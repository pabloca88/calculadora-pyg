import { describe, it, expect, beforeEach } from 'vitest';
import { saveCalculatorData, loadCalculatorData, saveARSCache, loadARSCache, clearStorage } from '../storage';
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
      rateMaxi: 6300,
      customRate: 6100,
      selectedFee: 3,
      customFeeValue: '',
    });

    const loaded = loadCalculatorData();
    expect(loaded).not.toBeNull();
    expect(loaded!.amount).toBe(620000);
    expect(loaded!.rateChaco).toBe(6200);
    expect(loaded!.rateMaxi).toBe(6300);
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

describe('clearStorage', () => {
  it('removes both storage keys', () => {
    saveCalculatorData({ amount: 1 });
    saveARSCache({ oficial: 1000, tarjeta: 1300, mep: null, cripto: null, custom: null });

    clearStorage();

    expect(loadCalculatorData()).toBeNull();
    expect(loadARSCache()).toBeNull();
  });
});
