import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { EgresoCaja } from '../../src/app/database/entities/financiero/egreso-caja.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuotaEstado, CuentaPorPagarTipo } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { PagoCuotaCppDetalle } from '../../src/app/database/entities/financiero/pago-cuota-cpp-detalle.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import { parseLocalDate } from '../utils/date.utils';
import { ensurePermission } from '../utils/auth.utils';
import { aplicarEstadoPagoCuota, revertirEstadoPagoCuota } from './cuentas-por-pagar.handler';
import { getCotizacionCompraLocal } from '../utils/moneda.utils';
import { crearCompraSimplificadaTx } from './compras.handler';

/**
 * Egresos de efectivo de la caja de venta (PdV) por vales y compras pagados
 * directamente desde el cajón (Utilitarios del PdV). Descuentan del cajón y
 * aparecen en el resumen de cierre; NO pasan por Caja Mayor. El objeto de
 * dominio (Vale / CuentaPorPagarCuota) es la fuente de verdad; `EgresoCaja`
 * solo registra la salida de efectivo.
 */
export function registerPdvEgresosHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // Valida que la caja exista, esté ABIERTA y que el dispositivo actual sea el
  // dueño de la caja (mismo gate que el cobro de venta). Devuelve la caja.
  async function validarCaja(_event: any, cajaId: number): Promise<Caja> {
    if (!cajaId) throw new Error('Falta la caja.');
    const caja = await dataSource.getRepository(Caja).findOne({
      where: { id: cajaId },
      relations: ['dispositivo'],
    });
    if (!caja) throw new Error(`Caja ${cajaId} no encontrada.`);
    if (caja.estado !== CajaEstado.ABIERTO) {
      throw new Error('La caja no está abierta. No se pueden registrar egresos.');
    }
    // Gate por dispositivo: bloquea solo cuando ambos ids son resolubles y difieren.
    const dispositivoCajaId = (caja.dispositivo as any)?.id ?? null;
    const deviceActual = resolveRequestDeviceId(_event);
    if (deviceActual != null && dispositivoCajaId != null && deviceActual !== dispositivoCajaId) {
      throw new Error('EGRESO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO');
    }
    return caja;
  }

  // Valida que la forma de pago exista y mueva caja (efectivo). Sin esto el
  // cierre no descontaría el egreso del esperado.
  async function validarFormaPagoEfectivo(qr: any, formaPagoId: number): Promise<FormasPago> {
    if (!formaPagoId) throw new Error('Falta la forma de pago.');
    const fp = await qr.manager.getRepository(FormasPago).findOne({ where: { id: formaPagoId } });
    if (!fp) throw new Error(`Forma de pago ${formaPagoId} no encontrada.`);
    if (!(fp as any).movimentaCaja) {
      throw new Error('La forma de pago debe mover caja (efectivo) para pagar desde el cajón.');
    }
    return fp;
  }

  // Pago MIXTO de una cuota de compra desde el cajón: N lineas efectivo (moneda +
  // forma + monto). Cada linea se convierte a la moneda de la deuda (CPP), asienta
  // un EgresoCaja y un PagoCuotaCppDetalle (fuente PDV_CAJA, con egresoCajaId); la
  // suma convertida se aplica al estado de dominio UNA vez. NO commitea.
  async function aplicarPagoMixtoCajaCuota(
    qr: any,
    p: { caja: Caja; cuotaId: number; cuotaNumero: number; cppMonedaId: number; saldo: number; lineas: any[]; descripcion: string; fecha: Date; userId?: number },
    currentUser: Usuario | null,
  ): Promise<number> {
    const lineas = p.lineas || [];
    if (!lineas.length) throw new Error('El pago mixto requiere al menos una linea.');
    if (!p.cppMonedaId) throw new Error('La cuota no tiene moneda.');

    const prep: Array<{ monedaId: number; formaPagoId: number; monto: number; cot: number; montoCpp: number }> = [];
    let totalCpp = 0;
    for (const l of lineas) {
      const monto = +Number(l.monto).toFixed(2);
      if (!(monto > 0)) throw new Error('Cada linea de pago debe tener un monto mayor a 0.');
      const fp = await validarFormaPagoEfectivo(qr, Number(l.formaPagoId));
      let cot: number | null = l.cotizacion != null ? Number(l.cotizacion) : null;
      if (cot == null) cot = await getCotizacionCompraLocal(dataSource, Number(l.monedaId), p.cppMonedaId);
      if (cot == null || !(cot > 0)) throw new Error('Falta la cotizacion para convertir una linea a la moneda de la deuda.');
      const montoCpp = +(monto * cot).toFixed(2);
      totalCpp += montoCpp;
      prep.push({ monedaId: Number(l.monedaId), formaPagoId: fp.id, monto, cot, montoCpp });
    }
    totalCpp = +totalCpp.toFixed(2);
    if (totalCpp > Number(p.saldo) + 0.005) {
      throw new Error(`El total del pago (${totalCpp}) supera el saldo de la cuota (${p.saldo}).`);
    }

    // Estado de dominio una sola vez con la suma convertida.
    await aplicarEstadoPagoCuota(qr, p.cuotaId, totalCpp, currentUser, dataSource);

    // Un EgresoCaja + un detalle por linea.
    for (const it of prep) {
      const egreso = await crearEgresoCaja(qr, {
        caja: p.caja, tipo: 'COMPRA', monto: it.monto, monedaId: it.monedaId, formaPagoId: it.formaPagoId,
        cuentaPorPagarCuotaId: p.cuotaId, descripcion: p.descripcion, fecha: p.fecha, userId: p.userId,
      });
      const det = qr.manager.create(PagoCuotaCppDetalle, {
        cuentaPorPagarCuotaId: p.cuotaId,
        moneda: { id: it.monedaId } as any,
        formaPago: { id: it.formaPagoId } as any,
        fuente: 'PDV_CAJA',
        montoOrigen: it.monto,
        cotizacion: it.cot,
        montoCpp: it.montoCpp,
        egresoCajaId: egreso.id,
      } as any);
      await setEntityUserTracking(dataSource, det, p.userId, false);
      await qr.manager.save(PagoCuotaCppDetalle, det);
    }
    return totalCpp;
  }

  // ─── Crear + pagar un vale desde el cajón del PdV ───────────────────────────
  ipcMain.handle('crear-vale-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PDV_PAGAR_VALE');
    if (!data?.funcionarioId) throw new Error('Funcionario requerido.');
    if (!data?.monedaId) throw new Error('Moneda requerida.');
    const monto = Number(data.monto);
    if (!monto || monto <= 0) throw new Error('Monto inválido.');

    const caja = await validarCaja(_event, Number(data.cajaId));
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const formaPago = await validarFormaPagoEfectivo(qr, Number(data.formaPagoId));

      const funcionario = await qr.manager.findOne(Funcionario, {
        where: { id: data.funcionarioId }, relations: ['persona'],
      });
      if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado.`);
      const userEntity = userId ? await qr.manager.findOne(Usuario, { where: { id: userId } }) : null;

      const vale = qr.manager.create(Vale, {
        funcionario,
        motivo: data.motivoId ? { id: data.motivoId } as any : undefined,
        monto,
        fecha: parseLocalDate(data.fecha) || new Date(),
        descripcion: data.descripcion ? String(data.descripcion).toUpperCase() : undefined,
        moneda: { id: Number(data.monedaId) } as any,
        formaPago: { id: formaPago.id } as any,
        estado: ValeEstado.CONFIRMADO,
        esAdelanto: data.esAdelanto === true,
        autorizadoPor: userEntity || undefined,
      });
      await setEntityUserTracking(dataSource, vale, userId, false);
      const valeSaved = await qr.manager.save(Vale, vale);

      const nombre = `${funcionario.persona?.nombre || ''} ${funcionario.persona?.apellido || ''}`.trim();
      const egreso = await crearEgresoCaja(qr, {
        caja, tipo: 'VALE', monto, monedaId: Number(data.monedaId), formaPagoId: formaPago.id,
        valeId: valeSaved.id, valeCreado: true, descripcion: `VALE ${nombre}`.trim(), fecha: vale.fecha, userId,
      });

      await qr.commitTransaction();
      return { vale: valeSaved, egreso };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ─── Pagar un vale YA existente (SOLICITADO) desde el cajón ──────────────────
  ipcMain.handle('pagar-vale-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PDV_PAGAR_VALE');
    if (!data?.valeId) throw new Error('Vale requerido.');

    const caja = await validarCaja(_event, Number(data.cajaId));
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const vale = await qr.manager.findOne(Vale, {
        where: { id: Number(data.valeId) },
        relations: ['funcionario', 'funcionario.persona', 'moneda'],
      });
      if (!vale) throw new Error(`Vale ${data.valeId} no encontrado.`);
      if (vale.estado !== ValeEstado.SOLICITADO) {
        throw new Error(`El vale está en estado ${vale.estado}, no se puede pagar.`);
      }
      const formaPago = await validarFormaPagoEfectivo(qr, Number(data.formaPagoId));
      const monto = Number(vale.monto);
      const monedaId = vale.moneda?.id;
      if (!monedaId) throw new Error('El vale no tiene moneda.');

      const userEntity = userId ? await qr.manager.findOne(Usuario, { where: { id: userId } }) : null;
      // Guard anti doble-pago: solo confirma si sigue SOLICITADO (dos requests
      // casi simultáneas no generan dos egresos). Si 0 filas, otro ya lo pagó.
      const upd = await qr.manager.getRepository(Vale)
        .createQueryBuilder()
        .update(Vale)
        .set({ estado: ValeEstado.CONFIRMADO, formaPago: { id: formaPago.id } as any, autorizadoPor: userEntity || null })
        .where('id = :id AND estado = :estado', { id: vale.id, estado: ValeEstado.SOLICITADO })
        .execute();
      if (!upd.affected) throw new Error('El vale ya fue pagado o cambió de estado.');
      // Refleja el nuevo estado en el objeto que se devuelve.
      vale.estado = ValeEstado.CONFIRMADO;
      vale.formaPago = { id: formaPago.id } as any;

      const nombre = `${vale.funcionario?.persona?.nombre || ''} ${vale.funcionario?.persona?.apellido || ''}`.trim();
      const egreso = await crearEgresoCaja(qr, {
        caja, tipo: 'VALE', monto, monedaId, formaPagoId: formaPago.id,
        valeId: vale.id, valeCreado: false, descripcion: `VALE ${nombre}`.trim(), fecha: new Date(), userId,
      });

      await qr.commitTransaction();
      return { vale, egreso };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ─── Crear + pagar una compra SIMPLIFICADA desde el cajón ────────────────────
  ipcMain.handle('crear-compra-simplificada-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PDV_PAGAR_COMPRA');

    const caja = await validarCaja(_event, Number(data.cajaId));
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const currentUser = getCurrentUser();
      const deviceId = resolveRequestDeviceId(_event);
      const monedaId = Number(data.monedaId);
      const esMixto = Array.isArray(data.lineas) && data.lineas.length > 0;
      const fecha = parseLocalDate(data.fechaCompra) || new Date();

      // Compra desde el PdV: siempre contado, sin pago a Caja Mayor.
      const { compraId, cuotaId, total } = await crearCompraSimplificadaTx(
        qr, { ...data, credito: false, pagarAhora: false, fuente: 'EFECTIVO' }, userId, deviceId,
      );

      const descripcion = `COMPRA #${compraId} ${data.proveedorNombre || ''}`.trim();
      let egreso: EgresoCaja | null = null;
      if (esMixto) {
        await aplicarPagoMixtoCajaCuota(qr, {
          caja, cuotaId, cuotaNumero: 1, cppMonedaId: monedaId, saldo: total,
          lineas: data.lineas, descripcion, fecha, userId,
        }, currentUser);
      } else {
        const formaPago = await validarFormaPagoEfectivo(qr, Number(data.formaPagoId));
        // Marca la cuota como pagada (estado de dominio) sin asentar en Caja Mayor.
        await aplicarEstadoPagoCuota(qr, cuotaId, total, currentUser, dataSource);
        egreso = await crearEgresoCaja(qr, {
          caja, tipo: 'COMPRA', monto: total, monedaId, formaPagoId: formaPago.id,
          cuentaPorPagarCuotaId: cuotaId, descripcion, fecha, userId,
        });
      }

      await qr.commitTransaction();
      return { compraId, cuotaId, egreso };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ─── Pagar una cuota de compra YA existente desde el cajón ───────────────────
  ipcMain.handle('pagar-compra-cuota-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PDV_PAGAR_COMPRA');
    if (!data?.cuotaId) throw new Error('Cuota requerida.');

    const caja = await validarCaja(_event, Number(data.cajaId));
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const currentUser = getCurrentUser();

      const cuota = await qr.manager.findOne(CuentaPorPagarCuota, {
        where: { id: Number(data.cuotaId) },
        relations: ['cuentaPorPagar', 'cuentaPorPagar.moneda'],
      });
      if (!cuota) throw new Error(`Cuota ${data.cuotaId} no encontrada.`);
      const cpp = cuota.cuentaPorPagar as any;
      if (cpp?.tipo !== CuentaPorPagarTipo.COMPRA) {
        throw new Error('Solo se pueden pagar cuotas de compras desde el PdV.');
      }
      const monedaId = cpp?.moneda?.id;
      if (!monedaId) throw new Error('La cuota no tiene moneda.');
      const saldo = +(Number(cuota.monto) - Number(cuota.montoPagado)).toFixed(2);
      const esMixto = Array.isArray(data.lineas) && data.lineas.length > 0;
      const descripcion = `PAGO CUOTA #${cuota.numero} CPP #${cpp.id}`;

      let egreso: EgresoCaja | null = null;
      if (esMixto) {
        await aplicarPagoMixtoCajaCuota(qr, {
          caja, cuotaId: cuota.id, cuotaNumero: cuota.numero, cppMonedaId: monedaId, saldo,
          lineas: data.lineas, descripcion, fecha: new Date(), userId,
        }, currentUser);
      } else {
        const formaPago = await validarFormaPagoEfectivo(qr, Number(data.formaPagoId));
        const monto = data.monto != null ? +Number(data.monto).toFixed(2) : saldo;
        if (monto <= 0 || monto > saldo + 0.005) {
          throw new Error(`Monto inválido (saldo pendiente: ${saldo}).`);
        }
        await aplicarEstadoPagoCuota(qr, cuota.id, monto, currentUser, dataSource);
        egreso = await crearEgresoCaja(qr, {
          caja, tipo: 'COMPRA', monto, monedaId, formaPagoId: formaPago.id,
          cuentaPorPagarCuotaId: cuota.id, descripcion, fecha: new Date(), userId,
        });
      }

      await qr.commitTransaction();
      return { cuotaId: cuota.id, egreso };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ─── Anular un egreso: revierte el dominio + marca el egreso ANULADO ─────────
  ipcMain.handle('anular-egreso-caja', async (_event, egresoId: number, motivo?: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'PDV_ANULAR_EGRESO');
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const currentUser = getCurrentUser();
      const egreso = await qr.manager.findOne(EgresoCaja, {
        where: { id: Number(egresoId) }, relations: ['caja'],
      });
      if (!egreso) throw new Error(`Egreso ${egresoId} no encontrado.`);
      if (egreso.estado !== 'ACTIVO') throw new Error('El egreso ya está anulado.');

      // Solo con caja abierta (no alterar el esperado de una caja cerrada).
      await validarCaja(_event, (egreso.caja as any)?.id);

      if (egreso.tipo === 'VALE' && egreso.valeId) {
        const vale = await qr.manager.findOne(Vale, { where: { id: egreso.valeId } });
        if (vale) {
          if (vale.estado === ValeEstado.DESCONTADO) {
            throw new Error('El vale ya fue descontado en una liquidación; no se puede anular.');
          }
          // Si el egreso creó el vale → se anula. Si solo pagó un vale ya
          // solicitado → el vale vuelve a SOLICITADO (queda pendiente de pago).
          vale.estado = egreso.valeCreado ? ValeEstado.ANULADO : ValeEstado.SOLICITADO;
          (vale as any).formaPago = null;
          await setEntityUserTracking(dataSource, vale, userId, true);
          await qr.manager.save(Vale, vale);
        }
      } else if (egreso.tipo === 'COMPRA' && egreso.cuentaPorPagarCuotaId) {
        // Des-paga SOLO el monto de este egreso (respeta otros pagos parciales).
        // Si el egreso es una linea de pago mixto, revertir por el monto convertido
        // a la moneda del CPP (no por el monto en la moneda de la linea).
        const det = await qr.manager.getRepository(PagoCuotaCppDetalle).findOne({ where: { egresoCajaId: egreso.id } });
        const montoRevertir = det ? Number(det.montoCpp) : Number(egreso.monto);
        await revertirEstadoPagoCuota(qr, egreso.cuentaPorPagarCuotaId, montoRevertir, currentUser, dataSource);
        if (det) await qr.manager.remove(PagoCuotaCppDetalle, det);
      }

      egreso.estado = 'ANULADO';
      egreso.motivoAnulacion = (motivo || '').toUpperCase().trim() || undefined;
      await setEntityUserTracking(dataSource, egreso, userId, true);
      await qr.manager.save(EgresoCaja, egreso);

      await qr.commitTransaction();
      return { success: true };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ─── Lecturas ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-egresos-caja', async (_event, cajaId: number, incluirAnulados?: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
    const where: any = { caja: { id: cajaId } };
    if (!incluirAnulados) where.estado = 'ACTIVO';
    return await dataSource.getRepository(EgresoCaja).find({
      where,
      relations: ['moneda', 'formaPago', 'createdBy', 'createdBy.persona'],
      order: { fecha: 'DESC', id: 'DESC' } as any,
    });
  });

  ipcMain.handle('get-vales-pendientes-funcionario', async (_event, funcionarioId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    return await dataSource.getRepository(Vale).find({
      where: { funcionario: { id: funcionarioId }, estado: ValeEstado.SOLICITADO } as any,
      relations: ['funcionario', 'funcionario.persona', 'moneda', 'motivo'],
      order: { fecha: 'DESC', id: 'DESC' } as any,
    });
  });

  // Helper: crea la fila EgresoCaja dentro de la transacción.
  async function crearEgresoCaja(qr: any, p: {
    caja: Caja; tipo: string; monto: number; monedaId: number; formaPagoId: number;
    valeId?: number; valeCreado?: boolean; cuentaPorPagarCuotaId?: number; descripcion: string; fecha: Date; userId?: number;
  }): Promise<EgresoCaja> {
    const egreso = qr.manager.create(EgresoCaja, {
      caja: { id: p.caja.id } as any,
      tipo: p.tipo,
      monto: p.monto,
      moneda: { id: p.monedaId } as any,
      formaPago: { id: p.formaPagoId } as any,
      valeId: p.valeId ?? null,
      valeCreado: p.valeCreado === true,
      cuentaPorPagarCuotaId: p.cuentaPorPagarCuotaId ?? null,
      descripcion: (p.descripcion || '').toUpperCase().slice(0, 255),
      fecha: p.fecha,
      estado: 'ACTIVO',
    });
    await setEntityUserTracking(dataSource, egreso, p.userId, false);
    return await qr.manager.save(EgresoCaja, egreso);
  }
}
