import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    emptyOutDir: false,
  },
});
