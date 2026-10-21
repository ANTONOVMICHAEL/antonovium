import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: {allowedHosts: ['terminal.local']}, build: { emptyOutDir: true, assetsInlineLimit: 2000000, cssCodeSplit: false } });
