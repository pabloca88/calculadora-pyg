import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { brand } from '@/config/brand';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  // The manifest (src/app/manifest.ts) and favicon.ico / icon.png /
  // apple-icon.png in src/app/ are linked automatically by App Router file
  // conventions, so they are not declared here.
  appleWebApp: {
    capable: true,
    title: brand.name,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: brand.name,
    description: brand.description,
    siteName: brand.name,
    images: [{ url: brand.images.og, width: 512, height: 512 }],
  },
  keywords: ['calculator', 'paraguay', 'pyg', 'usd', 'ars', 'currency'],
};

// Pinch-zoom stays enabled (accessibility); inputs use >= 16px font so iOS
// does not auto-zoom on focus.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: brand.themeColor,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={brand.locale}>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
