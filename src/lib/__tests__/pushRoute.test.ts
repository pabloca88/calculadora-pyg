import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const writePushedChaco = vi.fn();
const isPushRateLimited = vi.fn();
vi.mock('@/lib/chacoPushStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chacoPushStore')>();
  return { ...actual, isStoreConfigured: () => true, writePushedChaco, isPushRateLimited };
});

// Gap logging runs in next/server's after(); capture the callbacks to run them
// on demand, and stub the recorder (its own behaviour is tested separately).
const afterCallbacks: Array<() => unknown> = [];
const afterMock = vi.fn((fn: () => unknown) => { afterCallbacks.push(fn); });
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => afterMock(fn),
}));
const recordRateGap = vi.fn();
vi.mock('@/lib/rateGapRecorder', () => ({ recordRateGap }));

const { POST } = await import('../../app/api/pyg-rates/push/route');

const BODY = { compra: 5630, venta: 5740, updatedAt: '12/10/2026 17:25', readAt: new Date().toISOString() };
const req = (body: unknown, token?: string) =>
  new Request('http://localhost/api/pyg-rates/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/pyg-rates/push', () => {
  beforeEach(() => {
    vi.stubEnv('PUSH_TOKEN', 'secret-token');
    writePushedChaco.mockReset().mockResolvedValue(undefined);
    afterCallbacks.length = 0;
    afterMock.mockClear().mockImplementation((fn: () => unknown) => { afterCallbacks.push(fn); });
    recordRateGap.mockReset().mockResolvedValue(null);
    isPushRateLimited.mockReset().mockResolvedValue(false);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('401 sin token o con token incorrecto', async () => {
    expect((await POST(req(BODY))).status).toBe(401);
    expect((await POST(req(BODY, 'wrong'))).status).toBe(401);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  it('400 si la tasa no pasa la cordura', async () => {
    const res = await POST(req({ ...BODY, compra: 3000 }, 'secret-token'));
    expect(res.status).toBe(400);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  it('400 con JSON inválido', async () => {
    expect((await POST(req('{no json', 'secret-token'))).status).toBe(400);
  });

  it('200 y guarda el valor con token correcto', async () => {
    const res = await POST(req(BODY, 'secret-token'));
    expect(res.status).toBe(200);
    expect(writePushedChaco).toHaveBeenCalledWith(BODY);
  });

  it('503 si PUSH_TOKEN no está configurado', async () => {
    vi.stubEnv('PUSH_TOKEN', '');
    expect((await POST(req(BODY, 'secret-token'))).status).toBe(503);
  });

  it('413 when the body exceeds 2 KB (declared or actual size), without storing', async () => {
    const big = { ...BODY, updatedAt: 'x'.repeat(4000) };
    expect((await POST(req(big, 'secret-token'))).status).toBe(413);

    const lying = new Request('http://localhost/api/pyg-rates/push', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Length': '99999' },
      body: JSON.stringify(BODY),
    });
    expect((await POST(lying)).status).toBe(413);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  it('429 when the client is rate limited, before checking the token', async () => {
    isPushRateLimited.mockResolvedValue(true);
    expect((await POST(req(BODY, 'secret-token'))).status).toBe(429);
    expect((await POST(req(BODY))).status).toBe(429);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  describe('gap vs Maxicambios (log-only)', () => {
    it('is scheduled after a successful store, with the stored value', async () => {
      const res = await POST(req(BODY, 'secret-token'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, stored: BODY });
      expect(recordRateGap).not.toHaveBeenCalled(); // runs after the response
      await Promise.all(afterCallbacks.map((fn) => fn()));
      expect(recordRateGap).toHaveBeenCalledWith(BODY);
    });

    it('is not scheduled when the push is rejected', async () => {
      await POST(req({ ...BODY, compra: 3000 }, 'secret-token'));
      await POST(req(BODY, 'wrong'));
      expect(afterMock).not.toHaveBeenCalled();
    });

    it('never changes the response, even if scheduling fails', async () => {
      afterMock.mockImplementation(() => { throw new Error('after unavailable'); });
      const res = await POST(req(BODY, 'secret-token'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, stored: BODY });
    });
  });
});
