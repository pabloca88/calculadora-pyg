import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCalculatorData,
  loadCalculatorData,
  saveARSCache,
  loadARSCache,
  saveEffectiveDollarAppRate,
  loadDollarAppCalibration,
  clearStorage,
} from '../storage';
import type { ARSRates } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('saveCalculatorData / loadCalculatorData', () => {
  it('returns null when nothing is saved', () => {
    expect(loadCalculatorData()).toBeNull();
  });

  it('round-trips numeric fields', () => {
    saveCalculatorData({
      amount: 620000,
      rateChaco: 6200,
      customRate: 6100,
      selectedFee: 3,
      customFeeValue: '',
    });

    const loaded = loadCalculatorData();
    expect(loaded).not.toBeNull();
    expect(loaded!.amount).toBe(620000);
    expect(loaded!.rateChaco).toBe(6200);
    expect(loaded!.customRate).toBe(6100);
    expect(loaded!.selectedFee).toBe(3);
  });

  it('persists selectedFee as "custom"', () => {
    saveCalculatorData({ selectedFee: 'custom', customFeeValue: '2.5' });
    const loaded = loadCalculatorData();
    expect(loaded!.selectedFee).toBe('custom');
    expect(loaded!.customFeeValue).toBe('2.5');
  });

  it('saves a lastSave timestamp', () => {
    saveCalculatorData({ amount: 100 });
    const loaded = loadCalculatorData();
    expect(loaded!.lastSave).toBeTruthy();
    expect(new Date(loaded!.lastSave!).getTime()).not.toBeNaN();
  });
});

describe('saveARSCache / loadARSCache', () => {
  const rates: ARSRates = { oficial: 1000, tarjeta: 1300, mep: 1250, cripto: 1280, custom: null };

  it('returns null when cache is empty', () => {
    expect(loadARSCache()).toBeNull();
  });

  it('round-trips ARS rates', () => {
    saveARSCache(rates);
    const loaded = loadARSCache();
    expect(loaded).toEqual(rates);
  });
});

describe('saveEffectiveDollarAppRate / loadDollarAppCalibration', () => {
  it('returns null when nothing was measured yet (the reference value never counts as a calibration)', () => {
    expect(loadDollarAppCalibration()).toBeNull();
  });

  it('round-trips a calibration with the venta of that day', () => {
    saveEffectiveDollarAppRate({ rate: 6020.5, measuredAt: '2026-11-10', ventaAtCalibration: 6200 });
    expect(loadDollarAppCalibration()).toEqual({ rate: 6020.5, measuredAt: '2026-11-10', ventaAtCalibration: 6200 });
  });

  it('loads a calibration saved before 16/11/2026 (no venta) as legacy', () => {
    localStorage.setItem('pyg_calc_effective_dollarapp', JSON.stringify({ rate: 6020.5, measuredAt: '2026-10-01' }));
    expect(loadDollarAppCalibration()).toEqual({ rate: 6020.5, measuredAt: '2026-10-01' });
  });

  it('ignores malformed data', () => {
    localStorage.setItem('pyg_calc_effective_dollarapp', '{"rate":"x"}');
    expect(loadDollarAppCalibration()).toBeNull();
    localStorage.setItem('pyg_calc_effective_dollarapp', 'not json');
    expect(loadDollarAppCalibration()).toBeNull();
  });
});

describe('clearStorage', () => {
  it('removes all storage keys, including the DollarApp calibration', () => {
    saveCalculatorData({ amount: 1 });
    saveARSCache({ oficial: 1000, tarjeta: 1300, mep: null, cripto: null, custom: null });
    saveEffectiveDollarAppRate({ rate: 6020.5, measuredAt: '2026-10-01' });

    clearStorage();

    expect(loadCalculatorData()).toBeNull();
    expect(loadARSCache()).toBeNull();
    expect(loadDollarAppCalibration()).toBeNull();
  });
});
