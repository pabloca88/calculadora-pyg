/**
 * Lee el widget de Cambios Chaco desde ESTA Mac (IP residencial — Cloudflare
 * le da 403 a Vercel y a GitHub Actions) y lo pushea a producción:
 *   POST /api/pyg-rates/push  (Authorization: Bearer $PUSH_TOKEN)
 *
 * Sin proxies ni servicios anti-Cloudflare: es un Chromium headless normal
 * leyendo una página pública, cada 30 min, desde la red de casa.
 *
 * Lo corre launchd (~/Library/LaunchAgents/com.pablo.calculadorapyg.chaco.plist)
 * lun–sáb 08:00–19:00 hora Paraguay. Si la Mac despierta fuera de esa franja
 * y launchd dispara un run atrasado, el script lo saltea.
 *
 * Uso:
 *   node --import tsx scripts/push-chaco.ts            # respeta la franja horaria
 *   node --import tsx scripts/push-chaco.ts --force    # corre a cualquier hora
 *   node --import tsx scripts/push-chaco.ts --dry-run  # lee y parsea, no pushea
 *
 * Env (.env.local): PUSH_TOKEN (requerido), PUSH_URL (opcional).
 * Log: ~/Library/Logs/calculadora-pyg-chaco.log
 */
import { appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { parseChaco } from '../src/lib/pygScraping';
import { isCloudflareChallenge } from '../src/lib/cloudflareChallenge';
import { isPyBusinessHours } from '../src/lib/businessHours';

const ROOT = join(__dirname, '..');
const LOG_FILE = join(homedir(), 'Library', 'Logs', 'calculadora-pyg-chaco.log');
const CHACO_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
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

async function readChaco() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-PY' });
    const response = await page.goto(CHACO_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
    const html = await page.content();
    if (isCloudflareChallenge(response?.status(), html)) {
      throw new Error(`Cloudflare challenge (HTTP ${response?.status() ?? '?'})`);
    }
    return parseChaco(html);
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
  const rate = await readChaco();
  if (rate.compra === null || rate.venta === null) {
    throw new Error(`parseChaco no encontró una tasa válida (updatedAt=${rate.updatedAt})`);
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
  log('INFO', `push OK → ${pushUrl}`);
}

main().catch((error) => {
  log('ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
