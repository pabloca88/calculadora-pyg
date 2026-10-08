import { NextResponse } from 'next/server';
import { parseChaco, parseMaxi, type ExchangeHouseRate } from '@/lib/pygScraping';

export interface PygRatesResponse {
  chaco: ExchangeHouseRate;
  maxi: ExchangeHouseRate;
  source: 'scraping';
  cachedAt: string;
}

const CHACO_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const MAXI_URL = 'https://www.maxicambios.com.py/share';
const FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CalculadoraPYG/1.0)' };
const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { data: PygRatesResponse; expiresAt: number } | null = null;

async function fetchRates(): Promise<PygRatesResponse> {
  const [chacoResult, maxiResult] = await Promise.allSettled([
    fetch(CHACO_URL, { headers: FETCH_HEADERS, cache: 'no-store' }).then((r) => r.text()),
    fetch(MAXI_URL, { headers: FETCH_HEADERS, cache: 'no-store' }).then((r) => r.text()),
  ]);

  const chaco = chacoResult.status === 'fulfilled'
    ? parseChaco(chacoResult.value)
    : { compra: null, venta: null, updatedAt: null };
  const maxi = maxiResult.status === 'fulfilled'
    ? parseMaxi(maxiResult.value)
    : { compra: null, venta: null, updatedAt: null };

  return {
    chaco,
    maxi,
    source: 'scraping',
    cachedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchRates();
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching PYG rates:', error);
    if (cache) {
      return NextResponse.json(cache.data);
    }
    return NextResponse.json(
      {
        chaco: { compra: null, venta: null, updatedAt: null },
        maxi: { compra: null, venta: null, updatedAt: null },
        source: 'scraping',
        cachedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
