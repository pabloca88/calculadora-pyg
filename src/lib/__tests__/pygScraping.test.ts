import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseChaco, parseGsNumber } from '../pygScraping';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('parseGsNumber', () => {
  it('parses Paraguayan thousands-separator numbers', () => {
    expect(parseGsNumber('5.580')).toBe(5580);
    expect(parseGsNumber('5.730')).toBe(5730);
  });

  it('returns null for empty or zero values', () => {
    expect(parseGsNumber('')).toBeNull();
    expect(parseGsNumber('0')).toBeNull();
  });
});

describe('parseChaco', () => {
  it('extracts compra/venta and timestamp from the real widget markup', () => {
    const result = parseChaco(fixture('chaco.html'));
    expect(result.compra).toBe(5580);
    expect(result.venta).toBe(5730);
    expect(result.updatedAt).toBe('08/10/2026 17:00');
  });

  // Cambios Chaco es la única fuente de PYG/USD de la app: si el regex se
  // rompe (el sitio cambia su markup) y empieza a devolver null en silencio,
  // Efectivo USD queda sin tasa sin que nada lo marque como error. Este test
  // es un guardrail explícito e independiente del valor exacto.
  it('nunca debe devolver compra o venta null cuando el HTML trae la fila de Dólar Americano', () => {
    const result = parseChaco(fixture('chaco.html'));
    expect(result.compra).not.toBeNull();
    expect(result.venta).not.toBeNull();
  });

  it('returns nulls when the expected markup is missing', () => {
    const result = parseChaco('<html><body>no data here</body></html>');
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
    expect(result.updatedAt).toBeNull();
  });
});
