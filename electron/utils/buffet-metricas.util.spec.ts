/**
 * Tests de lógica pura de métricas de buffet. Autónomo. Correr con:
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","target":"es2020","esModuleInterop":true,"ignoreDeprecations":"6.0"}' \
 *   npx ts-node --transpile-only --skip-project electron/utils/buffet-metricas.util.spec.ts
 */
import { resumirMetricasBuffet, BuffetItemMetrica } from '../../src/app/shared/utils/buffet-metricas.util';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}
const approx = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const items: BuffetItemMetrica[] = [
  { pesoNetoGramos: 500, total: 37500, costo: 15000, aplicoLibre: false, ventaId: 1 },
  { pesoNetoGramos: 300, total: 22500, costo: 9000, aplicoLibre: false, ventaId: 1 }, // misma venta
  { pesoNetoGramos: 1000, total: 55000, costo: 30000, aplicoLibre: true, ventaId: 2 },
];

const r = resumirMetricasBuffet(items, 5); // 5 kg producidos

check('cantidad items = 3', r.cantidadItems === 3);
check('ventas distintas = 2', r.cantidadVentas === 2);
check('kg vendidos = 1.8', approx(r.kgVendidos, 1.8));
check('kg producidos = 5', approx(r.kgProducidos, 5));
check('desperdicio = 3.2', approx(r.desperdicioKg, 3.2));
check('peso medio por venta = 900 g', r.pesoMedioGramosPorVenta === 900); // (500+300+1000)/2
check('ingreso total = 115000', approx(r.ingresoTotal, 115000));
check('costo total = 54000', approx(r.costoTotal, 54000));
check('CMV % ≈ 46.9', approx(r.cmvPorcentaje, 46.9, 0.2));
check('tickets libre = 1', r.ticketsLibre === 1);
check('% libre ≈ 33.3', approx(r.porcentajeLibre, 33.3, 0.2));

// Vacío → todo cero, sin division por cero
const r0 = resumirMetricasBuffet([], 0);
check('vacío: ventas 0', r0.cantidadVentas === 0);
check('vacío: peso medio 0', r0.pesoMedioGramosPorVenta === 0);
check('vacío: CMV 0', r0.cmvPorcentaje === 0);
check('vacío: % libre 0', r0.porcentajeLibre === 0);

console.log(`\nbuffet-metricas.util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
