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
 * Emite ademas `API_ARG_SHAPE`, para los metodos donde preload NO pasa sus
 * parametros tal cual sino que los empaqueta en un objeto:
 *
 *   changePassword: async (usuarioId, currentPassword, newPassword) =>
 *     ipcRenderer.invoke('change-password', { usuarioId, currentPassword, newPassword })
 *
 * El shim manda `params: [...args]`, asi que sin esto el handler recibia el
 * primer argumento suelto en vez del objeto y rechazaba la llamada. Es lo que
 * rompia el cambio de contrasenha en la PWA, y con el la subida de imagenes de
 * perfil, el visor de archivos y las tres llamadas del upload por QR.
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
// El mismo mapa alimenta dos shims HTTP: la PWA mobile (projects/mobile) y el
// frontend desktop servido como web en /admin (src/app/web). Ambos rutean las
// llamadas de RepositoryIpcService a POST /api/rpc, así que comparten el mapeo
// método→canal extraído de preload.ts (única fuente de verdad de window.api).
const OUTS = [
  path.join(ROOT, 'projects/mobile/src/app/core/data/api-channel-map.generated.ts'),
  path.join(ROOT, 'src/app/web/api-channel-map.generated.ts'),
];

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

// invoke con un objeto literal de shorthands: `invoke('canal', { a, b })`.
// Solo la forma shorthand: cualquier otra se avisa y no se traduce, para no
// inventar un mapeo silencioso que despues no coincide con el handler.
const invokeObjRe = /ipcRenderer\.invoke\(\s*['"][^'"]+['"]\s*,\s*\{([^}]*)\}\s*\)/;
const invokeArgsRe = /ipcRenderer\.invoke\(\s*['"][^'"]+['"]\s*,([^;]*)\)\s*;?\s*$/;

const map = {};
const argShape = {};
const sospechosos = [];
let current = null;
for (const line of lines) {
  const m = methodRe.exec(line);
  if (m) current = m[1];
  const inv = invokeRe.exec(line);
  if (inv && current && !(current in map)) {
    map[current] = inv[1];

    const obj = invokeObjRe.exec(line);
    if (obj) {
      const claves = obj[1].split(',').map((c) => c.trim()).filter(Boolean);
      const soloShorthand = claves.every((c) => /^[a-zA-Z_$][\w$]*$/.test(c));
      if (soloShorthand && claves.length) {
        argShape[current] = claves;
      } else {
        sospechosos.push(`${current} -> ${inv[1]}: objeto no-shorthand { ${obj[1].trim()} }`);
      }
    } else {
      // Un invoke con args que no son ni el objeto ni identificadores sueltos
      // (spread, literales, .map(...)) tampoco se puede traducir a ciegas.
      const raw = invokeArgsRe.exec(line);
      const argsTxt = raw ? raw[1].trim() : '';
      if (argsTxt && !/^[\w$.\s,?[\]]*$/.test(argsTxt)) {
        sospechosos.push(`${current} -> ${inv[1]}: args no triviales (${argsTxt})`);
      }
    }
  }
}

if (sospechosos.length) {
  console.warn('[gen] ⚠ preload transforma argumentos de forma no traducible en:');
  sospechosos.forEach((x) => console.warn(`      ${x}`));
  console.warn('      Esos metodos van a fallar sobre HTTP (PWA / modo cliente).');
}

const entries = Object.keys(map).sort();
const body = entries.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n');
const shapeKeys = Object.keys(argShape).sort();
const shapeBody = shapeKeys
  .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(argShape[k])},`)
  .join('\n');

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

/**
 * Metodos donde preload empaqueta sus parametros posicionales en UN objeto
 * antes de invocar el canal. El shim HTTP tiene que hacer lo mismo o el handler
 * recibe el primer argumento suelto. Total: ${shapeKeys.length}.
 */
export const API_ARG_SHAPE: Record<string, string[]> = {
${shapeBody}
};
`;

for (const OUT of OUTS) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`[gen] ${entries.length} métodos → ${path.relative(ROOT, OUT)}`);
}
