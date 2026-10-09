import { parseChaco, parseMaxi, type ExchangeHouseRate } from './pygScraping';

export type RateSource = 'chaco' | 'maxi' | 'none';

export interface RateResolution {
  rate: ExchangeHouseRate;
  source: RateSource;
  chacoError?: string;
}

const NO_RATE: ExchangeHouseRate = { compra: null, venta: null, updatedAt: null };

/**
 * Resuelve la tasa PYG/USD: Cambios Chaco es la fuente primaria. Si no
 * responde con una tasa válida (Cloudflare bloquea las IPs de datacenter de
 * Vercel con un 403 challenge, o el parser no encuentra nada razonable),
 * cae a Maxicambios. Maxi ni se fetchea si Chaco ya dio un resultado válido.
 *
 * `fetchChacoHtml`/`fetchMaxiHtml` se inyectan (en vez de hacer fetch()
 * directo acá) para poder testear la lógica de fallback con HTML fijo, sin
 * red ni mocks de `fetch` global.
 */
export async function resolveRate(
  fetchChacoHtml: () => Promise<string>,
  fetchMaxiHtml: () => Promise<string>
): Promise<RateResolution> {
  let chacoError: string | undefined;

  try {
    const chaco = parseChaco(await fetchChacoHtml());
    if (chaco.compra !== null) {
      return { rate: chaco, source: 'chaco' };
    }
    chacoError = 'parse_failed';
  } catch (error) {
    chacoError = error instanceof Error ? error.message : String(error);
  }

  try {
    const maxi = parseMaxi(await fetchMaxiHtml());
    if (maxi.compra !== null) {
      return { rate: maxi, source: 'maxi', chacoError };
    }
  } catch {
    // Maxi también falló — cae a 'none' abajo con el chacoError ya seteado
  }

  return { rate: NO_RATE, source: 'none', chacoError };
}
