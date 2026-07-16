import { defineConfig } from "astro/config";

export default defineConfig({
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
