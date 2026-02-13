import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'LuminaPDF',
          short_name: 'LuminaPDF',
          description: 'Lecteur PDF élégant avec IA intégrée',
          theme_color: '#1a1a2e',
          background_color: '#1a1a2e',
          display: 'standalone',
          orientation: 'any',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    worker: {
      format: 'es', // Force ES format for workers to fix build issue
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'pdf-engine': ['react-pdf', 'pdfjs-dist'],
            'ai-panel': ['@google/genai'],
            'ui-icons': ['lucide-react'],
            'supabase': ['@supabase/supabase-js'],
          }
        }
      }
    }
  };
});
