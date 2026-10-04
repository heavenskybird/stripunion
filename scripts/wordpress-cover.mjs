import { deflateSync } from 'node:zlib';

function hashString(value) {
  let hash = 2166136261;
  for (const ch of String(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function generateEditorialCoverPng(seed, width = 1200, height = 630) {
  const hash = hashString(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 50 + ((hash >>> 8) % 80)) % 360;
  const a = hslToRgb(hueA, 72, 26);
  const b = hslToRgb(hueB, 78, 45);
  const accent = hslToRgb((hueA + 155) % 360, 82, 62);

  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);

  const circle1 = { x: width * 0.76, y: height * 0.30, r: height * 0.28 };
  const circle2 = { x: width * 0.17, y: height * 0.80, r: height * 0.38 };

  for (let y = 0; y < height; y++) {
    const row = y * rowSize;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      const t = (x / Math.max(1, width - 1)) * 0.72 + (y / Math.max(1, height - 1)) * 0.28;
      let r = Math.round(a[0] * (1 - t) + b[0] * t);
      let g = Math.round(a[1] * (1 - t) + b[1] * t);
      let bl = Math.round(a[2] * (1 - t) + b[2] * t);

      const d1 = Math.hypot(x - circle1.x, y - circle1.y);
      const d2 = Math.hypot(x - circle2.x, y - circle2.y);
      const stripe = ((x + y * 1.7 + (hash % 97)) % 180) < 28;

      if (d1 < circle1.r) {
        const mix = 0.24 * (1 - d1 / circle1.r);
        r = Math.round(r * (1 - mix) + accent[0] * mix);
        g = Math.round(g * (1 - mix) + accent[1] * mix);
        bl = Math.round(bl * (1 - mix) + accent[2] * mix);
      }
      if (d2 < circle2.r) {
        const mix = 0.16 * (1 - d2 / circle2.r);
        r = Math.min(255, Math.round(r * (1 - mix) + 245 * mix));
        g = Math.min(255, Math.round(g * (1 - mix) + 245 * mix));
        bl = Math.min(255, Math.round(bl * (1 - mix) + 245 * mix));
      }
      if (stripe) {
        r = Math.min(255, r + 10);
        g = Math.min(255, g + 10);
        bl = Math.min(255, bl + 10);
      }

      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = bl;
      raw[i + 3] = 255;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
