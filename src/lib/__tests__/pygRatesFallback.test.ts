import { describe, it, expect, vi } from 'vitest';
import { resolveRate } from '../pygRatesFallback';

const CHACO_HTML_OK = `
  <div class="cotiz-update">Última Actualización: <span class="time"><i class="fa fa-clock-o"></i> 08/10/2026 17:00</span></div>
  <tr><td><i class="moneda dolarUs"></i> Dólar Americano</td><td class="text-right"> 5.580 <i></i></td><td class="text-right"> 5.730 <i></i></td></tr>
`;
const CHACO_HTML_BROKEN = '<html><body>no data here</body></html>';

const buildMaxiCurrencyBlock = (flag: string, compra: string, venta: string) => `
  <img src="https://www.maxicambios.com.py/themes/default/assets/images/flags/${flag}.png">
  <p>Dólar</p><p></p>
  <div><p>Compra</p><p id="">${compra}<img src="equal.svg"></p></div>
  <div><p>Venta</p><p id="">${venta}<img src="equal.svg"></p></div>
`;
const wrapMaxiSection = (inner: string) =>
  `<div id="cotizacion-carousel">${inner}</div><div id="cotizacion-cd">CDE</div>`;

const MAXI_HTML_OK = wrapMaxiSection(buildMaxiCurrencyBlock('USD', '5500', '5750'));
const MAXI_HTML_BROKEN = '<html><body>no data here</body></html>';

describe('resolveRate', () => {
  it('usa Chaco y ni siquiera llama a fetchMaxiHtml cuando Chaco responde bien', async () => {
    const fetchChaco = vi.fn().mockResolvedValue(CHACO_HTML_OK);
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate(fetchChaco, fetchMaxi);

    expect(result.source).toBe('chaco');
    expect(result.rate.compra).toBe(5580);
    expect(result.chacoError).toBeUndefined();
    expect(fetchMaxi).not.toHaveBeenCalled();
  });

  it('cae a Maxi cuando Chaco no tiene una tasa válida (ej. HTML sin la fila esperada)', async () => {
    const fetchChaco = vi.fn().mockResolvedValue(CHACO_HTML_BROKEN);
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate(fetchChaco, fetchMaxi);

    expect(result.source).toBe('maxi');
    expect(result.rate.compra).toBe(5500);
    expect(result.chacoError).toBe('parse_failed');
    expect(fetchMaxi).toHaveBeenCalledTimes(1);
  });

  it('cae a Maxi cuando fetchChacoHtml tira (ej. 403 de Cloudflare)', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate(fetchChaco, fetchMaxi);

    expect(result.source).toBe('maxi');
    expect(result.rate.compra).toBe(5500);
    expect(result.chacoError).toBe('HTTP 403');
  });

  it('devuelve source "none" cuando Chaco y Maxi fallan los dos', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_BROKEN);

    const result = await resolveRate(fetchChaco, fetchMaxi);

    expect(result.source).toBe('none');
    expect(result.rate.compra).toBeNull();
    expect(result.chacoError).toBe('HTTP 403');
  });

  it('devuelve source "none" cuando fetchMaxiHtml también tira', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await resolveRate(fetchChaco, fetchMaxi);

    expect(result.source).toBe('none');
    expect(result.rate.compra).toBeNull();
  });
});
