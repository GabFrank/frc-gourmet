import { formaPagoEfectivo } from './forma-pago-efectivo.util';

const EFECTIVO = { id: 1, nombre: 'EFECTIVO', activo: true, movimentaCaja: true, principal: false };
const TARJETA = { id: 2, nombre: 'TARJETA', activo: true, movimentaCaja: false, principal: false };
const TRANSFER = { id: 3, nombre: 'TRANSFERENCIA', activo: true, movimentaCaja: false, principal: false };
const EFECTIVO_INACTIVO = { id: 4, nombre: 'EFECTIVO VIEJO', activo: false, movimentaCaja: true, principal: false };
const CAJA_PRINCIPAL = { id: 5, nombre: 'CAJA', activo: true, movimentaCaja: true, principal: true };

describe('formaPagoEfectivo (regla fuente Caja Mayor = efectivo)', () => {
  it('elige la forma EFECTIVO entre varias que mueven caja', () => {
    expect(formaPagoEfectivo([TARJETA, CAJA_PRINCIPAL, EFECTIVO, TRANSFER])?.id).toBe(EFECTIVO.id);
  });

  it('nunca elige tarjeta/transferencia cuando hay efectivo', () => {
    const r = formaPagoEfectivo([TARJETA, TRANSFER, EFECTIVO]);
    expect(r?.id).toBe(EFECTIVO.id);
    expect(r?.id).not.toBe(TARJETA.id);
    expect(r?.id).not.toBe(TRANSFER.id);
  });

  it('prefiere la principal que mueve caja si no hay una llamada EFECTIVO', () => {
    expect(formaPagoEfectivo([TARJETA, CAJA_PRINCIPAL, TRANSFER])?.id).toBe(CAJA_PRINCIPAL.id);
  });

  it('ignora formas inactivas', () => {
    const r = formaPagoEfectivo([TARJETA, EFECTIVO_INACTIVO, TRANSFER]);
    expect(r?.id).not.toBe(EFECTIVO_INACTIVO.id);
  });

  it('cae al pool de activas (nombre EFECTIVO) si ninguna mueve caja', () => {
    const efectivoSinMovimenta = { id: 9, nombre: 'EFECTIVO', activo: true, movimentaCaja: false, principal: false };
    expect(formaPagoEfectivo([TARJETA, efectivoSinMovimenta, TRANSFER])?.id).toBe(efectivoSinMovimenta.id);
  });

  it('devuelve null si no hay formas activas (dispara el bloqueo de guardado)', () => {
    expect(formaPagoEfectivo([EFECTIVO_INACTIVO, { id: 7, nombre: 'X', activo: false }])).toBeNull();
  });

  it('devuelve null con lista vacía o nula', () => {
    expect(formaPagoEfectivo([])).toBeNull();
    expect(formaPagoEfectivo(null as any)).toBeNull();
    expect(formaPagoEfectivo(undefined as any)).toBeNull();
  });

  it('match de EFECTIVO case-insensitive y por substring', () => {
    expect(formaPagoEfectivo([{ id: 8, nombre: 'Efectivo Gs', activo: true, movimentaCaja: true }])?.id).toBe(8);
  });
});
