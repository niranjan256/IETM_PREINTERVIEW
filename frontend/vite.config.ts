import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Exclude /media/ and /api/ from the navigate fallback so the service
        // worker never intercepts iframe navigation to PDFs or API endpoints.
        navigateFallbackDenylist: [/^\/media\//, /^\/api\//],
        // Precache only small static assets (JS, CSS, fonts, small images).
        // Large binaries (mp4, glb, pdf) are NOT precached here — they are
        // cached on first access via the runtimeCaching rules below.
        // Precaching >2 MB files causes a Workbox build error.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Content API: StaleWhileRevalidate — show cached, refresh in bg
            urlPattern: /\/api\/content\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-content',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Media files: CacheFirst with size limit
            urlPattern: /\/media\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-files',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Example demo files (GLB, MP4, PDF): CacheFirst for offline demo
            urlPattern: /\/examples\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ietm-examples',
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'IETM Offline Viewer',
        short_name: 'IETM',
        description: 'Offline-capable IETM documentation viewer',
        theme_color: '#1e3a5f',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  build: {
    sourcemap: false,      // never ship source maps — bundle is unreadable without them
    chunkSizeWarningLimit: 2000,
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
