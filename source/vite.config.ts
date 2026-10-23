import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: {allowedHosts: ['terminal.local']}, build: { emptyOutDir: true, assetsInlineLimit: (filePath, content) => !/\.woff2?$/i.test(filePath) && content.length < 2_000_000, cssCodeSplit: false } });
