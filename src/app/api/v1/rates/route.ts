import { NextResponse } from 'next/server';
import { fetchDolarApiJson, resolveLiveRate } from '@/lib/liveRates';
import { buildRatesV1 } from '@/lib/ratesV1';

export const dynamic = 'force-dynamic';

/**
 * Versioned, frozen rates endpoint for the native apps (contract in
 * src/lib/ratesV1.ts). Same rate resolution as /api/pyg-rates, plus the ARS
 * rates from DolarAPI, in one response.
 */
export async function GET() {
  const [resolution, dolarApiJson] = await Promise.all([resolveLiveRate(), fetchDolarApiJson()]);

  if (resolution.source !== 'chaco') {
    console.warn(`[v1/rates] source=${resolution.source}:`, resolution.chacoError);
  }

  return NextResponse.json(buildRatesV1(resolution, dolarApiJson), {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
