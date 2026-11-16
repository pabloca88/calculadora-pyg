import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const readRateGaps = vi.fn();
const isPushRateLimited = vi.fn();
let storeConfigured = true;
vi.mock('@/lib/chacoPushStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chacoPushStore')>();
  return { ...actual, isStoreConfigured: () => storeConfigured, readRateGaps, isPushRateLimited };
});

const { GET } = await import('../../app/api/pyg-rates/gaps/route');

const req = (token?: string) =>
  new Request('http://localhost/api/pyg-rates/gaps', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe('GET /api/pyg-rates/gaps', () => {
  beforeEach(() => {
    vi.stubEnv('PUSH_TOKEN', 'secret-token');
    storeConfigured = true;
    isPushRateLimited.mockReset().mockResolvedValue(false);
    readRateGaps.mockReset().mockResolvedValue([
      { at: new Date().toISOString(), readAt: '', chacoCompra: 6020, chacoVenta: 6180, maxiCompra: 5900, maxiVenta: 6150, maxiUpdatedAt: null, gapPct: 0.49 },
      { at: '2026-01-01T00:00:00Z', readAt: '', chacoCompra: 1, chacoVenta: 1, maxiCompra: 1, maxiVenta: 1, maxiUpdatedAt: null, gapPct: 9 },
    ]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('401 without or with a wrong token', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('wrong'))).status).toBe(401);
    expect(readRateGaps).not.toHaveBeenCalled();
  });

  it('200 with the last 30 days and their summary', async () => {
    const res = await GET(req('secret-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.windowDays).toBe(30);
    expect(body.entries).toHaveLength(1);
    expect(body.summary.count).toBe(1);
    expect(body.summary.maxPct).toBe(0.49);
  });

  it('503 without a store, 429 when rate limited', async () => {
    storeConfigured = false;
    expect((await GET(req('secret-token'))).status).toBe(503);
    isPushRateLimited.mockResolvedValue(true);
    expect((await GET(req('secret-token'))).status).toBe(429);
  });
});
