/**
 * Aritmetica del pago consolidado. Sin base de datos: sólo el util puro.
 *
 * Lo que se protege acá es que no se pierda ni aparezca plata al repartir N
 * lineas de pago entre M obligaciones, sobre todo cuando hay conversion de
 * moneda de por medio y una de las dos monedas no tiene decimales.
 *
 * Uso: npm run test:pago-consolidado
 */
import {
  decimalesDeMoneda,
  redondear,
  toleranciaDe,
  convertirLinea,
  validarSeleccion,
  validarCobertura,
  repartirFifo,
  imputadoPorItem,
  origenPorLinea,
  descripcionEvento,
  ItemAPagar,
  LineaDePago,
} from '../src/app/shared/utils/pago-consolidado.util';
import {
  PagoConcepto,
  PagoOrigenTipo,
} from '../src/app/database/entities/financiero/pago-consolidado-enums';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const PYG = 1, USD = 2, BRL = 3;
const DEC: Record<number, number> = { [PYG]: 0, [USD]: 2, [BRL]: 2 };
const decDe = (id: number) => DEC[id] ?? 2;

function item(origenId: number, monto: number, saldo = monto, monedaId = PYG, beneficiarioId?: number): ItemAPagar {
  return { origenTipo: PagoOrigenTipo.GASTO, origenId, monto, saldoPendiente: saldo, monedaId, beneficiarioId, descripcion: `GASTO #${origenId}` };
}
function linea(monto: number, monedaId = PYG, cotizacion = 1): LineaDePago {
  return { fuente: 'CAJA_MAYOR', monedaId, formaPagoId: 1, cajaMayorId: 1, monto, cotizacion };
}

/** Chequea los dos invariantes duros del reparto contra los datos de entrada. */
function verificarInvariantes(items: ItemAPagar[], lineas: LineaDePago[], decDeuda: number, nombre: string) {
  const filas = repartirFifo(items, lineas, decDeuda, decDe);
  const porItem = imputadoPorItem(filas, items.length, decDeuda);
  const porLinea = origenPorLinea(filas, lineas.length, (i) => decDe(lineas[i].monedaId));

  items.forEach((it, i) => {
    ok(porItem[i] === redondear(it.monto, decDeuda),
      `${nombre}: item ${it.origenId} recibe exactamente ${it.monto}`, { esperado: it.monto, real: porItem[i] });
  });
  lineas.forEach((l, i) => {
    ok(porLinea[i] === redondear(l.monto, decDe(l.monedaId)),
      `${nombre}: linea ${i} entrega exactamente ${l.monto}`, { esperado: l.monto, real: porLinea[i] });
  });
  return filas;
}

console.log('\n[A] Redondeo y tolerancia');
ok(decimalesDeMoneda({ decimales: 0 }) === 0, 'guarani = 0 decimales');
ok(decimalesDeMoneda({ decimales: null }) === 2, 'sin decimales definidos = 2 por defecto');
ok(decimalesDeMoneda(undefined) === 2, 'moneda ausente = 2 por defecto');
ok(redondear(1.005, 2) === 1.01, '1.005 redondea a 1.01 (no lo come el float)');
ok(redondear(2.675, 2) === 2.68, '2.675 redondea a 2.68');
ok(toleranciaDe(0) === 0.5, 'tolerancia en guaranies = 0.5');
ok(toleranciaDe(2) === 0.005, 'tolerancia con 2 decimales = 0.005');
ok(convertirLinea(10, 7500, 0) === 75000, '10 USD a 7500 = 75.000 Gs');
ok(convertirLinea(75000, 1 / 7500, 2) === 10, '75.000 Gs a 1/7500 = 10 USD');

console.log('\n[B] Reparto simple: una linea cubre varios items');
verificarInvariantes(
  [item(1, 100000), item(2, 50000), item(3, 25000)],
  [linea(175000)],
  0, 'B',
);

console.log('\n[C] Varias lineas cubren un solo item');
verificarInvariantes([item(1, 300000)], [linea(100000), linea(150000), linea(50000)], 0, 'C');

