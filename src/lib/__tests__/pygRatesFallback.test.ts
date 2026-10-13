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

const NOW = Date.parse('2026-10-12T20:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const noPush = async () => null;
const pushedAt = (ageMs: number) => async () => ({
  compra: 5630,
  venta: 5740,
  updatedAt: '12/10/2026 17:25',
  readAt: new Date(NOW - ageMs).toISOString(),
});

describe('resolveRate', () => {
  it('usa Chaco y ni siquiera llama a fetchMaxiHtml cuando Chaco responde bien', async () => {
    const fetchChaco = vi.fn().mockResolvedValue(CHACO_HTML_OK);
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate({ readPushedChaco: noPush, fetchChacoHtml: fetchChaco, fetchMaxiHtml: fetchMaxi });

    expect(result.source).toBe('chaco');
    expect(result.rate.compra).toBe(5580);
    expect(result.chacoVia).toBe('direct');
    expect(fetchMaxi).not.toHaveBeenCalled();
  });

  it('cae a Maxi cuando Chaco no tiene una tasa válida (ej. HTML sin la fila esperada)', async () => {
    const fetchChaco = vi.fn().mockResolvedValue(CHACO_HTML_BROKEN);
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate({ readPushedChaco: noPush, fetchChacoHtml: fetchChaco, fetchMaxiHtml: fetchMaxi });

    expect(result.source).toBe('maxi');
    expect(result.rate.compra).toBe(5500);
    expect(result.chacoError).toBe('push_missing; parse_failed');
    expect(fetchMaxi).toHaveBeenCalledTimes(1);
  });

  it('cae a Maxi cuando fetchChacoHtml tira (ej. 403 de Cloudflare)', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

    const result = await resolveRate({ readPushedChaco: noPush, fetchChacoHtml: fetchChaco, fetchMaxiHtml: fetchMaxi });

    expect(result.source).toBe('maxi');
    expect(result.rate.compra).toBe(5500);
    expect(result.chacoError).toBe('push_missing; HTTP 403');
  });

  it('devuelve source "none" cuando Chaco y Maxi fallan los dos', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_BROKEN);

    const result = await resolveRate({ readPushedChaco: noPush, fetchChacoHtml: fetchChaco, fetchMaxiHtml: fetchMaxi });

    expect(result.source).toBe('none');
    expect(result.rate.compra).toBeNull();
    expect(result.chacoError).toBe('push_missing; HTTP 403');
  });

  it('devuelve source "none" cuando fetchMaxiHtml también tira', async () => {
    const fetchChaco = vi.fn().mockRejectedValue(new Error('HTTP 403'));
    const fetchMaxi = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await resolveRate({ readPushedChaco: noPush, fetchChacoHtml: fetchChaco, fetchMaxiHtml: fetchMaxi });

    expect(result.source).toBe('none');
    expect(result.rate.compra).toBeNull();
  });

  describe('push desde la Mac', () => {
    it('(a) usa el push fresco (< 3 h) sin tocar Chaco ni Maxi', async () => {
      const fetchChaco = vi.fn().mockResolvedValue(CHACO_HTML_OK);
      const fetchMaxi = vi.fn().mockResolvedValue(MAXI_HTML_OK);

      const result = await resolveRate({
        readPushedChaco: pushedAt(2 * HOUR),
        fetchChacoHtml: fetchChaco,
        fetchMaxiHtml: fetchMaxi,
        now: () => NOW,
      });

      expect(result).toEqual({
        rate: { compra: 5630, venta: 5740, updatedAt: '12/10/2026 17:25' },
        source: 'chaco',
        chacoVia: 'push',
        readAt: new Date(NOW - 2 * HOUR).toISOString(),
      });
      expect(fetchChaco).not.toHaveBeenCalled();
      expect(fetchMaxi).not.toHaveBeenCalled();
    });

    it('(b) push viejo (>= 3 h) → intenta Chaco directo', async () => {
      const result = await resolveRate({
        readPushedChaco: pushedAt(3 * HOUR),
        fetchChacoHtml: vi.fn().mockResolvedValue(CHACO_HTML_OK),
        fetchMaxiHtml: vi.fn().mockResolvedValue(MAXI_HTML_OK),
        now: () => NOW,
      });

      expect(result.source).toBe('chaco');
      expect(result.chacoVia).toBe('direct');
      expect(result.rate.compra).toBe(5580);
      expect(result.chacoError).toBe('push_stale');
    });

    it('(c) push viejo + Chaco bloqueado → Maxi', async () => {
      const result = await resolveRate({
        readPushedChaco: pushedAt(5 * HOUR),
        fetchChacoHtml: vi.fn().mockRejectedValue(new Error('HTTP 403')),
        fetchMaxiHtml: vi.fn().mockResolvedValue(MAXI_HTML_OK),
        now: () => NOW,
      });

      expect(result.source).toBe('maxi');
      expect(result.rate.compra).toBe(5500);
      expect(result.chacoError).toBe('push_stale; HTTP 403');
    });

    it('un store que tira se trata como "sin push" y sigue la cadena', async () => {
      const result = await resolveRate({
        readPushedChaco: vi.fn().mockRejectedValue(new Error('store down')),
        fetchChacoHtml: vi.fn().mockRejectedValue(new Error('HTTP 403')),
        fetchMaxiHtml: vi.fn().mockResolvedValue(MAXI_HTML_OK),
        now: () => NOW,
      });

      expect(result.source).toBe('maxi');
      expect(result.chacoError).toBe('push_missing; HTTP 403');
    });
  });
});
