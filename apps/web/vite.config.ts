import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // App-internal path aliases
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@core': path.resolve(__dirname, './src/core'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),

      // Workspace packages (resolved from source — no build step needed in dev)
      '@platform/types': path.resolve(__dirname, '../../packages/types/src'),
      '@platform/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@platform/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
      '@platform/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    open: true,
  },

  preview: {
    port: 4173,
    strictPort: true,
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor bundles for better caching
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          ui: ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          i18n: ['i18next', 'react-i18next'],
          utils: ['date-fns', 'date-fns-tz'],
        },
      },
    },
  },
});
