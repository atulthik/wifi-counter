import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
<<<<<<< HEAD
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5055',
          changeOrigin: true,
          secure: false
        }
=======
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://wifi-counter-1.onrender.com',
        changeOrigin: true,
        secure: false
>>>>>>> 55e92d39251cdbc5f0876fd1f82c7589dfc20469
      }
    }
  }
})
