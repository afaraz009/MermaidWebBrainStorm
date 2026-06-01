import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['mermaid', '@dagrejs/dagre', 'd3-shape', 'd3-path'],
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        ourRenderer: 'our-renderer.html',
        editor: 'editor.html',
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
