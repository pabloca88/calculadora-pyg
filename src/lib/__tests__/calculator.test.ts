import { describe, it, expect } from 'vitest';
import { calculateConversions, hasValidInputs } from '../calculator';
import type { ARSRates } from '../types';

// ─── integration tests (call calculateConversions with string inputs) ───

const emptyRates: ARSRates = { oficial: null, tarjeta: null, mep: null, cripto: null, custom: null };
const fullRates: ARSRates = { oficial: 1000, tarjeta: 1300, mep: 1250, cripto: 1280, custom: null };

describe('calculateConversions', () => {
  it('returns empty array when amount is zero', () => {
    expect(calculateConversions('', '6.200', '', '', '', emptyRates, 0)).toHaveLength(0);
    expect(calculateConversions('0', '6.200', '', '', '', emptyRates, 0)).toHaveLength(0);
  });

  it('returns empty array when no PYG rates are set', () => {
    expect(calculateConversions('620.000', '', '', '', '', emptyRates, 0)).toHaveLength(0);
  });

  it('calculates USD correctly for Cambios Chaco', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '', emptyRates, 0);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('Cambios Chaco');
    expect(results[0].usd).toBeCloseTo(100);
    expect(results[0].highlight).toBe(false);
  });

  it('calculates USD correctly for Maxicambios', () => {
    const results = calculateConversions('620.000', '', '6.200', '', '', emptyRates, 0);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('Maxicambios');
    expect(results[0].usd).toBeCloseTo(100);
  });

  it('marks Personalizada conversion as highlight', () => {
    const results = calculateConversions('620.000', '', '', '6.200', '', emptyRates, 0);
    expect(results[0].source).toBe('Personalizada');
    expect(results[0].highlight).toBe(true);
  });

  it('returns all three conversions when all rates provided', () => {
    const results = calculateConversions('620.000', '6.200', '6.300', '6.100', '', emptyRates, 0);
    expect(results).toHaveLength(3);
  });

  it('calculates ARS tarjeta when tarjeta rate is available', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '', fullRates, 0);
    expect(results[0].arsRates.tarjeta).toBeCloseTo(130000);
  });

  it('calculates ARS oficial when oficial rate is available', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '', fullRates, 0);
    expect(results[0].arsRates.oficial).toBeCloseTo(100000);
  });

  it('calculates ARS custom wallet from custom ARS rate', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '1300', emptyRates, 0);
    expect(results[0].arsRates.custom).toBeCloseTo(130000);
  });

  it('calculates ARS custom wallet + fee', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '1300', emptyRates, 3);
    expect(results[0].arsRates.customWithFee).toBeCloseTo(133900);
  });

  it('sets customWithFee to null when selectedFee is 0', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '1300', emptyRates, 0);
    expect(results[0].arsRates.customWithFee).toBeNull();
  });

  it('sets customWithFee to null when selectedFee is "custom"', () => {
    const results = calculateConversions('620.000', '6.200', '', '', '1300', emptyRates, 'custom');
    expect(results[0].arsRates.customWithFee).toBeNull();
  });
});

describe('hasValidInputs', () => {
  it('returns false when amount is empty', () => {
    expect(hasValidInputs('', '6.200', '', '')).toBe(false);
  });

  it('returns false when all rates are empty', () => {
    expect(hasValidInputs('620.000', '', '', '')).toBe(false);
  });

  it('returns true with amount and at least one rate', () => {
    expect(hasValidInputs('620.000', '6.200', '', '')).toBe(true);
    expect(hasValidInputs('620.000', '', '6.300', '')).toBe(true);
    expect(hasValidInputs('620.000', '', '', '6.100')).toBe(true);
  });
});

// ─── arithmetic validation tests (verify the math with known values) ───

