/**
 * Cuts the browser icons out of `public/logo.png`.
 *
 * The artwork is a wide canvas with generous white margins, which would leave
 * the logo as an unreadable speck in a square favicon. So the blank border is
 * trimmed and the remaining artwork is fitted, centred, into each square tile.
 * Nothing about the logo itself is altered — only the empty space around it.
 *
 * Re-run this whenever the logo changes:  npm run icons
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SOURCE = join(PUBLIC, 'logo.png');

/** A pixel counts as artwork once it is this opaque. */
const ALPHA_FLOOR = 32;
/** Fraction of the tile the artwork fills, leaving a little breathing room. */
const FILL = 0.94;

/**
 * sharp's own `trim()` gives up on this file: the exported PNG carries faint,
 * almost-transparent specks out at the edges, so every border looks like
 * content to it. Scanning the alpha channel with a floor finds the real box.
 */
async function contentBox() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] < ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('logo.png appears to be fully transparent');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function squareIcon(size, box) {
  const inner = Math.round(size * FILL);
  const pad = Math.round((size - inner) / 2);

  const artwork = await sharp(SOURCE)
    .extract(box)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: artwork, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Wraps a PNG in a single-image ICO container. */
function toIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset past header + entry

  return Buffer.concat([header, entry, png]);
}

const main = async () => {
  await readFile(SOURCE).catch(() => {
    throw new Error(`public/logo.png not found — drop the logo there first.`);
  });

  const meta = await sharp(SOURCE).metadata();
  const box = await contentBox();
  console.log(
    `source ${meta.width}×${meta.height} → artwork ${box.width}×${box.height} at (${box.left}, ${box.top})`,
  );

  const [ico64, apple180, icon192, icon512] = await Promise.all([
    squareIcon(64, box),
    squareIcon(180, box),
    squareIcon(192, box),
    squareIcon(512, box),
  ]);

  const outputs = [
    ['favicon.ico', toIco(ico64, 64)],
    ['apple-touch-icon.png', apple180],
    ['icon-192.png', icon192],
    ['icon-512.png', icon512],
  ];

  for (const [name, buffer] of outputs) {
    await writeFile(join(PUBLIC, name), buffer);
    console.log(`  ${name.padEnd(22)} ${buffer.length} bytes`);
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
