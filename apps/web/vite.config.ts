import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    open: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:9888',
        changeOrigin: true,
      },
    },
  },
});
