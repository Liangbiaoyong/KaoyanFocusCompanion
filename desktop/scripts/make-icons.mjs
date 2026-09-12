// 生成托盘图标与 exe 图标，避免仓库依赖外来素材、也避免手搓二进制资源。
// 运行：node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'assets');

const ROCK = [91, 127, 166];      // 清冷山系主色
const ROCK_DARK = [70, 100, 133];
const WARM = [224, 164, 74];      // 凤凰

/** 按归一化坐标画出 32×32 设计，再缩放到任意尺寸 */
function renderRgba(size) {
  const px = Buffer.alloc(size * size * 4); // RGBA，初始全透明

  const blend = (x, y, [r, g, b], alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const src = alpha / 255;
    const dst = px[i + 3] / 255;
    const out = src + dst * (1 - src);
    if (out === 0) return;
    px[i] = Math.round((r * src + px[i] * dst * (1 - src)) / out);
    px[i + 1] = Math.round((g * src + px[i + 1] * dst * (1 - src)) / out);
    px[i + 2] = Math.round((b * src + px[i + 2] * dst * (1 - src)) / out);
    px[i + 3] = Math.round(out * 255);
  };

  const cx = size / 2;
  const apexY = size * 0.44;
  const baseY = size * 0.93;
  const baseHalf = size * 0.45;

  // 山
  for (let y = Math.round(apexY); y <= Math.round(baseY); y += 1) {
    const t = (y - apexY) / (baseY - apexY);
    const half = baseHalf * t;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x += 1) {
      blend(x, y, t > 0.62 ? ROCK_DARK : ROCK);
    }
  }

  // 凤凰：山巅上方的暖色圆点
  const dotR = size * 0.14;
  const dotCy = size * 0.27;
  for (let y = Math.floor(dotCy - dotR - 1); y <= Math.ceil(dotCy + dotR + 1); y += 1) {
    for (let x = Math.floor(cx - dotR - 1); x <= Math.ceil(cx + dotR + 1); x += 1) {
      const d = Math.hypot(x - cx, y - dotCy);
      if (d <= dotR) blend(x, y, WARM);
      else if (d <= dotR + 1) blend(x, y, WARM, Math.round((dotR + 1 - d) * 255));
    }
  }

  return px;
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

function encodePng(size) {
  const px = renderRgba(size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    px.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO 容器：Vista 起允许直接内嵌 PNG，所以不必再编码 BMP */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirs = [];
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size; // 0 表示 256
    dir[1] = size >= 256 ? 0 : size;
    dir[2] = 0; // 调色板数
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4);  // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

mkdirSync(OUT_DIR, { recursive: true });

// 托盘：Windows 托盘实际取 16/32，给 32 足够
const trayPng = encodePng(32);
writeFileSync(path.join(OUT_DIR, 'tray.png'), trayPng);

// exe 图标：多尺寸，资源管理器在不同视图下会挑不同的
const icoSizes = [16, 32, 48, 64, 128, 256];
const ico = buildIco(icoSizes.map((size) => ({ size, png: encodePng(size) })));
writeFileSync(path.join(OUT_DIR, 'app.ico'), ico);

console.log(`tray.png  ${trayPng.length} 字节 (32x32)`);
console.log(`app.ico   ${ico.length} 字节 (${icoSizes.join('/')})`);
