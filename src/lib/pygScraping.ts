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
