import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveLiveRate = vi.fn();
const fetchDolarApiJson = vi.fn();
vi.mock('@/lib/liveRates', () => ({ resolveLiveRate, fetchDolarApiJson }));

const { GET } = await import('../../app/api/v1/rates/route');

describe('GET /api/v1/rates', () => {
  beforeEach(() => {
    resolveLiveRate.mockReset().mockResolvedValue({
      rate: { compra: 5630, venta: 5730, updatedAt: '15/10/2026 10:42' },
      source: 'chaco',
      chacoVia: 'push',
    });
    fetchDolarApiJson.mockReset().mockResolvedValue([{ casa: 'oficial', venta: 1535 }, { casa: 'tarjeta', venta: 1995.5 }]);
  });

  it('returns the v1 body with a short CDN cache', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    const body = await res.json();
    expect(body).toMatchObject({
      schemaVersion: 1,
      pyg: { venta: 5730, compra: 5630, source: 'chaco' },
      ars: { oficial: 1535, tarjeta: 1995.5, mep: null, cripto: null },
    });
  });

  it('still answers 200 with nulls when every source failed', async () => {
    resolveLiveRate.mockResolvedValue({ rate: { compra: null, venta: null, updatedAt: null }, source: 'none' });
    fetchDolarApiJson.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ schemaVersion: 1, pyg: null, ars: null });
  });
});
