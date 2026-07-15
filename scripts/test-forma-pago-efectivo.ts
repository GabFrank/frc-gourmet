/**
 * Test interno del helper formaPagoEfectivo (regla: fuente Caja Mayor = efectivo).
 * Corre con: npm run test:forma-pago-efectivo
 */
import * as assert from 'assert';
import { formaPagoEfectivo } from '../projects/mobile/src/app/pages/financiero/forma-pago-efectivo.util';

let pasados = 0;
function test(nombre: string, fn: () => void): void {
  try {
    fn();
    pasados++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}\n     ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const EFECTIVO = { id: 1, nombre: 'EFECTIVO', activo: true, movimentaCaja: true, principal: false };
const TARJETA = { id: 2, nombre: 'TARJETA', activo: true, movimentaCaja: false, principal: false };
const TRANSFER = { id: 3, nombre: 'TRANSFERENCIA', activo: true, movimentaCaja: false, principal: false };
const EFECTIVO_INACTIVO = { id: 4, nombre: 'EFECTIVO VIEJO', activo: false, movimentaCaja: true, principal: false };
const CAJA_PRINCIPAL = { id: 5, nombre: 'CAJA', activo: true, movimentaCaja: true, principal: true };

console.log('formaPagoEfectivo:');

test('elige la forma EFECTIVO entre varias que mueven caja', () => {
  const r = formaPagoEfectivo([TARJETA, CAJA_PRINCIPAL, EFECTIVO, TRANSFER]);
  assert.strictEqual(r?.id, EFECTIVO.id, 'debería elegir EFECTIVO por nombre');
});

test('nunca elige una forma que NO es efectivo (tarjeta/transferencia) para caja', () => {
  const r = formaPagoEfectivo([TARJETA, TRANSFER, EFECTIVO]);
  assert.strictEqual(r?.id, EFECTIVO.id);
  assert.notStrictEqual(r?.id, TARJETA.id);
  assert.notStrictEqual(r?.id, TRANSFER.id);
});

test('si no hay una llamada "EFECTIVO", prefiere la principal entre las que mueven caja', () => {
  const r = formaPagoEfectivo([TARJETA, CAJA_PRINCIPAL, TRANSFER]);
  assert.strictEqual(r?.id, CAJA_PRINCIPAL.id, 'debería caer a la principal que mueve caja');
});

test('ignora formas inactivas', () => {
  const r = formaPagoEfectivo([TARJETA, EFECTIVO_INACTIVO, TRANSFER]);
  // No hay efectivo activo que mueva caja → cae al pool de activas (tarjeta/transfer).
  assert.notStrictEqual(r?.id, EFECTIVO_INACTIVO.id, 'no debe elegir una forma inactiva');
});

test('si ninguna mueve caja, cae al pool de activas (nombre EFECTIVO primero)', () => {
  const efectivoSinMovimenta = { id: 9, nombre: 'EFECTIVO', activo: true, movimentaCaja: false, principal: false };
  const r = formaPagoEfectivo([TARJETA, efectivoSinMovimenta, TRANSFER]);
  assert.strictEqual(r?.id, efectivoSinMovimenta.id, 'debe encontrar EFECTIVO por nombre aunque no movimente caja');
});

test('devuelve null si no hay formas activas (dispara el bloqueo de guardado)', () => {
  const r = formaPagoEfectivo([EFECTIVO_INACTIVO, { id: 7, nombre: 'X', activo: false }]);
  assert.strictEqual(r, null);
});

test('devuelve null con lista vacía o nula', () => {
  assert.strictEqual(formaPagoEfectivo([]), null);
  assert.strictEqual(formaPagoEfectivo(null as any), null);
  assert.strictEqual(formaPagoEfectivo(undefined as any), null);
});

test('match de EFECTIVO es case-insensitive y por substring', () => {
  const r = formaPagoEfectivo([{ id: 8, nombre: 'Efectivo Gs', activo: true, movimentaCaja: true }]);
  assert.strictEqual(r?.id, 8);
});

console.log(`\n${pasados} tests pasados${process.exitCode ? ' — CON FALLOS' : ''}`);
