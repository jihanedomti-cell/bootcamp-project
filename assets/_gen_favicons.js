// Génère les favicons PNG du picto Brandly (anneau sauge + point central).
// Rendu anti-aliasé par supersampling 4x4, sans dépendance (zlib intégré à Node).
// Usage : node assets/_gen_favicons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SAGE = [126, 149, 128];   // #7E9580
const CREAM = [244, 242, 234];  // #F4F2EA

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filtre None
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}
// bruit de valeur déterministe (grain craie), lissé bilinéairement
function hash(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return hash(x0, y0) * (1 - sx) * (1 - sy) + hash(x0 + 1, y0) * sx * (1 - sy)
       + hash(x0, y0 + 1) * (1 - sx) * sy + hash(x0 + 1, y0 + 1) * sx * sy;
}

function render(size, scale = 1.0, bg = null) {
  const c = size / 2;
  const rRing = 0.40 * size * scale;
  const halfw = 0.075 * size * scale;
  const rDot = 0.13 * size * scale;
  const gf = 0.9 * (32 / size);            // fréquence de grain (constante en pixels affichés)
  const GAP_C = -2.3, GAP_H = 0.17;        // petite ouverture du tracé (trait levé)
  const SS = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let ink = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS - c;
          const y = py + (sy + 0.5) / SS - c;
          const d = Math.hypot(x, y);
          const ang = Math.atan2(y, x);
          // tracé qui ondule (cercle imparfait) + épaisseur variable
          const wob = 1 + 0.045 * Math.sin(3 * ang + 0.8) + 0.028 * Math.sin(5 * ang + 2.1) + 0.02 * Math.sin(2 * ang - 1.0);
          const rr = rRing * wob;
          const hw = halfw * (1 + 0.25 * Math.sin(4 * ang + 0.5));
          let inRing = Math.abs(d - rr) <= hw;
          let da = ang - GAP_C; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < GAP_H) inRing = false;       // ouverture
          const rd = rDot * (1 + 0.10 * Math.sin(3 * ang + 1.7) + 0.06 * Math.sin(5 * ang));
          if (inRing || d <= rd) ink++;
        }
      }
      let cov = ink / (SS * SS);
      // grain craie : on érode légèrement et irrégulièrement la couverture
      if (cov > 0) {
        const grain = 0.62 + 0.38 * vnoise(px * gf, py * gf);
        const grain2 = 0.78 + 0.22 * vnoise(px * gf * 2.3 + 50, py * gf * 2.3 + 50);
        cov *= grain * grain2;
      }
      const i = (py * size + px) * 4;
      if (bg === null) {
        out[i] = SAGE[0]; out[i + 1] = SAGE[1]; out[i + 2] = SAGE[2];
        out[i + 3] = Math.round(cov * 255);
      } else {
        out[i] = Math.round(SAGE[0] * cov + bg[0] * (1 - cov));
        out[i + 1] = Math.round(SAGE[1] * cov + bg[1] * (1 - cov));
        out[i + 2] = Math.round(SAGE[2] * cov + bg[2] * (1 - cov));
        out[i + 3] = 255;
      }
    }
  }
  return out;
}
const here = __dirname;
const jobs = [
  ['favicon-32.png', 32, 1.0, null],     // onglet : transparent
  ['favicon-180.png', 180, 1.0, CREAM],  // apple-touch : fond crème
  ['favicon-512.png', 512, 0.78, CREAM], // PWA maskable : picto réduit, fond plein
];
for (const [name, size, scale, bg] of jobs) {
  writePng(path.join(here, name), size, size, render(size, scale, bg));
  console.log('écrit', name, `(${size}x${size})`);
}
