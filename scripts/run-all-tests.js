#!/usr/bin/env node
/**
 * Corre TODA la batería de tests de dominio (`npm run test:all`).
 *
 * Existe porque el paso 9 del ciclo de implementación pide "toda la batería" y
 * sin un comando eso es aspiracional: son 53 scripts sueltos, y la
 * interpretación cómoda —"las suites relacionadas con lo que toqué"— ya dejó
 * pasar bugs. Con un comando, correr algunas deja de ser una lectura razonable
 * del paso.
 *
 * Qué incluye: todos los `test:*` de `package.json` que invocan `ts-node`, que
 * corren contra SQLite en un archivo temporal y no necesitan nada instalado.
 * Los dos que quieren Postgres (`test:locks-pg`, `test:pg-backup`) entran igual
 * porque ya se autosaltean con exit 0 cuando no lo encuentran.
 *
 * Qué NO incluye, y hay que correr aparte cuando el cambio los toca:
 *   - `test`, `test:mobile` y los `*-dialog` → Karma, necesitan CHROME_BIN.
 *   - `test:e2e` → Playwright + Electron real, necesita display.
 * Un `test:all` que falla siempre por un requisito de entorno se vuelve ruido y
 * se empieza a ignorar, que es justo lo que este script trata de evitar.
 *
 * Corre TODO y reporta al final: abortar en la primera falla no diría nada del
 * resto de los dominios. El exit code es 1 si alguna suite falló — sin eso,
 * "corrí test:all" no garantizaría nada.
 */
const { exec } = require('child_process');
const pkg = require('../package.json');

const EXCLUIDOS = new Set(['test', 'test:mobile', 'test:e2e', 'test:e2e:dev']);

// Opciones (todas opcionales; sin ellas, el comportamiento de siempre: de a una):
//   --jobs N      corre N suites a la vez (en una máquina de 4 CPU, 3 es lo cómodo).
//   --desde S     sólo las suites que van después de S en orden alfabético (retomar una corrida cortada).
//   --timeout M   minutos máximos por suite (default 7); la que se pasa cuenta como FALLA.
// Ej.: `npm run test:all -- --jobs 3`.
function opcion(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}
const JOBS = Math.max(1, parseInt(opcion('jobs', '1'), 10) || 1);
const DESDE = opcion('desde', '');
const TIMEOUT_MS = (parseFloat(opcion('timeout', '7')) || 7) * 60000;

const suites = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith('test:') && !EXCLUIDOS.has(k))
  .filter((k) => pkg.scripts[k].includes('ts-node'))
  .sort()
  .filter((k) => k > DESDE);

console.log(`[test:all] ${suites.length} suites${JOBS > 1 ? ` · ${JOBS} a la vez` : ''}\n`);

const fallaron = [];
const inicio = Date.now();

function correr(suite) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    exec(`npm run ${suite} --silent`, { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const seg = ((Date.now() - t0) / 1000).toFixed(1);
      if (!err) {
        console.log(`  ${suite} … ok (${seg}s)`);
      } else {
        console.log(`  ${suite} … FALLA (${seg}s)${err.killed ? ' por timeout' : ''}`);
        // Sólo la cola: el stdout completo de todas las suites es ilegible.
        const salida = `${stdout || ''}${stderr || ''}`.trimEnd().split('\n').slice(-25).join('\n');
        fallaron.push({ suite, salida });
      }
      resolve();
    });
  });
}

(async () => {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < suites.length) await correr(suites[siguiente++]);
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, suites.length) }, trabajador));

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log(`\n[test:all] ${suites.length - fallaron.length}/${suites.length} en verde · ${minutos} min`);

  if (fallaron.length > 0) {
    fallaron.sort((a, b) => a.suite.localeCompare(b.suite));
    for (const f of fallaron) {
      console.error(`\n${'─'.repeat(70)}\n✗ ${f.suite}\n${'─'.repeat(70)}\n${f.salida}`);
    }
    console.error(`\n[test:all] FALLARON ${fallaron.length}: ${fallaron.map((f) => f.suite).join(', ')}`);
    console.error('[test:all] Con --jobs > 1, re-corré sola cada suite que falló antes de darla por nueva: algunas comparten recursos.');
    process.exit(1);
  }
})();
