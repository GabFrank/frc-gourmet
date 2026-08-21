/**
 * El mapa metodo->canal del shim HTTP tiene que estar al dia con `preload.ts`.
 *
 * Es un archivo generado, y olvidarse de regenerarlo **compila igual y pasa el
 * AOT**: el metodo nuevo cae al fallback kebab-case del shim y recien falla en
 * runtime, sobre HTTP, con un canal que no existe. En Electron nunca se nota.
 *
 * Este test regenera el mapa en memoria y lo compara contra los dos archivos
 * committeados. Tambien verifica `API_ARG_SHAPE`, la lista de metodos donde
 * preload empaqueta sus parametros en un objeto.
 *
 * Uso: npm run test:api-map
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const ROOT = path.resolve(__dirname, '..');
const SALIDAS = [
  'projects/mobile/src/app/core/data/api-channel-map.generated.ts',
  'src/app/web/api-channel-map.generated.ts',
];

function main() {
  const antes = SALIDAS.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));

  // Regenerar y comparar. El generador es determinista (ordena las claves).
  // Se junta stdout Y stderr: el aviso de "no traducible" sale por `console.warn`,
  // o sea stderr, y mirando solo stdout este chequeo nunca podia fallar.
  const proc = spawnSync('node', [path.join(ROOT, 'scripts/generate-mobile-api-map.js')], {
    cwd: ROOT, encoding: 'utf8',
  });
  const salida = `${proc.stdout || ''}\n${proc.stderr || ''}`;
  ok(proc.status === 0, 'el generador corre sin error', proc.status === 0 ? undefined : salida);

  const despues = SALIDAS.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));

  SALIDAS.forEach((rel, i) => {
    ok(antes[i] === despues[i],
      `${rel} está al día con preload.ts`,
      antes[i] === despues[i] ? undefined : 'DESACTUALIZADO — corré: node scripts/generate-mobile-api-map.js');
  });

  ok(antes[0] === antes[1], 'los dos mapas (PWA mobile y web /admin) son idénticos');

  // El generador avisa cuando preload transforma argumentos de una forma que el
  // shim no puede reproducir. Si aparece, hay un método roto sobre HTTP.
  ok(!/no traducible/.test(salida),
    'el generador no reporta transformaciones de argumentos intraducibles',
    /no traducible/.test(salida) ? salida : undefined);

  // API_ARG_SHAPE: los métodos donde preload empaqueta en objeto. Si esta lista
  // queda vacía es que la detección se rompió, no que el problema desapareció.
  const contenido = despues[0];
  const bloque = contenido.match(/API_ARG_SHAPE[^{]*\{([\s\S]*?)\n\};/);
  ok(!!bloque, 'el mapa exporta API_ARG_SHAPE');
  const claves = [...(bloque?.[1] || '').matchAll(/"([^"]+)":/g)].map((m) => m[1]);
  ok(claves.length > 0, `API_ARG_SHAPE no está vacío (${claves.length} métodos)`);

  // `changePassword` es el caso que rompió el cambio de contraseña en la PWA.
  ok(claves.includes('changePassword'),
    'changePassword está en API_ARG_SHAPE (el bug que rompía el cambio de contraseña)', claves);
  const cp = contenido.match(/"changePassword": \[([^\]]+)\]/);
  ok(cp?.[1] === '"usuarioId","currentPassword","newPassword"',
    'changePassword conserva el orden de los parámetros del preload', cp?.[1]);

  console.log(`\n${failed === 0 ? '✅' : '❌'} api-map: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
