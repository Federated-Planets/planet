import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
    platformProxy: {
      enabled: true,
    },
  }),
  vite: {
    ssr: {
      external: ['cloudflare:workers'],
      noExternal: ['zod', 'md5', 'cheerio'],
    },
    optimizeDeps: {
      exclude: ['zod', 'md5', 'cheerio'],
    },
  },
});
