import { isSaneRate } from './pygScraping';

/**
 * Tasa de Cambios Chaco leída desde la Mac de Pablo (IP residencial) y
 * pusheada a POST /api/pyg-rates/push — Cloudflare le da 403 a Vercel y a
 * GitHub Actions, así que el backend no puede leer Chaco directo.
 */
export interface PushedChacoRate {
  compra: number;
  venta: number;
  /** Timestamp de la casa, tal cual el widget: "12/10/2026 17:25". */
  updatedAt: string | null;
  /** ISO — cuándo la Mac leyó el widget. */
  readAt: string;
}

export const PUSH_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const READ_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const STORE_KEY = 'pyg:chaco:pushed';

export type PushValidation =
  | { ok: true; value: PushedChacoRate }
  | { ok: false; error: string };

/**
 * Valida el body del push con la misma cordura que los parsers
 * (compra en [4.000, 10.000], venta > compra) y un readAt ISO que no esté
 * en el futuro.
 */
export const validatePushBody = (body: unknown, now = Date.now()): PushValidation => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const { compra, venta, updatedAt, readAt } = body as Record<string, unknown>;

  if (typeof compra !== 'number' || typeof venta !== 'number') {
    return { ok: false, error: 'compra and venta must be numbers' };
  }
  if (!isSaneRate(compra, venta)) {
    return { ok: false, error: 'rate failed sanity check (4000-10000, venta > compra)' };
  }
  if (updatedAt !== null && updatedAt !== undefined && typeof updatedAt !== 'string') {
    return { ok: false, error: 'updatedAt must be a string or null' };
  }
  if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) {
    return { ok: false, error: 'readAt must be an ISO date string' };
  }
  if (Date.parse(readAt) > now + READ_AT_FUTURE_TOLERANCE_MS) {
    return { ok: false, error: 'readAt is in the future' };
  }

  return {
    ok: true,
    value: { compra, venta, updatedAt: (updatedAt as string | null | undefined) ?? null, readAt },
  };
};

export const isPushFresh = (pushed: PushedChacoRate | null, now = Date.now()): pushed is PushedChacoRate =>
  pushed !== null && now - Date.parse(pushed.readAt) < PUSH_MAX_AGE_MS;

// Upstash Redis (Vercel Marketplace) por REST — la integración inyecta
// KV_REST_API_URL/KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_* según versión).
const storeConfig = (): { url: string; token: string } | null => {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
};

export const isStoreConfigured = (): boolean => storeConfig() !== null;

const redis = async (command: (string | number)[]): Promise<unknown> => {
  const config = storeConfig();
  if (!config) throw new Error('store_not_configured');
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`store HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`store error: ${json.error}`);
  return json.result;
};

export const writePushedChaco = async (rate: PushedChacoRate): Promise<void> => {
  await redis(['SET', STORE_KEY, JSON.stringify(rate)]);
};

/**
 * Lee el último push. Devuelve null si no hay store, no hay valor, o el
 * valor guardado ya no pasa la validación (nunca tira: un store caído no
 * debe tumbar /api/pyg-rates, que todavía tiene Maxi de fallback).
 */
export const readPushedChaco = async (): Promise<PushedChacoRate | null> => {
  if (!isStoreConfigured()) return null;
  try {
    const raw = await redis(['GET', STORE_KEY]);
    if (typeof raw !== 'string') return null;
    const parsed = validatePushBody(JSON.parse(raw));
    return parsed.ok ? parsed.value : null;
  } catch (error) {
    console.error('[chacoPushStore] read failed:', error);
    return null;
  }
};
