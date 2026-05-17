#!/usr/bin/env node
/**
 * Generates app icons (electron-builder) and branded logo variants from
 * the master brand asset at `src/assets/images/logo-letra-negra.png`.
 *
 * Outputs:
 *   build/icon.png            — 1024x1024 master square icon
 *   build/icon.ico            — Windows multi-resolution
 *   build/icon.icns           — macOS
 *   build/icons/*.png         — Linux sizes
 *   src/assets/images/logo/   — width-based logo variants for in-app use
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');
const APP_LOGO_DIR = path.join(ROOT, 'src', 'assets', 'images', 'logo');
const SOURCE_DARK = path.join(ROOT, 'src', 'assets', 'images', 'logo-letra-negra.png');  // text negro -> bg claro
const SOURCE_LIGHT = path.join(ROOT, 'src', 'assets', 'images', 'logo-letra-blanca.png'); // text blanco -> bg oscuro
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

// In-app variants: width-based, aspect-preserving.
// Names used by the app: logo-light / logo-dark + size suffix.
const LOGO_WIDTHS = [
  { w: 256, suffix: 'sm' },
  { w: 512, suffix: 'md' },
  { w: 1024, suffix: 'lg' },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function drawAppIcon(size, sourceImg) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fondo blanco con esquinas redondeadas (icono cuadrado para apps).
  const r = size * 0.18;
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // El logo es wide (~2.6:1). Escalamos al 84% del ancho dejando padding.
  const targetW = size * 0.84;
  const ratio = sourceImg.width / sourceImg.height;
  const targetH = targetW / ratio;
  const x = (size - targetW) / 2;
  const y = (size - targetH) / 2;
  ctx.drawImage(sourceImg, x, y, targetW, targetH);

  return canvas.toBuffer('image/png');
}

function drawLogoVariant(width, sourceImg) {
  const ratio = sourceImg.width / sourceImg.height;
  const height = Math.round(width / ratio);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0, width, height);
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
  ensureDir(APP_LOGO_DIR);

  if (!fs.existsSync(SOURCE_DARK) || !fs.existsSync(SOURCE_LIGHT)) {
    throw new Error(`Faltan logos fuente: ${SOURCE_DARK} / ${SOURCE_LIGHT}`);
  }
  const sourceForIcon = await loadImage(SOURCE_DARK); // letra negra sobre fondo blanco
  const sourceDark = await loadImage(SOURCE_DARK);
  const sourceLight = await loadImage(SOURCE_LIGHT);

  // 1) Iconos de la app (cuadrados, fondo blanco con esquinas redondeadas)
  const masterPath = path.join(BUILD_DIR, 'icon.png');
  fs.writeFileSync(masterPath, drawAppIcon(MASTER_SIZE, sourceForIcon));
  console.log(`✓ build/icon.png (${MASTER_SIZE}x${MASTER_SIZE})`);

  for (const size of LINUX_SIZES) {
    const out = path.join(ICONS_DIR, `${size}x${size}.png`);
    fs.writeFileSync(out, drawAppIcon(size, sourceForIcon));
    console.log(`✓ build/icons/${size}x${size}.png`);
  }

  const icoBuffers = ICO_SIZES.map((s) => drawAppIcon(s, sourceForIcon));
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
    fs.writeFileSync(path.join(ICONSET_DIR, name), drawAppIcon(size, sourceForIcon));
  }
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${path.join(BUILD_DIR, 'icon.icns')}"`, { stdio: 'inherit' });
    console.log(`✓ build/icon.icns`);
    fs.rmSync(ICONSET_DIR, { recursive: true, force: true });
  } catch (e) {
    console.warn(`⚠ iconutil failed (Mac only). Skipping .icns.`);
  }

  // 2) Variantes in-app del logo (wide, transparentes) — light/dark x sm/md/lg
  for (const { w, suffix } of LOGO_WIDTHS) {
    const lightOut = path.join(APP_LOGO_DIR, `logo-light-${suffix}.png`);
    const darkOut = path.join(APP_LOGO_DIR, `logo-dark-${suffix}.png`);
    fs.writeFileSync(lightOut, drawLogoVariant(w, sourceDark));   // texto negro -> fondo claro
    fs.writeFileSync(darkOut, drawLogoVariant(w, sourceLight));   // texto blanco -> fondo oscuro
    console.log(`✓ ${path.relative(ROOT, lightOut)}`);
    console.log(`✓ ${path.relative(ROOT, darkOut)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