console.log('\n[D] Cruce N x M: una linea se parte entre items y un item toma de varias lineas');
{
  const items = [item(1, 80000), item(2, 120000), item(3, 40000)];
  const lineas = [linea(100000), linea(140000)];
  const filas = verificarInvariantes(items, lineas, 0, 'D');
  ok(filas.length === 4, 'D: el cruce produce 4 filas (item2 toma de las dos lineas)', filas.length);
  ok(filas.filter((f) => f.itemIdx === 1).length === 2, 'D: el item del medio se cubre con 2 lineas');
}

console.log('\n[E] Multi-moneda: deuda en guaranies pagada con USD');
verificarInvariantes(
  [item(1, 75000), item(2, 75000)],
  [linea(20, USD, 7500)],
  0, 'E',
);

console.log('\n[F] Multi-moneda inversa: deuda en USD pagada con guaranies (0 decimales cubriendo 2)');
{
  const items: ItemAPagar[] = [
    { ...item(1, 33.33, 33.33, USD), monedaId: USD },
    { ...item(2, 66.67, 66.67, USD), monedaId: USD },
  ];
  verificarInvariantes(items, [linea(750000, PYG, 1 / 7500)], 2, 'F');
}

console.log('\n[G] Residuo de redondeo: la conversion no cierra exacto');
{
  // 3 items de 33.33 = 99.99 USD. Una linea de 250000 Gs a 1/2500 = 100.00 USD.
  // La diferencia (0.01) está dentro de tolerancia y NO puede dejar un item corto.
  const items: ItemAPagar[] = [
    { ...item(1, 33.33, 33.33, USD), monedaId: USD },
    { ...item(2, 33.33, 33.33, USD), monedaId: USD },
    { ...item(3, 33.33, 33.33, USD), monedaId: USD },
  ];
  const lineas = [linea(250000, PYG, 1 / 2500)];
  const filas = verificarInvariantes(items, lineas, 2, 'G');
  const total = redondear(filas.reduce((s, f) => s + f.montoImputado, 0), 2);
  ok(total === 99.99, 'G: el total imputado es la deuda exacta, no la capacidad de la linea', total);
}

console.log('\n[H] Tercios: 100.000 Gs entre 3 items no divide exacto');
verificarInvariantes(
  [item(1, 33333), item(2, 33333), item(3, 33334)],
  [linea(100000)],
  0, 'H',
);

console.log('\n[I] Validacion de seleccion');
{
  const dosMonedas = [item(1, 1000, 1000, PYG), item(2, 10, 10, USD)];
  ok(validarSeleccion(PagoConcepto.GASTO, dosMonedas, 0).some((e) => /misma moneda/.test(e)),
    'I: rechaza obligaciones de monedas distintas');

  ok(validarSeleccion(PagoConcepto.GASTO, [], 0).length > 0, 'I: rechaza seleccion vacia');

  const dosLiq = [
    { ...item(1, 1000), origenTipo: PagoOrigenTipo.LIQUIDACION_SUELDO },
    { ...item(2, 2000), origenTipo: PagoOrigenTipo.LIQUIDACION_SUELDO },
  ];
  ok(validarSeleccion(PagoConcepto.LIQUIDACION_SUELDO, dosLiq, 0).some((e) => /de a una/.test(e)),
    'I: rechaza pagar dos liquidaciones en el mismo evento');
  ok(validarSeleccion(PagoConcepto.LIQUIDACION_SUELDO, [dosLiq[0]], 0).length === 0,
    'I: acepta una sola liquidacion');

  const dosProv = [item(1, 1000, 1000, PYG, 7), item(2, 2000, 2000, PYG, 9)];
  ok(validarSeleccion(PagoConcepto.COMPRA, dosProv, 0).some((e) => /un solo proveedor/.test(e)),
    'I: compras exige un solo proveedor');
  ok(!validarSeleccion(PagoConcepto.GASTO, dosProv, 0).some((e) => /proveedor/.test(e)),
    'I: gastos NO exige un solo beneficiario');

  ok(validarSeleccion(PagoConcepto.COMPRA, [item(1, 500, 1000, PYG, 7)], 0).length === 0,
    'I: compras admite pago parcial');
  ok(validarSeleccion(PagoConcepto.GASTO, [item(1, 500, 1000)], 0).some((e) => /entera o no se paga/.test(e)),
    'I: gastos NO admite pago parcial');
  ok(validarSeleccion(PagoConcepto.VALE, [{ ...item(1, 500, 1000), origenTipo: PagoOrigenTipo.VALE }], 0)
    .some((e) => /entera o no se paga/.test(e)), 'I: vales NO admite pago parcial');

  ok(validarSeleccion(PagoConcepto.COMPRA, [item(1, 1500, 1000, PYG, 7)], 0).some((e) => /supera el saldo/.test(e)),
    'I: rechaza pagar mas que el saldo pendiente');
  ok(validarSeleccion(PagoConcepto.COMPRA, [item(1, 0, 1000, PYG, 7)], 0).some((e) => /mayor a 0/.test(e)),
    'I: rechaza monto 0');
  ok(validarSeleccion(PagoConcepto.GASTO, [{ ...item(1, 1000), bloqueado: true, bloqueoMotivo: 'SIN MONEDA' }], 0)
    .some((e) => /SIN MONEDA/.test(e)), 'I: rechaza obligaciones bloqueadas');
}

