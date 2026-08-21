/**
 * Test de invariantes de validación del formulario de Operación Financiera.
 *
 * ## Invariante central
 *
 * Cada control REQUERIDO por un tipo de operación debe poder poblarse: o el
 * usuario lo elige en la UI, o se hereda de la cuenta bancaria, o es la forma de
 * pago EFECTIVO fija de un tramo contra caja mayor. Si un tipo exige un campo
 * que ninguna de esas tres fuentes puebla, el formulario queda inválido para
 * siempre y el botón "Registrar" no se habilita nunca — sin ningún campo marcado
 * en rojo, porque el control ni siquiera se renderiza para ese tipo.
 *
 * La versión anterior de este test sólo auditaba los controles de MONEDA, así
 * que pasaba 20/20 mientras CAMBIO_DIVISA era imposible de guardar en la PWA por
 * `formaPagoDestinoId`. Ahora recorre TODOS los campos requeridos.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-operacion-financiera-validacion-e2e.ts
 */
import {
  CAMPOS_REQUERIDOS, CAMPOS_MONEDA, CAMPOS_FORMA_PAGO, MONEDAS_EN_UI, TIPOS_OPERACION,
  LADOS_CAJA_MAYOR, CAJAS_EN_UI, CUENTAS_EN_UI, COTIZACION_EN_UI,
  usaCuentaBancaria, usaDosCuentasBancarias, monedasDesdeCuentaBancaria,
  fuenteDelCampo, camposFaltantes, validarCoherencia, etiquetaDe,
  TipoOperacionFinanciera,
} from '../src/app/pages/financiero/caja-mayor/operaciones-financieras/create-operacion-financiera/operacion-financiera-validacion.util';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Valores completos y coherentes por tipo, como los dejaría la UI. */
function valoresCompletos(tipo: TipoOperacionFinanciera): Record<string, unknown> {
  const base: Record<string, unknown> = { descripcion: 'PRUEBA' };
  for (const campo of CAMPOS_REQUERIDOS[tipo]) {
    if (campo === 'montoOrigen' || campo === 'montoDestino') base[campo] = 100;
    else if (campo === 'cotizacion') base[campo] = 7000;
    else base[campo] = 1;
  }
  // Las incoherencias se prueban aparte: acá los pares deben diferir.
  if (tipo === 'CAMBIO_DIVISA') base['monedaDestinoId'] = 2;
  if (tipo === 'TRANSFERENCIA_ENTRE_CAJAS') base['cajaMayorDestinoId'] = 2;
  if (tipo === 'TRANSFERENCIA_BANCARIA') base['cuentaBancariaDestinoId'] = 2;
  return base;
}

