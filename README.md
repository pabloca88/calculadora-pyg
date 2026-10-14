# CalPyg

**Guaraníes → Dólares → Pesos.** A mobile-first PWA for Argentines shopping in
Paraguay: type a price in guaraníes (₲) and see what it costs in USD and in
Argentine pesos for each way of paying (Argentine bank card / Mercado Pago at
"Dólar Tarjeta +30%", ARQ/DollarApp or Payoneer, or cash USD), with the
cheapest option highlighted.

Production: https://calpyg.vercel.app (also https://calculadora-pyg.vercel.app) · User guide: `/manual.html`
(the UI is in Spanish; code and docs are in English).

## Architecture

```
 maintainer's Mac (residential IP)                      Vercel (Next.js 15, App Router)
 ┌─────────────────────────────┐   POST /api/pyg-rates/push  ┌───────────────────────────┐
 │ launchd, every 30 min,      │  Bearer PUSH_TOKEN, ≤2 KB,  │ validate (sanity) ──► Upstash Redis
 │ Mon–Sat 08–19 PY            │  10 req/min                 │                    key pyg:chaco:pushed
 │ scripts/push-chaco.ts       │ ──────────────────────────► │                           │
 │ (headless Chromium reads    │                             │ GET /api/pyg-rates ◄──────┘
 │  the Cambios Chaco widget)  │                             │  1. pushed Chaco < 3 h old
 └─────────────────────────────┘                             │  2. Chaco direct (403 here)
                                                             │  3. Maxicambios (scraped)
 GitHub Actions (daily, Mon–Sat 10:00 PY)                    │  4. "none"
 test:live: API vs site vs UI ──► opens/closes an issue      └────────────┬──────────────┘
                                                                          ▼
                                   browser UI ◄── DolarApi.com (ARS rates, client-side)
```

- **Why push from a Mac?** Cambios Chaco sits behind Cloudflare, which answers
  Vercel's and GitHub's datacenter IPs with a 403 challenge. The widget is
  public and loads fine from a home connection, so a small script reads it there
  and pushes the result. No proxies or anti-bot services are used.
- **Fallback:** if no fresh push exists (Mac asleep/off), the API scrapes
  Maxicambios. Its parser anchors on the `flags/USD.png` icon because CAD and
  AUD rows also say "Dólar".
- **Monitoring:** `.github/workflows/live-rates.yml` runs `npm run test:live`
  against production. During business hours it requires `source=chaco` with a
  push less than 3 h old; it opens a `live-rates` issue on failure and closes it
  on recovery.

## Key decisions

| Decision | Why |
|---|---|
| Single reference rate = Chaco **venta** | One house, one number. `compra` is never used in a calculation or as a fallback; it is only used to validate venta > compra. |
| Sanity range 4,000–10,000 Gs for compra and venta, and venta > compra | A regex that drifts onto another currency or row returns plausible-looking numbers; a discarded value (null / HTTP 400) is safer than a wrong one. |
| No international "market rate" | Shoppers pay the exchange-house rate; a market-rate fallback produced wrong USD amounts. With no rate the UI shows "-" plus a hint to retry or type it manually. |
| Pushed value is trusted for 3 h | Long enough to cover a missed run or two, short enough that stale data falls back to Maxi. |
| Manual override (12 h) | The user can type the rate the shop actually offers. |
| Branding in `src/config/brand.ts` | The manifest and metadata are generated from it, so a sibling app (CalBra) only changes that file and `public/brand/`. |

## Security

- `POST /api/pyg-rates/push`: bearer token (`PUSH_TOKEN`, compared in constant
  time), 2 KB body limit (413), 10 requests/min per IP backed by Redis (429,
  fails open), and payload validation (400). Secrets stay server-side; the
  client bundle is checked for `PUSH_TOKEN`/`KV_` during review.
- Headers (`next.config.js`): Content-Security-Policy (iframes limited to the
  two exchange houses, `frame-ancestors 'none'`), `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; HSTS comes from
  Vercel.

## Running locally

```bash
npm install
npm run dev                 # http://localhost:3000 (no Redis needed: falls back to scraping)
npm run lint && npm run typecheck
npm test                    # unit tests (Vitest, HTML fixtures)
npm run test:e2e            # Playwright: Chromium + a WebKit/iPhone layout check
npm run test:live           # against production (normally run by GitHub Actions)
```

Environment: `PUSH_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Vercel).
For the Mac pusher, `.env.local` needs only `PUSH_TOKEN`; install the agent
with `scripts/launchd/install.sh` and run it manually with
`node --import tsx scripts/push-chaco.ts --force`.

## Known limitations

- Fresh Chaco data depends on the maintainer's Mac being awake during business
  hours; otherwise the app falls back to Maxicambios (and the monitor reports it).
- CSP allows `'unsafe-inline'` scripts: the App Router injects inline bootstrap
  scripts, and nonces would force dynamic rendering of every page.
- `npm audit` still lists build-time issues in `next-pwa`/workbox,
  `tailwindcss@3` and `eslint-config-next`; the only fixes are breaking
  upgrades (next-pwa is unmaintained). Next itself is on the latest 15.5.x.
