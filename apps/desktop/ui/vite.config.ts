import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** The UI dev port. Tauri's `devUrl` names the same one; change both together. */
const DEV_PORT = 28600

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: DEV_PORT, strictPort: true },
  build: { target: 'es2023', outDir: 'dist', emptyOutDir: true },
  // 20 s a test, for the whole-app tests on a busy machine (queries wait 5 s each; see setup.ts).
  test: { environment: 'jsdom', setupFiles: ['src/__tests__/setup.ts'], testTimeout: 20_000 },
})
