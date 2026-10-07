import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const frontendRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  plugins: [react(), tailwindcss()],
  envDir: frontendRoot,
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react-dom/client', 'react-router-dom', '@supabase/supabase-js'],
  },
  server: {
    host: '127.0.0.1',
    fs: { allow: [projectRoot] },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
