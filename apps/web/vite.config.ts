import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA installable + mode hors-ligne (contrainte critique CEMAC).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kombi',
        short_name: 'Kombi',
        description: "Kombi — l'ami de la gestion d'entreprise (PME zone CEMAC)",
        lang: 'fr',
        theme_color: '#0b6e4f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // App shell precache + navigation fallback pour fonctionner hors-ligne.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: { port: 5173 },
});
