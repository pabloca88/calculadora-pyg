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
 */
export const parseChaco = (html: string): ExchangeHouseRate => {
  const tsMatch = html.match(
    /Última Actualización:[\s\S]*?class="time">[\s\S]*?<\/i>\s*([\d/]+\s+[\d:]+)/
  );
  const rowMatch = html.match(
    /Dólar Americano<\/td>\s*<td[^>]*>\s*([\d.,]+)[\s\S]{0,60}?<\/td>\s*<td[^>]*>\s*([\d.,]+)/
  );

  return {
    compra: rowMatch ? parseGsNumber(rowMatch[1]) : null,
    venta: rowMatch ? parseGsNumber(rowMatch[2]) : null,
    updatedAt: tsMatch ? tsMatch[1] : null,
  };
};

/**
 * Parsea la página pública de Maxicambios (Angular SSR). La página repite
 * las cotizaciones por sucursal (Asunción, CDE) y por tipo (efectivo,
 * transferencia); acotamos al bloque "Asunción" (cotizacion-carousel), que
 * es la cotización de efectivo por defecto, antes de la sección CDE.
 */
export const parseMaxi = (html: string): ExchangeHouseRate => {
  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = startIdx >= 0 ? html.indexOf('id="cotizacion-cd"', startIdx) : -1;
  if (startIdx < 0 || endIdx < 0) {
    return { compra: null, venta: null, updatedAt: null };
  }
  const section = html.slice(startIdx, endIdx);

  const match = section.match(
    /Dólar<\/p>[\s\S]{0,500}?Compra<\/p>\s*<p[^>]*>\s*([\d.,]+)[\s\S]{0,1000}?Venta<\/p>\s*<p[^>]*>\s*([\d.,]+)/
  );

  return {
    compra: match ? parseGsNumber(match[1]) : null,
    venta: match ? parseGsNumber(match[2]) : null,
    updatedAt: null,
  };
};
