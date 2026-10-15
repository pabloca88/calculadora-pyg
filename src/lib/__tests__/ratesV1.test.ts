import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRatesV1, houseTimeToIso, parseDolarApi, toPygRateV1 } from '../ratesV1';
import type { RateResolution } from '../pygRatesFallback';

const DOLARAPI = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'dolarapi-2026-10-15.json'), 'utf8'));
const NOW = new Date('2026-10-15T16:45:35.855Z');

const CHACO_PUSH: RateResolution = {
  rate: { compra: 5630, venta: 5730, updatedAt: '15/10/2026 10:42' },
  source: 'chaco',
  chacoVia: 'push',
  readAt: '2026-10-15T16:30:06.120Z',
};
const MAXI: RateResolution = {
  rate: { compra: 5600, venta: 5750, updatedAt: '15/10/2026 09:05' },
  source: 'maxi',
  chacoError: 'push_stale; HTTP 403',
};
const NONE: RateResolution = {
  rate: { compra: null, venta: null, updatedAt: null },
  source: 'none',
  chacoError: 'push_missing; HTTP 403',
};

describe('houseTimeToIso', () => {
  it('turns Paraguay wall time into ISO with the -03:00 offset', () => {
    expect(houseTimeToIso('15/10/2026 10:42')).toBe('2026-10-15T10:42:00-03:00');
  });

  it('uses the current tz rules (Paraguay stays on UTC-3 all year since 2024)', () => {
    expect(houseTimeToIso('15/06/2026 08:00')).toBe('2026-06-15T08:00:00-03:00');
  });

  it('pads single-digit day, month and hour', () => {
    expect(houseTimeToIso('1/2/2026 9:05')).toBe('2026-02-01T09:05:00-03:00');
  });

  it('returns null for missing or malformed input', () => {
    expect(houseTimeToIso(null)).toBeNull();
    expect(houseTimeToIso(undefined)).toBeNull();
    expect(houseTimeToIso('')).toBeNull();
    expect(houseTimeToIso('2026-10-15 10:42')).toBeNull();
    expect(houseTimeToIso('15/13/2026 10:42')).toBeNull();
    expect(houseTimeToIso('15/10/2026 25:00')).toBeNull();
  });
});

describe('toPygRateV1', () => {
  it('maps a pushed Chaco rate', () => {
    expect(toPygRateV1(CHACO_PUSH)).toEqual({
      venta: 5730,
      compra: 5630,
      houseUpdatedAt: '2026-10-15T10:42:00-03:00',
      houseUpdatedAtLabel: '15/10 10:42',
      source: 'chaco',
    });
  });

  it('maps the Maxicambios fallback', () => {
    expect(toPygRateV1(MAXI)).toMatchObject({ venta: 5750, compra: 5600, source: 'maxi' });
  });

  it('is null when no house answered', () => {
    expect(toPygRateV1(NONE)).toBeNull();
  });

  it('is null when the rate fails the sanity checks (never a wrong number)', () => {
    const rate = (compra: number, venta: number): RateResolution => ({ ...CHACO_PUSH, rate: { compra, venta, updatedAt: null } });
    expect(toPygRateV1(rate(5730, 5630))).toBeNull(); // venta <= compra
    expect(toPygRateV1(rate(5700, 5700))).toBeNull();
    expect(toPygRateV1(rate(3850, 3900))).toBeNull(); // CAD-like value, below 4,000
    expect(toPygRateV1(rate(9000, 10500))).toBeNull(); // above 10,000
  });

  it('keeps the rate when only the timestamp is missing', () => {
    const noTime: RateResolution = { ...CHACO_PUSH, rate: { ...CHACO_PUSH.rate, updatedAt: null } };
    expect(toPygRateV1(noTime)).toMatchObject({ venta: 5730, houseUpdatedAt: null, houseUpdatedAtLabel: null });
  });
});

describe('parseDolarApi', () => {
  it('maps a real DolarAPI response like the web client (bolsa → mep)', () => {
    expect(parseDolarApi(DOLARAPI)).toEqual({
      oficial: 1535,
      tarjeta: 1995.5,
      mep: 1536.9,
      cripto: 1615.6,
      updatedAt: '2026-10-15T15:57:00.000Z',
    });
  });

  it('nulls individual missing or malformed rates', () => {
    const json = [
      { casa: 'oficial', venta: 1535, fechaActualizacion: '2026-10-15T13:00:00.000Z' },
      { casa: 'tarjeta', venta: '1995,5' },
      { casa: 'bolsa', venta: -1 },
    ];
    expect(parseDolarApi(json)).toEqual({
      oficial: 1535,
      tarjeta: null,
      mep: null,
      cripto: null,
      updatedAt: '2026-10-15T13:00:00.000Z',
    });
  });

  it('ignores timestamps of rates that were discarded', () => {
    const json = [
      { casa: 'oficial', venta: 1535, fechaActualizacion: '2026-10-15T13:00:00.000Z' },
      { casa: 'cripto', venta: 0, fechaActualizacion: '2026-10-15T18:00:00.000Z' },
    ];
    expect(parseDolarApi(json)?.updatedAt).toBe('2026-10-15T13:00:00.000Z');
  });

  it('is null for anything that is not a usable array', () => {
    expect(parseDolarApi(null)).toBeNull();
    expect(parseDolarApi({ casa: 'oficial', venta: 1535 })).toBeNull();
    expect(parseDolarApi([])).toBeNull();
    expect(parseDolarApi([null, 'x', { casa: 'blue', venta: 1545 }])).toBeNull();
  });
});

describe('buildRatesV1', () => {
  it('builds the full response', () => {
    expect(buildRatesV1(CHACO_PUSH, DOLARAPI, NOW)).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-10-15T16:45:35.855Z',
      pyg: {
        venta: 5730,
        compra: 5630,
        houseUpdatedAt: '2026-10-15T10:42:00-03:00',
        houseUpdatedAtLabel: '15/10 10:42',
        source: 'chaco',
      },
      ars: { oficial: 1535, tarjeta: 1995.5, mep: 1536.9, cripto: 1615.6, updatedAt: '2026-10-15T15:57:00.000Z' },
    });
  });

  it('keeps each half independent: no PYG rate still returns ARS, and vice versa', () => {
    expect(buildRatesV1(NONE, DOLARAPI, NOW)).toMatchObject({ pyg: null, ars: { oficial: 1535 } });
    expect(buildRatesV1(CHACO_PUSH, null, NOW)).toMatchObject({ pyg: { venta: 5730 }, ars: null });
  });

  // Installed apps decode this exact shape. If this test fails, don't update
  // it: add the field instead of renaming/removing one, or create /api/v2.
  it('CONTRACT: v1 keys and types are frozen', () => {
    const body = buildRatesV1(CHACO_PUSH, DOLARAPI, NOW);
    expect(Object.keys(body).sort()).toEqual(['ars', 'generatedAt', 'pyg', 'schemaVersion']);
    expect(Object.keys(body.pyg!).sort()).toEqual(['compra', 'houseUpdatedAt', 'houseUpdatedAtLabel', 'source', 'venta']);
    expect(Object.keys(body.ars!).sort()).toEqual(['cripto', 'mep', 'oficial', 'tarjeta', 'updatedAt']);
    expect(body.schemaVersion).toBe(1);
    expect(typeof body.pyg!.venta).toBe('number');
    expect(typeof body.pyg!.compra).toBe('number');
    expect(typeof body.ars!.oficial).toBe('number');
    expect(JSON.parse(JSON.stringify(body))).toEqual(body); // plain JSON, no Dates/undefined
  });
});
