import { NextResponse } from 'next/server';
import { parseChaco, type ExchangeHouseRate } from '@/lib/pygScraping';

export interface PygRatesResponse {
  chaco: ExchangeHouseRate;
  source: 'scraping';
  cachedAt: string;
}

const CHACO_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';

// Headers realistas para evitar bloqueos por bot-detection
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-PY,es;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { data: PygRatesResponse; expiresAt: number } | null = null;

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRates(): Promise<PygRatesResponse> {
  let chaco: ExchangeHouseRate;
  try {
    chaco = parseChaco(await fetchWithTimeout(CHACO_URL));
  } catch (error) {
    console.error('[pyg-rates] chaco fetch failed:', error);
    chaco = { compra: null, venta: null, updatedAt: null };
  }

  // Log para debugging en Vercel
  console.log('[pyg-rates] chaco:', chaco);

  return { chaco, source: 'scraping', cachedAt: new Date().toISOString() };
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
        source: 'scraping',
        cachedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
