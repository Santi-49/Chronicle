import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path from 'node:path'
import packageJson from './package.json'

// Local builds read the repository .env. CI supplies these same public values
// as repository variables, so installed apps do not depend on a machine-level
// environment variable or a bundled .env file.
loadEnv({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true })

export default defineConfig({
  // Runtime dependencies (better-sqlite3, chokidar) must stay external in the
  // main/preload bundles — native modules cannot be inlined by the bundler.
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __CHRONICLE_CONTROL_PLANE_URL__: JSON.stringify(
        process.env['CHRONICLE_CONTROL_PLANE_URL']?.trim() ?? '',
      ),
      __GOOGLE_OAUTH_CLIENT_ID__: JSON.stringify(
        process.env['GOOGLE_OAUTH_CLIENT_ID']?.trim() ?? '',
      ),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Tailwind activates once a stylesheet imports it (e.g. `@import "tailwindcss";`);
    // until then the plugin is inert and the hand-written CSS stands alone.
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    }
  }
})
