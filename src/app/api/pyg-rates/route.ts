import { NextResponse } from 'next/server';
import type { RateResolution } from '@/lib/pygRatesFallback';
import { resolveLiveRate } from '@/lib/liveRates';

export const dynamic = 'force-dynamic';

export type PygRatesResponse = RateResolution & { cachedAt: string };

export async function GET() {
  const resolution = await resolveLiveRate();

  if (resolution.source === 'none') {
    console.error('[pyg-rates] Chaco y Maxi fallaron:', resolution.chacoError);
  } else if (resolution.source === 'maxi') {
    console.warn('[pyg-rates] Chaco no disponible, fallback a Maxi:', resolution.chacoError);
  }

  const data: PygRatesResponse = { ...resolution, cachedAt: new Date().toISOString() };
  return NextResponse.json(data);
}
