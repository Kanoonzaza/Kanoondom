// Generate the home-screen icons.
//
//   node tools/make-icons.mjs      (or: npm run icons)
//
// The game ships no artwork — every graphic in it is an emoji — but the
// platforms insist on real PNGs for a home-screen icon, and an emoji is not one.
//
// So the castle is DRAWN here, in a few dozen rectangles, and encoded to PNG
// with nothing but node:zlib. No canvas, no font, no dependency, no manual
// download step: the icons are reproducible from source with one command, which
// is the same standard everything else in this project is held to.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BG = [0x12, 0x15, 0x1f];      // --bg
const GOLD = [0xd9, 0xa4, 0x41];    // --gold
const DARK = [0x0d, 0x11, 0x19];    // the gate, and the sky behind battlements

// ---------------------------------------------------------------------------
// A very small raster
// ---------------------------------------------------------------------------

function canvas(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = BG[0];
    pixels[i * 4 + 1] = BG[1];
    pixels[i * 4 + 2] = BG[2];
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/** Fill a rectangle given in 0..1 coordinates. */
function rect(pixels, size, colour, x0, y0, x1, y1) {
  const px = (v) => Math.round(v * size);
  const left = Math.max(0, px(x0));
  const right = Math.min(size, px(x1));
  const top = Math.max(0, px(y0));
  const bottom = Math.min(size, px(y1));

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const at = (y * size + x) * 4;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
      pixels[at + 3] = 255;
    }
  }
}

/**
 * A castle: three towers, battlements, a gate.
 *
 * `inset` is how much of the canvas is kept clear around it. Maskable icons get
 * a wide one because Android crops them to whatever shape the launcher fancies,
 * and a full-bleed castle would lose its towers to a circle.
 */
function castle(pixels, size, inset) {
  const span = 1 - inset * 2;
  const at = (v) => inset + v * span;          // map 0..1 of the castle into the safe area
  const box = (colour, x0, y0, x1, y1) =>
    rect(pixels, size, colour, at(x0), at(y0), at(x1), at(y1));

  // Towers: outer pair, then the taller keep in the middle.
  const towers = [
    { x0: 0.06, x1: 0.30, top: 0.30 },
    { x0: 0.38, x1: 0.62, top: 0.16 },
    { x0: 0.70, x1: 0.94, top: 0.30 },
  ];

  for (const tower of towers) {
    box(GOLD, tower.x0, tower.top, tower.x1, 0.92);

    // Battlements, cut back out of the top: four teeth, three gaps.
    const width = tower.x1 - tower.x0;
    const tooth = width / 7;
    for (let i = 1; i <= 5; i += 2) {
      box(DARK, tower.x0 + tooth * i, tower.top, tower.x0 + tooth * (i + 1), tower.top + 0.075);
    }
  }

  // The curtain wall between them, lower than the towers.
  box(GOLD, 0.06, 0.52, 0.94, 0.92);

  // The gate.
  box(DARK, 0.42, 0.66, 0.58, 0.92);
  box(DARK, 0.44, 0.63, 0.56, 0.68);           // a suggestion of an arch
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  // Each scanline is prefixed with its filter type; 0 means "stored as-is",
  // which compresses perfectly well for flat colour.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;      // bit depth
  header[9] = 6;      // colour type: RGBA
  header[10] = 0;     // deflate
  header[11] = 0;     // adaptive filtering
  header[12] = 0;     // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const ICONS = [
  { name: 'icon-192.png', size: 192, inset: 0.10 },
  { name: 'icon-512.png', size: 512, inset: 0.10 },
  { name: 'icon-maskable-512.png', size: 512, inset: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, inset: 0.10 },
];

mkdirSync(join(ROOT, 'icons'), { recursive: true });

for (const { name, size, inset } of ICONS) {
  const pixels = canvas(size);
  castle(pixels, size, inset);
  const png = encodePng(pixels, size);
  writeFileSync(join(ROOT, 'icons', name), png);
  console.log(`icons/${name}  ${size}x${size}  ${png.length} bytes`);
}
