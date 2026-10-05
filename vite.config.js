import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/NMAWebinar/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/NMAWebinar/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/NMAWebinar/, ''),
      },
    },
  },
});
