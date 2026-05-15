/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Regenera latest.yml / alpha.yml / beta.yml de electron-builder DESPUES de
 * que el .exe fue firmado por un servicio externo (SignPath). El YAML lleva
 * sha512 + size del binario y electron-updater valida el hash al actualizar,
 * asi que firmar in-place rompe el manifest si no se recalcula.
 *
 * Itera todos los .yml en release/ que tengan `path:` apuntando a un .exe
 * existente, recalcula sha512 (base64) y size, persiste con el mismo formato.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const RELEASE_DIR = path.resolve(process.cwd(), 'release');

function sha512Base64(buf) {
  return crypto.createHash('sha512').update(buf).digest('base64');
}

function processManifest(ymlPath) {
  const raw = fs.readFileSync(ymlPath, 'utf-8');
  const manifest = yaml.load(raw);
  if (!manifest || !manifest.path) {
    console.log(`[skip] ${path.basename(ymlPath)} sin "path:"`);
    return false;
  }
  const exePath = path.join(path.dirname(ymlPath), manifest.path);
  if (!fs.existsSync(exePath) || !manifest.path.toLowerCase().endsWith('.exe')) {
    console.log(`[skip] ${path.basename(ymlPath)} no apunta a .exe existente: ${manifest.path}`);
    return false;
  }
  const buf = fs.readFileSync(exePath);
  const sha512 = sha512Base64(buf);
  const size = buf.length;

  manifest.sha512 = sha512;
  // releaseDate se conserva tal cual.
  if (Array.isArray(manifest.files)) {
    for (const f of manifest.files) {
      if (f.url && f.url.toLowerCase().endsWith('.exe')) {
        f.sha512 = sha512;
        f.size = size;
      }
    }
  }

  fs.writeFileSync(ymlPath, yaml.dump(manifest, { lineWidth: -1 }), 'utf-8');
  console.log(`[ok] ${path.basename(ymlPath)} regenerado (sha512=${sha512.slice(0, 12)}..., size=${size}).`);
  return true;
}

function main() {
  if (!fs.existsSync(RELEASE_DIR)) {
    console.error(`[error] no existe ${RELEASE_DIR}`);
    process.exit(1);
  }
  const ymls = fs.readdirSync(RELEASE_DIR).filter((f) => f.endsWith('.yml'));
  if (!ymls.length) {
    console.log('[warn] no hay .yml en release/');
    return;
  }
  let regenerados = 0;
  for (const yml of ymls) {
    if (processManifest(path.join(RELEASE_DIR, yml))) regenerados++;
  }
  console.log(`Total regenerados: ${regenerados}/${ymls.length}`);
}

main();
