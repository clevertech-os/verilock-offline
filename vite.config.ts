import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is relative for GitHub Pages project sites unless VITE_BASE_PATH is set
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? './',
  server: {
    port: 5177,
    strictPort: false,
  },
  build: {
    sourcemap: true,
  },
})