function main() {
  const tipos: TipoOperacionFinanciera[] = TIPOS_OPERACION;

  console.log('\n[A] INVARIANTE: todo campo requerido tiene una fuente que lo puebla');
  for (const tipo of tipos) {
    for (const campo of CAMPOS_REQUERIDOS[tipo]) {
      const fuente = fuenteDelCampo(tipo, campo);
      ok(fuente !== null,
        `${tipo}: "${campo}" es poblable (fuente: ${fuente})`,
        { campo, fuente, requeridos: CAMPOS_REQUERIDOS[tipo] });
    }
  }

  console.log('\n[B] Regresión: CAMBIO_DIVISA y la forma de pago del lado destino');
  // El bug: la UI seteaba la forma de pago según "¿hay select de caja de este
  // lado?" (CAJAS_EN_UI) en vez de "¿este lado mueve caja mayor?"
  // (LADOS_CAJA_MAYOR). En CAMBIO_DIVISA los dos lados mueven la MISMA caja, así
  // que hay un solo select y el destino quedaba sin forma de pago.
  ok(CAMPOS_REQUERIDOS.CAMBIO_DIVISA.includes('formaPagoDestinoId'), 'CAMBIO_DIVISA exige formaPagoDestinoId');
  ok(LADOS_CAJA_MAYOR.CAMBIO_DIVISA.destino === true, 'CAMBIO_DIVISA: el lado destino SÍ mueve caja mayor');
  ok(CAJAS_EN_UI.CAMBIO_DIVISA.destino === false, 'CAMBIO_DIVISA: pero NO hay select de caja destino (es la misma caja)');
  ok(fuenteDelCampo('CAMBIO_DIVISA', 'formaPagoDestinoId') === 'EFECTIVO', 'formaPagoDestinoId se puebla con efectivo fijo');
  // La condición vieja, reproducida: habría dejado el campo sin fuente.
  const condicionVieja = (t: TipoOperacionFinanciera) => CAJAS_EN_UI[t].destino || t === 'RETIRO_BANCARIO';
  ok(condicionVieja('CAMBIO_DIVISA') === false, 'la condición vieja (basada en el select) fallaba justo acá');

  console.log('\n[C] Coherencia LADOS_CAJA_MAYOR ↔ campos de forma de pago requeridos');
  for (const tipo of tipos) {
    for (const lado of ['origen', 'destino'] as const) {
      const campo = lado === 'origen' ? 'formaPagoOrigenId' : 'formaPagoDestinoId';
      const requerido = CAMPOS_REQUERIDOS[tipo].includes(campo);
      ok(requerido === LADOS_CAJA_MAYOR[tipo][lado],
        `${tipo}/${lado}: "${campo}" requerido (${requerido}) == mueve caja (${LADOS_CAJA_MAYOR[tipo][lado]})`);
    }
  }
  // Y a la inversa: ningún lado que NO mueva caja puede exigir forma de pago.
  for (const tipo of tipos) {
    for (const campo of CAMPOS_FORMA_PAGO) {
      if (!CAMPOS_REQUERIDOS[tipo].includes(campo)) continue;
      const lado = campo === 'formaPagoOrigenId' ? 'origen' : 'destino';
      ok(LADOS_CAJA_MAYOR[tipo][lado], `${tipo}: exige "${campo}" sólo porque ese lado mueve caja`);
    }
  }

  console.log('\n[D] Monedas: elegidas en la UI o heredadas de la cuenta bancaria');
  for (const tipo of tipos) {
    const monedasRequeridas = CAMPOS_REQUERIDOS[tipo].filter((c) => CAMPOS_MONEDA.includes(c));
    const cubiertasUI = MONEDAS_EN_UI[tipo];
    const cubiertasBanco = usaCuentaBancaria(tipo) ? Object.keys(monedasDesdeCuentaBancaria(1)) : [];
    for (const m of monedasRequeridas) {
      ok(cubiertasUI.includes(m) || cubiertasBanco.includes(m),
        `${tipo}: "${m}" se puede poblar`, { cubiertasUI, cubiertasBanco });
    }
  }
  ok(CAMPOS_REQUERIDOS.RETIRO_BANCARIO.includes('monedaDestinoId'), 'RETIRO exige monedaDestinoId');
  ok(usaCuentaBancaria('RETIRO_BANCARIO'), 'RETIRO usa cuenta bancaria');
  ok(CAMPOS_REQUERIDOS.DEPOSITO_BANCARIO.includes('monedaOrigenId'), 'DEPOSITO exige monedaOrigenId');
  ok(usaCuentaBancaria('DEPOSITO_BANCARIO'), 'DEPOSITO usa cuenta bancaria');
  const res = monedasDesdeCuentaBancaria(7);
  ok(res.monedaOrigenId === 7 && res.monedaDestinoId === 7, 'la cuenta setea AMBAS monedas (7)', res);

  console.log('\n[E] Cajas y cuentas requeridas ⇒ su select existe en la UI');
  for (const tipo of tipos) {
    for (const lado of ['origen', 'destino'] as const) {
      const caja = lado === 'origen' ? 'cajaMayorOrigenId' : 'cajaMayorDestinoId';
      if (CAMPOS_REQUERIDOS[tipo].includes(caja)) {
        ok(CAJAS_EN_UI[tipo][lado], `${tipo}: "${caja}" requerido y con select visible`);
      }
      const cta = lado === 'origen' ? 'cuentaBancariaOrigenId' : 'cuentaBancariaDestinoId';
      if (CAMPOS_REQUERIDOS[tipo].includes(cta)) {
        ok(CUENTAS_EN_UI[tipo][lado], `${tipo}: "${cta}" requerido y con select visible`);
      }
    }
  }
  // Un select que la UI no muestra no puede ser requerido.
  for (const tipo of tipos) {
    for (const lado of ['origen', 'destino'] as const) {
      const caja = lado === 'origen' ? 'cajaMayorOrigenId' : 'cajaMayorDestinoId';
      if (!CAJAS_EN_UI[tipo][lado]) ok(!CAMPOS_REQUERIDOS[tipo].includes(caja), `${tipo}: "${caja}" no se muestra, no se exige`);
      const cta = lado === 'origen' ? 'cuentaBancariaOrigenId' : 'cuentaBancariaDestinoId';
      if (!CUENTAS_EN_UI[tipo][lado]) ok(!CAMPOS_REQUERIDOS[tipo].includes(cta), `${tipo}: "${cta}" no se muestra, no se exige`);
    }
  }

  console.log('\n[F] Cotización: sólo requerida donde el campo se muestra siempre');
  for (const tipo of tipos) {
    if (CAMPOS_REQUERIDOS[tipo].includes('cotizacion')) {
      ok(COTIZACION_EN_UI[tipo] === 'SIEMPRE', `${tipo}: exige cotización y el campo está siempre visible`);
    }
    if (COTIZACION_EN_UI[tipo] === 'NUNCA') {
      ok(!CAMPOS_REQUERIDOS[tipo].includes('cotizacion'), `${tipo}: sin campo de cotización, no la exige`);
    }
  }
  ok(COTIZACION_EN_UI.TRANSFERENCIA_BANCARIA === 'SI_MONEDAS_DISTINTAS', 'transferencia bancaria: cotización condicional');
  ok(!CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('cotizacion'), 'transferencia bancaria: cotización opcional');

  console.log('\n[G] TRANSFERENCIA_BANCARIA (banco → banco, posible multi-moneda)');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('cuentaBancariaOrigenId'), 'exige cuenta origen');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('cuentaBancariaDestinoId'), 'exige cuenta destino');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('montoOrigen'), 'exige monto origen');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('montoDestino'), 'exige monto destino');
  ok(!CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.some((c) => CAMPOS_MONEDA.includes(c)), 'no exige monedas (se heredan de las cuentas)');
  ok(MONEDAS_EN_UI.TRANSFERENCIA_BANCARIA.length === 0, 'ninguna moneda se elige en UI');
  ok(usaDosCuentasBancarias('TRANSFERENCIA_BANCARIA') === true, 'usa DOS cuentas bancarias');
  ok(usaCuentaBancaria('TRANSFERENCIA_BANCARIA') === false, 'NO usa el path de una sola cuenta (misma moneda ambos lados)');
  ok(usaDosCuentasBancarias('DEPOSITO_BANCARIO') === false, 'depósito NO usa dos cuentas');
  // No toca caja mayor ⇒ no hay dónde imputar la diferencia (el backend la descarta).
  ok(!LADOS_CAJA_MAYOR.TRANSFERENCIA_BANCARIA.origen && !LADOS_CAJA_MAYOR.TRANSFERENCIA_BANCARIA.destino,
    'no mueve caja mayor por ningún lado ⇒ la UI oculta el bloque de diferencia');

  console.log('\n[H] camposFaltantes(): nombra exactamente lo que falta');
  for (const tipo of tipos) {
    ok(camposFaltantes(tipo, valoresCompletos(tipo)).length === 0,
      `${tipo}: completo ⇒ sin faltantes`, camposFaltantes(tipo, valoresCompletos(tipo)));
  }
  ok(camposFaltantes('CAMBIO_DIVISA', {}).includes('descripcion'), 'form vacío ⇒ falta la descripción');
  {
    const v = valoresCompletos('CAMBIO_DIVISA');
    delete v['formaPagoDestinoId'];
    ok(camposFaltantes('CAMBIO_DIVISA', v).includes('formaPagoDestinoId'), 'detecta la forma de pago destino ausente');
  }
  {
    const v = { ...valoresCompletos('CAMBIO_DIVISA'), montoOrigen: 0 };
    ok(camposFaltantes('CAMBIO_DIVISA', v).includes('montoOrigen'), 'un monto en 0 cuenta como incompleto');
  }
  {
    const v = { ...valoresCompletos('TRANSFERENCIA_BANCARIA'), cotizacion: null };
    ok(!camposFaltantes('TRANSFERENCIA_BANCARIA', v).includes('cotizacion'), 'la cotización opcional no se reclama');
  }
  {
    // `fecha` sólo existe en el formulario de escritorio.
    ok(camposFaltantes('CAMBIO_DIVISA', { ...valoresCompletos('CAMBIO_DIVISA'), fecha: null }).includes('fecha'),
      'escritorio: reclama la fecha vacía');
    ok(!camposFaltantes('CAMBIO_DIVISA', valoresCompletos('CAMBIO_DIVISA')).includes('fecha'),
      'mobile: sin control de fecha, no la reclama');
  }
  ok(etiquetaDe('formaPagoDestinoId') === 'Forma de pago destino', 'las etiquetas son legibles');
  ok(etiquetaDe('campoInventado') === 'campoInventado', 'etiqueta desconocida cae al nombre crudo');

  console.log('\n[I] validarCoherencia(): errores que ningún `required` ve');
  for (const tipo of tipos) {
    ok(validarCoherencia(tipo, valoresCompletos(tipo)).length === 0, `${tipo}: operación coherente ⇒ sin errores`);
  }
  ok(validarCoherencia('CAMBIO_DIVISA', { monedaOrigenId: 1, monedaDestinoId: 1 }).length === 1,
    'cambio de divisa con la misma moneda a ambos lados');
  ok(validarCoherencia('TRANSFERENCIA_ENTRE_CAJAS', { cajaMayorOrigenId: 3, cajaMayorDestinoId: 3 }).length === 1,
    'transferencia a la misma caja');
  ok(validarCoherencia('TRANSFERENCIA_BANCARIA', { cuentaBancariaOrigenId: 4, cuentaBancariaDestinoId: 4 }).length === 1,
    'transferencia a la misma cuenta (el handler también la rechaza)');
  ok(validarCoherencia('CAMBIO_DIVISA', { monedaOrigenId: null, monedaDestinoId: null }).length === 0,
    'dos nulos no son "la misma moneda" (eso lo reporta camposFaltantes)');

  console.log(`\n[operacion-financiera-validacion] Resultado: ${passed} OK, ${failed} FALLARON.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