describe('Calculator - Conversiones PYG → USD → ARS', () => {
  const pygAmount = 200000;
  const chacoRate = 6150;
  const maxiRate = 6200;
  const arsOficial = 1415.00;
  const arsTarjeta = 1839.50; // oficial × 1.30
  const arsCustom = 1475.00;

  describe('Conversión básica PYG → USD', () => {
    it('debe convertir ₲200.000 a U$D con tasa ₲6.150', () => {
      expect(pygAmount / chacoRate).toBeCloseTo(32.52, 2);
    });

    it('debe convertir ₲200.000 a U$D con tasa ₲6.200', () => {
      expect(pygAmount / maxiRate).toBeCloseTo(32.26, 2);
    });
  });

  describe('Tarjeta de Crédito Argentina - Dólar Oficial', () => {
    it('debe calcular correctamente con Cambios Chaco', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsOficial).toBeCloseTo(46016.26, 1);
    });

    it('debe calcular correctamente con Maxicambios', () => {
      const usd = pygAmount / maxiRate;
      expect(usd * arsOficial).toBeCloseTo(45645.16, 1);
    });
  });

  describe('Tarjeta de Crédito Argentina - Dólar Tarjeta (+30%)', () => {
    it('debe calcular correctamente con Cambios Chaco', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsTarjeta).toBeCloseTo(59821.14, 1);
    });

    it('debe calcular correctamente con Maxicambios', () => {
      const usd = pygAmount / maxiRate;
      expect(usd * arsTarjeta).toBeCloseTo(59338.71, 1);
    });

    it('Dólar Tarjeta debe ser Oficial × 1.30', () => {
      expect(arsTarjeta / arsOficial).toBeCloseTo(1.30, 2);
    });
  });

  describe('Billetera Virtual', () => {
    it('debe calcular correctamente SIN recargo', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsCustom).toBeCloseTo(47967.48, 1);
    });

    it('debe calcular correctamente CON recargo 2%', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsCustom * 1.02).toBeCloseTo(48926.83, 1);
    });

    it('debe calcular correctamente CON recargo 3%', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsCustom * 1.03).toBeCloseTo(49406.51, 1);
    });
  });

  describe('Efectivo USD', () => {
    it('debe retornar solo el monto en USD sin conversión ARS', () => {
      expect(pygAmount / chacoRate).toBeCloseTo(32.52, 2);
      expect(pygAmount / maxiRate).toBeCloseTo(32.26, 2);
    });
  });

  describe('Descuento Turista (-10%)', () => {
    it('debe aplicar -10% correctamente a Dólar Oficial', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsOficial * 0.9).toBeCloseTo(41414.63, 1);
    });

    it('debe aplicar -10% correctamente a Dólar Tarjeta', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsTarjeta * 0.9).toBeCloseTo(53839.03, 1);
    });

    it('debe aplicar -10% correctamente a Billetera', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsCustom * 0.9).toBeCloseTo(43170.73, 1);
    });

    it('debe aplicar -10% correctamente a USD', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * 0.9).toBeCloseTo(29.27, 2);
    });
  });

  describe('Comparación - Método más barato', () => {
    it('Efectivo USD (en ARS via oficial) debe ser más barato que Tarjeta', () => {
      const usd = pygAmount / chacoRate;
      const efectivoEnARS = usd * arsOficial;
      const tarjeta = usd * arsTarjeta;
      const billetera = usd * arsCustom;
      expect(efectivoEnARS).toBeLessThan(tarjeta);
      expect(efectivoEnARS).toBeLessThan(billetera);
    });

    it('Dólar Oficial debe ser más barato que Dólar Tarjeta', () => {
      const usd = pygAmount / chacoRate;
      expect(usd * arsOficial).toBeLessThan(usd * arsTarjeta);
    });
  });

  describe('Edge Cases', () => {
    it('debe manejar monto 0', () => {
      expect(0 / chacoRate).toBe(0);
    });

    it('debe manejar tasa alta (₲10.000)', () => {
      expect(pygAmount / 10000).toBeCloseTo(20, 2);
    });

    it('debe manejar tasa baja (₲1.000)', () => {
      expect(pygAmount / 1000).toBeCloseTo(200, 2);
    });

    it('debe manejar decimales en monto PYG', () => {
      expect(123456.78 / chacoRate).toBeCloseTo(20.07, 2);
    });
  });
});
