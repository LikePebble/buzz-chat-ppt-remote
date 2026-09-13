import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron', 'express', 'socket.io'],
        input: resolve('src/interaction/main.ts'),
        output: { format: 'cjs', entryFileNames: 'index.js' }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
        input: resolve('src/interaction/preload.ts'),
        output: { format: 'cjs', entryFileNames: 'index.js' }
      }
    }
  },
  renderer: {
    base: '/',
    server: { host: '127.0.0.1' },
    build: { rollupOptions: { input: resolve('src/renderer/interaction.html') } },
    plugins: [vue()]
  }
})
