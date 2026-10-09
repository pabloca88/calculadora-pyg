import type { ARSRates, DolarAPIResponse, ExchangeHouseRate } from './types';
import { saveARSCache, loadARSCache } from './storage';

const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';

/**
 * Fetch de tasas ARS desde DolarAPI con fallback a caché
 */
export const fetchARSRates = async (): Promise<ARSRates> => {
  try {
    const response = await fetch(DOLAR_API_URL);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: DolarAPIResponse[] = await response.json();

    const oficial = data.find((d) => d.casa === 'oficial');
    const tarjeta = data.find((d) => d.casa === 'tarjeta');
    const bolsa = data.find((d) => d.casa === 'bolsa');
    const cripto = data.find((d) => d.casa === 'cripto');

    const rates: ARSRates = {
      oficial: oficial?.venta ?? null,
      tarjeta: tarjeta?.venta ?? null,
      mep: bolsa?.venta ?? null,
      cripto: cripto?.venta ?? null,
      custom: null,
    };

    // Guarda en caché para fallback offline
    saveARSCache(rates);

    return rates;
  } catch (error) {
    console.error('Error fetching ARS rates:', error);

    // Intenta cargar desde caché en caso de error
    const cached = loadARSCache();
    if (cached) {
      console.log('Using cached ARS rates due to fetch error');
      return cached;
    }

    // Retorna rates vacías si no hay caché
    return {
      oficial: null,
      tarjeta: null,
      mep: null,
      cripto: null,
      custom: null,
    };
  }
};

/**
 * Status del fetch (para mostrar en UI)
 */
export const getARSStatus = (isLoading: boolean, error: boolean): string => {
  if (isLoading) return 'Cargando...';
  if (error) return 'Error';
  return 'LIVE';
};

export type HouseSource = 'chaco' | 'maxi' | 'none';

export interface PygExchangeHouseRates {
  rate: ExchangeHouseRate;
  houseSource: HouseSource;
  chacoError?: string;
  cachedAt: string;
}

// _v3: la respuesta de /api/pyg-rates pasa de { chaco } a { rate, source }
// (Chaco con fallback a Maxicambios) — una key nueva evita que un cliente
// con la caché _v2 (que trae `chaco` en vez de `rate`) siga leyendo ese
// formato viejo.
const PYG_HOUSE_CACHE_KEY = 'pyg_calc_house_rates_cache_v3';
const PYG_HOUSE_CACHE_TTL = 30 * 60 * 1000;

interface PygHouseRatesCache {
  data: PygExchangeHouseRates;
  timestamp: number;
}

const NONE_RATES: PygExchangeHouseRates = {
  rate: { compra: null, venta: null, updatedAt: null, source: 'none' },
  houseSource: 'none',
  cachedAt: '',
};

/**
 * Fetch de la tasa PYG/USD vía /api/pyg-rates — Cambios Chaco primero, con
 * fallback automático a Maxicambios si Chaco no respondió (Cloudflare
 * bloquea las IPs de Vercel) — con fallback a caché local de 30 minutos.
 */
export const fetchPygExchangeHouseRates = async (force = false): Promise<PygExchangeHouseRates> => {
  if (!force && typeof window !== 'undefined') {
    const cached = localStorage.getItem(PYG_HOUSE_CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp }: PygHouseRatesCache = JSON.parse(cached);
        if (Date.now() - timestamp < PYG_HOUSE_CACHE_TTL) return data;
      } catch {
        // sigue al fetch
      }
    }
  }

  try {
    const response = await fetch('/api/pyg-rates');
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const json = await response.json();
    const data: PygExchangeHouseRates = {
      rate: { ...json.rate, source: json.rate.compra ? 'api' : 'none' },
      houseSource: json.source,
      chacoError: json.chacoError,
      cachedAt: json.cachedAt,
    };

    if (typeof window !== 'undefined') {
      const cache: PygHouseRatesCache = { data, timestamp: Date.now() };
      localStorage.setItem(PYG_HOUSE_CACHE_KEY, JSON.stringify(cache));
    }

    return data;
  } catch (error) {
    console.error('Error fetching PYG exchange house rates:', error);

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(PYG_HOUSE_CACHE_KEY);
      if (cached) {
        try {
          const { data }: PygHouseRatesCache = JSON.parse(cached);
          return data;
        } catch {
          // sigue al fallback final
        }
      }
    }

    return NONE_RATES;
  }
};
