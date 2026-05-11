import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchARSRates, getARSStatus } from '../rates';
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
