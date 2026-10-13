import { NextResponse } from 'next/server';
import { resolveRate, type RateResolution } from '@/lib/pygRatesFallback';
import { readPushedChaco } from '@/lib/chacoPushStore';

export const dynamic = 'force-dynamic';

export type PygRatesResponse = RateResolution & { cachedAt: string };

const CHACO_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const MAXI_URL = 'https://www.maxicambios.com.py/share';

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

// Caché en memoria SOLO del scraping (HTML o error de Chaco/Maxi, 30 min por
// URL) — el valor pusheado desde la Mac se lee del store en cada GET, así
// que un push nuevo se ve en el próximo request sin invalidar nada.
const CACHE_TTL_MS = 30 * 60 * 1000;
const htmlCache = new Map<string, { result: Promise<string>; expiresAt: number }>();

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

function cachedFetch(url: string): Promise<string> {
  const now = Date.now();
  const hit = htmlCache.get(url);
  if (hit && hit.expiresAt > now) return hit.result;
  const result = fetchWithTimeout(url);
  result.catch(() => {}); // el rechazo se maneja en resolveRate; evita unhandled rejection
  htmlCache.set(url, { result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

export async function GET() {
  const resolution = await resolveRate({
    readPushedChaco,
    fetchChacoHtml: () => cachedFetch(CHACO_URL),
    fetchMaxiHtml: () => cachedFetch(MAXI_URL),
  });

  if (resolution.source === 'none') {
    console.error('[pyg-rates] Chaco y Maxi fallaron:', resolution.chacoError);
  } else if (resolution.source === 'maxi') {
    console.warn('[pyg-rates] Chaco no disponible, fallback a Maxi:', resolution.chacoError);
  }

  const data: PygRatesResponse = { ...resolution, cachedAt: new Date().toISOString() };
  return NextResponse.json(data);
}
