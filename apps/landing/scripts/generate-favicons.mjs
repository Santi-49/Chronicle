// Renders public/favicon.svg into the raster icons search engines and browsers
// actually ask for. Google only shows a favicon it can crawl as an image, and it
// recommends a square icon larger than 48x48; an SVG has no intrinsic size, so we
// publish PNG sizes plus a classic /favicon.ico for the default browser probe.
//
// Run with: npm run generate:favicons  (inside apps/landing)
import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "public", "favicon.svg");

// 48 and its multiples are what Google asks for; 180 is the Apple touch icon size.
const pngSizes = [48, 96, 180, 192, 512];
const icoSizes = [16, 32, 48];

function render(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

/** Packs PNG frames into an ICO container (PNG-in-ICO, supported everywhere we target). */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length + frames.length * 16;
  const directory = frames.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...frames.map((frame) => frame.data)]);
}

const svg = await readFile(source);

for (const size of pngSizes) {
  const target = resolve(root, "public", `favicon-${size}.png`);
  await writeFile(target, render(svg, size));
  console.log(`wrote favicon-${size}.png`);
}

const ico = buildIco(icoSizes.map((size) => ({ size, data: render(svg, size) })));
await writeFile(resolve(root, "public", "favicon.ico"), ico);
console.log(`wrote favicon.ico (${icoSizes.join(", ")} px)`);
