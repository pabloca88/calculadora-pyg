import { isRateInRange } from './pygScraping';
import { parseNumber } from './format';

// _venta_v1: desde el 13/10/2026 el override significa VENTA (antes era
// compra, bajo 'chaco_rate') — key nueva para que un valor de compra viejo
// no se cuele como venta; la key vieja se borra al leer.
export const CHACO_OVERRIDE_KEY = 'chaco_rate_venta_v1';
export const LEGACY_CHACO_OVERRIDE_KEY = 'chaco_rate';
export const CHACO_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;

interface ChacoOverride {
  value: string;
  savedAt: number;
}

/**
 * A typed venta ("5.700") is usable only inside the same 4.000–10.000 range
 * the API enforces: a typo like "57" must never become the reference rate.
 */
export const isValidManualVenta = (value: string): boolean => isRateInRange(parseNumber(value));

/**
 * Stored override → its value, or null if the JSON is malformed, older than
 * 12 h, or out of range (an out-of-range value could be stored before the
 * range check existed).
 */
export const parseStoredOverride = (raw: string | null, now = Date.now()): string | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ChacoOverride).value === 'string' &&
      typeof (parsed as ChacoOverride).savedAt === 'number'
    ) {
      const { value, savedAt } = parsed as ChacoOverride;
      if (now - savedAt < CHACO_OVERRIDE_TTL_MS && isValidManualVenta(value)) return value;
    }
  } catch {
    // formato viejo (string plano) u otro JSON inválido
  }
  return null;
};

/**
 * Lee el override manual si todavía es válido; si no, lo borra para que un
 * valor viejo o inválido no tape la tasa automática.
 */
export const readValidChacoOverride = (now = Date.now()): string | null => {
  localStorage.removeItem(LEGACY_CHACO_OVERRIDE_KEY);
  const value = parseStoredOverride(localStorage.getItem(CHACO_OVERRIDE_KEY), now);
  if (value === null) localStorage.removeItem(CHACO_OVERRIDE_KEY);
  return value;
};

/** Persists a valid venta for 12 h; anything else clears the stored override. */
export const saveChacoOverride = (value: string, now = Date.now()): boolean => {
  if (!isValidManualVenta(value)) {
    localStorage.removeItem(CHACO_OVERRIDE_KEY);
    return false;
  }
  const override: ChacoOverride = { value, savedAt: now };
  localStorage.setItem(CHACO_OVERRIDE_KEY, JSON.stringify(override));
  return true;
};

export const clearChacoOverride = (): void => localStorage.removeItem(CHACO_OVERRIDE_KEY);
