import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** The brand preview's port, beside the app's 28600. */
const PORT = 28610

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: { port: PORT, strictPort: true, fs: { allow: ['..', '../../..'] } },
})
