#!/usr/bin/env node
/**
 * Generador del mapa método→channel para el shim HTTP de la PWA mobile.
 *
 * Parsea `preload.ts` (única fuente de verdad de `window.api`) y extrae, por
 * cada método del objeto expuesto en `contextBridge.exposeInMainWorld('api', {...})`,
 * el primer canal IPC que invoca: `ipcRenderer.invoke('<channel>', ...)`.
 *
 * Emite `projects/mobile/src/app/core/data/api-channel-map.generated.ts` con
 * `API_CHANNEL_MAP: Record<string,string>`. El shim usa este mapa para rutear
 * cada llamada de `RepositoryIpcService` (que en mobile se reusa como repo HTTP)
 * a `POST /api/rpc { method: '<channel>', params: [...args] }`.
 *
 * Heurística: las propiedades del objeto `api` están indentadas con EXACTAMENTE
 * 2 espacios; las claves de objetos internos tienen 4+ espacios. Anclar a 2
 * espacios evita confundir un `nombre:` interno con un nombre de método.
 *
 * Uso: `node scripts/generate-mobile-api-map.js`
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRELOAD = path.join(ROOT, 'preload.ts');
const OUT = path.join(ROOT, 'projects/mobile/src/app/core/data/api-channel-map.generated.ts');

const src = fs.readFileSync(PRELOAD, 'utf8');

const exposeIdx = src.indexOf("exposeInMainWorld('api'");
if (exposeIdx === -1) {
  console.error('[gen] No encontré exposeInMainWorld(\'api\') en preload.ts');
  process.exit(1);
}

// Escanear desde el bloque api hasta EOF (es lo último relevante del preload).
const lines = src.slice(exposeIdx).split('\n');

// Propiedad de nivel método: exactamente 2 espacios de indentación.
const methodRe = /^ {2}([a-zA-Z_$][\w$]*)\s*:/;
// invoke con canal string literal (callIpc usa variable → no matchea, correcto).
const invokeRe = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/;

const map = {};
let current = null;
for (const line of lines) {
  const m = methodRe.exec(line);
  if (m) current = m[1];
  const inv = invokeRe.exec(line);
  if (inv && current && !(current in map)) {
    map[current] = inv[1];
  }
}

const entries = Object.keys(map).sort();
const body = entries.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n');

const out = `/* eslint-disable */
/**
 * AUTO-GENERADO por scripts/generate-mobile-api-map.js — NO editar a mano.
 * Mapa método de window.api → canal IPC (extraído de preload.ts).
 * Regenerar tras tocar preload.ts: \`node scripts/generate-mobile-api-map.js\`.
 * Total: ${entries.length} métodos.
 */
export const API_CHANNEL_MAP: Record<string, string> = {
${body}
};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
console.log(`[gen] ${entries.length} métodos → ${path.relative(ROOT, OUT)}`);
