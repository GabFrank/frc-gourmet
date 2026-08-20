/**
 * Pago consolidado de obligaciones desde Caja Mayor.
 *
 * Un evento salda N obligaciones del mismo concepto (cuotas de compra, gastos,
 * vales o una liquidacion de sueldo) cobrando con M lineas de pago, cada una con
 * su moneda, forma de pago y fuente (Caja Mayor o cuenta bancaria).
 *
 * Este archivo es el UNICO lugar donde vive el asiento contable de un pago. La
 * logica de estado de cada tipo de deuda vive en `pago-consolidado-adapters.ts`,
 * y la aritmetica del reparto en `shared/utils/pago-consolidado.util.ts`.
 *
 * Ver `docs/planes/PLAN-PAGO-CONSOLIDADO-CAJA-MAYOR.md`.
 */
import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';

import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { PagoConsolidado } from '../../src/app/database/entities/financiero/pago-consolidado.entity';
import { PagoConsolidadoDetalle } from '../../src/app/database/entities/financiero/pago-consolidado-detalle.entity';
import {
  PagoConcepto,
  PagoConsolidadoEstado,
  PagoConsolidadoFuente,
} from '../../src/app/database/entities/financiero/pago-consolidado-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { actualizarSaldoCajaMayor, esIngreso } from './caja-mayor-utils';
import { registrarMovimientoBancario } from '../utils/movimiento-bancario.utils';
import { getCotizacionBidireccional } from '../utils/moneda.utils';
import { getAdapter, AdapterCtx } from './pago-consolidado-adapters';
import {
  descripcionEvento,
  imputadoPorItem,
  redondear,
  repartirFifo,
  validarCobertura,
  validarSeleccion,
  ItemAPagar,
  LineaDePago,
} from '../utils/pago-consolidado.util';

interface LineaPayload {
  fuente?: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
  monedaId: number;
  formaPagoId?: number | null;
  cajaMayorId?: number | null;
  cuentaBancariaId?: number | null;
  monto: number;
  cotizacion?: number | null;
}

interface PagoPayload {
  concepto: PagoConcepto;
  items: Array<{ origenId: number; monto: number }>;
  lineas: LineaPayload[];
  observacion?: string;
}

/** Clave de consolidacion fisica: un asiento por grupo. */
function claveGrupo(l: LineaDePago): string {
  return [l.fuente, l.cajaMayorId ?? 0, l.cuentaBancariaId ?? 0, l.monedaId, l.formaPagoId ?? 0].join('|');
}

