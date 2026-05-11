// Tipos para tasas ARS
export interface ARSRates {
  oficial: number | null;
  tarjeta: number | null;
  mep: number | null;
  cripto: number | null;
  custom: number | null;
}

// Tipo para cada conversión calculada
export interface Conversion {
  source: string;
  usd: number;
  arsRates: {
    oficial: number | null;
    tarjeta: number | null;
    custom: number | null;
    customWithFee: number | null;
  };
  highlight: boolean;
}

// Tipo para datos guardados en localStorage
export interface SavedCalculatorData {
  amount: number;
  rateChaco: number;
  rateMaxi: number;
  customRate: number;
  arsCustomRate: string;
  selectedFee: number | 'custom';
  customFeeValue: string;
  selectedWallet: string;
  customWalletName: string;
  lastSave: string;
}

// Tipo para respuesta de DolarAPI
export interface DolarAPIResponse {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  oficial?: boolean;
}

// Tipo para datos cacheados de ARS
export interface CachedARSData {
  rates: ARSRates;
  timestamp: number;
}

// Tipo para estado de la aplicación
export interface CalculatorState {
  pygAmount: string;
  rateChaco: string;
  rateMaxi: string;
  rateCustom: string;
  rateArsCustom: string;
  selectedFee: number | 'custom';
  feeCustomValue: string;
  arsRates: ARSRates;
  arsStatus: string;
  isArsLoading: boolean;
  showOptionalArs: boolean;
  showCustomFee: boolean;
  expansions: Record<string, boolean>;
  results: Conversion[];
  showEmptyState: boolean;
}
