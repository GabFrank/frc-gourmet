/**
 * Tests de lógica pura del cobro de buffet por peso. Autónomo. Correr con:
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","target":"es2020","esModuleInterop":true,"ignoreDeprecations":"6.0"}' \
 *   npx ts-node --transpile-only --skip-project electron/utils/buffet-peso.util.spec.ts
 */
import { calcularCobroBuffet } from '../../src/app/shared/utils/buffet-peso.util';

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

// Caso base: 500 g netos a 75.000/kg = 37.500
const r1 = calcularCobroBuffet({ pesoBrutoGramos: 850, taraGramos: 350, precioPorKg: 75000 });
check('neto = bruto - tara', r1.pesoNetoGramos === 500);
check('cantidadKg correcta', approx(r1.cantidadKg, 0.5));
check('subtotal 500g @75k = 37500', approx(r1.subtotal, 37500));
check('sin tope → total = subtotal', approx(r1.total, 37500));
check('sin tope → no aplicoLibre', r1.aplicoLibre === false);
check('efectivo = precioPorKg sin clamp', approx(r1.precioVentaUnitarioEfectivo, 75000));

// Tope buffet libre: kilo 75k, libre 55k. 1000 g → subtotal 75k > 55k → 55k
const r2 = calcularCobroBuffet({
  pesoBrutoGramos: 1350,
  taraGramos: 350,
  precioPorKg: 75000,
  precioMaximo: 55000,
});
check('libre: peso real preservado (1000g)', r2.pesoNetoGramos === 1000);
check('libre: subtotal real = 75000', approx(r2.subtotal, 75000));
check('libre: total capado a 55000', approx(r2.total, 55000));
check('libre: aplicoLibre = true', r2.aplicoLibre === true);
check('libre: efectivo*cantidad = total', approx(r2.precioVentaUnitarioEfectivo * r2.cantidadKg, 55000));

// Justo en el umbral del tope (subtotal == max) → aplica libre
const r3 = calcularCobroBuffet({ pesoBrutoGramos: 1000, precioPorKg: 55000, precioMaximo: 55000 });
check('umbral exacto aplica libre', r3.aplicoLibre === true && approx(r3.total, 55000));

// Cobro mínimo: plato chico por debajo del mínimo
const r4 = calcularCobroBuffet({
  pesoBrutoGramos: 450,
  taraGramos: 350,
  precioPorKg: 75000,
  precioMinimo: 10000,
});
check('mínimo: neto 100g', r4.pesoNetoGramos === 100);
check('mínimo: subtotal 7500 < min', approx(r4.subtotal, 7500));
check('mínimo: total elevado a 10000', approx(r4.total, 10000));
check('mínimo: no aplicoLibre', r4.aplicoLibre === false);
check('mínimo: efectivo*cantidad = total', approx(r4.precioVentaUnitarioEfectivo * r4.cantidadKg, 10000));

// Por encima del mínimo → no se toca
const r5 = calcularCobroBuffet({ pesoBrutoGramos: 700, precioPorKg: 75000, precioMinimo: 10000 });
check('sobre el mínimo → total real', approx(r5.total, 52500));

// Tara mayor que bruto → neto 0
const r6 = calcularCobroBuffet({ pesoBrutoGramos: 300, taraGramos: 350, precioPorKg: 75000 });
check('tara>bruto → neto 0', r6.pesoNetoGramos === 0 && r6.total === 0);

// min y max juntos: subtotal entre ambos → sin cambios
const r7 = calcularCobroBuffet({
  pesoBrutoGramos: 500,
  precioPorKg: 75000,
  precioMinimo: 10000,
  precioMaximo: 55000,
});
check('entre min y max → total = subtotal', approx(r7.total, 37500) && !r7.aplicoLibre);

console.log(`\nbuffet-peso.util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
