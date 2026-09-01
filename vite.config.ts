import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    headers: {
      // WebMCP requires origin-isolated documents.
      'Origin-Agent-Cluster': '?1',
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
