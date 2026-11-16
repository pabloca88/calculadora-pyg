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
