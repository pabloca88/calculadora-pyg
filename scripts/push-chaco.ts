/**
 * Reads the Cambios Chaco widget from the maintainer's Mac (residential IP;
 * Cloudflare returns 403 to Vercel and GitHub Actions) and pushes it to
 * production:
 *   POST /api/pyg-rates/push  (Authorization: Bearer $PUSH_TOKEN)
 *
 * No proxies or anti-Cloudflare services: a plain headless Chromium reads a
 * public page every 30 minutes from a home network.
 *
 * Scheduled by launchd (installed with scripts/launchd/install.sh) Mon–Sat
 * 08:00–19:00 Paraguay time. If the Mac wakes up outside that window and
 * launchd fires a late run, the script skips it.
 *
 * Usage:
 *   node --import tsx scripts/push-chaco.ts            # respects the time window
 *   node --import tsx scripts/push-chaco.ts --force    # runs at any time
 *   node --import tsx scripts/push-chaco.ts --dry-run  # reads and parses, no push
 *
 * Env (.env.local): PUSH_TOKEN (required), PUSH_URL (optional).
 * Log: ~/Library/Logs/calculadora-pyg-chaco.log
 */
import { appendFileSync, existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { parseChaco } from '../src/lib/pygScraping';
import { isCloudflareChallenge } from '../src/lib/cloudflareChallenge';
import { isPyBusinessHours } from '../src/lib/businessHours';

const ROOT = join(__dirname, '..');
const LOG_DIR = join(homedir(), 'Library', 'Logs');
const LOG_FILE = join(LOG_DIR, 'calculadora-pyg-chaco.log');
const FAILED_HTML_PREFIX = 'calculadora-pyg-chaco-failed-';
const FAILED_HTML_KEEP = 5;
// CHACO_URL se puede pisar por env solo para probar el camino de parse_failed.
const CHACO_URL = process.env.CHACO_URL || 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const DEFAULT_PUSH_URL = 'https://calculadora-pyg.vercel.app/api/pyg-rates/push';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY_RUN = args.has('--dry-run');

const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // sin log en disco igual seguimos (stdout lo captura launchd)
  }
};

/**
 * Guarda el HTML crudo cuando parseChaco no encuentra tasa, para poder ver
 * qué cambió en el widget. Conserva solo los últimos FAILED_HTML_KEEP.
 */
const saveFailedHtml = (html: string): string | null => {
  try {
    const file = join(LOG_DIR, `${FAILED_HTML_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
    writeFileSync(file, html);
    const old = readdirSync(LOG_DIR)
      .filter((name) => name.startsWith(FAILED_HTML_PREFIX) && name.endsWith('.html'))
      .sort()
      .slice(0, -FAILED_HTML_KEEP);
    for (const name of old) unlinkSync(join(LOG_DIR, name));
    return file;
  } catch {
    return null;
  }
};

async function readChaco() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-PY' });
    const response = await page.goto(CHACO_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
    const html = await page.content();
    if (isCloudflareChallenge(response?.status(), html)) {
      throw new Error(`Cloudflare challenge (HTTP ${response?.status() ?? '?'})`);
    }
    return { rate: parseChaco(html), html, status: response?.status() };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!FORCE && !isPyBusinessHours()) {
    log('INFO', 'fuera de horario (lun–sáb 08:00–19:00 PY) — salteado');
    return;
  }

  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const token = process.env.PUSH_TOKEN;
  const pushUrl = process.env.PUSH_URL || DEFAULT_PUSH_URL;
  if (!token && !DRY_RUN) throw new Error(`PUSH_TOKEN no definido (esperado en ${envFile})`);

  const readAt = new Date().toISOString();
  const { rate, html, status } = await readChaco();
  if (rate.compra === null || rate.venta === null) {
    const saved = saveFailedHtml(html);
    throw new Error(
      `parseChaco no encontró una tasa válida (HTTP ${status ?? '?'}, ${html.length} bytes, updatedAt=${rate.updatedAt}) — HTML: ${saved ?? 'no se pudo guardar'}`
    );
  }
  const body = { compra: rate.compra, venta: rate.venta, updatedAt: rate.updatedAt, readAt };
  log('INFO', `Chaco leído: compra=${body.compra} venta=${body.venta} updatedAt=${body.updatedAt}`);

  if (DRY_RUN) {
    log('INFO', '--dry-run: no se pushea');
    return;
  }

  const res = await fetch(pushUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`push HTTP ${res.status}: ${text}`);
  log('INFO', `push OK (HTTP ${res.status}) → ${pushUrl}`);
}

main().catch((error) => {
  log('ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