console.log('\n[J] Validacion de cobertura');
{
  const items = [item(1, 100000)];
  ok(validarCobertura(items, [], 0).some((e) => /al menos una forma/.test(e)), 'J: exige al menos una linea');
  ok(validarCobertura(items, [linea(100000)], 0).length === 0, 'J: acepta cobertura exacta');
  ok(validarCobertura(items, [linea(90000)], 0).some((e) => /suman/.test(e)), 'J: rechaza pago de menos');
  ok(validarCobertura(items, [linea(110000)], 0).some((e) => /suman/.test(e)), 'J: rechaza pago de mas');
  ok(validarCobertura(items, [linea(60000), linea(40000)], 0).length === 0, 'J: acepta dos lineas que suman');
  ok(validarCobertura(items, [{ ...linea(100000), cotizacion: 0 }], 0).some((e) => /cotización/.test(e)),
    'J: rechaza linea sin cotizacion');
  ok(validarCobertura(items, [{ ...linea(100000), formaPagoId: null }], 0).some((e) => /caja y la forma/.test(e)),
    'J: linea de caja mayor exige caja y forma');
  ok(validarCobertura(items, [{ fuente: 'CUENTA_BANCARIA', monedaId: PYG, monto: 100000, cotizacion: 1 }], 0)
    .some((e) => /necesita la cuenta/.test(e)), 'J: linea bancaria exige cuenta');
  // Dentro de tolerancia: 99.999 Gs contra 100.000 no deberia molestar en guaranies.
  ok(validarCobertura(items, [linea(99999.6)], 0).length === 0, 'J: acepta diferencia dentro de la tolerancia');
}

console.log('\n[K] Etiqueta del evento');
ok(descripcionEvento(PagoConcepto.GASTO, 3) === 'PAGO CONSOLIDADO DE 3 GASTOS', 'K: plural de gastos');
ok(descripcionEvento(PagoConcepto.VALE, 2) === 'PAGO CONSOLIDADO DE 2 VALES', 'K: plural de vales');
ok(descripcionEvento(PagoConcepto.COMPRA, 4, 'DISTRIBUIDORA CAMPOS') ===
  'PAGO CONSOLIDADO DE 4 CUOTAS DE COMPRA — DISTRIBUIDORA CAMPOS', 'K: incluye al proveedor');
ok(descripcionEvento(PagoConcepto.GASTO, 1, null, 'GASTO #7 (ALQUILER)') === 'PAGO DE GASTO #7 (ALQUILER)',
  'K: con un solo item usa su descripcion');

console.log(`\n${failed === 0 ? '✅' : '❌'} pago-consolidado: ${passed} pasaron, ${failed} fallaron\n`);
process.exit(failed === 0 ? 0 : 1);
