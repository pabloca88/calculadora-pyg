import type { Conversion, ARSRates, PaymentMethod } from './types';
import { parseNumber, parseDecimal } from './format';

/**
 * Calcula conversiones PYG → USD → ARS
 */
export const calculateConversions = (
  pygAmount: string,
  rateChaco: string,
  rateMaxi: string,
  rateCustom: string,
  rateArsCustom: string,
  arsRates: ARSRates,
  selectedFee: number | 'custom'
): Conversion[] => {
  const amount = parseNumber(pygAmount);

  if (!amount || amount <= 0) {
    return [];
  }

  const conversions: Conversion[] = [];
  const customArsRate = parseDecimal(rateArsCustom);

  // Conversión Cambios Chaco
  const chacoRateVal = parseNumber(rateChaco);
  if (chacoRateVal && chacoRateVal > 0) {
    const usd = amount / chacoRateVal;
    conversions.push({
      source: 'Cambios Chaco',
      usd,
      arsRates: {
        oficial: arsRates.oficial ? usd * arsRates.oficial : null,
        tarjeta: arsRates.tarjeta ? usd * arsRates.tarjeta : null,
        custom: customArsRate ? usd * customArsRate : null,
        customWithFee:
          customArsRate && typeof selectedFee === 'number' && selectedFee > 0
            ? usd * customArsRate * (1 + selectedFee / 100)
            : null,
      },
      highlight: false,
    });
  }

  // Conversión Maxicambios
  const maxiRateVal = parseNumber(rateMaxi);
  if (maxiRateVal && maxiRateVal > 0) {
    const usd = amount / maxiRateVal;
    conversions.push({
      source: 'Maxicambios',
      usd,
      arsRates: {
        oficial: arsRates.oficial ? usd * arsRates.oficial : null,
        tarjeta: arsRates.tarjeta ? usd * arsRates.tarjeta : null,
        custom: customArsRate ? usd * customArsRate : null,
        customWithFee:
          customArsRate && typeof selectedFee === 'number' && selectedFee > 0
            ? usd * customArsRate * (1 + selectedFee / 100)
            : null,
      },
      highlight: false,
    });
  }

  // Conversión Personalizada (highlight)
  const customRateVal = parseNumber(rateCustom);
  if (customRateVal && customRateVal > 0) {
    const usd = amount / customRateVal;
    conversions.push({
      source: 'Personalizada',
      usd,
      arsRates: {
        oficial: arsRates.oficial ? usd * arsRates.oficial : null,
        tarjeta: arsRates.tarjeta ? usd * arsRates.tarjeta : null,
        custom: customArsRate ? usd * customArsRate : null,
        customWithFee:
          customArsRate && typeof selectedFee === 'number' && selectedFee > 0
            ? usd * customArsRate * (1 + selectedFee / 100)
            : null,
      },
      highlight: true,
    });
  }

  return conversions;
};

/**
 * Valida si hay datos suficientes para calcular
 */
export const hasValidInputs = (
  pygAmount: string,
  rateChaco: string,
  rateMaxi: string,
  rateCustom: string
): boolean => {
  const amount = parseNumber(pygAmount);
  const chaco = parseNumber(rateChaco);
  const maxi = parseNumber(rateMaxi);
  const custom = parseNumber(rateCustom);

  return amount > 0 && (chaco > 0 || maxi > 0 || custom > 0);
};

export const PAYMENT_METHODS_AR: PaymentMethod[] = [
  {
    id: 'tarjeta-banco',
    name: 'Tarjeta banco argentino',
    icon: '🏦',
    network: 'Visa / Mastercard',
    rateType: 'tarjeta',
    fee: 0,
    note: 'Tu banco aplica Dólar Tarjeta (Oficial +30%). Aplica a Santander, Galicia, BBVA, Nación, HSBC y cualquier banco argentino.',
  },
  {
    id: 'efectivo-usd',
    name: 'Efectivo USD',
    icon: '💵',
    network: null,
    rateType: 'market',
    fee: 0,
    note: 'Cambiás tus dólares físicos en una casa de cambio paraguaya y pagás en guaraníes.',
  },
];

// Card fija (no seleccionable): Mercado Pago cobra Dólar Tarjeta igual que un banco.
export const MERCADO_PAGO_METHOD: PaymentMethod = {
  id: 'mercado-pago',
  name: 'Mercado Pago',
  icon: '💙',
  network: 'Mastercard',
  rateType: 'tarjeta',
  fee: 0,
  note: 'Mercado Pago aplica Dólar Tarjeta igual que un banco tradicional al pagar en el exterior.',
};

// Billetera virtual seleccionable desde el dropdown "Billetera Virtual"
export const WALLET_METHODS: Record<'arq' | 'payoneer', PaymentMethod> = {
  arq: {
    id: 'arq-dolarapp',
    name: 'ARQ / DollarApp',
    icon: '💚',
    network: 'Mastercard',
    rateType: 'oficial',
    fee: 0,
    note: 'Usa tasa interbancaria real, sin comisión adicional. Generalmente la opción más económica entre las billeteras virtuales.',
  },
  payoneer: {
    id: 'payoneer',
    name: 'Payoneer',
    icon: '🔶',
    network: 'Mastercard',
    rateType: 'oficial',
    fee: 1.8,
    note: 'Usa tasa Mastercard (similar a interbancaria) + 1.8% de comisión por compras en el exterior.',
  },
};

export function calcPaymentMethod(
  method: PaymentMethod,
  usdAmount: number,
  arsRates: { oficial: number; tarjeta: number }
): number | null {
  if (!usdAmount || usdAmount <= 0) return null;
  switch (method.rateType) {
    case 'tarjeta':
      return usdAmount * arsRates.tarjeta * (1 + method.fee / 100);
    case 'oficial':
      return usdAmount * arsRates.oficial * (1 + method.fee / 100);
    case 'market':
      return usdAmount; // retorna USD, no ARS
    default:
      return null;
  }
}

export function getCheapestMethodIds(
  usdAmount: number,
  arsRates: { oficial: number; tarjeta: number },
  methods: PaymentMethod[] = PAYMENT_METHODS_AR
): string[] {
  if (!usdAmount || usdAmount <= 0) return [];

  const comparisons = methods.map(method => {
    const arsValue =
      method.rateType === 'market'
        ? usdAmount * arsRates.oficial
        : (calcPaymentMethod(method, usdAmount, arsRates) ?? Infinity);
    return { id: method.id, arsValue };
  });

  const minValue = Math.min(...comparisons.map(c => c.arsValue));

  return comparisons
    .filter(c => Math.abs(c.arsValue - minValue) < 1)
    .map(c => c.id);
}
