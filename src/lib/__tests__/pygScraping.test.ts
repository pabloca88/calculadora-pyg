import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseChaco, parseMaxi, parseGsNumber } from '../pygScraping';

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

  it('returns nulls when the expected markup is missing', () => {
    const result = parseChaco('<html><body>no data here</body></html>');
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
    expect(result.updatedAt).toBeNull();
  });
});

describe('parseMaxi', () => {
  it('extracts compra/venta from the Asunción cash section of the real page', () => {
    const result = parseMaxi(fixture('maxi.html'));
    expect(result.compra).toBe(5500);
    expect(result.venta).toBe(5750);
  });

  it('returns nulls when the expected markup is missing', () => {
    const result = parseMaxi('<html><body>no data here</body></html>');
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });
});
