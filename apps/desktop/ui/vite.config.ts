import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** The UI dev port. Tauri's `devUrl` names the same one; change both together. */
const DEV_PORT = 28600

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: DEV_PORT, strictPort: true },
  build: { target: 'es2023', outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom', setupFiles: ['src/__tests__/setup.ts'] },
})
