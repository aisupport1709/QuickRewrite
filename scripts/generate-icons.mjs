// Generates tray icons (pencil glyph, macOS menu-bar sized) and the app
// icon as PNGs using zlib deflate + hand-built PNG chunks — no image
// library dependency.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "assets", "icons");
mkdirSync(OUT_DIR, { recursive: true });

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Builds a PNG from an RGBA pixel buffer. */
function buildPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// macOS menu bar: template images should be ~22x22pt. We render at 2x (44px)
// so it looks crisp on Retina displays without appearing oversized.
const SIZE = 44;

function setPixel(rgba, size, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (Math.round(y) * size + Math.round(x)) * 4;
  rgba[idx] = rgb[0];
  rgba[idx + 1] = rgb[1];
  rgba[idx + 2] = rgb[2];
  rgba[idx + 3] = alpha;
}

/** Distance from point (x,y) to line segment (x1,y1)-(x2,y2). */
function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

/**
 * Draws a simple pencil glyph (diagonal shaft + angled tip) — reads as
 * "rewrite/edit" and matches the thin, modern look of native macOS menu
 * bar icons instead of a plain filled circle.
 */
function drawPencil(rgba, size, rgb, alpha = 255) {
  const stroke = size * 0.09;
  // Shaft runs from lower-left to upper-right at a natural writing angle.
  const x1 = size * 0.24, y1 = size * 0.82;
  const x2 = size * 0.72, y2 = size * 0.24;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = distToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2);
      if (d <= stroke / 2) {
        setPixel(rgba, size, x, y, rgb, alpha);
      }
    }
  }

  // Pencil tip (small triangle beyond x2,y2 continuing the same angle).
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipLen = size * 0.14;
  const tipX = x2 + Math.cos(angle) * tipLen;
  const tipY = y2 + Math.sin(angle) * tipLen;
  const perpX = Math.cos(angle + Math.PI / 2) * (stroke * 0.65);
  const perpY = Math.sin(angle + Math.PI / 2) * (stroke * 0.65);

  const triPoints = [
    [x2 + perpX, y2 + perpY],
    [x2 - perpX, y2 - perpY],
    [tipX, tipY],
  ];
  fillTriangle(rgba, size, triPoints, rgb, alpha);
}

function fillTriangle(rgba, size, pts, rgb, alpha) {
  const [p0, p1, p2] = pts;
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

  const sign = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pt = [x + 0.5, y + 0.5];
      const d1 = sign(pt, p0, p1);
      const d2 = sign(pt, p1, p2);
      const d3 = sign(pt, p2, p0);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) {
        setPixel(rgba, size, x, y, rgb, alpha);
      }
    }
  }
}

/** Small filled circle badge in a corner, used to convey state without recoloring the whole glyph. */
function drawBadge(rgba, size, rgb, alpha = 255) {
  const r = size * 0.16;
  const cx = size * 0.80;
  const cy = size * 0.80;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist <= r) {
        setPixel(rgba, size, x, y, rgb, alpha);
      }
    }
  }
}

// Colored (non-template) icon: used on Windows/Linux where the tray does
// its own theming. Dark gray pencil + colored state badge.
function makeColorIcon({ badge }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  drawPencil(rgba, SIZE, [60, 60, 60], 255);
  if (badge) drawBadge(rgba, SIZE, badge, 255);
  return buildPng(SIZE, SIZE, rgba);
}

// macOS template icon: pure black silhouette + alpha; macOS auto-tints for
// light/dark menu bar. No badge here (template images are monochrome by
// OS contract) — state is instead conveyed via the tooltip and menu label.
function makeTemplateIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  drawPencil(rgba, SIZE, [0, 0, 0], 255);
  return buildPng(SIZE, SIZE, rgba);
}

const STATE_BADGES = {
  empty: null,
  ready: [70, 160, 90],
  processing: [70, 130, 220],
  done: [50, 180, 90],
  error: [210, 70, 70],
};

for (const [state, badge] of Object.entries(STATE_BADGES)) {
  writeFileSync(path.join(OUT_DIR, `tray-${state}.png`), makeColorIcon({ badge }));
  writeFileSync(path.join(OUT_DIR, `tray-${state}Template.png`), makeTemplateIcon());
}

// App icon (used for the settings window / installer; must be >=512x512).
function makeAppIcon() {
  const size = 1024;
  const rgba = Buffer.alloc(size * size * 4, 0);

  // Rounded-square background, modern blue.
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < radius && y < radius && Math.hypot(x - radius, y - radius) > radius) ||
        (x > size - radius && y < radius && Math.hypot(x - (size - radius), y - radius) > radius) ||
        (x < radius && y > size - radius && Math.hypot(x - radius, y - (size - radius)) > radius) ||
        (x > size - radius && y > size - radius && Math.hypot(x - (size - radius), y - (size - radius)) > radius);
      if (!inCorner) {
        setPixel(rgba, size, x, y, [74, 144, 217], 255);
      }
    }
  }

  // White pencil glyph on top, centered and scaled to the icon.
  const glyph = Buffer.alloc(size * size * 4, 0);
  drawPencil(glyph, size, [255, 255, 255], 255);
  for (let i = 0; i < glyph.length; i += 4) {
    if (glyph[i + 3] > 0) {
      rgba[i] = glyph[i];
      rgba[i + 1] = glyph[i + 1];
      rgba[i + 2] = glyph[i + 2];
      rgba[i + 3] = 255;
    }
  }

  return buildPng(size, size, rgba);
}

mkdirSync(path.join(process.cwd(), "assets"), { recursive: true });
writeFileSync(path.join(process.cwd(), "assets", "icon.png"), makeAppIcon());

console.log("Generated pencil-glyph tray icons (44x44 @2x) and app icon.");
