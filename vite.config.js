import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project below /royversemoviez/. Override with
  // VITE_BASE_PATH=/ when deploying to a domain root (Vercel/Netlify).
  base: command === 'build' ? (process.env.VITE_BASE_PATH || '/royversemoviez/') : '/',
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true
  }
}))
