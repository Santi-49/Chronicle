import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __CHRONICLE_LANDING_URL__: JSON.stringify(
      process.env['CHRONICLE_LANDING_URL']?.trim() ||
      'https://chronicle.quick2query.com',
    ),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
