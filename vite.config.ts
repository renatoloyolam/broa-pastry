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
      // Íconos y pantallas de carga del iPhone desde public/logo.svg
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Broa Pastry by Sofía',
        short_name: 'Broa',
        description: 'Gestión de ventas, costos y ganancia de Broa Pastry',
        lang: 'es-CL',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#465941',
        theme_color: '#465941',
      },
      workbox: {
        // Solo guardamos la app en el teléfono; los datos siempre vienen de internet.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/apple-splash-*', '**/xlsx-*.js'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
