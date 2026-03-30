import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
    platformProxy: {
      enabled: true,
      configPath: 'wrangler.build.jsonc',
      persist: true,
    },
  }),
  vite: {
    ssr: {
      external: ['cloudflare:workers'],
      noExternal: true,
    },
  },
});
