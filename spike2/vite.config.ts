import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        reference: resolve(__dirname, 'mermaid-reference.html'),
        ours: resolve(__dirname, 'our-renderer.html'),
      },
    },
  },
  server: {
    port: 5174,
    open: '/index.html',
  },
});
