import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchARSRates, getARSStatus, fetchPygExchangeHouseRates } from '../rates';
import * as storage from '../storage';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const mockApiResponse = [
  { casa: 'oficial', nombre: 'Oficial', compra: 980, venta: 1000 },
  { casa: 'tarjeta', nombre: 'Tarjeta', compra: 1270, venta: 1300 },
  { casa: 'bolsa', nombre: 'Bolsa/MEP', compra: 1240, venta: 1250 },
  { casa: 'cripto', nombre: 'Cripto', compra: 1260, venta: 1280 },
];

describe('fetchARSRates', () => {
  it('returns parsed rates from API on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    }));

    const rates = await fetchARSRates();

    expect(rates.oficial).toBe(1000);
    expect(rates.tarjeta).toBe(1300);
    expect(rates.mep).toBe(1250);
    expect(rates.cripto).toBe(1280);
    expect(rates.custom).toBeNull();
  });

  it('caches rates to localStorage after successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    }));

    await fetchARSRates();

    const cached = storage.loadARSCache();
    expect(cached?.tarjeta).toBe(1300);
  });

  it('falls back to cached rates when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    storage.saveARSCache({ oficial: 999, tarjeta: 1299, mep: null, cripto: null, custom: null });

    const rates = await fetchARSRates();

    expect(rates.tarjeta).toBe(1299);
  });

  it('returns empty rates when fetch fails and no cache exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const rates = await fetchARSRates();

    expect(rates.oficial).toBeNull();
    expect(rates.tarjeta).toBeNull();
    expect(rates.mep).toBeNull();
    expect(rates.cripto).toBeNull();
  });

  it('falls back to cache when API returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    storage.saveARSCache({ oficial: 999, tarjeta: 1299, mep: null, cripto: null, custom: null });

    const rates = await fetchARSRates();

    expect(rates.tarjeta).toBe(1299);
  });
});

describe('getARSStatus', () => {
  it('returns "Cargando..." while loading', () => {
    expect(getARSStatus(true, false)).toBe('Cargando...');
  });

  it('returns "Error" when there is an error', () => {
    expect(getARSStatus(false, true)).toBe('Error');
  });

  it('returns "LIVE" on success', () => {
    expect(getARSStatus(false, false)).toBe('LIVE');
  });
});

describe('fetchPygExchangeHouseRates', () => {
  const mockChacoResponse = {
    rate: { compra: 5580, venta: 5730, updatedAt: '08/10/2026 17:00' },
    source: 'chaco',
    cachedAt: '2026-10-08T19:00:00.000Z',
  };

  it('returns parsed rates from /api/pyg-rates on success, tagged as api source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockChacoResponse,
    }));

    const rates = await fetchPygExchangeHouseRates(true);

    expect(rates.rate.compra).toBe(5580);
    expect(rates.rate.source).toBe('api');
    expect(rates.houseSource).toBe('chaco');
  });

  it('surfaces houseSource "maxi" and chacoError when the API fell back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rate: { compra: 5500, venta: 5750, updatedAt: null },
        source: 'maxi',
        chacoError: 'HTTP 403',
        cachedAt: '2026-10-08T19:00:00.000Z',
      }),
    }));

    const rates = await fetchPygExchangeHouseRates(true);

    expect(rates.rate.compra).toBe(5500);
    expect(rates.houseSource).toBe('maxi');
    expect(rates.chacoError).toBe('HTTP 403');
  });

  it('falls back to all-null rates when fetch fails and there is no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const rates = await fetchPygExchangeHouseRates(true);

    expect(rates.rate.compra).toBeNull();
    expect(rates.rate.source).toBe('none');
    expect(rates.houseSource).toBe('none');
  });

  it('marks rate as source "none" when neither Chaco nor Maxi returned a compra value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rate: { compra: null, venta: null, updatedAt: null },
        source: 'none',
        cachedAt: '2026-10-08T19:00:00.000Z',
      }),
    }));

    const rates = await fetchPygExchangeHouseRates(true);

    expect(rates.rate.source).toBe('none');
    expect(rates.houseSource).toBe('none');
  });
});
