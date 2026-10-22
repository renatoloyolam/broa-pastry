/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: { __VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Íconos y pantallas de carga del iPhone desde public/logo-original.png
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Broa Pastry by Sofía',
        short_name: 'Broa',
        description: 'Gestión de ventas, costos y ganancia de Broa Pastry',
        lang: 'es-CL',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#324D4D',
        theme_color: '#324D4D',
      },
      workbox: {
        // Solo guardamos la app en el teléfono; los datos siempre vienen de internet.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/apple-splash-*', '**/logo-original.png', '**/exceljs*.js', '**/xlsx-*.js', '**/jspdf*.js', '**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        navigateFallback: '/index.html',
        // Notificaciones del resumen semanal (public/push-sw.js)
        importScripts: ['push-sw.js'],
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
