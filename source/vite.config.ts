import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { emptyOutDir: true, assetsInlineLimit: 2000000, cssCodeSplit: false } });
