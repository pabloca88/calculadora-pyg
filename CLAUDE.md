# Calculadora PYG

PWA Next.js (App Router) en Vercel: convierte guaraníes → USD → ARS y compara
métodos de pago. Producción: https://calculadora-pyg.vercel.app

## Decisiones clave (no revertir sin hablarlo)

### Tasa PYG/USD: Cambios Chaco, vía push desde la Mac
- Cambios Chaco es la fuente. Cloudflare bloquea las IPs de Vercel y de
  GitHub Actions (HTTP 403 "Just a moment..."), pero se lee bien desde la Mac
  de Pablo (IP residencial).
- `scripts/push-chaco.ts` (Playwright + `parseChaco`) lee el widget en la Mac
  y hace `POST /api/pyg-rates/push` con `Authorization: Bearer $PUSH_TOKEN`.
  Body: `{ compra, venta, updatedAt, readAt }`.
- launchd: `~/Library/LaunchAgents/com.pablo.calculadorapyg.chaco.plist`
  (copia versionada en `scripts/launchd/`), cada 30 min, lun–sáb 08:00–19:00
  hora Paraguay. Si la Mac duerme, ese run se saltea. Log:
  `~/Library/Logs/calculadora-pyg-chaco.log`.
- El valor pusheado vive en Upstash Redis (Vercel Marketplace, envs
  `KV_REST_API_URL`/`KV_REST_API_TOKEN`), clave `pyg:chaco:pushed`.
- **No usar proxies ni servicios anti-Cloudflare.** La lectura de Chaco sale
  solo desde la Mac.

### Orden de resolución (`resolveRate`, src/lib/pygRatesFallback.ts)
1. Push de Chaco con `readAt` < 3 h → `source: "chaco"`, `chacoVia: "push"`.
2. Chaco directo (en prod casi siempre 403).
3. Maxicambios — `parseMaxi` se ancla en `flags/USD.png` (Maxi lista CAD y
   AUD con el mismo texto "Dólar"; nunca tomar "el primer Dólar").
4. `source: "none"`.

`GET /api/pyg-rates` lee el store en cada request; solo el HTML scrapeado se
cachea en memoria (30 min).

### Cálculo
- **Tasa única de referencia = Chaco VENTA (decidido 13/10/2026).** Una casa,
  un número: el recuadro U$D, AR$ Oficial, Tarjeta +30%, tasa personalizada,
  Efectivo USD y la comparación "más barato" usan `rate.venta` (Maxi de
  fallback: también su venta). La compra **nunca** entra en un cálculo ni es
  fallback; solo se valida (venta > compra).
- Override manual = venta, vence a las 12 h (localStorage `chaco_rate_venta_v1`;
  la key vieja `chaco_rate`, que era compra, se borra).
- **Sin tasa de mercado** (exchangerate-api y similares eliminados). Sin tasa
  → se muestra "-".
- Cordura en todos lados (parsers y push): compra y venta en **4.000–10.000**
  y venta > compra; si no, se descarta (null / 400).
- UI neutral: la card principal no nombra a Chaco/Maxi y no dice "compra":
  "Venta USD ₲X · act. DD/MM HH:MM" y "Venta ₲X". "act." es el `updatedAt` de
  la casa, no la hora del fetch.

## Comandos
- `npm test`: vitest (unit, con fixtures en `src/lib/__tests__/fixtures`)
- `npm run test:e2e`: Playwright contra el dev server local
- `npm run test:live`: Playwright contra producción. Con `source=chaco` no
  re-lee Chaco (el runner está bloqueado); en horario hábil exige
  `source=chaco` y push < 3 h, y fuera de horario acepta Maxi.
  Lo corre `.github/workflows/live-rates.yml`, que abre un issue
  `live-rates` si falla.
- `node --import tsx scripts/push-chaco.ts [--force] [--dry-run]`: push manual.
  `--force` ignora la franja horaria.

## Secretos
- `PUSH_TOKEN`: en Vercel (production) y en `.env.local` (gitignored).
