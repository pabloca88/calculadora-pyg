import { describe, it, expect, vi, afterEach } from 'vitest';
import { validatePushBody, isPushFresh, isPushRateLimited, PUSH_MAX_AGE_MS, PUSH_RATE_LIMIT_PER_MINUTE } from '../chacoPushStore';

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

describe('isPushRateLimited', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const stubRedis = (incrResult: number | Error) => {
    vi.stubEnv('KV_REST_API_URL', 'https://redis.example');
    vi.stubEnv('KV_REST_API_TOKEN', 't');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const [cmd] = JSON.parse(init.body as string);
      if (cmd === 'INCR' && incrResult instanceof Error) throw incrResult;
      return new Response(JSON.stringify({ result: cmd === 'INCR' ? incrResult : 1 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('allows up to the limit and sets an expiry on the first hit', async () => {
    const fetchMock = stubRedis(1);
    expect(await isPushRateLimited('1.2.3.4', NOW)).toBe(false);
    const commands = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string)[0]);
    expect(commands).toEqual(['INCR', 'EXPIRE']);
  });

  it('blocks above the per-minute limit', async () => {
    stubRedis(PUSH_RATE_LIMIT_PER_MINUTE + 1);
    expect(await isPushRateLimited('1.2.3.4', NOW)).toBe(true);
  });

  it('fails open when Redis is down', async () => {
    stubRedis(new Error('network'));
    expect(await isPushRateLimited('1.2.3.4', NOW)).toBe(false);
  });

  it('is a no-op without a configured store', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    expect(await isPushRateLimited('1.2.3.4', NOW)).toBe(false);
  });
});
