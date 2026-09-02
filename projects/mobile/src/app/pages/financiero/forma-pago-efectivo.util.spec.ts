import { formaPagoEfectivo, formasPagoDeCaja, formasPagoEfectivoDeCaja } from '@frc/shared-core';

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

describe('formasPagoDeCaja / formasPagoEfectivoDeCaja (pool de un tramo de Caja Mayor)', () => {
  it('el pool son las activas que mueven caja', () => {
    const r = formasPagoDeCaja([TARJETA, CAJA_PRINCIPAL, EFECTIVO, EFECTIVO_INACTIVO]);
    expect(r.map((f) => f.id).sort()).toEqual([1, 5]);
  });

  it('cae a todas las activas si ninguna declara movimentaCaja', () => {
    const a = { id: 20, nombre: 'EFECTIVO', activo: true };
    const b = { id: 21, nombre: 'TARJETA', activo: true };
    expect(formasPagoDeCaja([a, b]).map((f) => f.id)).toEqual([20, 21]);
  });

  it('las opciones ofrecibles son sólo las de nombre EFECTIVO dentro del pool', () => {
    // `movimentaCaja` solo no alcanza: CAJA_PRINCIPAL mueve caja pero no es efectivo.
    const r = formasPagoEfectivoDeCaja([TARJETA, CAJA_PRINCIPAL, EFECTIVO]);
    expect(r.map((f) => f.id)).toEqual([EFECTIVO.id]);
  });

  it('nunca deja el select vacío: cae a la mejor opción si ninguna se llama EFECTIVO', () => {
    const r = formasPagoEfectivoDeCaja([TARJETA, CAJA_PRINCIPAL]);
    expect(r.map((f) => f.id)).toEqual([CAJA_PRINCIPAL.id]);
  });

  it('devuelve vacío si no hay ninguna forma usable', () => {
    expect(formasPagoEfectivoDeCaja([EFECTIVO_INACTIVO])).toEqual([]);
    expect(formasPagoEfectivoDeCaja([])).toEqual([]);
  });

  it('ignora las inactivas', () => {
    expect(formasPagoEfectivoDeCaja([EFECTIVO_INACTIVO, EFECTIVO]).map((f) => f.id)).toEqual([EFECTIVO.id]);
  });
});
