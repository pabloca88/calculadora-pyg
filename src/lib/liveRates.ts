import { resolveRate, type RateResolution } from './pygRatesFallback';
import { readPushedChaco } from './chacoPushStore';

// Shared by GET /api/pyg-rates (web) and GET /api/v1/rates (native apps), so
// both endpoints use one scraping cache and always agree on the rate.

const CHACO_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const MAXI_URL = 'https://www.maxicambios.com.py/share';
const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';

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

async function fetchWithTimeout(url: string, timeoutMs = 8000, headers: Record<string, string> = FETCH_HEADERS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
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

export const resolveLiveRate = (): Promise<RateResolution> =>
  resolveRate({
    readPushedChaco,
    fetchChacoHtml: () => cachedFetch(CHACO_URL),
    fetchMaxiHtml: () => cachedFetch(MAXI_URL),
  });

// DolarAPI JSON for /api/v1/rates. Only successes are cached (5 min), so an
// outage doesn't stick; the CDN cache in front of the route limits retries.
const DOLAR_API_TTL_MS = 5 * 60 * 1000;
let dolarApiCache: { json: unknown; expiresAt: number } | null = null;

export async function fetchDolarApiJson(): Promise<unknown> {
  const now = Date.now();
  if (dolarApiCache && dolarApiCache.expiresAt > now) return dolarApiCache.json;
  try {
    const json: unknown = JSON.parse(await fetchWithTimeout(DOLAR_API_URL, 8000, { Accept: 'application/json' }));
    dolarApiCache = { json, expiresAt: now + DOLAR_API_TTL_MS };
    return json;
  } catch (error) {
    console.warn('[liveRates] DolarAPI failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
