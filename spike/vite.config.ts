import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        reference: resolve(__dirname, 'mermaid-reference.html'),
        ourStatic: resolve(__dirname, 'our-renderer.html'),
        ourInteractive: resolve(__dirname, 'our-renderer-interactive.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/index.html',
  },
});
