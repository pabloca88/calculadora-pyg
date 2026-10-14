# CalPyg

Next.js (App Router) PWA on Vercel: converts guaraníes → USD → ARS and compares
Argentine payment methods. Production: https://calpyg.vercel.app (the old
https://calculadora-pyg.vercel.app keeps working and is what the push script
and the live monitor use; see README.md for the full overview). UI copy is Spanish; code comments,
docs and commit messages are English.

## Key decisions (don't revert without discussing)

### Branding
- All branding lives in `src/config/brand.ts` (+ images in `public/brand/`).
  The web manifest is generated from it (`src/app/manifest.ts`). A sibling
  app (CalBra) should only change those.

### PYG/USD rate: Cambios Chaco, pushed from the maintainer's Mac
- Cambios Chaco is the source. Cloudflare blocks Vercel and GitHub Actions IPs
  (HTTP 403 "Just a moment..."), but the widget reads fine from a residential IP.
- `scripts/push-chaco.ts` (Playwright + `parseChaco`) reads the widget on the
  maintainer's Mac and calls `POST /api/pyg-rates/push` with
  `Authorization: Bearer $PUSH_TOKEN`. Body: `{ compra, venta, updatedAt, readAt }`.
- launchd agent, installed with `scripts/launchd/install.sh` from
  `scripts/launchd/calpyg.chaco.plist.template`: every 30 min, Mon–Sat
  08:00–19:00 Paraguay time; runs while the Mac sleeps are skipped.
  Log: `~/Library/Logs/calculadora-pyg-chaco.log` (raw HTML of the last 5
  parse failures is saved next to it).
- The pushed value lives in Upstash Redis (Vercel Marketplace; env
  `KV_REST_API_URL` / `KV_REST_API_TOKEN`), key `pyg:chaco:pushed`.
- **No proxies or anti-Cloudflare services.** Chaco is only read from the Mac.
- The push endpoint: bearer token (timing-safe compare), 2 KB body limit (413),
  10 req/min per IP via Redis (429, fails open), same sanity checks (400).

### Resolution order (`resolveRate`, src/lib/pygRatesFallback.ts)
1. Pushed Chaco with `readAt` < 3 h → `source: "chaco"`, `chacoVia: "push"`.
2. Chaco fetched directly (almost always 403 in production).
3. Maxicambios — `parseMaxi` anchors on `flags/USD.png` (Maxi lists CAD and
   AUD with the same "Dólar" text; never take "the first Dólar").
4. `source: "none"`.

`GET /api/pyg-rates` reads the store on every request; only scraped HTML is
cached in memory (30 min).

### Calculation
- **Single reference rate = Chaco VENTA (decided 13/10/2026).** One house, one
  number: the U$D box, AR$ Oficial, Tarjeta +30%, custom rate, Efectivo USD and
  the "cheapest" comparison use `rate.venta` (the Maxi fallback uses its venta
  too). `compra` never enters a calculation and is never a fallback; it is only
  validated (venta > compra).
- Manual override = venta, expires after 12 h (localStorage
  `chaco_rate_venta_v1`; the old `chaco_rate` key, which meant compra, is deleted).
- **No market rate** (exchangerate-api and similar were removed). No rate → "-",
  plus a visible hint to retry or type the rate manually.
- Sanity everywhere (parsers and push): compra and venta in **4,000–10,000** and
  venta > compra; otherwise discarded (null / 400).
- Neutral UI: the main card never names Chaco/Maxi and never says "compra":
  "Venta USD ₲X · act. DD/MM HH:MM" and "Venta ₲X". "act." is the house's own
  `updatedAt`, not the fetch time.

### Security headers (next.config.js)
CSP (`script-src 'self' 'unsafe-inline'` because the App Router injects inline
scripts; `frame-src` allows www and bare domains of both houses for the
"Ver cotizaciones" iframes), `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`.

## Commands
- `npm run lint`, `npm run typecheck` (app + scripts + e2e)
- `npm test`: vitest (unit, fixtures in `src/lib/__tests__/fixtures`)
- `npm run test:e2e`: Playwright against the local dev server (Chromium + a
  WebKit/iPhone layout check)
- `npm run test:live`: Playwright against production. With `source=chaco` it
  doesn't re-read Chaco (the runner is blocked); during business hours it
  requires `source=chaco` and a push < 3 h old; outside them it accepts Maxi.
  Run by `.github/workflows/live-rates.yml`, which opens a `live-rates` issue
  on failure and closes it on recovery.
- `node --import tsx scripts/push-chaco.ts [--force] [--dry-run]`: manual push.
- Deploys are done with `npx vercel deploy --prod` (no Git integration).

## Secrets
- `PUSH_TOKEN`: in Vercel (production) and in `.env.local` (gitignored). The
  Mac only needs `PUSH_TOKEN`; the `KV_*` variables stay in Vercel.
