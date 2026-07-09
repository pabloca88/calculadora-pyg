import type { ARSRates, DolarAPIResponse } from './types';
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

const PYG_CACHE_KEY = 'pyg_rate_cache';
const PYG_CACHE_TTL = 10 * 60 * 1000;

interface PygRateCache {
  rate: number;
  timestamp: number;
}

/**
 * Lee la caché de tasa PYG/USD sin disparar un fetch (para inspección de estado)
 */
export const getCachedPygRate = (): PygRateCache | null => {
  if (typeof window === 'undefined') return null;
  const cached = localStorage.getItem(PYG_CACHE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

const cachePygRate = (rate: number): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PYG_CACHE_KEY, JSON.stringify({ rate, timestamp: Date.now() }));
  }
};

export async function getPYGtoUSDRate(): Promise<number> {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(PYG_CACHE_KEY);
    if (cached) {
      const { rate, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < PYG_CACHE_TTL) return rate;
    }
  }

  // Primary: exchangerate-api.com (legacy free endpoint, sin auth)
  // Nota: frankfurter.app fue evaluada pero no cubre PYG (solo ~30 monedas ECB).
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.PYG;
      if (rate && rate > 0) {
        cachePygRate(rate);
        return rate;
      }
    }
  } catch {
    // sigue al fallback
  }

  // Secondary: open.er-api.com
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const rate = data.rates?.PYG;
      if (rate && rate > 0) {
        cachePygRate(rate);
        return rate;
      }
    }
  } catch {
    // sigue al fallback
  }

  // Usa la caché aunque esté vencida
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(PYG_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached).rate;
      } catch {
        // sigue al fallback final
      }
    }
  }

  return 6100;
}
