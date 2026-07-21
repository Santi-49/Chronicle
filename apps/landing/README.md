# Landing Page

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
