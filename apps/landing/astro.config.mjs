import { defineConfig } from "astro/config";

const site = process.env.PUBLIC_SITE_URL ?? process.env.CF_PAGES_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/gsap")) {
              return "motion";
            }
          },
        },
      },
    },
  },
});
