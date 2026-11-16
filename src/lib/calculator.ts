import type { Conversion, ARSRates, PaymentMethod, EffectiveRate } from './types';
import { parseNumber, parseDecimal } from './format';
import { isRateInRange } from './pygScraping';

/**
 * Calcula conversiones PYG → USD → ARS
 */
export const calculateConversions = (
  pygAmount: string,
  rateChaco: string,
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
 * USD disponible para la tasa única de referencia (VENTA de la casa de cambio vía
 * /api/pyg-rates, o el override manual del usuario). Única fuente de verdad
 * para el recuadro U$D principal y todo lo que deriva de él (Dólar Oficial,
 * Tarjeta +30%, tasa personalizada) — ya no hay una tasa de mercado
 * internacional de respaldo: sin tasa de referencia, no hay USD que mostrar.
 */
export function calcReferenceUsdAmount(
  pygAmount: number,
  referenceVenta: number | null
): number | null {
  if (!pygAmount || pygAmount <= 0 || !referenceVenta || referenceVenta <= 0) return null;
  return pygAmount / referenceVenta;
}

/**
 * Valida si hay datos suficientes para calcular
 */
export const hasValidInputs = (
  pygAmount: string,
  rateChaco: string,
  rateCustom: string
): boolean => {
  const amount = parseNumber(pygAmount);
  const chaco = parseNumber(rateChaco);
  const custom = parseNumber(rateCustom);

  return amount > 0 && (chaco > 0 || custom > 0);
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

/**
 * Compara métodos de pago por su equivalente en ARS. Cada método puede partir
 * de una conversión Gs→USD distinta (ej. Efectivo USD usa la tasa VENTA de
 * una casa de cambio, ARQ/DollarApp usa su tasa efectiva medida), por eso el
 * monto en USD se resuelve por método via getUsdAmount en lugar de un único
 * valor compartido.
 */
export function getCheapestMethodIds(
  getUsdAmount: (methodId: string) => number,
  arsRates: { oficial: number; tarjeta: number },
  methods: PaymentMethod[] = PAYMENT_METHODS_AR
): string[] {
  const comparisons = methods.map(method => {
    const usdAmount = getUsdAmount(method.id);
    if (!usdAmount || usdAmount <= 0) return { id: method.id, arsValue: Infinity };

    const arsValue =
      method.rateType === 'market'
        ? usdAmount * arsRates.oficial
        : (calcPaymentMethod(method, usdAmount, arsRates) ?? Infinity);
    return { id: method.id, arsValue };
  });

  const minValue = Math.min(...comparisons.map(c => c.arsValue));
  if (!Number.isFinite(minValue)) return [];

  return comparisons
    .filter(c => Math.abs(c.arsValue - minValue) < 1)
    .map(c => c.id);
}

// ─── DollarApp effective rate (decided 16/11/2026) ───────────────────────
// DollarApp doesn't publish its rate; the user calibrates it with a real
// purchase (₲ paid / USD debited). Its rate moves with the market, so:
//   - no calibration → the shipped reference value is shown but never
//     competes for "cheapest";
//   - calibration with the venta of that day → today's estimate is
//     rate × todayVenta / ventaAtCalibration (keeps competing; after 30
//     days it also asks to recalibrate);
//   - legacy calibration (no venta) → unadjusted rate; competes only while
//     it is at most 30 days old.

/** Reference DollarApp rate measured 28/07/2026; shown, never compared. */
export const DOLLARAPP_REFERENCE: EffectiveRate = { rate: 5991.05, measuredAt: '2026-07-28' };
export const DOLLARAPP_RECALIBRATE_AFTER_DAYS = 30;
export const DOLLARAPP_CALIBRATE_HINT = 'Calibrá DollarApp con tu última compra para compararlo';

export type DollarAppEstimateKind = 'reference' | 'adjusted' | 'unadjusted';

export interface DollarAppEstimate {
  /** ₲ per USD used for the ARQ / DollarApp card today. */
  rate: number;
  /** Whether it takes part in the "cheapest" comparison. */
  competes: boolean;
  kind: DollarAppEstimateKind;
  measuredAt: string;
  needsRecalibration: boolean;
}

/** Whole days since 'YYYY-MM-DD' (UTC midnight, like `new Date('YYYY-MM-DD')`). */
const daysSince = (isoDate: string, now: number): number =>
  Math.floor((now - Date.parse(`${isoDate}T00:00:00Z`)) / 86_400_000);

export function estimateDollarAppRate(
  calibration: EffectiveRate | null,
  todayVenta: number | null,
  now = Date.now()
): DollarAppEstimate {
  if (!calibration) {
    return { rate: DOLLARAPP_REFERENCE.rate, competes: false, kind: 'reference', measuredAt: DOLLARAPP_REFERENCE.measuredAt, needsRecalibration: true };
  }
  const old = daysSince(calibration.measuredAt, now) > DOLLARAPP_RECALIBRATE_AFTER_DAYS;
  const ventaThen = calibration.ventaAtCalibration;
  if (isRateInRange(ventaThen) && todayVenta && todayVenta > 0) {
    return {
      rate: (calibration.rate * todayVenta) / ventaThen,
      competes: true,
      kind: 'adjusted',
      measuredAt: calibration.measuredAt,
      needsRecalibration: old,
    };
  }
  return { rate: calibration.rate, competes: !old, kind: 'unadjusted', measuredAt: calibration.measuredAt, needsRecalibration: old };
}

/** The methods that take part in "cheapest": ARQ/DollarApp only when it competes. */
export const comparableMethods = (methods: PaymentMethod[], estimate: DollarAppEstimate): PaymentMethod[] =>
  methods.filter((m) => m.id !== 'arq-dolarapp' || estimate.competes);

/** "DD/MM" from 'YYYY-MM-DD'. */
const dayMonth = (isoDate: string): string => isoDate.slice(5).split('-').reverse().join('/');

/** Label for the DollarApp rate, e.g. "₲6.495,56/USD · estimado desde tu calibración del 16/11". */
export function dollarAppRateLabel(estimate: DollarAppEstimate): string {
  const rate = `₲${estimate.rate.toLocaleString('es-PY', { maximumFractionDigits: 2 })}/USD`;
  const detail =
    estimate.kind === 'reference'
      ? 'valor de referencia'
      : estimate.kind === 'adjusted'
        ? `estimado desde tu calibración del ${dayMonth(estimate.measuredAt)}`
        : `medida ${dayMonth(estimate.measuredAt)}`;
  const recalibrate = estimate.kind !== 'reference' && estimate.needsRecalibration ? ' · recalibrá' : '';
  return `${rate} · ${detail}${recalibrate}`;
}
