/**
 * Summarizes the Chaco-vs-Maxicambios gaps recorded on each push (log-only)
 * to choose the real alert threshold.
 *
 *   npm run report:gaps
 *
 * Env (.env.local): PUSH_TOKEN (required), GAPS_URL (optional).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RateGapEntry, RateGapSummary } from '../src/lib/rateGap';

const ROOT = join(__dirname, '..');
const DEFAULT_GAPS_URL = 'https://calculadora-pyg.vercel.app/api/pyg-rates/gaps';

const pct = (value: number | null) => (value === null ? '-' : `${value.toFixed(2)} %`);

async function main() {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const token = process.env.PUSH_TOKEN;
  if (!token) throw new Error(`PUSH_TOKEN no definido (esperado en ${envFile})`);
  const url = process.env.GAPS_URL || DEFAULT_GAPS_URL;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}: ${await res.text()}`);
  const { windowDays, summary, entries } = (await res.json()) as {
    windowDays: number;
    summary: RateGapSummary;
    entries: RateGapEntry[];
  };

  console.log(`Chaco (push) vs Maxicambios — last ${windowDays} days`);
  console.log(`  pushes compared : ${summary.count}`);
  console.log(`  from → to       : ${summary.firstAt ?? '-'} → ${summary.lastAt ?? '-'}`);
  console.log(`  median gap      : ${pct(summary.medianPct)}`);
  console.log(`  p95 gap         : ${pct(summary.p95Pct)}`);
  console.log(`  max gap         : ${pct(summary.maxPct)}`);
  console.log(`  pushes over 1/2/3/5 %: ${summary.over[1]} / ${summary.over[2]} / ${summary.over[3]} / ${summary.over[5]}`);

  const top = [...entries].sort((a, b) => b.gapPct - a.gapPct).slice(0, 10);
  if (top.length) {
    console.log('\nLargest gaps:');
    for (const e of top) {
      console.log(
        `  ${e.at.slice(0, 16)}  ${pct(e.gapPct).padStart(8)}  Chaco ${e.chacoCompra}/${e.chacoVenta}  Maxi ${e.maxiCompra ?? '-'}/${e.maxiVenta} (act. ${e.maxiUpdatedAt ?? '-'})`
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
