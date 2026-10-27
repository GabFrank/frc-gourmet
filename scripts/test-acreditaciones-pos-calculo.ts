/**
 * Test unitario del cálculo puro de acreditaciones POS (issue #320).
 * Uso: npm run test:acreditaciones-pos-calculo
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { calcularAcreditacion, fechasAcreditacion, REGLAS_OBSERVADAS, ReglaAcreditacion } from '../electron/services/acreditaciones-pos/calculo';

let n = 0;
let fallas = 0;
function caso(nombre: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${nombre}`); }
  catch (e: any) { fallas++; console.error(`  ✗ ${nombre}: ${e?.message ?? e}`); }
}
const eq = (a: unknown, b: unknown, m?: string) => { n++; assert.deepStrictEqual(a, b, m); };

const regla = (banco: string, medio: string): ReglaAcreditacion =>
  REGLAS_OBSERVADAS[banco].find(r => r.medio === medio)!.regla;
const bancardCredito = regla('BANCARD', 'CREDITO');
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bancard-credito-2026-10.json'), 'utf8'));
const feriados = new Set<string>(fx.feriados);

caso('Bancard crédito: los 91 casos del extracto real, montos exactos', () => {
  for (const [fechaVenta, bruto, comision, iva, retRenta, retIva, neto, fechaCredito] of fx.filas) {
    const r = calcularAcreditacion(bancardCredito, bruto, fechaVenta, feriados);
    eq([r.montoComision, r.montoIvaComision, r.montoRetRenta, r.montoRetIva, r.montoNeto],
      [comision, iva, retRenta, retIva, neto], `bruto ${bruto} ${fechaVenta}`);
    eq(r.fechaEsperada, fechaCredito, `fecha ${bruto} ${fechaVenta}`);
    eq(r.montoEsperado, neto);
  }
  eq(fx.filas.length, 91);
});

caso('Bancard crédito: casos del plan', () => {
  const c = (b: number) => calcularAcreditacion(bancardCredito, b, '2026-10-26').montoNeto;
  eq([c(56000), c(17940), c(27090), c(349000)], [53083, 17015, 25682, 330820]);
});

caso('plazos hábiles: lun→mié, vie→mar, jue→lun, sáb→mié (proceso lunes), feriado corre un día', () => {
  const f = (d: string, fer: string[] = []) => fechasAcreditacion(bancardCredito, d, new Set(fer));
  eq(f('2026-10-26').fechaEsperada, '2026-10-28');
  eq(f('2026-10-23').fechaEsperada, '2026-10-27');
  eq(f('2026-10-22').fechaEsperada, '2026-10-26');
  eq(f('2026-10-24'), { fechaProceso: '2026-10-26', fechaEsperada: '2026-10-28' });
  eq(f('2026-09-27', ['2026-09-28']), { fechaProceso: '2026-09-29', fechaEsperada: '2026-10-01' });
  eq(f('2026-10-29', ['2026-10-30']).fechaEsperada, '2026-11-03');
});

caso('uPay QR/débito (sin verificar): +1 día corrido, sáb/dom → lunes', () => {
  const q = regla('UPAY', 'QR');
  eq(fechasAcreditacion(q, '2026-10-26', new Set()).fechaEsperada, '2026-10-27');
  eq(fechasAcreditacion(q, '2026-10-23', new Set()).fechaEsperada, '2026-10-26');
  eq(fechasAcreditacion(q, '2026-10-24', new Set()).fechaEsperada, '2026-10-26');
  eq(calcularAcreditacion(q, 100000, '2026-10-26').montoNeto, 98130);
});

caso('uPay crédito (sin verificar): +2 corridos, corre a lunes', () => {
  const c = regla('UPAY', 'CREDITO');
  eq(fechasAcreditacion(c, '2026-10-22', new Set()).fechaEsperada, '2026-10-26');
  eq(fechasAcreditacion(c, '2026-10-26', new Set()).fechaEsperada, '2026-10-28');
  eq(calcularAcreditacion(c, 100000, '2026-10-26').montoNeto, 96220);
});

caso('Bancard débito (sin verificar): acredita bruto, descuento aparte, mismo día hábil', () => {
  const d = regla('BANCARD', 'DEBITO');
  const r = calcularAcreditacion(d, 100000, '2026-10-24');
  eq(r.montoEsperado, 100000);
  eq(r.montoComision, 3700);
  eq(r.montoNeto, 96300);
  eq(r.fechaEsperada, '2026-10-26');
  eq(calcularAcreditacion(d, 50000, '2026-10-27').fechaEsperada, '2026-10-27');
});

caso('verificación: solo Bancard crédito está marcada como verificada', () => {
  const v = Object.values(REGLAS_OBSERVADAS).flat().filter(r => r.verificada).map(r => r.medio);
  eq(v, ['CREDITO']);
});

caso('moneda con decimales (R$) y validaciones', () => {
  const r = calcularAcreditacion({ ...bancardCredito, redondeoComision: 0 }, 100.5, '2026-10-26', new Set(), 2);
  eq(r.montoComision, 3.02);
  assert.throws(() => calcularAcreditacion(bancardCredito, -1, '2026-10-26'));
  assert.throws(() => calcularAcreditacion(bancardCredito, 10, '26/10/2026'));
  n += 2;
});

console.log(`\n${n} verificaciones, ${fallas} casos fallidos`);
if (fallas) process.exit(1);
