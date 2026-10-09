/**
 * Detecta si una respuesta es el challenge interactivo de Cloudflare
 * ("Just a moment...") en vez del contenido real — lo que Cambios Chaco le
 * devuelve a las IPs de datacenter de Vercel (confirmado: HTTP 403, título
 * "Just a moment...", header `server: cloudflare`).
 *
 * Pura e independiente de Playwright para poder testearla con HTML fijo,
 * sin red ni browser — el status y el HTML se pasan ya extraídos.
 */
export const isCloudflareChallenge = (status: number | undefined, html: string): boolean => {
  if (status === 403) return true;
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html);
};
