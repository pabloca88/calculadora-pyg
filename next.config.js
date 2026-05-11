/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
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

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname
};

module.exports = withPWA(nextConfig);
