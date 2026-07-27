/**
 * Test de invariante de validación del formulario de Operación Financiera.
 *
 * Regla que debe cumplirse siempre: cada control de moneda REQUERIDO por un tipo
 * de operación debe poder poblarse — o el usuario lo elige en la UI, o se hereda
 * de la cuenta bancaria. Si un tipo exige una moneda que ni se elige ni se
 * hereda, el formulario queda inválido para siempre (bug del botón "Registrar"
 * deshabilitado en RETIRO/DEPOSITO).
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-operacion-financiera-validacion-e2e.ts
 */
import {
  CAMPOS_REQUERIDOS, CAMPOS_MONEDA, MONEDAS_EN_UI, usaCuentaBancaria, usaDosCuentasBancarias, monedasDesdeCuentaBancaria,
  TipoOperacionFinanciera,
} from '../src/app/pages/financiero/caja-mayor/operaciones-financieras/create-operacion-financiera/operacion-financiera-validacion.util';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

function main() {
  const tipos: TipoOperacionFinanciera[] = ['CAMBIO_DIVISA', 'DEPOSITO_BANCARIO', 'RETIRO_BANCARIO', 'TRANSFERENCIA_ENTRE_CAJAS', 'TRANSFERENCIA_BANCARIA'];

  console.log('\n[A] Cada moneda requerida es poblable (UI o cuenta bancaria)');
  for (const tipo of tipos) {
    const monedasRequeridas = CAMPOS_REQUERIDOS[tipo].filter((c) => CAMPOS_MONEDA.includes(c));
    const cubiertasUI = MONEDAS_EN_UI[tipo];
    const cubiertasBanco = usaCuentaBancaria(tipo) ? Object.keys(monedasDesdeCuentaBancaria(1)) : [];
    for (const m of monedasRequeridas) {
      ok(cubiertasUI.includes(m) || cubiertasBanco.includes(m),
        `${tipo}: "${m}" se puede poblar`, { cubiertasUI, cubiertasBanco });
    }
  }

  console.log('\n[B] Casos puntuales del bug corregido');
  // RETIRO exige monedaDestinoId, que se hereda de la cuenta bancaria.
  ok(CAMPOS_REQUERIDOS.RETIRO_BANCARIO.includes('monedaDestinoId'), 'RETIRO exige monedaDestinoId');
  ok(usaCuentaBancaria('RETIRO_BANCARIO'), 'RETIRO usa cuenta bancaria');
  // DEPOSITO exige monedaOrigenId, que se hereda de la cuenta bancaria.
  ok(CAMPOS_REQUERIDOS.DEPOSITO_BANCARIO.includes('monedaOrigenId'), 'DEPOSITO exige monedaOrigenId');
  ok(usaCuentaBancaria('DEPOSITO_BANCARIO'), 'DEPOSITO usa cuenta bancaria');

  console.log('\n[C] La cuenta bancaria setea AMBAS monedas con la misma divisa');
  const res = monedasDesdeCuentaBancaria(7);
  ok(res.monedaOrigenId === 7 && res.monedaDestinoId === 7, 'origen y destino = moneda de la cuenta (7)', res);

  console.log('\n[D] TRANSFERENCIA_BANCARIA (banco → banco, posible multi-moneda)');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('cuentaBancariaOrigenId'), 'exige cuenta origen');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('cuentaBancariaDestinoId'), 'exige cuenta destino');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('montoOrigen'), 'exige monto origen');
  ok(CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.includes('montoDestino'), 'exige monto destino');
  // Las monedas se heredan de cada cuenta (no requeridas ni elegidas en UI).
  ok(!CAMPOS_REQUERIDOS.TRANSFERENCIA_BANCARIA.some((c) => CAMPOS_MONEDA.includes(c)), 'no exige monedas (se heredan de las cuentas)');
  ok(MONEDAS_EN_UI.TRANSFERENCIA_BANCARIA.length === 0, 'ninguna moneda se elige en UI');
  ok(usaDosCuentasBancarias('TRANSFERENCIA_BANCARIA') === true, 'usa DOS cuentas bancarias');
  ok(usaCuentaBancaria('TRANSFERENCIA_BANCARIA') === false, 'NO usa el path de una sola cuenta (misma moneda ambos lados)');
  ok(usaDosCuentasBancarias('DEPOSITO_BANCARIO') === false, 'depósito NO usa dos cuentas');

  console.log(`\n[operacion-financiera-validacion] Resultado: ${passed} OK, ${failed} FALLARON.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
