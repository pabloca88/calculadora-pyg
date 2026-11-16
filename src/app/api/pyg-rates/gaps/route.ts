import { NextResponse } from 'next/server';
import { isPushRateLimited, isStoreConfigured, readRateGaps } from '@/lib/chacoPushStore';
import { checkPushBearer, clientKey } from '@/lib/pushAuth';
import { RATE_GAP_WINDOW_DAYS, summarizeGaps } from '@/lib/rateGap';

export const dynamic = 'force-dynamic';

/**
 * Chaco-vs-Maxicambios gaps recorded on each push (log-only), for
 * `npm run report:gaps`. Same bearer PUSH_TOKEN as the push endpoint, so the
 * KV credentials never leave Vercel.
 */
export async function GET(request: Request) {
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
  if (!isStoreConfigured()) {
    return NextResponse.json({ error: 'store not configured' }, { status: 503 });
  }

  const now = Date.now();
  const since = now - RATE_GAP_WINDOW_DAYS * 86_400_000;
  const entries = (await readRateGaps()).filter((e) => Date.parse(e.at) >= since);
  return NextResponse.json(
    { windowDays: RATE_GAP_WINDOW_DAYS, summary: summarizeGaps(entries, now), entries },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
