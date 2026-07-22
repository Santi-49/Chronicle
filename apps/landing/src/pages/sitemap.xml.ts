import type { APIRoute } from "astro";

export const prerender = true;

const paths = ["/", "/privacy", "/terms-and-services"];

export const GET: APIRoute = ({ site, url }) => {
  const baseUrl = site ?? new URL(url.origin);
  const entries = paths
    .map((path) => `  <url><loc>${new URL(path, baseUrl).href}</loc></url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(sitemap, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
