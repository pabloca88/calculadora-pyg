import { parseChaco, parseMaxi, type ExchangeHouseRate } from './pygScraping';
import { isPushFresh, type PushedChacoRate } from './chacoPushStore';

export type RateSource = 'chaco' | 'maxi' | 'none';

/** Cómo se obtuvo Chaco: pusheado desde la Mac, o leído directo del widget. */
export type ChacoVia = 'push' | 'direct';

export interface RateResolution {
  rate: ExchangeHouseRate;
  source: RateSource;
  chacoVia?: ChacoVia;
  /** ISO — solo con chacoVia "push": cuándo leyó la Mac el widget. */
  readAt?: string;
  chacoError?: string;
}

export interface RateFetchers {
  readPushedChaco: () => Promise<PushedChacoRate | null>;
  fetchChacoHtml: () => Promise<string>;
  fetchMaxiHtml: () => Promise<string>;
  now?: () => number;
}

const NO_RATE: ExchangeHouseRate = { compra: null, venta: null, updatedAt: null };

/**
 * Resuelve la tasa PYG/USD, en orden:
 *   (a) Chaco pusheado desde la Mac con readAt < 3 h → source "chaco" (via push)
 *   (b) Chaco directo (Cloudflare bloquea las IPs de datacenter de Vercel
 *       con un 403 challenge, así que en prod casi siempre falla)
 *   (c) Maxicambios
 *   (d) "none"
 * Cada paso solo se ejecuta si el anterior no dio una tasa válida.
 *
 * Las fuentes se inyectan (en vez de hacer fetch() directo acá) para poder
 * testear la lógica de fallback con datos fijos, sin red ni mocks de
 * `fetch` global.
 */
export async function resolveRate({
  readPushedChaco,
  fetchChacoHtml,
  fetchMaxiHtml,
  now = Date.now,
}: RateFetchers): Promise<RateResolution> {
  const pushed = await readPushedChaco().catch(() => null);
  if (isPushFresh(pushed, now())) {
    const { compra, venta, updatedAt, readAt } = pushed;
    return { rate: { compra, venta, updatedAt }, source: 'chaco', chacoVia: 'push', readAt };
  }

  let chacoError: string | undefined = pushed ? 'push_stale' : 'push_missing';

  try {
    const chaco = parseChaco(await fetchChacoHtml());
    if (chaco.venta !== null) {
      return { rate: chaco, source: 'chaco', chacoVia: 'direct', chacoError };
    }
    chacoError += '; parse_failed';
  } catch (error) {
    chacoError += `; ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    const maxi = parseMaxi(await fetchMaxiHtml());
    if (maxi.venta !== null) {
      return { rate: maxi, source: 'maxi', chacoError };
    }
  } catch {
    // Maxi también falló — cae a 'none' abajo con el chacoError ya seteado
  }

  return { rate: NO_RATE, source: 'none', chacoError };
}
