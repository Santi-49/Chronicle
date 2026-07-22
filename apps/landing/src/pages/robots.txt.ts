import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site, url }) => {
  const baseUrl = site ?? new URL(url.origin);
  const sitemapUrl = new URL("/sitemap.xml", baseUrl);

  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl.href}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
