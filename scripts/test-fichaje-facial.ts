/**
 * Test de la lógica pura de matching facial (`electron/utils/face-match`).
 * No requiere DB, Electron ni modelos ML: alimenta embeddings conocidos y
 * verifica umbral, margen y ranking 1:N.
 *
 * Correr: npm run test:fichaje-facial
 */
import { buildRostroCacheItem, elegirMejorMatch } from '../electron/utils/face-match';

let fallos = 0;
function check(nombre: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${nombre}`);
  } else {
    console.error(`  ✗ ${nombre}`);
    fallos++;
  }
}

const UMBRAL = 0.6;
const MARGEN = 0.05;

// Funcionario 1 con dos rostros, Funcionario 2 con uno
const cache = [
  buildRostroCacheItem(1, [1, 0, 0]),
  buildRostroCacheItem(1, [0.9, 0.1, 0]),
  buildRostroCacheItem(2, [0, 1, 0]),
];

// 1. Match exacto → F1
const r1 = elegirMejorMatch([1, 0, 0], cache, UMBRAL, MARGEN);
check('match exacto identifica F1', r1.matched && r1.funcionarioId === 1);
check('similitud ~1.0', r1.similitud >= 0.99);

// 2. Bajo umbral → NO_MATCH (cos = 0.5 < 0.6)
const r2 = elegirMejorMatch([0.5, 0, 0.8660254], cache, UMBRAL, MARGEN);
check('bajo umbral → NO_MATCH', !r2.matched && r2.reason === 'NO_MATCH');

// 3. Ambiguo entre dos funcionarios → BAJO_MARGEN
//    query equidistante de F1([1,0,0]) y F2([0,1,0]) → sim ~0.707 ambos.
//    Cache con un solo rostro por funcionario para que el margen sea ~0.
const cacheAmbiguo = [buildRostroCacheItem(1, [1, 0, 0]), buildRostroCacheItem(2, [0, 1, 0])];
const r3 = elegirMejorMatch([0.7071, 0.7071, 0], cacheAmbiguo, 0.6, MARGEN);
check('ambiguo → BAJO_MARGEN', !r3.matched && r3.reason === 'BAJO_MARGEN');

// 4. Cache vacío → SIN_ROSTROS
const r4 = elegirMejorMatch([1, 0, 0], [], UMBRAL, MARGEN);
check('cache vacío → SIN_ROSTROS', !r4.matched && r4.reason === 'SIN_ROSTROS');

// 5. El mejor rostro del funcionario gana (multi-rostro)
const soloF1 = [buildRostroCacheItem(1, [0.6, 0.8, 0]), buildRostroCacheItem(1, [1, 0, 0])];
const r5 = elegirMejorMatch([1, 0, 0], soloF1, UMBRAL, MARGEN);
check('multi-rostro toma el mejor y matchea F1', r5.matched && r5.funcionarioId === 1 && r5.similitud >= 0.99);

// 6. Distinta dimensión se ignora (no rompe)
const mix = [buildRostroCacheItem(3, [1, 0, 0, 0]), buildRostroCacheItem(1, [1, 0, 0])];
const r6 = elegirMejorMatch([1, 0, 0], mix, UMBRAL, MARGEN);
check('ignora vectores de otra dimensión', r6.matched && r6.funcionarioId === 1);

if (fallos > 0) {
  console.error(`\n${fallos} test(s) fallaron.`);
  process.exit(1);
}
console.log('\nTodos los tests de matching facial pasaron.');
