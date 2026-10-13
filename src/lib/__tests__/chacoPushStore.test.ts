import { describe, it, expect } from 'vitest';
import { validatePushBody, isPushFresh, PUSH_MAX_AGE_MS } from '../chacoPushStore';

const NOW = Date.parse('2026-10-12T20:00:00.000Z');
const VALID = { compra: 5630, venta: 5740, updatedAt: '12/10/2026 17:25', readAt: '2026-10-12T19:55:00.000Z' };

describe('validatePushBody', () => {
  it('acepta un body válido', () => {
    expect(validatePushBody(VALID, NOW)).toEqual({ ok: true, value: VALID });
  });

  it('acepta updatedAt ausente como null', () => {
    const { updatedAt: _omit, ...rest } = VALID;
    const result = validatePushBody(rest, NOW);
    expect(result.ok && result.value.updatedAt).toBeNull();
  });

  it.each([
    ['compra < 4000', { ...VALID, compra: 3999 }],
    ['compra > 10000', { ...VALID, compra: 10001, venta: 10100 }],
    ['venta == compra', { ...VALID, venta: 5630 }],
    ['venta < compra', { ...VALID, venta: 5600 }],
    ['compra como string', { ...VALID, compra: '5630' }],
    ['readAt inválido', { ...VALID, readAt: 'ayer' }],
    ['readAt en el futuro', { ...VALID, readAt: '2026-10-12T21:00:00.000Z' }],
    ['updatedAt numérico', { ...VALID, updatedAt: 1725 }],
  ])('rechaza %s', (_label, body) => {
    expect(validatePushBody(body, NOW).ok).toBe(false);
  });

  it('rechaza body no-objeto', () => {
    expect(validatePushBody(null, NOW).ok).toBe(false);
    expect(validatePushBody('x', NOW).ok).toBe(false);
  });
});

describe('isPushFresh', () => {
  it('fresco por debajo de 3 h, viejo desde 3 h', () => {
    const at = (ageMs: number) => ({ ...VALID, readAt: new Date(NOW - ageMs).toISOString() });
    expect(isPushFresh(at(PUSH_MAX_AGE_MS - 1), NOW)).toBe(true);
    expect(isPushFresh(at(PUSH_MAX_AGE_MS), NOW)).toBe(false);
    expect(isPushFresh(null, NOW)).toBe(false);
  });
});
