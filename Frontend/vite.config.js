import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all /api calls to your .NET backend during development
      '/api': {
        target: 'http://localhost:5277',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
