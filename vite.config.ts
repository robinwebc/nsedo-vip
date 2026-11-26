import { defineConfig } from 'vite'

export default defineConfig({
  base: '/nsedo-vip/',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { outDir: 'dist', sourcemap: false },
})
