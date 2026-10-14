/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  // Install icons and the og image are fetched by the OS / link previews, not
  // by the page, so they don't need to be precached by the service worker.
  publicExcludes: ['!noprecache/**/*', '!brand/icon-*.png', '!brand/og.jpg'],
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline.html'
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/dolarapi\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'ars-rates',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 3600 // 1 hour
        }
      }
    },
    {
      urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        }
      }
    }
  ]
});

// Exchange houses embedded in "Ver cotizaciones" (www and bare domain).
const EXCHANGE_HOUSE_FRAMES = [
  'https://cambioschaco.com.py',
  'https://www.cambioschaco.com.py',
  'https://maxicambios.com.py',
  'https://www.maxicambios.com.py',
];

const isDev = process.env.NODE_ENV === 'development';

// script-src needs 'unsafe-inline': the App Router injects inline bootstrap
// scripts, and the nonce-based alternative forces every page to render
// dynamically. 'unsafe-eval' is only needed by the dev server (React Refresh).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://dolarapi.com",
  `frame-src ${EXCHANGE_HOUSE_FRAMES.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = withPWA(nextConfig);
