import { defineConfig } from 'vite';

// `base: './'` makes every asset URL relative, so the build works from any
// GitHub Pages path (https://<user>.github.io/<repo>/) or a custom domain.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
});
