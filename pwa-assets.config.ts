import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Genera íconos y pantallas de carga del iPhone a partir de public/logo-original.png (logo oficial).
// vite-plugin-pwa los genera solo al compilar (pwaAssets en vite.config.ts).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#324D4D' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#324D4D' } },
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.55,
        resizeOptions: { background: '#324D4D', fit: 'contain' },
        darkResizeOptions: { background: '#324D4D', fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
        png: { compressionLevel: 9, quality: 70 },
        name: (landscape, size, dark) =>
          `apple-splash-${landscape ? 'landscape' : 'portrait'}-${dark ? 'dark-' : ''}${size.width}x${size.height}.png`,
      },
      ['iPhone 6', 'iPhone 6 Plus', 'iPhone X', 'iPhone XR', 'iPhone XS Max', 'iPhone 12', 'iPhone 12 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Pro Max'],
    ),
  },
  images: ['public/logo-original.png'],
})
