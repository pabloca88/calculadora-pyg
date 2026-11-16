import { describe, it, expect } from 'vitest';
import { MAX_CHACO_MAXI_GAP_PCT, ventaGapPct } from '../rateGap';

describe('ventaGapPct (Chaco vs Maxicambios venta)', () => {
  it('is relative to Maxi and symmetric in sign', () => {
    // 16/11/2026: Chaco 6.180, Maxi 6.150 → 30 / 6.150 = 0,4878 %
    expect(ventaGapPct(6180, 6150)).toBeCloseTo(0.4878, 4);
    expect(ventaGapPct(6120, 6150)).toBeCloseTo(0.4878, 4);
    expect(ventaGapPct(6150, 6150)).toBe(0);
  });

  it('flags a wrong-row read (e.g. CAD ≈ 4.400 vs USD 6.150) far above the threshold', () => {
    expect(ventaGapPct(4400, 6150)).toBeGreaterThan(MAX_CHACO_MAXI_GAP_PCT);
  });

  it('threshold is 5 % (alert only)', () => {
    expect(MAX_CHACO_MAXI_GAP_PCT).toBe(5);
    expect(ventaGapPct(6457.5, 6150)).toBeCloseTo(5, 6); // exactly at the line passes (≤)
  });
});

import { summarizeGaps, type RateGapEntry } from '../rateGap';

const NOW = Date.parse('2026-11-16T22:00:00Z');
const entry = (daysAgo: number, gapPct: number): RateGapEntry => ({
  at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  readAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  chacoCompra: 6020,
  chacoVenta: 6180,
  maxiCompra: 5900,
  maxiVenta: 6150,
  maxiUpdatedAt: '16/11/2026 16:26',
  gapPct,
});

describe('summarizeGaps', () => {
  it('is empty-safe', () => {
    expect(summarizeGaps([], NOW)).toEqual({
      count: 0, firstAt: null, lastAt: null, medianPct: null, p95Pct: null, maxPct: null,
      over: { 1: 0, 2: 0, 3: 0, 5: 0 },
    });
  });

  it('median, p95 (nearest rank), max and buckets over the last 30 days', () => {
    // 20 gaps 0.1 … 2.0 → median = 10th = 1.0, p95 = 19th = 1.9, max 2.0
    const entries = Array.from({ length: 20 }, (_, i) => entry(i, Math.round((i + 1) * 10) / 100));
    const s = summarizeGaps(entries, NOW);
    expect(s.count).toBe(20);
    expect(s.medianPct).toBe(1.0);
    expect(s.p95Pct).toBe(1.9);
    expect(s.maxPct).toBe(2.0);
    expect(s.over).toEqual({ 1: 10, 2: 0, 3: 0, 5: 0 });
    expect(s.firstAt! < s.lastAt!).toBe(true);
  });

  it('ignores entries older than 30 days', () => {
    const s = summarizeGaps([entry(31, 9), entry(29, 0.5)], NOW);
    expect(s.count).toBe(1);
    expect(s.maxPct).toBe(0.5);
  });
});
