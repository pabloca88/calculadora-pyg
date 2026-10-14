/**
 * Single source of truth for the app's branding. A sibling app (e.g. "CalBra")
 * should only need to change this file plus the images in public/brand/.
 */
export const brand = {
  name: 'CalPyg',
  /** Shown under the header title. */
  subtitle: 'Guaraníes → Dólares → Pesos',
  description: 'Calculá cuánto cuesta realmente pagar en guaraníes según el medio de pago',
  siteUrl: 'https://calpyg.vercel.app',
  locale: 'es',
  themeColor: '#0038A8',
  backgroundColor: '#ffffff',
  images: {
    headerLogo: '/brand/logo-56.png',
    icon192: '/brand/icon-192.png',
    icon512: '/brand/icon-512.png',
    iconMaskable512: '/brand/icon-maskable-512.png',
    og: '/brand/og.jpg',
  },
} as const;
