import { describe, it, expect } from 'vitest';
import { parseNumber, parseDecimal, formatNumber, formatDecimal, formatCurrency, formatARSRate, parseARSRate, validateARSRate, formatPYG } from '../format';

describe('parseNumber', () => {
  it('returns 0 for empty string', () => {
    expect(parseNumber('')).toBe(0);
  });

  it('strips thousands separators and returns integer', () => {
    expect(parseNumber('6.200')).toBe(6200);
    expect(parseNumber('1.000.000')).toBe(1000000);
  });

  it('strips non-numeric characters', () => {
    expect(parseNumber('₲ 6,200')).toBe(6200);
  });

  it('handles plain numbers', () => {
    expect(parseNumber('6200')).toBe(6200);
  });
});

describe('parseDecimal', () => {
  it('returns 0 for empty string', () => {
    expect(parseDecimal('')).toBe(0);
  });

  it('parses es-AR decimal format (1.471,41)', () => {
    expect(parseDecimal('1.471,41')).toBeCloseTo(1471.41);
  });

  it('parses plain decimal with comma', () => {
    expect(parseDecimal('1471,41')).toBeCloseTo(1471.41);
  });

  it('parses plain integer string', () => {
    expect(parseDecimal('1471')).toBe(1471);
  });
});

describe('formatNumber', () => {
  it('returns empty string for falsy input', () => {
    expect(formatNumber(0)).toBe('');
    expect(formatNumber('')).toBe('');
  });

  it('formats with thousands separator (es-PY uses .)', () => {
    const result = formatNumber(6200);
    expect(result).toBe('6.200');
  });

  it('formats large numbers', () => {
    const result = formatNumber(1000000);
    expect(result).toBe('1.000.000');
  });

  it('strips non-numeric chars from string input before formatting', () => {
    expect(formatNumber('6200')).toBe('6.200');
  });
});

describe('formatDecimal', () => {
  it('returns empty string for empty input', () => {
    expect(formatDecimal('')).toBe('');
  });

  it('allows single comma as decimal separator', () => {
    expect(formatDecimal('1471,41')).toBe('1471,41');
  });

  it('strips dots (thousands sep) from input', () => {
    expect(formatDecimal('1.471,41')).toBe('1471,41');
  });

  it('collapses multiple commas to one', () => {
    expect(formatDecimal('1471,41,99')).toBe('1471,4199');
  });
});

describe('formatCurrency', () => {
  it('returns "-" for null', () => {
    expect(formatCurrency(null)).toBe('-');
  });

  it('returns "-" for 0', () => {
    expect(formatCurrency(0)).toBe('-');
  });

  it('formats with comma as decimal separator', () => {
    expect(formatCurrency(1234.56)).toBe('1.234,56');
  });

  it('formats small USD values', () => {
    expect(formatCurrency(16.13)).toBe('16,13');
  });
});

describe('formatARSRate', () => {
  describe('auto-formateo sin decimales', () => {
    it('debe formatear números sin separadores de miles', () => {
      expect(formatARSRate('1')).toBe('1');
      expect(formatARSRate('14')).toBe('14');
      expect(formatARSRate('146')).toBe('146');
      expect(formatARSRate('1467')).toBe('1.467');
      expect(formatARSRate('14677')).toBe('14.677');
      expect(formatARSRate('146774')).toBe('146.774');
      expect(formatARSRate('1467742')).toBe('1.467.742');
    });
  });

  describe('auto-formateo con decimales', () => {
    it('debe formatear con coma decimal', () => {
      expect(formatARSRate('1467,7')).toBe('1.467,7');
      expect(formatARSRate('1467,74')).toBe('1.467,74');
      expect(formatARSRate('14677,5')).toBe('14.677,5');
    });

    it('debe truncar a 2 decimales máximo', () => {
      expect(formatARSRate('1467,742')).toBe('1.467,74');
      expect(formatARSRate('1467,7421231')).toBe('1.467,74');
    });

    it('debe convertir punto decimal a coma', () => {
      expect(formatARSRate('1467.74')).toBe('1.467,74');
      expect(formatARSRate('14677.5')).toBe('14.677,5');
    });
  });

  describe('debe remover caracteres inválidos', () => {
    it('strips letras y símbolos', () => {
      expect(formatARSRate('1abc467')).toBe('1.467');
      expect(formatARSRate('AR$1467,74')).toBe('1.467,74');
    });

    it('convierte formato US (1,467.74) a formato AR', () => {
      expect(formatARSRate('1,467.74')).toBe('1.467,74');
    });
  });

  describe('edge cases', () => {
    it('debe manejar ceros a la izquierda', () => {
      expect(formatARSRate('0001467')).toBe('1.467');
    });

    it('debe manejar múltiples separadores', () => {
      expect(formatARSRate('1.4.6.7')).toBe('1.467');
    });

    it('debe manejar coma al inicio', () => {
      expect(formatARSRate(',74')).toBe('0,74');
    });

    it('retorna vacío para input vacío', () => {
      expect(formatARSRate('')).toBe('');
    });
  });
});

describe('parseARSRate', () => {
  it('parsea números formateados correctamente', () => {
    expect(parseARSRate('1.467,74')).toBeCloseTo(1467.74);
    expect(parseARSRate('14.677,5')).toBeCloseTo(14677.5);
    expect(parseARSRate('146.774,12')).toBeCloseTo(146774.12);
  });

  it('parsea números sin decimales', () => {
    expect(parseARSRate('1.467')).toBe(1467);
    expect(parseARSRate('14.677')).toBe(14677);
  });

  it('parsea entrada sin formatear', () => {
    expect(parseARSRate('1467')).toBe(1467);
    expect(parseARSRate('146774')).toBe(146774);
  });

  it('retorna 0 para entrada vacía o inválida', () => {
    expect(parseARSRate('')).toBe(0);
    expect(parseARSRate('abc')).toBe(0);
  });
});

describe('validateARSRate', () => {
  it('debe rechazar tasas muy bajas', () => {
    const result = validateARSRate('50');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('muy baja');
  });

  it('debe rechazar tasas muy altas', () => {
    const result = validateARSRate('150000');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('muy alta');
  });

  it('debe rechazar tasa vacía', () => {
    expect(validateARSRate('').isValid).toBe(false);
  });

  it('debe aceptar tasas normales', () => {
    expect(validateARSRate('1.471,41').isValid).toBe(true);
    expect(validateARSRate('1.800,00').isValid).toBe(true);
    expect(validateARSRate('2.000,50').isValid).toBe(true);
  });
});

describe('formatPYG', () => {
  it('debe formatear ₲200.000 correctamente', () => {
    expect(formatPYG('200000')).toBe('200.000');
  });

  it('debe formatear ₲1.500.000 correctamente', () => {
    expect(formatPYG('1500000')).toBe('1.500.000');
  });
});
