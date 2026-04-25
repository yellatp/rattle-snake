// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@libsql/client'],
    },
    build: {
      rollupOptions: {
        external: ['@libsql/client'],
      },
    },
  },
});
