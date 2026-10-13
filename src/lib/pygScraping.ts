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

export const RATE_MIN = 4000;
export const RATE_MAX = 10000;

/**
 * Validación de cordura compartida por ambos parsers: compra o venta fuera de
 * [4.000, 10.000], o venta <= compra, es señal de que el regex agarró
 * otra cosa (otra moneda, otro producto, markup roto) — preferimos null a
 * devolver un número que parece válido pero está mal.
 */
export const isSaneRate = (compra: number | null, venta: number | null): boolean => {
  if (compra === null || venta === null) return false;
  if (compra < RATE_MIN || compra > RATE_MAX) return false;
  if (venta < RATE_MIN || venta > RATE_MAX) return false;
  if (venta <= compra) return false;
  return true;
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

  const compra = rowMatch ? parseGsNumber(rowMatch[1]) : null;
  const venta = rowMatch ? parseGsNumber(rowMatch[2]) : null;
  const updatedAt = tsMatch ? tsMatch[1] : null;

  if (!isSaneRate(compra, venta)) {
    if (compra !== null || venta !== null) {
      console.warn('[pygScraping] parseChaco: tasa fuera de rango, descartada', { compra, venta });
    }
    return { compra: null, venta: null, updatedAt };
  }

  return { compra, venta, updatedAt };
};

/**
 * Parsea la página pública de Maxicambios (Angular SSR), sección
 * "cotizacion-carousel" (Asunción, efectivo) antes de "cotizacion-cd" (CDE).
 *
 * La sección lista varias monedas con el mismo texto visible "Dólar" — USD,
 * CAD (Dólar canadiense) y AUD (Dólar australiano) todas dicen "Dólar</p>",
 * solo se distinguen por el ícono de bandera (flags/USD.png, flags/CAD.png,
 * flags/AUD.png) y el orden en que aparecen no es estable entre requests.
 * Por eso NUNCA hay que confiar en "el primer Dólar</p>" — hay que anclar en
 * flags/USD.png específicamente y cortar el bloque en la bandera siguiente,
 * para que el regex de Compra/Venta no se escape a la moneda de al lado.
 */
export const parseMaxi = (html: string): ExchangeHouseRate => {
  // Header de la página (arriba de las secciones de cotización):
  //   <strong ...>Ultima actualización:</strong> <span ...>12/10/2026 - 16:31</span>
  // Se normaliza a "12/10/2026 16:31", el mismo formato que parseChaco.
  const tsMatch = html.match(
    /Ultima actualizaci[oó]n:<\/strong>\s*<span[^>]*>\s*([\d/]+)\s*-\s*([\d:]+)/i
  );
  const updatedAt = tsMatch ? `${tsMatch[1]} ${tsMatch[2]}` : null;

  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = startIdx >= 0 ? html.indexOf('id="cotizacion-cd"', startIdx) : -1;
  if (startIdx < 0 || endIdx < 0) {
    return { compra: null, venta: null, updatedAt: null };
  }
  const section = html.slice(startIdx, endIdx);

  const usdFlagIdx = section.indexOf('flags/USD.png');
  if (usdFlagIdx < 0) {
    return { compra: null, venta: null, updatedAt: null };
  }
  const nextFlagIdx = section.indexOf('flags/', usdFlagIdx + 1);
  const usdBlock = section.slice(usdFlagIdx, nextFlagIdx > 0 ? nextFlagIdx : usdFlagIdx + 2500);

  const match = usdBlock.match(
    /Dólar<\/p>[\s\S]{0,500}?Compra<\/p>\s*<p[^>]*>\s*([\d.,]+)[\s\S]{0,1500}?Venta<\/p>\s*<p[^>]*>\s*([\d.,]+)/
  );

  const compra = match ? parseGsNumber(match[1]) : null;
  const venta = match ? parseGsNumber(match[2]) : null;

  if (!isSaneRate(compra, venta)) {
    if (compra !== null || venta !== null) {
      console.warn('[pygScraping] parseMaxi: tasa fuera de rango, descartada', { compra, venta });
    }
    return { compra: null, venta: null, updatedAt };
  }

  return { compra, venta, updatedAt };
};
