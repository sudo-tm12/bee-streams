import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome134',
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5174,
    // In browser dev mode, talk to a server started with `npm --prefix server start`.
    proxy: { '/api': 'http://localhost:4010' },
  },
});
