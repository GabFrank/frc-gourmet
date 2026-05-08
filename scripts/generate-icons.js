#!/usr/bin/env node
/**
 * Generates branded placeholder icons for electron-builder.
 *
 * Outputs:
 *   build/icon.png        — 1024x1024 master
 *   build/icon.ico        — Windows multi-resolution
 *   build/icon.icns       — macOS
 *   build/icons/*.png     — Linux (16, 32, 48, 64, 128, 256, 512, 1024)
 *
 * Replace build/icon.png with a real brand asset (≥1024x1024) and re-run
 * `node scripts/generate-icons.js` to regenerate derivatives.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createCanvas, registerFont } = require('canvas');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');
const MASTER_SIZE = 1024;
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#0d47a1');
  grad.addColorStop(1, '#1976d2');
  ctx.fillStyle = grad;
  const r = size * 0.18;
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.34)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FRC', size / 2, size * 0.46);

  ctx.font = `${Math.floor(size * 0.12)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('GOURMET', size / 2, size * 0.72);

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function main() {
  ensureDir(BUILD_DIR);
  ensureDir(ICONS_DIR);
  ensureDir(ICONSET_DIR);

  const masterPath = path.join(BUILD_DIR, 'icon.png');
  fs.writeFileSync(masterPath, drawIcon(MASTER_SIZE));
  console.log(`✓ build/icon.png (${MASTER_SIZE}x${MASTER_SIZE})`);

  for (const size of LINUX_SIZES) {
    const out = path.join(ICONS_DIR, `${size}x${size}.png`);
    fs.writeFileSync(out, drawIcon(size));
    console.log(`✓ build/icons/${size}x${size}.png`);
  }

  const icoBuffers = ICO_SIZES.map((s) => drawIcon(s));
  const tmpFiles = [];
  for (let i = 0; i < ICO_SIZES.length; i++) {
    const tmp = path.join(BUILD_DIR, `.tmp-ico-${ICO_SIZES[i]}.png`);
    fs.writeFileSync(tmp, icoBuffers[i]);
    tmpFiles.push(tmp);
  }
  const icoBuf = await pngToIco(tmpFiles);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuf);
  tmpFiles.forEach((f) => fs.unlinkSync(f));
  console.log(`✓ build/icon.ico`);

  for (const { size, name } of ICNS_SIZES) {
    fs.writeFileSync(path.join(ICONSET_DIR, name), drawIcon(size));
  }
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${path.join(BUILD_DIR, 'icon.icns')}"`, { stdio: 'inherit' });
    console.log(`✓ build/icon.icns`);
    fs.rmSync(ICONSET_DIR, { recursive: true, force: true });
  } catch (e) {
    console.warn(`⚠ iconutil failed (Mac only). Skipping .icns.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
