import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    lang: brand.locale,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,
    categories: ['finance', 'utilities'],
    icons: [
      { src: brand.images.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: brand.images.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: brand.images.iconMaskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
