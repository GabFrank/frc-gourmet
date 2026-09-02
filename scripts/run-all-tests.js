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
const { execSync } = require('child_process');
const pkg = require('../package.json');

const EXCLUIDOS = new Set(['test', 'test:mobile', 'test:e2e', 'test:e2e:dev']);

const suites = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith('test:') && !EXCLUIDOS.has(k))
  .filter((k) => pkg.scripts[k].includes('ts-node'))
  .sort();

console.log(`[test:all] ${suites.length} suites\n`);

const fallaron = [];
const inicio = Date.now();

for (const suite of suites) {
  process.stdout.write(`  ${suite} … `);
  const t0 = Date.now();
  try {
    execSync(`npm run ${suite} --silent`, { stdio: 'pipe', encoding: 'utf8' });
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`FALLA (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    // Sólo la cola: el stdout completo de 53 suites es ilegible.
    const salida = `${e.stdout || ''}${e.stderr || ''}`.trimEnd().split('\n').slice(-25).join('\n');
    fallaron.push({ suite, salida });
  }
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
console.log(`\n[test:all] ${suites.length - fallaron.length}/${suites.length} en verde · ${minutos} min`);

if (fallaron.length > 0) {
  for (const f of fallaron) {
    console.error(`\n${'─'.repeat(70)}\n✗ ${f.suite}\n${'─'.repeat(70)}\n${f.salida}`);
  }
  console.error(`\n[test:all] FALLARON ${fallaron.length}: ${fallaron.map((f) => f.suite).join(', ')}`);
  process.exit(1);
}