export function registerPagoConsolidadoHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  /**
   * Obligaciones pendientes de un concepto.
   *
   * Lleva permiso aunque sea de lectura: el listado de liquidaciones expone la
   * nomina completa, y el permiso del concepto ya existe.
   */
  ipcMain.handle('get-obligaciones-pendientes', async (_e, concepto: PagoConcepto, filtros?: any) => {
    const adapter = getAdapter(concepto);
    await ensurePermission(dataSource, getCurrentUser, adapter.permiso);
    try {
      return await adapter.listarPendientes(dataSource, filtros);
    } catch (error) {
      console.error('Error get-obligaciones-pendientes:', error);
      throw error;
    }
  });

  ipcMain.handle('registrar-pago-consolidado', async (_e, payload: PagoPayload) => {
    const concepto = payload?.concepto;
    const adapter = getAdapter(concepto);
    await ensurePermission(dataSource, getCurrentUser, adapter.permiso);

    const itemsPayload = payload?.items || [];
    const lineasPayload = payload?.lineas || [];
    if (!itemsPayload.length) throw new Error('Seleccioná al menos una obligación para pagar.');
    if (!lineasPayload.length) throw new Error('Agregá al menos una forma de pago.');

    const currentUser = getCurrentUser();
    const userId = currentUser?.id;
    const ctx: AdapterCtx = { dataSource, currentUser, userId };
    const observacion = (payload?.observacion || '').toUpperCase();

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      // ── 1. Releer cada obligacion CON LOCK y validar contra el saldo real.
      // Nunca contra el saldo que mando el cliente: entre que se dibujo la
      // pantalla y se confirmo el pago la deuda pudo saldarse por otro camino.
      const items: ItemAPagar[] = [];
      const meta: Array<{ descripcion: string; beneficiario: string | null }> = [];
      // Se lockea SIEMPRE en orden de id: dos pagos concurrentes con obligaciones
      // solapadas, tomadas en el orden en que las tildó cada usuario, pueden
      // deadlockear en Postgres. Un orden total las serializa.
      const itemsOrdenados = [...itemsPayload].sort((a, b) => Number(a.origenId) - Number(b.origenId));
      for (const it of itemsOrdenados) {
        const real = await adapter.leerYBloquear(queryRunner, Number(it.origenId));
        items.push({
          origenTipo: adapter.origenTipo,
          origenId: Number(it.origenId),
          monto: redondear(Number(it.monto), 2),
          saldoPendiente: real.saldoPendiente,
          monedaId: real.monedaId,
          beneficiarioId: null,
          descripcion: real.descripcion,
        });
        meta.push({ descripcion: real.descripcion, beneficiario: real.beneficiario });
      }

      // Moneda de la deuda: comun a todas (lo valida `validarSeleccion`).
      const monedaDeudaId = items[0].monedaId;
      const monedaDeuda = await queryRunner.manager.findOne(Moneda, { where: { id: monedaDeudaId } });
      if (!monedaDeuda) throw new Error('No se encontró la moneda de la deuda.');
      const decDeuda = (monedaDeuda as any).decimales == null ? 2 : Number((monedaDeuda as any).decimales);

      // El beneficiario sale de la relectura, no del cliente.
      for (let i = 0; i < items.length; i++) {
        // `itemsOrdenados`, no `itemsPayload`: el orden de lock ya no coincide
        // con el que mandó el cliente.
        items[i].monto = redondear(Number(itemsOrdenados[i].monto), decDeuda);
      }
      if (adapter.concepto === PagoConcepto.COMPRA) {
        // Para compras, el proveedor unico se valida contra lo releido.
        const provs = new Set(meta.map((m) => m.beneficiario || ''));
        if (provs.size > 1) throw new Error('Un pago de compras cubre a un solo proveedor.');
      }

      const erroresSeleccion = validarSeleccion(concepto, items, decDeuda);
      if (erroresSeleccion.length) throw new Error(erroresSeleccion.join(' '));

      // ── 2. Resolver cotizaciones faltantes. Si no hay, se corta: no se asume 1.
      const decimalesPorMoneda = new Map<number, number>([[monedaDeudaId, decDeuda]]);
      const lineas: LineaDePago[] = [];
      for (const l of lineasPayload) {
        const monedaLineaId = Number(l.monedaId);
        if (!decimalesPorMoneda.has(monedaLineaId)) {
          const m = await queryRunner.manager.findOne(Moneda, { where: { id: monedaLineaId } });
          if (!m) throw new Error(`No se encontró la moneda de una de las formas de pago.`);
          decimalesPorMoneda.set(monedaLineaId, (m as any).decimales == null ? 2 : Number((m as any).decimales));
        }
        let cotizacion = l.cotizacion != null ? Number(l.cotizacion) : null;
        if (cotizacion == null) {
          const c = await getCotizacionBidireccional(dataSource, monedaLineaId, monedaDeudaId);
          cotizacion = c?.tasa ?? null;
        }
        if (cotizacion == null || !(cotizacion > 0)) {
          throw new Error('Falta la cotización para convertir una de las formas de pago a la moneda de la deuda.');
        }
        lineas.push({
          fuente: l.fuente === 'CUENTA_BANCARIA' ? 'CUENTA_BANCARIA' : 'CAJA_MAYOR',
          monedaId: monedaLineaId,
          formaPagoId: l.formaPagoId ?? null,
          cajaMayorId: l.cajaMayorId ?? null,
          cuentaBancariaId: l.cuentaBancariaId ?? null,
          monto: redondear(Number(l.monto), decimalesPorMoneda.get(monedaLineaId)!),
          cotizacion,
        });
      }

      // ── 3. Las formas de pago tienen que cubrir la deuda.
      const erroresCobertura = validarCobertura(items, lineas, decDeuda);
      if (erroresCobertura.length) throw new Error(erroresCobertura.join(' '));

      // ── 4. Cabecera del evento.
      const totalDeuda = redondear(items.reduce((s, i) => s + i.monto, 0), decDeuda);
      const beneficiarioComun = meta.length && meta.every((m) => m.beneficiario === meta[0].beneficiario)
        ? meta[0].beneficiario
        : null;
      const pago = queryRunner.manager.create(PagoConsolidado, {
        fecha: new Date(),
        concepto,
        descripcion: descripcionEvento(
          concepto, items.length, beneficiarioComun,
          items.length === 1 ? meta[0].descripcion : null,
        ).slice(0, 255),
        monedaDeuda: { id: monedaDeudaId } as any,
        monedaDeudaId,
        montoTotal: totalDeuda,
        cantidadItems: items.length,
        responsable: userEntity || undefined,
        observacion: observacion || undefined,
        estado: PagoConsolidadoEstado.ACTIVO,
      } as any);
      await setEntityUserTracking(dataSource, pago, userId, false);
      const pagoGuardado = await queryRunner.manager.save(PagoConsolidado, pago);

      // ── 5. Un asiento por grupo fisico (fuente, caja/cuenta, moneda, forma).
      // Consolidar es justamente el punto: 3 gastos pagados con un billete son
      // UN egreso de caja, no tres.
      const grupos = new Map<string, { linea: LineaDePago; monto: number; movimientoId?: number }>();
      for (const l of lineas) {
        const k = claveGrupo(l);
        const g = grupos.get(k);
        if (g) g.monto = redondear(g.monto + l.monto, decimalesPorMoneda.get(l.monedaId)!);
        else grupos.set(k, { linea: l, monto: l.monto });
      }

      // Cuando el evento cubre UNA sola obligacion, el movimiento ademas lleva la
      // columna de referencia clasica: hay filtros y observaciones compuestas que
      // dependen de ella (p.ej. filtrar movimientos por proveedor via gasto).
      const refClasica = items.length === 1 ? adapter.columnaReferencia(items[0].origenId) : {};

      const obsMov = observacion
        ? `${pagoGuardado.descripcion} — ${observacion}`
        : pagoGuardado.descripcion;

      for (const g of grupos.values()) {
        const l = g.linea;
        if (l.fuente === 'CAJA_MAYOR') {
          if (!l.cajaMayorId || !l.formaPagoId) throw new Error('Una forma de pago por Caja Mayor necesita la caja y la forma.');
          const mov = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: l.cajaMayorId } as any,
            tipoMovimiento: adapter.tipoMovimiento,
            moneda: { id: l.monedaId } as any,
            formaPago: { id: l.formaPagoId } as any,
            monto: g.monto,
            fecha: new Date(),
            observacion: obsMov.slice(0, 255),
            pagoConsolidadoId: pagoGuardado.id,
            ...refClasica,
          } as any);
          if (userEntity) (mov as any).responsable = userEntity;
          await setEntityUserTracking(dataSource, mov, userId, false);
          const guardado = await queryRunner.manager.save(CajaMayorMovimiento, mov);
          g.movimientoId = guardado.id;
          await actualizarSaldoCajaMayor(
            queryRunner, Number(l.cajaMayorId), Number(l.monedaId), Number(l.formaPagoId),
            g.monto, adapter.tipoMovimiento,
          );
        } else {
          if (!l.cuentaBancariaId) throw new Error('Una forma de pago bancaria necesita la cuenta.');
          const cb = await queryRunner.manager.findOne(CuentaBancaria, {
            where: { id: Number(l.cuentaBancariaId) },
            relations: ['moneda'],
          });
          if (!cb) throw new Error('Cuenta bancaria no encontrada');
          // `CuentaBancaria.saldo` es un escalar en UNA moneda fija. Si la linea
          // viene denominada en otra, debitar ese monto corrompe el saldo sin que
          // nadie se entere. El cliente manda la moneda de la linea, asi que hay
          // que verificarla acá: el diálogo la hereda de la cuenta, pero un
          // cliente crudo (o el select de moneda tocado después de elegir la
          // cuenta) puede mandar cualquier cosa.
          const monedaCuentaId = (cb.moneda as any)?.id;
          if (monedaCuentaId && Number(l.monedaId) !== Number(monedaCuentaId)) {
            throw new Error(
              `La cuenta "${cb.nombre}" está en otra moneda: una forma de pago bancaria se debita en la moneda de la cuenta.`,
            );
          }
          cb.saldo = redondear(Number(cb.saldo) - g.monto, 2);
          await queryRunner.manager.save(CuentaBancaria, cb);
          const movBanco = await registrarMovimientoBancario(queryRunner.manager, dataSource, {
            cuentaBancariaId: Number(l.cuentaBancariaId),
            tipo: MovimientoBancarioTipo.SALIDA_MANUAL,
            monto: g.monto,
            observacion: obsMov,
            responsable: userEntity,
          });
          g.movimientoId = movBanco.id;
        }
      }

      // ── 6. Reparto FIFO y filas de detalle.
      const filas = repartirFifo(items, lineas, decDeuda, (mid) => decimalesPorMoneda.get(mid) ?? 2);
      for (const f of filas) {
        const l = lineas[f.lineaIdx];
        const g = grupos.get(claveGrupo(l))!;
        const det = queryRunner.manager.create(PagoConsolidadoDetalle, {
          pagoConsolidadoId: pagoGuardado.id,
          pagoConsolidado: { id: pagoGuardado.id } as any,
          origenTipo: adapter.origenTipo,
          origenId: items[f.itemIdx].origenId,
          origenDescripcion: (meta[f.itemIdx].descripcion || '').slice(0, 255),
          origenBeneficiario: meta[f.itemIdx].beneficiario
            ? meta[f.itemIdx].beneficiario!.slice(0, 255)
            : undefined,
          fuente: l.fuente as PagoConsolidadoFuente,
          moneda: { id: l.monedaId } as any,
          monedaId: l.monedaId,
          formaPago: l.formaPagoId ? ({ id: l.formaPagoId } as any) : null,
          formaPagoId: l.formaPagoId ?? null,
          cajaMayorId: l.cajaMayorId ?? null,
          cuentaBancariaId: l.cuentaBancariaId ?? null,
          montoOrigen: f.montoOrigen,
          cotizacion: l.cotizacion,
          montoImputado: f.montoImputado,
          cajaMayorMovimientoId: l.fuente === 'CAJA_MAYOR' ? g.movimientoId ?? null : null,
          movimientoBancarioId: l.fuente === 'CUENTA_BANCARIA' ? g.movimientoId ?? null : null,
          anulado: false,
        } as any);
        await setEntityUserTracking(dataSource, det, userId, false);
        await queryRunner.manager.save(PagoConsolidadoDetalle, det);
      }

      // ── 7. Estado de dominio de cada obligacion, con lo REALMENTE imputado.
      const imputado = imputadoPorItem(filas, items.length, decDeuda);
      for (let i = 0; i < items.length; i++) {
        await adapter.aplicar(queryRunner, items[i].origenId, imputado[i], ctx);
      }

      await queryRunner.commitTransaction();
      return { id: pagoGuardado.id, descripcion: pagoGuardado.descripcion, montoTotal: totalDeuda, items: items.length };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error registrar-pago-consolidado:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-pago-consolidado-detalle', async (_e, pagoId: number) => {
    try {
      const pago = await dataSource.getRepository(PagoConsolidado).findOne({
        where: { id: pagoId },
        relations: ['monedaDeuda', 'responsable', 'responsable.persona'],
      });
      if (!pago) throw new Error(`Pago consolidado ${pagoId} no encontrado`);
      await ensurePermission(dataSource, getCurrentUser, getAdapter(pago.concepto).permiso);

      const detalles = await dataSource.getRepository(PagoConsolidadoDetalle).find({
        where: { pagoConsolidadoId: pagoId },
        relations: ['moneda', 'formaPago'],
        order: { id: 'ASC' as any },
      });

      // Vista por obligacion: cuanto recibio cada una en este evento.
      const porItem = new Map<number, any>();
      for (const d of detalles) {
        const k = d.origenId;
        const acc = porItem.get(k) || {
          origenTipo: d.origenTipo, origenId: d.origenId,
          descripcion: d.origenDescripcion, beneficiario: d.origenBeneficiario || null,
          montoImputado: 0,
        };
        acc.montoImputado = +(acc.montoImputado + Number(d.montoImputado)).toFixed(2);
        porItem.set(k, acc);
      }

      // Vista por linea fisica: de donde salio la plata.
      const porLinea = new Map<string, any>();
      for (const d of detalles) {
        const k = [d.fuente, d.cajaMayorId ?? 0, d.cuentaBancariaId ?? 0, d.monedaId, d.formaPagoId ?? 0].join('|');
        const acc = porLinea.get(k) || {
          fuente: d.fuente,
          monedaSimbolo: (d.moneda as any)?.simbolo || null,
          monedaDenominacion: (d.moneda as any)?.denominacion || null,
          formaPago: (d.formaPago as any)?.nombre || null,
          cajaMayorId: d.cajaMayorId ?? null,
          cuentaBancariaId: d.cuentaBancariaId ?? null,
          cotizacion: Number(d.cotizacion),
          montoOrigen: 0,
          montoImputado: 0,
          cajaMayorMovimientoId: d.cajaMayorMovimientoId ?? null,
          movimientoBancarioId: d.movimientoBancarioId ?? null,
        };
        acc.montoOrigen = +(acc.montoOrigen + Number(d.montoOrigen)).toFixed(2);
        acc.montoImputado = +(acc.montoImputado + Number(d.montoImputado)).toFixed(2);
        porLinea.set(k, acc);
      }

      const persona: any = (pago.responsable as any)?.persona;
      return {
        id: pago.id,
        concepto: pago.concepto,
        descripcion: pago.descripcion,
        fecha: pago.fecha,
        estado: pago.estado,
        motivoAnulacion: pago.motivoAnulacion || null,
        fechaAnulacion: pago.fechaAnulacion || null,
        observacion: pago.observacion || null,
        montoTotal: Number(pago.montoTotal),
        cantidadItems: pago.cantidadItems,
        monedaSimbolo: (pago.monedaDeuda as any)?.simbolo || null,
        monedaDenominacion: (pago.monedaDeuda as any)?.denominacion || null,
        decimales: (pago.monedaDeuda as any)?.decimales == null ? 2 : Number((pago.monedaDeuda as any).decimales),
        responsable: (persona?.nombre || (pago.responsable as any)?.nickname || null),
        items: Array.from(porItem.values()),
        lineas: Array.from(porLinea.values()),
      };
    } catch (error) {
      console.error('Error get-pago-consolidado-detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('anular-pago-consolidado', async (_e, pagoId: number, motivo?: string) => {
    const pagoPrevio = await dataSource.getRepository(PagoConsolidado).findOne({ where: { id: pagoId } });
    if (!pagoPrevio) throw new Error(`Pago consolidado ${pagoId} no encontrado`);
    const adapter = getAdapter(pagoPrevio.concepto);
    await ensurePermission(dataSource, getCurrentUser, adapter.permiso);

    const currentUser = getCurrentUser();
    const userId = currentUser?.id;
    const ctx: AdapterCtx = { dataSource, currentUser, userId };

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pago = await queryRunner.manager.findOne(PagoConsolidado, { where: { id: pagoId } });
      if (!pago) throw new Error(`Pago consolidado ${pagoId} no encontrado`);
      if (pago.estado === PagoConsolidadoEstado.ANULADO) throw new Error('El pago ya fue anulado');

      const detalles = await queryRunner.manager.find(PagoConsolidadoDetalle, {
        where: { pagoConsolidadoId: pagoId, anulado: false },
        order: { id: 'ASC' as any },
      });
      if (!detalles.length) throw new Error('El pago no tiene detalle activo para revertir');

      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;
      const motivoTxt = (motivo || '').toUpperCase();

      // ── 1. Revertir cada movimiento fisico UNA sola vez: un movimiento
      // consolidado cubre varias filas de detalle.
      const movsCaja = new Set<number>();
      const movsBanco = new Set<number>();
      for (const d of detalles) {
        if (d.cajaMayorMovimientoId) movsCaja.add(d.cajaMayorMovimientoId);
        if (d.movimientoBancarioId) movsBanco.add(d.movimientoBancarioId);
      }

      for (const movId of movsCaja) {
        const original = await queryRunner.manager.findOne(CajaMayorMovimiento, {
          where: { id: movId },
          relations: ['cajaMayor', 'moneda', 'formaPago'],
        });
        if (!original) continue;
        const cajaMayorId = (original.cajaMayor as any)?.id;
        const monedaId = (original.moneda as any)?.id;
        const formaPagoId = (original.formaPago as any)?.id;
        if (!cajaMayorId || !monedaId || !formaPagoId) continue;
        // La reversa se deriva del movimiento original en vez de asumir egreso:
        // hoy los 4 conceptos son egresos, pero el día que entre uno de sentido
        // invertido (una cuota de préstamo a funcionario es un INGRESO) un
        // AJUSTE_POSITIVO a fuego duplicaría plata al anular.
        const tipoReversa = esIngreso(original.tipoMovimiento)
          ? TipoMovimiento.AJUSTE_NEGATIVO
          : TipoMovimiento.AJUSTE_POSITIVO;
        const contra = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: tipoReversa,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto: original.monto,
          fecha: new Date(),
          observacion: `ANULACION PAGO #${pago.id}${motivoTxt ? ` - ${motivoTxt}` : ''}`.slice(0, 255),
          referenciaAnulacion: original,
          pagoConsolidadoId: pago.id,
        } as any);
        if (userEntity) (contra as any).responsable = userEntity;
        await setEntityUserTracking(dataSource, contra, userId, false);
        await queryRunner.manager.save(CajaMayorMovimiento, contra);
        await actualizarSaldoCajaMayor(
          queryRunner, Number(cajaMayorId), Number(monedaId), Number(formaPagoId),
          Number(original.monto), tipoReversa,
        );
      }

      // Banco: se acredita de vuelta lo que salio por cada cuenta.
      const porCuenta = new Map<number, number>();
      for (const d of detalles) {
        if (d.fuente !== PagoConsolidadoFuente.CUENTA_BANCARIA || !d.cuentaBancariaId) continue;
        porCuenta.set(d.cuentaBancariaId, +( (porCuenta.get(d.cuentaBancariaId) || 0) + Number(d.montoOrigen) ).toFixed(2));
      }
      for (const [cuentaId, monto] of porCuenta) {
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: cuentaId } });
        if (!cb) continue;
        cb.saldo = +(Number(cb.saldo) + monto).toFixed(2);
        await queryRunner.manager.save(CuentaBancaria, cb);
        await registrarMovimientoBancario(queryRunner.manager, dataSource, {
          cuentaBancariaId: cuentaId,
          tipo: MovimientoBancarioTipo.AJUSTE_POSITIVO,
          monto,
          observacion: `ANULACION PAGO #${pago.id}${motivoTxt ? ` - ${motivoTxt}` : ''}`,
          responsable: userEntity,
        });
      }

      // ── 2. Reabrir cada obligacion por lo que efectivamente recibio.
      const porItem = new Map<number, number>();
      for (const d of detalles) {
        porItem.set(d.origenId, +((porItem.get(d.origenId) || 0) + Number(d.montoImputado)).toFixed(2));
      }
      for (const [origenId, monto] of porItem) {
        await adapter.revertir(queryRunner, origenId, monto, ctx);
      }

      // ── 3. Marcar el evento y su detalle.
      for (const d of detalles) {
        d.anulado = true;
        await queryRunner.manager.save(PagoConsolidadoDetalle, d);
      }
      pago.estado = PagoConsolidadoEstado.ANULADO;
      pago.motivoAnulacion = motivoTxt || undefined;
      pago.fechaAnulacion = new Date();
      await setEntityUserTracking(dataSource, pago, userId, true);
      await queryRunner.manager.save(PagoConsolidado, pago);

      await queryRunner.commitTransaction();
      return { success: true, id: pago.id, itemsRevertidos: porItem.size };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error anular-pago-consolidado:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });
}
