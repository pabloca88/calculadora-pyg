import type { ARSRates, SavedCalculatorData, CachedARSData } from './types';

const STORAGE_KEY = 'pyg_calc_v7';
const STORAGE_KEY_ARS = 'pyg_calc_v7_ars';

/**
 * Guarda datos de la calculadora en localStorage
 */
export const saveCalculatorData = (data: Partial<SavedCalculatorData>): void => {
  try {
    const fullData: SavedCalculatorData = {
      amount: data.amount ?? 0,
      rateChaco: data.rateChaco ?? 0,
      rateMaxi: data.rateMaxi ?? 0,
      customRate: data.customRate ?? 0,
      arsCustomRate: data.arsCustomRate ?? '',
      selectedFee: data.selectedFee ?? 0,
      customFeeValue: data.customFeeValue ?? '',
      selectedWallet: data.selectedWallet ?? 'DollarApp',
      customWalletName: data.customWalletName ?? '',
      selectedExchange: data.selectedExchange ?? 'chaco',
      lastSave: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullData));
  } catch (e) {
    console.error('Error saving calculator data:', e);
  }
};

/**
 * Carga datos de la calculadora desde localStorage
 */
export const loadCalculatorData = (): Partial<SavedCalculatorData> | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.error('Error loading calculator data:', e);
    return null;
  }
};

/**
 * Guarda tasas ARS en caché con timestamp
 */
export const saveARSCache = (rates: ARSRates): void => {
  try {
    const data: CachedARSData = {
      rates,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY_ARS, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving ARS cache:', e);
  }
};

/**
 * Carga tasas ARS desde caché
 */
export const loadARSCache = (): ARSRates | null => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_ARS);
    if (cached) {
      const data: CachedARSData = JSON.parse(cached);
      return data.rates;
    }
    return null;
  } catch (e) {
    console.error('Error loading ARS cache:', e);
    return null;
  }
};

/**
 * Limpia todos los datos guardados (para debugging)
 */
export const clearStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_ARS);
  } catch (e) {
    console.error('Error clearing storage:', e);
  }
};
