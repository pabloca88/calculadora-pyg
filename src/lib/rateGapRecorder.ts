import type { PushedChacoRate } from './chacoPushStore';
import { appendRateGap } from './chacoPushStore';
import { fetchMaxiRate } from './liveRates';
import type { ExchangeHouseRate } from './pygScraping';
import { ventaGapPct, type RateGapEntry } from './rateGap';

export interface RateGapDeps {
  fetchMaxi: () => Promise<ExchangeHouseRate>;
  append: (entry: RateGapEntry) => Promise<void>;
  now: () => Date;
}

const defaultDeps: RateGapDeps = { fetchMaxi: fetchMaxiRate, append: appendRateGap, now: () => new Date() };

/**
 * LOG-ONLY: compares a stored push with Maxicambios and records the gap so a
 * real threshold can be chosen later (`npm run report:gaps`). It never
 * rejects anything and never throws; the push response is already sent.
 */
export async function recordRateGap(pushed: PushedChacoRate, deps: RateGapDeps = defaultDeps): Promise<RateGapEntry | null> {
  try {
    const maxi = await deps.fetchMaxi();
    if (maxi.venta === null) {
      console.warn('[rate-gap] Maxicambios without a valid venta; gap not recorded');
      return null;
    }
    const entry: RateGapEntry = {
      at: deps.now().toISOString(),
      readAt: pushed.readAt,
      chacoCompra: pushed.compra,
      chacoVenta: pushed.venta,
      maxiCompra: maxi.compra,
      maxiVenta: maxi.venta,
      maxiUpdatedAt: maxi.updatedAt,
      gapPct: Math.round(ventaGapPct(pushed.venta, maxi.venta) * 100) / 100,
    };
    await deps.append(entry);
    console.info('[rate-gap]', JSON.stringify(entry));
    return entry;
  } catch (error) {
    console.error('[rate-gap] not recorded:', error);
    return null;
  }
}
