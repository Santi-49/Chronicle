import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  // Runtime dependencies (better-sqlite3, chokidar) must stay external in the
  // main/preload bundles — native modules cannot be inlined by the bundler.
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Tailwind activates once a stylesheet imports it (e.g. `@import "tailwindcss";`);
    // until then the plugin is inert and the hand-written CSS stands alone.
    plugins: [react(), tailwindcss()]
  }
})
