#!/usr/bin/env node
/**
 * Descarga los modelos de @vladmandic/human necesarios para el fichaje facial
 * y los coloca en los assets del desktop y de la PWA mobile, para servirlos
 * localmente (offline / LAN) sin depender de un CDN.
 *
 * Uso: node scripts/download-face-models.js   (o `npm run models:face`)
 *
 * Modelos:
 *   blazeface  → detección de rostro
 *   facemesh   → landmarks / alineación + insumo de liveness
 *   faceres    → embedding (descriptor 1024-D)
 *   antispoof  → anti-spoofing (foto/pantalla)
 *   liveness   → prueba de vida
 *
 * Los pesos (.bin) se resuelven leyendo el weightsManifest de cada .json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://vladmandic.github.io/human-models/models/';
const MODELS = ['blazeface', 'facemesh', 'faceres', 'antispoof', 'liveness'];
const TARGET_DIRS = [
  path.join(__dirname, '..', 'src', 'assets', 'models', 'human'),
  path.join(__dirname, '..', 'projects', 'mobile', 'src', 'assets', 'models', 'human'),
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} para ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function downloadModel(model, targetDir) {
  const jsonName = `${model}.json`;
  const jsonBuf = await fetch(BASE_URL + jsonName);
  fs.writeFileSync(path.join(targetDir, jsonName), jsonBuf);
  let manifest;
  try {
    manifest = JSON.parse(jsonBuf.toString('utf8'));
  } catch (e) {
    throw new Error(`No se pudo parsear ${jsonName}: ${e.message}`);
  }
  const paths = new Set();
  for (const group of manifest.weightsManifest || []) {
    for (const p of group.paths || []) paths.add(p);
  }
  let bytes = jsonBuf.length;
  for (const p of paths) {
    const buf = await fetch(BASE_URL + p);
    fs.writeFileSync(path.join(targetDir, p), buf);
    bytes += buf.length;
  }
  return bytes;
}

async function main() {
  for (const dir of TARGET_DIRS) fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const model of MODELS) {
    // Descarga una vez y copia a cada destino
    const primary = TARGET_DIRS[0];
    process.stdout.write(`  ${model} ... `);
    const bytes = await downloadModel(model, primary);
    // Copiar los archivos del primario a los demás destinos
    for (const dir of TARGET_DIRS.slice(1)) {
      for (const file of fs.readdirSync(primary)) {
        if (file.startsWith(model)) {
          fs.copyFileSync(path.join(primary, file), path.join(dir, file));
        }
      }
    }
    total += bytes;
    console.log(`${(bytes / 1e6).toFixed(2)} MB`);
  }
  console.log(`\nTotal: ${(total / 1e6).toFixed(2)} MB en ${TARGET_DIRS.length} destino(s).`);
}

main().catch((e) => {
  console.error('Error descargando modelos:', e.message);
  process.exit(1);
});
