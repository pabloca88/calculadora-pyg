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

/** One push compared with Maxicambios (log-only, see rateGapRecorder). */
export interface RateGapEntry {
  /** When the comparison ran (ISO). */
  at: string;
  /** When the Mac read Chaco (ISO, from the push). */
  readAt: string;
  chacoCompra: number;
  chacoVenta: number;
  maxiCompra: number | null;
  maxiVenta: number;
  /** Maxi's own timestamp ("DD/MM/YYYY HH:MM"); its HTML is cached up to 30 min. */
  maxiUpdatedAt: string | null;
  gapPct: number;
}

export const RATE_GAP_WINDOW_DAYS = 30;
const GAP_BUCKETS = [1, 2, 3, 5] as const;

export interface RateGapSummary {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  medianPct: number | null;
  p95Pct: number | null;
  maxPct: number | null;
  /** How many pushes exceeded each gap (1, 2, 3 and 5 %). */
  over: Record<(typeof GAP_BUCKETS)[number], number>;
}

/** Nearest-rank percentile of an ascending list. */
const percentile = (sorted: number[], p: number): number =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

/** Summary of the entries within the last RATE_GAP_WINDOW_DAYS. */
export const summarizeGaps = (entries: RateGapEntry[], now = Date.now()): RateGapSummary => {
  const since = now - RATE_GAP_WINDOW_DAYS * 86_400_000;
  const recent = entries
    .filter((e) => Date.parse(e.at) >= since)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const gaps = recent.map((e) => e.gapPct).sort((a, b) => a - b);
  const over = Object.fromEntries(GAP_BUCKETS.map((b) => [b, gaps.filter((g) => g > b).length])) as RateGapSummary['over'];
  return {
    count: recent.length,
    firstAt: recent[0]?.at ?? null,
    lastAt: recent[recent.length - 1]?.at ?? null,
    medianPct: gaps.length ? percentile(gaps, 50) : null,
    p95Pct: gaps.length ? percentile(gaps, 95) : null,
    maxPct: gaps.length ? gaps[gaps.length - 1] : null,
    over,
  };
};
