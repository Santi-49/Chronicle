import { defineConfig } from "astro/config";

// The public home of the landing site. Canonical URLs, og:url, the sitemap, and
// robots.txt are all derived from it, so it must be the stable custom domain.
// CF_PAGES_URL is deliberately not used as a fallback: on Cloudflare Pages it is
// the per-deployment `<hash>.<project>.pages.dev` address, which would point every
// canonical tag and sitemap entry at a URL that changes on each build.
const PRODUCTION_SITE = "https://chronicle.quick2query.com";

const site = process.env.PUBLIC_SITE_URL ?? PRODUCTION_SITE;

export default defineConfig({
  site,
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
