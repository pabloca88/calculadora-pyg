import type { Conversion, ARSRates } from './types';
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
