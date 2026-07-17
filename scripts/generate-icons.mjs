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
  const stroke = size * 0.13;
  // Shaft runs from lower-left to upper-right at a natural writing angle,
  // kept compact (doesn't reach the corners) so state decorations have
  // clear space in the bottom-right and below.
  const x1 = size * 0.28, y1 = size * 0.68;
  const x2 = size * 0.68, y2 = size * 0.24;

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
  const tipLen = size * 0.16;
  const tipX = x2 + Math.cos(angle) * tipLen;
  const tipY = y2 + Math.sin(angle) * tipLen;
  const perpX = Math.cos(angle + Math.PI / 2) * (stroke * 0.7);
  const perpY = Math.sin(angle + Math.PI / 2) * (stroke * 0.7);

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

/** Filled circle (used as a badge base, and for the processing dots). */
function fillCircle(rgba, size, cx, cy, r, rgb, alpha) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist <= r) setPixel(rgba, size, x, y, rgb, alpha);
    }
  }
}

/**
 * Three dots in a row along the bottom edge, classic "loading" indicator.
 * Positioned in the clear strip below the pencil's shaft (which stays
 * above y=0.75 — see drawPencil). activeIndex (0-2) makes one dot larger
 * than the other two; cycling it across frames produces a left-to-right
 * bounce.
 */
function drawLoadingDots(rgba, size, activeIndex, rgb, alpha) {
  const y = size * 0.93;
  const spacing = size * 0.16;
  const cx = size * 0.5;
  const baseR = size * 0.05;
  const activeR = size * 0.09;

  for (let i = 0; i < 3; i++) {
    const dotX = cx + (i - 1) * spacing;
    const isActive = i === activeIndex;
    fillCircle(rgba, size, dotX, y, isActive ? activeR : baseR, rgb, alpha);
  }
}

/** Checkmark, drawn as two connected thick line segments. */
function drawCheck(rgba, size, cx, cy, scale, rgb, alpha) {
  const stroke = size * 0.12;
  const x1 = cx - scale * 0.5, y1 = cy - scale * 0.05;
  const x2 = cx - scale * 0.12, y2 = cy + scale * 0.35;
  const x3 = cx + scale * 0.55, y3 = cy - scale * 0.45;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = distToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2);
      const d2 = distToSegment(x + 0.5, y + 0.5, x2, y2, x3, y3);
      if (Math.min(d1, d2) <= stroke / 2) setPixel(rgba, size, x, y, rgb, alpha);
    }
  }
}

/** Exclamation mark: a vertical bar plus a dot below it. */
function drawExclamation(rgba, size, cx, cy, scale, rgb, alpha) {
  const stroke = size * 0.13;
  const barTopY = cy - scale * 0.55;
  const barBottomY = cy;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = distToSegment(x + 0.5, y + 0.5, cx, barTopY, cx, barBottomY);
      if (d <= stroke / 2) setPixel(rgba, size, x, y, rgb, alpha);
    }
  }
  fillCircle(rgba, size, cx, cy + scale * 0.3, stroke / 2, rgb, alpha);
}

/**
 * Draws the state-specific decoration.
 * - ready/empty: nothing extra (plain pencil)
 * - processing: 3 loading dots along the bottom edge; frame (0-2) selects
 *   which dot is enlarged, producing a left-to-right bounce when the tray
 *   controller cycles frames
 * - done: a bold checkmark in the bottom-right corner
 * - error: a bold exclamation mark in the bottom-right corner
 * The pencil shaft stays within the top-left 0.75 of the canvas (see
 * drawPencil), so both the bottom edge and bottom-right corner are clear
 * space for these decorations. All shapes are pure silhouette so they
 * remain valid macOS template images.
 */
function drawStateDecoration(rgba, size, state, rgb, alpha, frame = 0) {
  if (state === "processing") {
    drawLoadingDots(rgba, size, frame % 3, rgb, alpha);
  } else if (state === "done" || state === "error") {
    const cx = size * 0.83;
    const cy = size * 0.83;
    if (state === "done") {
      drawCheck(rgba, size, cx, cy, size * 0.19, rgb, alpha);
    } else {
      drawExclamation(rgba, size, cx, cy, size * 0.21, rgb, alpha);
    }
  }
}

// Colored (non-template) icon: used on Windows/Linux where the tray does
// its own theming. Dark gray pencil + colored state decoration.
function makeColorIcon(state, accent, frame) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  drawPencil(rgba, SIZE, [60, 60, 60], 255);
  drawStateDecoration(rgba, SIZE, state, accent, 255, frame);
  return buildPng(SIZE, SIZE, rgba);
}

// macOS template icon: pure black silhouette + alpha; macOS auto-tints for
// light/dark menu bar. State decoration is drawn in the same black so it
// stays a valid monochrome template image.
function makeTemplateIcon(state, frame) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  drawPencil(rgba, SIZE, [0, 0, 0], 255);
  drawStateDecoration(rgba, SIZE, state, [0, 0, 0], 255, frame);
  return buildPng(SIZE, SIZE, rgba);
}

const STATE_ACCENTS = {
  empty: [150, 150, 150],
  ready: [70, 160, 90],
  processing: [70, 130, 220],
  done: [50, 180, 90],
  error: [210, 70, 70],
};

// One frame per dot in the loading-dots animation (left, middle, right).
const PROCESSING_FRAME_COUNT = 3;

for (const [state, accent] of Object.entries(STATE_ACCENTS)) {
  writeFileSync(path.join(OUT_DIR, `tray-${state}.png`), makeColorIcon(state, accent, 0));
  writeFileSync(path.join(OUT_DIR, `tray-${state}Template.png`), makeTemplateIcon(state, 0));
}

// Extra animation frames for the processing state — the tray controller
// cycles through these on an interval so "processing" reads as active
// motion rather than a static icon.
for (let frame = 0; frame < PROCESSING_FRAME_COUNT; frame++) {
  writeFileSync(
    path.join(OUT_DIR, `tray-processing-${frame}.png`),
    makeColorIcon("processing", STATE_ACCENTS.processing, frame)
  );
  writeFileSync(
    path.join(OUT_DIR, `tray-processing-${frame}Template.png`),
    makeTemplateIcon("processing", frame)
  );
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
