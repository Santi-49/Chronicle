import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public", "exports", "tilted-app-mockup.png");
const port = 4322;
const host = "127.0.0.1";
const url = `http://${host}:${port}`;

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function startPreview() {
  return spawn("npx", ["astro", "preview", "--host", host, "--port", String(port)], {
    cwd: root,
    shell: process.platform === "win32",
    stdio: "ignore",
  });
}

async function waitForServer() {
  const started = Date.now();

  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function readPng(path) {
  return new Promise((resolveRead, reject) => {
    createReadStream(path)
      .pipe(new PNG({ checkCRC: false }))
      .on("parsed", function handleParsed() {
        resolveRead(this);
      })
      .on("error", reject);
  });
}

function writePng(path, png) {
  return new Promise((resolveWrite, reject) => {
    png.pack().pipe(createWriteStream(path)).on("finish", resolveWrite).on("error", reject);
  });
}

async function trimTransparentPixels(path) {
  const source = await readPng(path);
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const alpha = source.data[(source.width * y + x) * 4 + 3];
      if (alpha === 0) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("Exported image is fully transparent; nothing to trim.");
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const trimmed = new PNG({ width, height });

  PNG.bitblt(source, trimmed, minX, minY, width, height, 0, 0);
  await writePng(path, trimmed);

  return { width, height };
}

await mkdir(dirname(output), { recursive: true });
await run("npm", ["run", "build"]);

const preview = startPreview();

try {
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 2200, height: 1500 },
    deviceScaleFactor: 4,
    colorScheme: "dark",
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `
      html,
      body,
      main,
      .hero-stage,
      .hero {
        background: transparent !important;
      }

      body::before,
      .site-header,
      .hero-stage::after,
      .hero-copy,
      .debug-panel,
      .why,
      .power,
      .templates {
        display: none !important;
      }

      body {
        overflow: hidden !important;
      }

      .hero-stage {
        min-height: 1500px !important;
        overflow: visible !important;
      }

      .hero {
        padding: 0 !important;
        overflow: visible !important;
      }

      .mockup-section {
        padding: 0 !important;
        overflow: visible !important;
      }

      .mockup-export {
        display: none !important;
      }

      .hero-mockup--exported {
        display: none !important;
      }

      .hero-mockup--live,
      .hero-mockup--live[hidden] {
        display: block !important;
      }

      .hero-mockup {
        position: absolute !important;
        top: 220px !important;
        left: 360px !important;
        bottom: auto !important;
        transform: none !important;
      }
    `,
  });

  await page.locator(".hero-mockup--live").evaluate((element) => {
    element.removeAttribute("hidden");
  });

  await page.locator(".mockup-plane img").evaluate((image) => {
    if (image instanceof HTMLImageElement && !image.complete) {
      return image.decode();
    }
    return undefined;
  });

  const rect = await page.locator(".mockup-plane").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  });

  const padding = 220;
  const clip = {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: Math.min(2200, rect.width + padding * 2),
    height: Math.min(1500, rect.height + padding * 2),
  };

  await page.screenshot({
    path: output,
    clip,
    omitBackground: true,
  });

  await browser.close();
  const size = await trimTransparentPixels(output);
  console.log(`Exported ${output}`);
  console.log(`Trimmed transparent pixels. Final size: ${size.width}x${size.height}`);
} finally {
  preview.kill();
}
