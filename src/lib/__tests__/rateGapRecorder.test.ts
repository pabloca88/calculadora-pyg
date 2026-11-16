import { describe, it, expect, vi } from 'vitest';
import { recordRateGap, type RateGapDeps } from '../rateGapRecorder';

const PUSHED = { compra: 6020, venta: 6180, updatedAt: '16/11/2026 17:00', readAt: '2026-11-16T21:30:07.468Z' };
const MAXI = { compra: 5900, venta: 6150, updatedAt: '16/11/2026 16:26' };
const deps = (over: Partial<RateGapDeps> = {}): RateGapDeps => ({
  fetchMaxi: vi.fn().mockResolvedValue(MAXI),
  append: vi.fn().mockResolvedValue(undefined),
  now: () => new Date('2026-11-16T21:30:09.000Z'),
  ...over,
});

describe('recordRateGap (log-only)', () => {
  it('stores Chaco vs Maxi with the venta gap in %', async () => {
    const d = deps();
    const entry = await recordRateGap(PUSHED, d);
    expect(entry).toEqual({
      at: '2026-11-16T21:30:09.000Z',
      readAt: PUSHED.readAt,
      chacoCompra: 6020,
      chacoVenta: 6180,
      maxiCompra: 5900,
      maxiVenta: 6150,
      maxiUpdatedAt: '16/11/2026 16:26',
      gapPct: 0.49, // 30 / 6150 = 0,4878 % → 0,49
    });
    expect(d.append).toHaveBeenCalledWith(entry);
  });

  it('records nothing when Maxi has no valid venta', async () => {
    const d = deps({ fetchMaxi: vi.fn().mockResolvedValue({ compra: null, venta: null, updatedAt: null }) });
    expect(await recordRateGap(PUSHED, d)).toBeNull();
    expect(d.append).not.toHaveBeenCalled();
  });

  it('never throws (Maxi down or store down)', async () => {
    await expect(recordRateGap(PUSHED, deps({ fetchMaxi: vi.fn().mockRejectedValue(new Error('HTTP 503')) }))).resolves.toBeNull();
    await expect(recordRateGap(PUSHED, deps({ append: vi.fn().mockRejectedValue(new Error('store down')) }))).resolves.toBeNull();
  });
});
