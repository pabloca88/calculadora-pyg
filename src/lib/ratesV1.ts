import type { RateResolution } from './pygRatesFallback';
import { isSaneRate } from './pygScraping';
import { formatHouseUpdatedAt } from './format';

/**
 * Frozen contract of GET /api/v1/rates, consumed by the native apps.
 * Installed apps can't be updated in lockstep with the web, so this shape only
 * ever grows: adding a field is fine; renaming, removing or retyping one
 * requires a new /api/v2 route. The contract test in
 * __tests__/ratesV1.test.ts fails if a key changes.
 */
export const RATES_V1_SCHEMA_VERSION = 1;

export interface PygRateV1 {
  /** The single reference rate (₲ per USD). */
  venta: number;
  /** Only for validation (venta > compra); never used in a calculation. */
  compra: number;
  /** The house's own timestamp as ISO 8601 with the Paraguay offset. */
  houseUpdatedAt: string | null;
  /** "DD/MM HH:MM", ready for the "act." label. */
  houseUpdatedAtLabel: string | null;
  /** Diagnostic only: clients must not show it. */
  source: 'chaco' | 'maxi';
}

export interface ArsRatesV1 {
  oficial: number | null;
  tarjeta: number | null;
  mep: number | null;
  cripto: number | null;
  /** Most recent DolarAPI `fechaActualizacion` among the rates above. */
  updatedAt: string | null;
}

export interface RatesV1 {
  schemaVersion: typeof RATES_V1_SCHEMA_VERSION;
  generatedAt: string;
  pyg: PygRateV1 | null;
  ars: ArsRatesV1 | null;
}

const PY_TIME_ZONE = 'America/Asuncion';

/** Offset of `timeZone` at `instant`, in minutes east of UTC (e.g. -180). */
const offsetMinutes = (instant: number, timeZone: string): number => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(instant))
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0; // "GMT" alone means UTC
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * House timestamp ("15/10/2026 10:42", Paraguay wall time, as produced by
 * parseChaco/parseMaxi and the push) → "2026-10-15T10:42:00-03:00". The
 * offset comes from the tz database, so apps never have to guess it.
 */
export const houseTimeToIso = (updatedAt: string | null | undefined): string | null => {
  const m = updatedAt?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [day, month, year, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes so a wall time right at an offset change resolves correctly.
  let offset = offsetMinutes(wallAsUtc, PY_TIME_ZONE);
  offset = offsetMinutes(wallAsUtc - offset * 60_000, PY_TIME_ZONE);

  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

export const toPygRateV1 = (resolution: RateResolution): PygRateV1 | null => {
  const { source, rate } = resolution;
  if (source === 'none' || !isSaneRate(rate.compra, rate.venta)) return null;
  return {
    venta: rate.venta!,
    compra: rate.compra!,
    houseUpdatedAt: houseTimeToIso(rate.updatedAt),
    houseUpdatedAtLabel: formatHouseUpdatedAt(rate.updatedAt),
    source,
  };
};

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * DolarAPI /v1/dolares → ARS rates, same mapping as the web client
 * (rates.ts: `venta` of oficial, tarjeta, bolsa → mep, cripto). Anything
 * malformed becomes null instead of a wrong number; null overall when no rate
 * survives.
 */
export const parseDolarApi = (json: unknown): ArsRatesV1 | null => {
  if (!Array.isArray(json)) return null;
  const entry = (casa: string) =>
    json.find((d): d is Record<string, unknown> => !!d && typeof d === 'object' && d.casa === casa);

  const picked = { oficial: entry('oficial'), tarjeta: entry('tarjeta'), mep: entry('bolsa'), cripto: entry('cripto') };
  const rates = {
    oficial: positiveNumber(picked.oficial?.venta),
    tarjeta: positiveNumber(picked.tarjeta?.venta),
    mep: positiveNumber(picked.mep?.venta),
    cripto: positiveNumber(picked.cripto?.venta),
  };
  if (Object.values(rates).every((v) => v === null)) return null;

  const updatedTimes = Object.entries(picked)
    .filter(([key]) => rates[key as keyof typeof rates] !== null)
    .map(([, d]) => (typeof d?.fechaActualizacion === 'string' ? Date.parse(d.fechaActualizacion) : NaN))
    .filter(Number.isFinite);
  const updatedAt = updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null;

  return { ...rates, updatedAt };
};

export const buildRatesV1 = (
  resolution: RateResolution,
  dolarApiJson: unknown,
  now: Date = new Date()
): RatesV1 => ({
  schemaVersion: RATES_V1_SCHEMA_VERSION,
  generatedAt: now.toISOString(),
  pyg: toPygRateV1(resolution),
  ars: parseDolarApi(dolarApiJson),
});
