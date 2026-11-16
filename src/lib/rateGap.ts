/**
 * Gap between the Chaco venta (pushed from the Mac) and the Maxicambios
 * venta, as a percentage of Maxi's. Chaco is only ever read from the
 * maintainer's Mac, so Maxi is the independent second source:
 *   - the live monitor fails above MAX_CHACO_MAXI_GAP_PCT (alert only);
 *   - every push logs the gap (log-only) to choose the real threshold.
 */
export const MAX_CHACO_MAXI_GAP_PCT = 5;

export const ventaGapPct = (chacoVenta: number, maxiVenta: number): number =>
  (Math.abs(chacoVenta - maxiVenta) / maxiVenta) * 100;
