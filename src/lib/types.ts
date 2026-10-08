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
  customRate: number;
  selectedFee: number | 'custom';
  customFeeValue: string;
  selectedWallet: string;
  selectedExchange?: 'chaco' | 'custom';
  lastSave: string;
}

// Tasa de una casa de cambio paraguaya (Cambios Chaco), vía scraping o manual
export interface ExchangeHouseRate {
  compra: number | null;
  venta: number | null;
  updatedAt: string | null;
  source: 'api' | 'manual' | 'none';
}

// Tasa efectiva medida con una compra real (ej. DollarApp), para billeteras
// que no exponen una tasa pública.
export interface EffectiveRate {
  rate: number;
  measuredAt: string; // ISO date 'YYYY-MM-DD'
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

// Tipo para métodos de pago argentinos (Fase 2)
export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  network: string | null;
  rateType: 'tarjeta' | 'oficial' | 'market';
  fee: number;
  note: string;
}

// Tipo para estado de la aplicación
export interface CalculatorState {
  pygAmount: string;
  rateChaco: string;
  rateCustom: string;
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
