// Generates simple placeholder tray icons (16x16 and app icon) as PNGs
// using zlib deflate + hand-built PNG chunks — no image library dependency.
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

  // Add filter byte 0 per scanline
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

const SIZE = 32;

function makeCircleIcon({ color, ring = null }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 3;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * SIZE + x) * 4;
      if (dist <= r) {
        rgba[idx] = color[0];
        rgba[idx + 1] = color[1];
        rgba[idx + 2] = color[2];
        rgba[idx + 3] = 255;
      } else if (ring && dist <= r + 2) {
        rgba[idx] = ring[0];
        rgba[idx + 1] = ring[1];
        rgba[idx + 2] = ring[2];
        rgba[idx + 3] = 200;
      }
    }
  }
  return buildPng(SIZE, SIZE, rgba);
}

// macOS template icons must be black/transparent only (silhouette, alpha channel encodes shape).
function makeTemplateIcon({ filled }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 3;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * SIZE + x) * 4;
      const onRing = dist <= r && dist >= r - (filled ? r : 2.5);
      if (onRing) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 255;
      }
    }
  }
  return buildPng(SIZE, SIZE, rgba);
}

const STATES = {
  empty: { color: [150, 150, 150] },
  ready: { color: [70, 160, 90] },
  processing: { color: [70, 130, 220] },
  done: { color: [50, 180, 90], ring: [255, 255, 255] },
  error: { color: [210, 70, 70] },
};

for (const [state, spec] of Object.entries(STATES)) {
  writeFileSync(path.join(OUT_DIR, `tray-${state}.png`), makeCircleIcon(spec));
  writeFileSync(
    path.join(OUT_DIR, `tray-${state}Template.png`),
    makeTemplateIcon({ filled: state === "ready" || state === "done" })
  );
}

// App icon (used for the settings window / installer during dev; larger size)
function makeAppIcon() {
  const size = 1024;
  const rgba = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= r) {
        rgba[idx] = 74;
        rgba[idx + 1] = 144;
        rgba[idx + 2] = 217;
        rgba[idx + 3] = 255;
      }
    }
  }
  return buildPng(size, size, rgba);
}

mkdirSync(path.join(process.cwd(), "assets"), { recursive: true });
writeFileSync(path.join(process.cwd(), "assets", "icon.png"), makeAppIcon());

console.log("Generated placeholder icons in assets/icons and assets/icon.png");
