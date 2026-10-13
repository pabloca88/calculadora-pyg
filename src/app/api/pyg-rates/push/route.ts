import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isStoreConfigured, validatePushBody, writePushedChaco } from '@/lib/chacoPushStore';

export const dynamic = 'force-dynamic';

// Hashea ambos lados para que timingSafeEqual reciba buffers del mismo largo
// (no filtra el largo del token esperado).
const tokensMatch = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest()
  );

/**
 * Recibe la tasa de Cambios Chaco leída desde la Mac (scripts/push-chaco.ts).
 * Body: { compra, venta, updatedAt, readAt } — validado con la misma
 * cordura que los parsers; 400 si no pasa.
 */
export async function POST(request: Request) {
  const expected = process.env.PUSH_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'PUSH_TOKEN not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!given || !tokensMatch(given, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
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
