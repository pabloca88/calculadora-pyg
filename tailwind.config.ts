import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary-blue': '#0038A8',
        'primary-red': '#CE1126',
        'bg-card': '#ffffff',
        'bg-input': '#f8fafc',
        'border': '#e5e7eb',
        'text-primary': '#1a1a1a',
        'text-secondary': '#6b7280',
      },
      fontSize: {
        xs: 'clamp(0.5625rem, 2vw, 0.625rem)',
        sm: 'clamp(0.625rem, 2.5vw, 0.75rem)',
        base: 'clamp(0.875rem, 3vw, 1rem)',
        lg: 'clamp(1rem, 3.5vw, 1.125rem)',
        xl: 'clamp(1.125rem, 4vw, 1.25rem)',
        '2xl': 'clamp(1.25rem, 5vw, 1.5rem)',
        '3xl': 'clamp(1.5rem, 6vw, 1.75rem)',
      },
      spacing: {
        'safe-top': 'var(--safe-area-inset-top)',
        'safe-bottom': 'var(--safe-area-inset-bottom)',
        'safe-left': 'var(--safe-area-inset-left)',
        'safe-right': 'var(--safe-area-inset-right)',
      }
    },
  },
  plugins: [],
}
export default config
