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
