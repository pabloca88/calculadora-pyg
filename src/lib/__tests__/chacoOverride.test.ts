import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHACO_OVERRIDE_KEY,
  CHACO_OVERRIDE_TTL_MS,
  LEGACY_CHACO_OVERRIDE_KEY,
  isValidManualVenta,
  parseStoredOverride,
  readValidChacoOverride,
  saveChacoOverride,
} from '../chacoOverride';

const NOW = Date.parse('2026-10-15T17:00:00.000Z');
const stored = (value: unknown, savedAt = NOW) => JSON.stringify({ value, savedAt });

describe('isValidManualVenta (same 4.000–10.000 range as the API)', () => {
  it('accepts values inside the range, edges included', () => {
    expect(isValidManualVenta('5.700')).toBe(true);
    expect(isValidManualVenta('4.000')).toBe(true);
    expect(isValidManualVenta('10.000')).toBe(true);
  });

  it('rejects typos and values outside the range', () => {
    expect(isValidManualVenta('')).toBe(false);
    expect(isValidManualVenta('57')).toBe(false);
    expect(isValidManualVenta('3.999')).toBe(false);
    expect(isValidManualVenta('10.001')).toBe(false);
    expect(isValidManualVenta('57.000')).toBe(false);
  });
});

describe('parseStoredOverride', () => {
  it('returns a fresh, in-range value', () => {
    expect(parseStoredOverride(stored('5.700'), NOW)).toBe('5.700');
  });

  it('drops values older than 12 h', () => {
    expect(parseStoredOverride(stored('5.700', NOW - CHACO_OVERRIDE_TTL_MS), NOW)).toBeNull();
  });

  it('drops out-of-range values stored before the range check existed', () => {
    expect(parseStoredOverride(stored('57'), NOW)).toBeNull();
    expect(parseStoredOverride(stored('57.300'), NOW)).toBeNull();
  });

  it('drops malformed data', () => {
    expect(parseStoredOverride(null, NOW)).toBeNull();
    expect(parseStoredOverride('5.700', NOW)).toBeNull();
    expect(parseStoredOverride(stored(5700), NOW)).toBeNull();
    expect(parseStoredOverride(JSON.stringify({ value: '5.700' }), NOW)).toBeNull();
  });
});

describe('saveChacoOverride / readValidChacoOverride', () => {
  beforeEach(() => localStorage.clear());

  it('saves and reads back a valid venta', () => {
    expect(saveChacoOverride('5.700', NOW)).toBe(true);
    expect(readValidChacoOverride(NOW + 1000)).toBe('5.700');
  });

  it('rejects an out-of-range venta and clears a previous one', () => {
    saveChacoOverride('5.700', NOW);
    expect(saveChacoOverride('57', NOW)).toBe(false);
    expect(localStorage.getItem(CHACO_OVERRIDE_KEY)).toBeNull();
  });

  it('deletes invalid stored overrides and the legacy compra key on read', () => {
    localStorage.setItem(CHACO_OVERRIDE_KEY, stored('57'));
    localStorage.setItem(LEGACY_CHACO_OVERRIDE_KEY, stored('5.600'));
    expect(readValidChacoOverride(NOW)).toBeNull();
    expect(localStorage.getItem(CHACO_OVERRIDE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_CHACO_OVERRIDE_KEY)).toBeNull();
  });
});
