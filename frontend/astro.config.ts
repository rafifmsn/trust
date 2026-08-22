import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://trust.rafifmsn.com',
  server: {
    port: parseInt(process.env.FRONTEND_DEV_PORT || '4321', 10),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [sitemap()],
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-sans',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      display: 'swap',
    },
    {
      provider: fontProviders.google(),
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      fallbacks: ['ui-monospace', 'monospace'],
      display: 'swap',
    },
  ],
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
