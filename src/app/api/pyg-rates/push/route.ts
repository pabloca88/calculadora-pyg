import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isPushRateLimited, isStoreConfigured, validatePushBody, writePushedChaco } from '@/lib/chacoPushStore';

export const dynamic = 'force-dynamic';

// The real payload is ~120 bytes; anything far larger is rejected unread.
const MAX_BODY_BYTES = 2048;

// Hash both sides so timingSafeEqual gets equal-length buffers (does not leak
// the expected token's length).
const tokensMatch = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest()
  );

const clientKey = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  request.headers.get('x-real-ip') ||
  'unknown';

/**
 * Receives the Cambios Chaco rate read on the maintainer's Mac
 * (scripts/push-chaco.ts). Body: { compra, venta, updatedAt, readAt },
 * validated with the same sanity rules as the parsers (400 otherwise).
 * Order: rate limit (429) → auth (401) → body size (413) → JSON/validation (400).
 */
export async function POST(request: Request) {
  if (await isPushRateLimited(clientKey(request))) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const expected = process.env.PUSH_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'PUSH_TOKEN not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!given || !tokensMatch(given, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const validation = validatePushBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (!isStoreConfigured()) {
    return NextResponse.json({ error: 'store not configured' }, { status: 503 });
  }

  try {
    await writePushedChaco(validation.value);
  } catch (error) {
    console.error('[pyg-rates/push] store write failed:', error);
    return NextResponse.json({ error: 'store write failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, stored: validation.value });
}
