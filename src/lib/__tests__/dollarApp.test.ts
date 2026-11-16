import { describe, it, expect } from 'vitest';
import {
  DOLLARAPP_REFERENCE,
  MERCADO_PAGO_METHOD,
  PAYMENT_METHODS_AR,
  WALLET_METHODS,
  comparableMethods,
  dollarAppRateLabel,
  estimateDollarAppRate,
  getCheapestMethodIds,
  type DollarAppEstimate,
} from '../calculator';

// Today (16/11/2026): venta 6.180, oficial 1.575, tarjeta 2.047,5.
const NOW = Date.parse('2026-11-16T20:00:00Z');
const VENTA = 6180;
const ARS = { oficial: 1575, tarjeta: 2047.5 };
const PYG = 550_000;

const cards = [
  PAYMENT_METHODS_AR.find((m) => m.id === 'tarjeta-banco')!,
  MERCADO_PAGO_METHOD,
  WALLET_METHODS.arq,
  PAYMENT_METHODS_AR.find((m) => m.id === 'efectivo-usd')!,
];

/** Same wiring as page.tsx: ARQ uses its own rate, the rest the reference venta. */
const cheapest = (estimate: DollarAppEstimate) =>
  getCheapestMethodIds(
    (id) => (id === 'arq-dolarapp' ? PYG / estimate.rate : PYG / VENTA),
    ARS,
    comparableMethods(cards, estimate)
  );

const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString().slice(0, 10);

describe('DollarApp estimate — golden cases (₲550.000, venta 6.180)', () => {
  it('shipped default: shown but excluded → Efectivo USD is cheapest', () => {
    // Efectivo: 550.000 / 6.180 = 88,9968 USD × 1.575 = AR$140.169,90
    // Tarjeta / MP: 88,9968 × 2.047,5 = AR$182.220,87
    // (ARQ at 5.991,05 would be 91,8036 × 1.575 = AR$144.590,68, but it doesn't compete)
    const estimate = estimateDollarAppRate(null, VENTA, NOW);
    expect(estimate).toMatchObject({ rate: 5991.05, competes: false, kind: 'reference' });
    expect(cheapest(estimate)).toEqual(['efectivo-usd']);
  });

  it('calibration of 5.991,05 made at venta 5.700 → adjusted ₲6.495,56 → ARQ / DollarApp is cheapest', () => {
    // 5.991,05 × 6.180 / 5.700 = 6.495,5595
    // ARQ: 550.000 / 6.495,5595 = 84,6732 USD × 1.575 = AR$133.360,34 < Efectivo AR$140.169,90
    const estimate = estimateDollarAppRate({ rate: 5991.05, measuredAt: daysAgo(5), ventaAtCalibration: 5700 }, VENTA, NOW);
    expect(estimate.kind).toBe('adjusted');
    expect(estimate.competes).toBe(true);
    expect(estimate.rate).toBeCloseTo(6495.5595, 3);
    expect((PYG / estimate.rate) * ARS.oficial).toBeCloseTo(133360.34, 1);
    expect(cheapest(estimate)).toEqual(['arq-dolarapp']);
  });
});

describe('DollarApp estimate — rules', () => {
  it('adjusted calibrations keep competing after 30 days but ask to recalibrate', () => {
    const at30 = estimateDollarAppRate({ rate: 5991.05, measuredAt: daysAgo(30), ventaAtCalibration: 5700 }, VENTA, NOW);
    const at31 = estimateDollarAppRate({ rate: 5991.05, measuredAt: daysAgo(31), ventaAtCalibration: 5700 }, VENTA, NOW);
    expect(at30).toMatchObject({ competes: true, needsRecalibration: false });
    expect(at31).toMatchObject({ competes: true, needsRecalibration: true, kind: 'adjusted' });
  });

  it('legacy calibration (no venta) competes unadjusted up to 30 days old', () => {
    const e = estimateDollarAppRate({ rate: 6020.5, measuredAt: daysAgo(30) }, VENTA, NOW);
    expect(e).toMatchObject({ rate: 6020.5, competes: true, kind: 'unadjusted', needsRecalibration: false });
  });

  it('legacy calibration older than 30 days is shown but stops competing', () => {
    const e = estimateDollarAppRate({ rate: 6020.5, measuredAt: daysAgo(31) }, VENTA, NOW);
    expect(e).toMatchObject({ rate: 6020.5, competes: false, kind: 'unadjusted', needsRecalibration: true });
    expect(comparableMethods(cards, e).map((m) => m.id)).not.toContain('arq-dolarapp');
  });

  it('a stored venta outside 4.000–10.000 is ignored (treated as legacy)', () => {
    const e = estimateDollarAppRate({ rate: 6020.5, measuredAt: daysAgo(2), ventaAtCalibration: 57 }, VENTA, NOW);
    expect(e.kind).toBe('unadjusted');
  });

  it('Payoneer is never filtered', () => {
    const e = estimateDollarAppRate(null, VENTA, NOW);
    expect(comparableMethods([WALLET_METHODS.payoneer], e)).toEqual([WALLET_METHODS.payoneer]);
  });
});

describe('dollarAppRateLabel', () => {
  it('labels each case in es-AR', () => {
    expect(dollarAppRateLabel(estimateDollarAppRate(null, VENTA, NOW))).toBe('₲5.991,05/USD · valor de referencia');
    expect(
      dollarAppRateLabel(estimateDollarAppRate({ rate: 5991.05, measuredAt: '2026-11-11', ventaAtCalibration: 5700 }, VENTA, NOW))
    ).toBe('₲6.495,56/USD · estimado desde tu calibración del 11/11');
    expect(
      dollarAppRateLabel(estimateDollarAppRate({ rate: 5991.05, measuredAt: '2026-10-01', ventaAtCalibration: 5700 }, VENTA, NOW))
    ).toBe('₲6.495,56/USD · estimado desde tu calibración del 01/10 · recalibrá');
    expect(dollarAppRateLabel(estimateDollarAppRate({ rate: 6020.5, measuredAt: '2026-11-10' }, VENTA, NOW))).toBe(
      '₲6.020,5/USD · medida 10/11'
    );
    expect(dollarAppRateLabel(estimateDollarAppRate({ rate: 6020.5, measuredAt: '2026-10-01' }, VENTA, NOW))).toBe(
      '₲6.020,5/USD · medida 01/10 · recalibrá'
    );
  });

  it('reference value is the one measured on 28/07/2026', () => {
    expect(DOLLARAPP_REFERENCE).toEqual({ rate: 5991.05, measuredAt: '2026-07-28' });
  });
});
