/**
 * Tests de lógica pura del escalado de producción. Autónomo. Correr con:
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","target":"es2020","esModuleInterop":true,"ignoreDeprecations":"6.0"}' \
 *   npx ts-node --transpile-only --skip-project electron/utils/produccion-buffet.util.spec.ts
 */
import { escalarProduccion } from '../../src/app/shared/utils/produccion-buffet.util';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}
const approx = (a: number, b: number, eps = 0.001) => Math.abs(a - b) < eps;

// Receta rinde 10 kg con 2000 g de arroz y 5 unidades de algo.
const ingredientes = [
  { ingredienteId: 1, cantidad: 2000, unidad: 'GRAMOS' },
  { ingredienteId: 2, cantidad: 5, unidad: 'UNIDADES' },
];

// Producir 20 kg → factor 2.
const r = escalarProduccion(ingredientes, 10, 20);
check('escala arroz 2000→4000', approx(r[0].cantidadUsada, 4000));
check('escala unidades 5→10', approx(r[1].cantidadUsada, 10));
check('conserva unidad', r[0].unidad === 'GRAMOS');

// Aprovechamiento 80% → se usa más insumo.
const r2 = escalarProduccion(
  [{ ingredienteId: 1, cantidad: 1000, unidad: 'GRAMOS', porcentajeAprovechamiento: 80 }],
  10,
  10,
);
check('aprovechamiento 80% → 1000/0.8 = 1250', approx(r2[0].cantidadUsada, 1250));

// rendimiento 0 → factor 0 (evita división por cero).
const r3 = escalarProduccion(ingredientes, 0, 20);
check('rendimiento 0 → 0', r3[0].cantidadUsada === 0);

// lista vacía
check('lista vacía → []', escalarProduccion([], 10, 10).length === 0);

console.log(`\nproduccion-buffet.util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
