import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isCloudflareChallenge } from '../cloudflareChallenge';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('isCloudflareChallenge', () => {
  // Fixture capturada tal cual del log de Vercel (ver [pyg-rates][DEBUG] en
  // el diagnóstico del 403 de Cloudflare a las IPs de datacenter) — HTML
  // real, no inventado.
  it('detecta el challenge real de Cloudflare ("Just a moment...") capturado desde Vercel', () => {
    const html = fixture('cloudflare-challenge.html');
    expect(isCloudflareChallenge(403, html)).toBe(true);
  });

  it('detecta el challenge por el título aunque el status no sea 403', () => {
    const html = fixture('cloudflare-challenge.html');
    expect(isCloudflareChallenge(200, html)).toBe(true);
  });

  it('status 403 solo (sin HTML de challenge) también cuenta como bloqueado', () => {
    expect(isCloudflareChallenge(403, '<html><body>empty</body></html>')).toBe(true);
  });

  it('NO marca como bloqueado el HTML real de Cambios Chaco (200, sin challenge)', () => {
    const html = fixture('chaco.html');
    expect(isCloudflareChallenge(200, html)).toBe(false);
  });

  it('NO marca como bloqueado cuando no hay status 403 ni challenge en el HTML', () => {
    expect(isCloudflareChallenge(undefined, '<html><body>ok</body></html>')).toBe(false);
    expect(isCloudflareChallenge(200, '<html><body>ok</body></html>')).toBe(false);
  });
});
