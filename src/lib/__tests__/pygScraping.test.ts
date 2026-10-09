import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseChaco, parseMaxi, parseGsNumber } from '../pygScraping';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

// Construye un bloque de moneda con la misma estructura de tags que usa
// Maxicambios de verdad (ver fixtures/maxi.html), para poder probar el
// parser con distintos órdenes de moneda sin depender de que el sitio en
// vivo tenga ese orden en el momento de correr los tests.
const buildCurrencyBlock = (flag: string, compra: string, venta: string) => `
  <img class="tamaño2" src="https://www.maxicambios.com.py/themes/default/assets/images/flags/${flag}.png" style="width:10%;padding:5px;">
  <p class="ng-tns-c4-0">Dólar</p><p></p>
  <div><p>Compra</p><p id="">${compra}<img src="https://www.maxicambios.com.py/themes/default/assets/images/equal.svg"></p></div>
  <div><p>Venta</p><p id="">${venta}<img src="https://www.maxicambios.com.py/themes/default/assets/images/equal.svg"></p></div>
`;

const wrapSection = (inner: string) =>
  `<div id="cotizacion-carousel">${inner}</div><div id="cotizacion-cd">CDE</div>`;

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

  // Cambios Chaco es (junto con Maxi de fallback) la única fuente de
  // PYG/USD de la app: si el regex se rompe (el sitio cambia su markup) y
  // empieza a devolver null en silencio, Efectivo USD queda sin tasa sin
  // que nada lo marque como error. Este test es un guardrail explícito e
  // independiente del valor exacto.
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

  it('descarta una tasa fuera de rango (ej. regex corrido a otra fila)', () => {
    const brokenHtml = `
      <div class="cotiz-update">Última Actualización: <span class="time"><i class="fa fa-clock-o"></i> 08/10/2026 17:00</span></div>
      <tr><td><i class="moneda dolarUs"></i> Dólar Americano</td><td class="text-right"> 50 <i></i></td><td class="text-right"> 60 <i></i></td></tr>
    `;
    const result = parseChaco(brokenHtml);
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });
});

describe('parseMaxi', () => {
  it('extracts the real USD compra/venta from the live page snapshot', () => {
    const result = parseMaxi(fixture('maxi.html'));
    expect(result.compra).toBe(5500);
    expect(result.venta).toBe(5750);
  });

  it('returns nulls when the expected markup is missing', () => {
    const result = parseMaxi('<html><body>no data here</body></html>');
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });

  // Regresión del bug real: Maxicambios lista Dólar Canadiense y Dólar
  // Australiano ANTES de Dólar Americano en la misma sección, y las tres
  // dicen "Dólar</p>" en el texto visible — solo se distinguen por el
  // ícono de bandera. Confiar en "el primer Dólar" agarra la cotización
  // de CAD (3850) en vez de la de USD (5500). El orden tampoco es estable
  // entre requests del sitio real, así que esto tiene que funcionar sin
  // importar en qué posición aparezca USD.
  it('ignora Dólar Canadiense y Dólar Australiano (orden real) y extrae USD', () => {
    const html = wrapSection(
      buildCurrencyBlock('CAD', '3850', '4350') +
      buildCurrencyBlock('AUD', '3500', '4300') +
      buildCurrencyBlock('USD', '5500', '5750')
    );
    const result = parseMaxi(html);
    expect(result.compra).toBe(5500);
    expect(result.venta).toBe(5750);
  });

  it('sigue funcionando cuando USD aparece primero (orden viejo)', () => {
    const html = wrapSection(buildCurrencyBlock('USD', '5500', '5750'));
    const result = parseMaxi(html);
    expect(result.compra).toBe(5500);
    expect(result.venta).toBe(5750);
  });

  it('devuelve null si no hay ningún bloque con flags/USD.png', () => {
    const html = wrapSection(buildCurrencyBlock('CAD', '3850', '4350'));
    const result = parseMaxi(html);
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });

  it('descarta una tasa fuera de rango bajo la bandera USD (ej. markup roto)', () => {
    // compra=3850 es un valor real del sitio, pero para CAD — si por algún
    // motivo terminara asociado a la bandera USD, la validación de cordura
    // debe rechazarlo igual (preferible null a un número incorrecto).
    const html = wrapSection(buildCurrencyBlock('USD', '3850', '4350'));
    const result = parseMaxi(html);
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });

  it('descarta cuando venta <= compra', () => {
    const html = wrapSection(buildCurrencyBlock('USD', '5750', '5500'));
    const result = parseMaxi(html);
    expect(result.compra).toBeNull();
    expect(result.venta).toBeNull();
  });
});
