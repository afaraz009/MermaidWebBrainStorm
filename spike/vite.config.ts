import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['mermaid', '@dagrejs/dagre', 'd3-shape', 'd3-path'],
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        static: 'our-renderer.html',
        interactive: 'our-renderer-interactive.html',
        reference: 'mermaid-reference.html',
      },
    },
  },
  server: {
    fs: {
      allow: ['.'],
    },
  },
});
