# Landing Page

## Production URL and social metadata

The landing page includes canonical, Open Graph, Twitter Card, structured-data, favicon, and web
manifest metadata. Set `PUBLIC_SITE_URL` to the public custom domain for production builds. On
Cloudflare Pages, `CF_PAGES_URL` is used automatically when `PUBLIC_SITE_URL` is not set.

## Hero Mockup Export

The hero uses a rasterized PNG by default for better compatibility across devices and browsers:

```text
public/exports/tilted-app-mockup.png
```

The live CSS-3D mockup is still kept in `src/pages/index.astro` for future tuning. At the top of that file:

```ts
const useExportedMockup = true;
const showMockupTuner = false;
```

Set `useExportedMockup` to `false` to preview the live 3D plane in the page. Set `showMockupTuner` to `true` to show the temporary on-page controls for adjusting the perspective, transform, border, shadow, and hero placement.

After changing the live 3D settings, regenerate the static asset:

```bash
npm run export:mockup
```

The exporter builds the Astro site, starts a local preview server, reveals the hidden live 3D mockup, captures it with Playwright/Chromium, trims fully transparent pixels from the output, and writes the updated PNG back to `public/exports/tilted-app-mockup.png`.

## Chronicle Help

The public help center starts at `/help/`. Its articles, categories, search terms, related links,
and reviewed dates have one source of truth:

```text
src/helpContent.ts
```

`src/pages/help/index.astro` builds the search-led help home. The static
`src/pages/help/[...slug].astro` route renders every article. Search uses a small browser-side
index generated from the same article data, so it works during `npm run dev` and after a static
Cloudflare build without a support backend.

Preview and build:

```bash
npm run dev
npm run build
npm run preview
```

### Writing and safety rules

- Write for a creative professional who does not know developer terminology.
- Start with what happened, whether the user's work is safe, and the next reversible action.
- Include the exact visible operating-system or Chronicle error text in article keywords.
- Never ask for an API key, password, token, private local path, filename, or creative file.
- Link provider claims only to current official Google, Anthropic, or OpenAI sources.
- Do not promise free access, fixed prices, supported models, or exact costs.
- Distinguish expected unsigned-app trust warnings from malware, damaged-app, and managed-device
  blocks. Never recommend disabling system-wide protection.
- Mark future behavior as future. Help content must describe the packaged app as shipped.

### Maintenance checklist

**Owner:** Unassigned until the team names a support-doc owner
**Last full review:** July 26, 2026

Before publishing and after any relevant product change:

- [ ] Walk through a clean Windows x64 install and Apple Silicon Mac install.
- [ ] Verify every button label, warning, model selector, and first-run step.
- [ ] Refresh screenshots at readable scale with no usernames, private paths, or keys.
- [ ] Re-check provider key, billing, pricing, quota, rate-limit, and revocation links.
- [ ] Reconcile the privacy/data-flow article with the shipped Privacy Policy.
- [ ] Check every internal and external link.
- [ ] Run `npm run build` and browser accessibility/responsive checks.
- [ ] Test search with everyday phrases and exact error text.
- [ ] Have someone unfamiliar with Chronicle reach their first captured version without coaching.

Re-review immediately after changes to onboarding, packaging, signing/notarization, auto-update,
supported platforms/formats, AI providers/models, pricing, key storage, telemetry, sync, privacy,
restore, or deletion.

### Screenshot refresh list

The most valuable clean-machine captures are:

1. Windows “Windows protected your PC” before and after selecting **More info**.
2. macOS developer-verification alert and **Privacy & Security → Open Anyway**.
3. Chronicle entry choice showing **Continue local**.
4. New Project folder scan and file selection.
5. First captured version in the Timeline.
6. AI provider key/model setup with a fake or fully obscured key.
7. In-app update downloading and **Restart to update**.

Store approved help images under `public/help/`, use descriptive filenames, preserve the original
capture separately, and add meaningful alt text plus visible numbered callouts where useful.
