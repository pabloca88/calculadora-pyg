import { NextResponse, after } from 'next/server';
import { isPushRateLimited, isStoreConfigured, validatePushBody, writePushedChaco } from '@/lib/chacoPushStore';
import { checkPushBearer, clientKey } from '@/lib/pushAuth';
import { recordRateGap } from '@/lib/rateGapRecorder';

export const dynamic = 'force-dynamic';

// The real payload is ~120 bytes; anything far larger is rejected unread.
const MAX_BODY_BYTES = 2048;

/**
 * Receives the Cambios Chaco rate read on the maintainer's Mac
 * (scripts/push-chaco.ts). Body: { compra, venta, updatedAt, readAt },
 * validated with the same sanity rules as the parsers (400 otherwise).
 * Order: rate limit (429) → auth (401) → body size (413) → JSON/validation (400).
 * After a successful store, the gap vs Maxicambios is recorded LOG-ONLY,
 * after the response is sent: it never changes what the push returns.
 */
export async function POST(request: Request) {
  if (await isPushRateLimited(clientKey(request))) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const auth = checkPushBearer(request);
  if (auth === 'not_configured') {
    return NextResponse.json({ error: 'PUSH_TOKEN not configured' }, { status: 503 });
  }
  if (auth === 'unauthorized') {
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

  try {
    const stored = validation.value;
    after(() => recordRateGap(stored));
  } catch (error) {
    // Gap logging is optional; it must never affect the push.
    console.error('[pyg-rates/push] could not schedule gap logging:', error);
  }

  return NextResponse.json({ ok: true, stored: validation.value });
}
