// 生成托盘图标，避免仓库依赖外来素材、也避免手搓二进制资源。
// 运行：node scripts/make-tray-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 32;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'assets', 'tray.png');

const ROCK = [91, 127, 166];   // 清冷山系主色
const ROCK_DARK = [70, 100, 133];
const WARM = [224, 164, 74];   // 凤凰

const px = Buffer.alloc(SIZE * SIZE * 4); // RGBA，初始全透明

function blend(x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const src = alpha / 255;
  const dst = px[i + 3] / 255;
  const out = src + dst * (1 - src);
  if (out === 0) return;
  px[i] = Math.round((r * src + px[i] * dst * (1 - src)) / out);
  px[i + 1] = Math.round((g * src + px[i + 1] * dst * (1 - src)) / out);
  px[i + 2] = Math.round((b * src + px[i + 2] * dst * (1 - src)) / out);
  px[i + 3] = Math.round(out * 255);
}

// 山：底边从 y=29 起，随高度收窄
for (let y = 15; y <= 29; y += 1) {
  const half = Math.round((y - 14) * 1.15);
  for (let x = 16 - half; x <= 16 + half; x += 1) {
    blend(x, y, y > 24 ? ROCK_DARK : ROCK);
  }
}

// 凤凰：山巅上方一枚暖色圆点
const cx = 16;
const cy = 9;
const r = 4.5;
for (let y = cy - 6; y <= cy + 6; y += 1) {
  for (let x = cx - 6; x <= cx + 6; x += 1) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r) blend(x, y, WARM);
    else if (d <= r + 1) blend(x, y, WARM, Math.round((r + 1 - d) * 255));
  }
}

// —— PNG 编码 ——
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const stride = SIZE * 4 + 1;
const raw = Buffer.alloc(SIZE * stride);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * stride] = 0; // filter: none
  px.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`已生成 ${OUT}（${png.length} 字节，${SIZE}x${SIZE}）`);
