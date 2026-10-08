export interface ExchangeHouseRate {
  compra: number | null;
  venta: number | null;
  updatedAt: string | null;
}

export const parseGsNumber = (raw: string): number | null => {
  const normalized = raw.trim().replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Parsea el widget público de Cambios Chaco (HTML server-rendered, sin JS).
 * HTML real:
 *   <td><i class="moneda dolarUs"></i> Dólar Americano</td>
 *   <td class="text-right"> 5.580 <i class="estado baja"></i></td>
 *   <td class="text-right"> 5.730 <i class="estado baja"></i></td>
 */
export const parseChaco = (html: string): ExchangeHouseRate => {
  const tsMatch = html.match(
    /Última Actualización:[\s\S]*?class="time">[\s\S]*?<\/i>\s*([\d/]+\s+[\d:]+)/
  );
  // Matches "Dólar Americano</td>" (con o sin <i> antes) + dos <td> con valores
  const rowMatch = html.match(
    /Dólar Americano<\/td>\s*<td[^>]*>\s*([\d.,]+)[\s\S]{0,200}?<\/td>\s*<td[^>]*>\s*([\d.,]+)/
  );

  return {
    compra: rowMatch ? parseGsNumber(rowMatch[1]) : null,
    venta: rowMatch ? parseGsNumber(rowMatch[2]) : null,
    updatedAt: tsMatch ? tsMatch[1] : null,
  };
};

/**
 * Parsea la página pública de Maxicambios (Angular SSR).
 * Acota al bloque "cotizacion-carousel" (Asunción efectivo) antes de "cotizacion-cd".
 * HTML real:
 *   Dólar</p>
 *   ...Compra</p> <p ...>5500\n<img ...></p>
 *   ...Venta</p>  <p ...>5750\n<img ...></p>
 */
export const parseMaxi = (html: string): ExchangeHouseRate => {
  const tsMatch = html.match(/([\d]{2}\/[\d]{2}\/[\d]{4}\s*-\s*[\d:]+)/);

  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = startIdx >= 0 ? html.indexOf('id="cotizacion-cd"', startIdx) : -1;
  if (startIdx < 0 || endIdx < 0) {
    return { compra: null, venta: null, updatedAt: tsMatch ? tsMatch[1].trim() : null };
  }
  const section = html.slice(startIdx, endIdx);

  const match = section.match(
    /Dólar<\/p>[\s\S]{0,500}?Compra<\/p>\s*<p[^>]*>\s*([\d.,]+)[\s\S]{0,1500}?Venta<\/p>\s*<p[^>]*>\s*([\d.,]+)/
  );

  return {
    compra: match ? parseGsNumber(match[1]) : null,
    venta: match ? parseGsNumber(match[2]) : null,
    updatedAt: tsMatch ? tsMatch[1].trim() : null,
  };
};
