import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CajaMayor } from '../../src/app/database/entities/financiero/caja-mayor.entity';
import { CajaMayorSaldo } from '../../src/app/database/entities/financiero/caja-mayor-saldo.entity';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { CajaMayorConfiguracion } from '../../src/app/database/entities/financiero/caja-mayor-configuracion.entity';
import { AcreditacionPos } from '../../src/app/database/entities/financiero/acreditacion-pos.entity';
import { AcreditacionPosEstado } from '../../src/app/database/entities/financiero/banking-enums';
import { GastoCategoria } from '../../src/app/database/entities/financiero/gasto-categoria.entity';
import { Gasto } from '../../src/app/database/entities/financiero/gasto.entity';
import { GastoDetalle } from '../../src/app/database/entities/financiero/gasto-detalle.entity';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaDetalle } from '../../src/app/database/entities/financiero/retiro-caja-detalle.entity';
import { EntradaVariaCategoria } from '../../src/app/database/entities/financiero/entrada-varia-categoria.entity';
import { EntradaVaria } from '../../src/app/database/entities/financiero/entrada-varia.entity';
import { OperacionFinancieraCategoria } from '../../src/app/database/entities/financiero/operacion-financiera-categoria.entity';
import { OperacionFinanciera } from '../../src/app/database/entities/financiero/operacion-financiera.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { CajaMayorEstado, TipoMovimiento, GastoEstado, GastoDestinoTipo, RetiroCajaEstado, RetiroCajaOrigen } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { Conteo } from '../../src/app/database/entities/financiero/conteo.entity';
import { ConteoDetalle } from '../../src/app/database/entities/financiero/conteo-detalle.entity';
import { MonedaBillete } from '../../src/app/database/entities/financiero/moneda-billete.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { TipoOperacionFinanciera, DiferenciaDestinoTipo } from '../../src/app/database/entities/financiero/operaciones-financieras-enums';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { esIngreso, actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { ensurePermission, getEffectiveUser } from '../utils/auth.utils';
import { getMovimientosBancariosUnificados } from '../utils/movimientos-bancarios';
import { dispatchEvento } from '../services/notificacion.service';

// Alias local para mantener firma legacy de actualizarSaldo
const actualizarSaldo = actualizarSaldoCajaMayor;

/**
 * Arma y despacha el resumen de cierre de caja por las notificaciones
 * configuradas (WhatsApp/email). No debe romper el cierre si falla el envio.
 */
async function notificarCierreCajaMayor(dataSource: DataSource, cajaId: number): Promise<void> {
  try {
    const repo = dataSource.getRepository(CajaMayor);
    const caja = await repo.findOne({
      where: { id: cajaId },
      relations: ['responsable', 'responsable.persona', 'saldos', 'saldos.moneda', 'saldos.formaPago'],
    });
    if (!caja) return;

    const responsable = caja.responsable?.persona?.nombre || caja.responsable?.nickname || '-';
    const fmtFecha = (d?: Date) => (d ? new Date(d).toLocaleString('es-PY') : '-');
    const fmtNum = (n: any) => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 });

    const saldos = (caja.saldos || []).filter((s: any) => Number(s.saldo) !== 0);
    const lineasSaldos = saldos.length
      ? saldos
          .map((s: any) => `• ${s.moneda?.simbolo || ''} ${s.formaPago?.nombre || '-'}: ${fmtNum(s.saldo)}`)
          .join('\n')
      : '• (sin saldos)';

    const texto =
      `🧾 *CIERRE DE CAJA MAYOR*\n` +
      `Caja: ${caja.nombre}\n` +
      `Responsable: ${responsable}\n` +
      `Apertura: ${fmtFecha(caja.fechaApertura)}\n` +
      `Cierre: ${fmtFecha(caja.fechaCierre)}\n\n` +
      `*Saldos:*\n${lineasSaldos}`;

    const html =
      `<h3>🧾 Cierre de Caja Mayor</h3>` +
      `<p><b>Caja:</b> ${caja.nombre}<br>` +
      `<b>Responsable:</b> ${responsable}<br>` +
      `<b>Apertura:</b> ${fmtFecha(caja.fechaApertura)}<br>` +
      `<b>Cierre:</b> ${fmtFecha(caja.fechaCierre)}</p>` +
      `<p><b>Saldos:</b></p><ul>` +
      (saldos.length
        ? saldos.map((s: any) => `<li>${s.moneda?.simbolo || ''} ${s.formaPago?.nombre || '-'}: ${fmtNum(s.saldo)}</li>`).join('')
        : '<li>(sin saldos)</li>') +
      `</ul>`;

    await dispatchEvento('CAJA_CIERRE', {
      asunto: `CIERRE DE CAJA: ${caja.nombre}`,
      texto,
      html,
      dedupeKey: `caja-${caja.id}`,
    });
  } catch (e) {
    console.warn('[caja-mayor] no se pudo notificar el cierre:', (e as Error).message);
  }
}

export function registerCajaMayorHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {

  // Anula una operacion financiera completa DENTRO de una transaccion ya abierta:
  // marca la OperacionFinanciera como anulada, revierte TODOS sus movimientos de
  // caja (ej. los dos lados de un cambio de divisa) y revierte el saldo bancario
  // cuando aplica (deposito/retiro). Reusado por anular-operacion-financiera y por
  // anular-caja-mayor-movimiento (cuando el movimiento pertenece a una operacion).
  const anularOperacionFinancieraTx = async (
    queryRunner: any,
    opId: number,
    motivo: string,
    currentUser: Usuario | null,
  ): Promise<void> => {
    const opRepo = queryRunner.manager.getRepository(OperacionFinanciera);
    const op = await opRepo.findOne({
      where: { id: opId },
      relations: ['cuentaBancariaOrigen', 'cuentaBancariaDestino'],
    });
    if (!op) throw new Error(`OperacionFinanciera ${opId} no encontrada`);
    if (op.anulado) throw new Error('La operacion ya esta anulada');

    op.anulado = true;
    await setEntityUserTracking(dataSource, op, currentUser?.id, true);
    await queryRunner.manager.save(OperacionFinanciera, op);

    const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
    const movs = await movRepo.find({
      where: { operacionFinancieraId: opId },
      relations: ['cajaMayor', 'moneda', 'formaPago'],
    });

    for (const mov of movs) {
      if (mov.tipoMovimiento === TipoMovimiento.ANULACION) continue;
      // No re-anular un movimiento que ya tiene su contra-movimiento.
      const yaAnulado = await movRepo.findOne({ where: { referenciaAnulacion: { id: mov.id } as any } });
      if (yaAnulado) continue;

      const contra = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: mov.cajaMayor,
        tipoMovimiento: TipoMovimiento.ANULACION,
        moneda: mov.moneda,
        formaPago: mov.formaPago,
        monto: mov.monto,
        fecha: new Date(),
        observacion: `ANULACION OP. FIN. #${opId}: ${motivo}`.toUpperCase(),
        operacionFinancieraId: opId,
        referenciaAnulacion: mov,
      });
      if (currentUser) contra.responsable = currentUser;
      await setEntityUserTracking(dataSource, contra, currentUser?.id, false);
      await queryRunner.manager.save(CajaMayorMovimiento, contra);

      const tipoContrario = esIngreso(mov.tipoMovimiento)
        ? TipoMovimiento.AJUSTE_NEGATIVO
        : TipoMovimiento.AJUSTE_POSITIVO;
      await actualizarSaldo(queryRunner, mov.cajaMayor.id, mov.moneda.id, mov.formaPago.id, Number(mov.monto), tipoContrario);
    }

    const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
    if (op.tipoOperacion === TipoOperacionFinanciera.DEPOSITO_BANCARIO && op.cuentaBancariaDestino) {
      const cb = await cbRepo.findOne({ where: { id: op.cuentaBancariaDestino.id } });
      if (cb) {
        cb.saldo = Number(cb.saldo) - Number(op.montoDestino || 0);
        await queryRunner.manager.save(CuentaBancaria, cb);
      }
    } else if (op.tipoOperacion === TipoOperacionFinanciera.RETIRO_BANCARIO && op.cuentaBancariaOrigen) {
      const cb = await cbRepo.findOne({ where: { id: op.cuentaBancariaOrigen.id } });
      if (cb) {
        cb.saldo = Number(cb.saldo) + Number(op.montoOrigen || 0);
        await queryRunner.manager.save(CuentaBancaria, cb);
      }
    }
  };

  // ===================== CAJA MAYOR CRUD =====================

  ipcMain.handle('get-cajas-mayor', async () => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      return await repo.find({
        relations: ['responsable', 'responsable.persona', 'saldos', 'saldos.moneda', 'saldos.formaPago'],
        order: { fechaApertura: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting cajas mayor:', error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-mayor', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      return await repo.findOne({
        where: { id },
        relations: ['responsable', 'responsable.persona', 'saldos', 'saldos.moneda', 'saldos.formaPago'],
      });
    } catch (error) {
      console.error(`Error getting caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-mayor', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMayor);
      const entity = repo.create({
        ...data,
        fechaApertura: new Date(),
        estado: CajaMayorEstado.ABIERTA,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja mayor:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja-mayor', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMayor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja Mayor ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cerrar-caja-mayor', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMayor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja Mayor ID ${id} not found`);
      entity.estado = CajaMayorEstado.CERRADA;
      entity.fechaCierre = new Date();
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);
      // Notificar el cierre (no bloquea ni rompe el cierre si falla el envio).
      notificarCierreCajaMayor(dataSource, id).catch(() => undefined);
      return saved;
    } catch (error) {
      console.error(`Error cerrando caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  // ===================== CAJA MAYOR SALDOS =====================

  ipcMain.handle('get-caja-mayor-saldos', async (_event: any, cajaMayorId: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayorSaldo);
      return await repo.find({
        where: { cajaMayor: { id: cajaMayorId } },
        relations: ['moneda', 'formaPago'],
        order: { moneda: { denominacion: 'ASC' } },
      });
    } catch (error) {
      console.error(`Error getting saldos for caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('recalcular-saldos', async (_event: any, cajaMayorId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Eliminar saldos actuales
      await queryRunner.manager.delete(CajaMayorSaldo, { cajaMayor: { id: cajaMayorId } });

      // Recalcular desde movimientos (excluyendo anulados)
      const movimientos = await queryRunner.manager.find(CajaMayorMovimiento, {
        where: { cajaMayor: { id: cajaMayorId } },
        relations: ['moneda', 'formaPago'],
      });

      // Agrupar por moneda+formaPago
      const saldosMap = new Map<string, { monedaId: number; formaPagoId: number; saldo: number }>();
      for (const mov of movimientos) {
        // Saltar movimientos que fueron anulados (tienen un contra-movimiento apuntando a ellos)
        const key = `${mov.moneda.id}-${mov.formaPago.id}`;
        if (!saldosMap.has(key)) {
          saldosMap.set(key, { monedaId: mov.moneda.id, formaPagoId: mov.formaPago.id, saldo: 0 });
        }
        const entry = saldosMap.get(key)!;
        const delta = esIngreso(mov.tipoMovimiento) ? Number(mov.monto) : -Number(mov.monto);
        entry.saldo += delta;
      }

      // Crear saldos recalculados
      for (const entry of saldosMap.values()) {
        const saldo = queryRunner.manager.create(CajaMayorSaldo, {
          cajaMayor: { id: cajaMayorId },
          moneda: { id: entry.monedaId },
          formaPago: { id: entry.formaPagoId },
          saldo: entry.saldo,
        });
        await queryRunner.manager.save(CajaMayorSaldo, saldo);
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error recalculando saldos caja mayor ${cajaMayorId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== CAJA MAYOR MOVIMIENTOS =====================

  ipcMain.handle('get-caja-mayor-movimientos', async (_event: any, cajaMayorId: number, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(CajaMayorMovimiento);
      const qb = repo.createQueryBuilder('mov')
        .leftJoinAndSelect('mov.moneda', 'moneda')
        .leftJoinAndSelect('mov.formaPago', 'formaPago')
        .leftJoinAndSelect('mov.responsable', 'responsable')
        .leftJoinAndSelect('responsable.persona', 'persona')
        .leftJoinAndSelect('mov.gasto', 'gasto')
        .leftJoinAndSelect('gasto.proveedor', 'proveedor')
        .leftJoinAndSelect('mov.retiroCaja', 'retiroCaja')
        .leftJoinAndSelect('mov.referenciaAnulacion', 'referenciaAnulacion')
        .where('mov.caja_mayor_id = :cajaMayorId', { cajaMayorId })
        .orderBy('mov.fecha', 'DESC')
        .addOrderBy('mov.id', 'DESC');

      if (filtros?.fechaDesde) {
        qb.andWhere('mov.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde });
      }
      if (filtros?.fechaHasta) {
        qb.andWhere('mov.fecha <= :fechaHasta', { fechaHasta: filtros.fechaHasta });
      }
      if (filtros?.tipoMovimiento) {
        qb.andWhere('mov.tipo_movimiento = :tipo', { tipo: filtros.tipoMovimiento });
      }
      if (filtros?.responsableId) {
        qb.andWhere('mov.responsable_id = :responsableId', { responsableId: filtros.responsableId });
      }
      if (filtros?.proveedorId) {
        qb.andWhere('gasto.proveedor_id = :proveedorId', { proveedorId: filtros.proveedorId });
      }
      // Por defecto se ocultan las contra-anulaciones; el original se decora con info de su anulacion.
      if (!filtros?.incluirAnulaciones) {
        qb.andWhere('mov.referencia_anulacion_id IS NULL');
      }

      // Decora cada item con info de su anulacion (si fue anulado).
      const decorar = async (items: any[]) => {
        if (!items.length) return items;
        const ids = items.map((m: any) => m.id);
        const anulaciones = await repo.createQueryBuilder('a')
          .leftJoinAndSelect('a.responsable', 'r')
          .leftJoinAndSelect('r.persona', 'p')
          .loadRelationIdAndMap('a.referenciaAnulacionId', 'a.referenciaAnulacion')
          .where('a.referencia_anulacion_id IN (:...ids)', { ids })
          .getMany();
        const byOrigId = new Map<number, any>();
        for (const a of anulaciones) {
          const origId = (a as any).referenciaAnulacionId;
          if (!origId) continue;
          byOrigId.set(origId, {
            id: a.id,
            fecha: a.fecha,
            motivo: ((a as any).observacion || '').replace(/^ANULACION:\s*/i, '').trim(),
            responsableNombre:
              (a as any).responsable?.persona?.nombre ||
              (a as any).responsable?.nickname ||
              null,
          });
        }
        for (const m of items) {
          (m as any).anulacion = byOrigId.get(m.id) || null;
        }
        return items;
      };

      // Paginacion (devuelve { items, total } cuando se pasa pageSize)
      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        await decorar(items);
        return { items, total };
      }

      const items = await qb.getMany();
      await decorar(items);
      return items;
    } catch (error) {
      console.error(`Error getting movimientos for caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  // ===================== MOVIMIENTOS CONSOLIDADOS (CAJA + BANCOS) =====================

  // Etiquetas humanizadas para el panel financiero consolidado.
  const tipoLabelCaja: Record<string, string> = {
    INGRESO_RETIRO_CAJA: 'Retiro de Caja (entrada)',
    INGRESO_CIERRE_CAJA: 'Cierre de Caja',
    INGRESO_ENTRADA_VARIA: 'Entrada Varia',
    INGRESO_OPERACION_FINANCIERA: 'Operacion Financiera (entrada)',
    INGRESO_RETIRO_BANCO: 'Retiro de Banco',
    INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO: 'Cobro cuota prestamo func.',
    INGRESO_COBRO_CUENTA_POR_COBRAR: 'Cobro cuenta por cobrar',
    TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
    AJUSTE_POSITIVO: 'Ajuste (+)',
    EGRESO_GASTO: 'Gasto',
    EGRESO_COMPRA: 'Compra',
    EGRESO_CUOTA_COMPRA: 'Cuota compra',
    EGRESO_CUOTA_PRESTAMO: 'Cuota prestamo',
    EGRESO_VALE: 'Vale',
    EGRESO_SALARIO: 'Salario',
    EGRESO_CHEQUE: 'Cheque',
    EGRESO_OPERACION_FINANCIERA: 'Operacion Financiera (salida)',
    EGRESO_DEPOSITO_BANCO: 'Deposito a Banco',
    EGRESO_CAJA_INICIAL: 'Caja Inicial (salida)',
    EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO: 'Desembolso prestamo func.',
    TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
    AJUSTE_NEGATIVO: 'Ajuste (-)',
    ANULACION: 'Anulacion',
  };
  const tipoLabelBanco: Record<string, string> = {
    MANUAL: 'Ajuste manual',
    ENTRADA_MANUAL: 'Entrada manual',
    SALIDA_MANUAL: 'Salida manual',
    AJUSTE_POSITIVO: 'Ajuste (+)',
    AJUSTE_NEGATIVO: 'Ajuste (-)',
    CHEQUE_COBRADO: 'Cheque cobrado',
    DEPOSITO: 'Deposito bancario',
    RETIRO: 'Retiro bancario',
    ENTRADA_VARIA: 'Entrada Varia',
    GASTO: 'Gasto',
    VALE: 'Vale',
    COBRO_CLIENTE: 'Cobro cliente',
  };

  // Agrupa los CajaMayorMovimiento crudos en filas unificadas (un gasto/retiro con
  // varias monedas/formas de pago colapsa a una fila con N detalles). Portado de
  // consolidarMovimientos() del componente.
  const consolidarCaja = (movimientos: any[]): any[] => {
    const grupos = new Map<string, any>();
    const ordenados = [...movimientos].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );
    for (const mov of ordenados) {
      const gastoId = mov.gasto?.id;
      const retiroCajaId = mov.retiroCaja?.id;
      const conteoId = mov.conteo?.id;
      const isAnulacion = mov.tipoMovimiento === 'ANULACION';
      const contraDeId = mov.referenciaAnulacion?.id;
      // El egreso de caja inicial genera un movimiento por moneda con el mismo
      // conteo; se agrupan en una sola fila para poder "abrir caja con este conteo".
      const key = gastoId ? `gasto-${gastoId}` :
                  retiroCajaId ? `retiro-${retiroCajaId}` :
                  conteoId ? `conteo-${conteoId}` :
                  `mov-${mov.id}`;

      if (isAnulacion && (gastoId || retiroCajaId) && grupos.has(key)) {
        const grupo = grupos.get(key);
        grupo.esAnulacion = true;
        grupo.movimientoIds.push(mov.id);
        continue;
      }

      const detalle = {
        monedaSimbolo: mov.moneda?.simbolo || '-',
        formaPagoNombre: mov.formaPago?.nombre || '-',
        monto: Number(mov.monto),
      };

      if (grupos.has(key)) {
        const grupo = grupos.get(key);
        grupo.detalles.push(detalle);
        grupo.movimientoIds.push(mov.id);
      } else {
        const tipo: string = mov.tipoMovimiento || '';
        const ingreso = tipo.startsWith('INGRESO') || tipo.startsWith('AJUSTE_POS') || tipo === 'TRANSFERENCIA_ENTRADA';
        grupos.set(key, {
          fuente: 'CAJA',
          fuenteLabel: 'CAJA MAYOR',
          fuenteCuentaId: undefined,
          fecha: mov.fecha,
          tipoMovimiento: tipo,
          tipoLabel: tipoLabelCaja[tipo] || tipo,
          tipoIsIngreso: ingreso,
          detalles: [detalle],
          responsableNombre: mov.responsable?.persona?.nombre || mov.responsable?.nickname || '-',
          observacion: mov.observacion || '-',
          anulado: !!mov.anulacion,
          origen: '',
          gastoId,
          retiroCajaId,
          conteoId,
          movimientoIds: [mov.id],
          esAnulacion: isAnulacion || !!contraDeId,
          anulacion: mov.anulacion || null,
          contraDeId: contraDeId || undefined,
        });
      }
    }
    return Array.from(grupos.values());
  };

  ipcMain.handle('get-movimientos-caja-mayor-consolidados', async (_event: any, cajaMayorId: number, filtros?: any) => {
    try {
      const fuente: string = filtros?.fuente || 'TODO'; // 'TODO' | 'CAJA' | 'BANCO' | '<accountId>'
      const cuentasVisibles: number[] = (filtros?.cuentasBancariasIds || []).map((n: any) => Number(n));
      const incluirCaja = fuente === 'TODO' || fuente === 'CAJA';
      const fuenteEsCuenta = fuente !== 'TODO' && fuente !== 'CAJA' && fuente !== 'BANCO';
      const incluirBanco = fuente === 'TODO' || fuente === 'BANCO' || fuenteEsCuenta;

      let unificados: any[] = [];

      // ---- Rama caja ----
      if (incluirCaja) {
        const repo = dataSource.getRepository(CajaMayorMovimiento);
        const qb = repo.createQueryBuilder('mov')
          .leftJoinAndSelect('mov.moneda', 'moneda')
          .leftJoinAndSelect('mov.formaPago', 'formaPago')
          .leftJoinAndSelect('mov.responsable', 'responsable')
          .leftJoinAndSelect('responsable.persona', 'persona')
          .leftJoinAndSelect('mov.gasto', 'gasto')
          .leftJoinAndSelect('gasto.proveedor', 'proveedor')
          .leftJoinAndSelect('mov.retiroCaja', 'retiroCaja')
          .leftJoinAndSelect('mov.conteo', 'conteo')
          .leftJoinAndSelect('mov.referenciaAnulacion', 'referenciaAnulacion')
          .where('mov.caja_mayor_id = :cajaMayorId', { cajaMayorId })
          .orderBy('mov.fecha', 'DESC')
          .addOrderBy('mov.id', 'DESC');
        if (filtros?.fechaDesde) qb.andWhere('mov.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde });
        if (filtros?.fechaHasta) qb.andWhere('mov.fecha <= :fechaHasta', { fechaHasta: filtros.fechaHasta });
        if (filtros?.responsableId) qb.andWhere('mov.responsable_id = :responsableId', { responsableId: filtros.responsableId });
        if (filtros?.proveedorId) qb.andWhere('gasto.proveedor_id = :proveedorId', { proveedorId: filtros.proveedorId });
        if (!filtros?.incluirAnulaciones) qb.andWhere('mov.referencia_anulacion_id IS NULL');

        const cajaItems = await qb.getMany();

        // Decorar con info de anulacion
        if (cajaItems.length) {
          const ids = cajaItems.map((m: any) => m.id);
          const anulaciones = await repo.createQueryBuilder('a')
            .leftJoinAndSelect('a.responsable', 'r')
            .leftJoinAndSelect('r.persona', 'p')
            .loadRelationIdAndMap('a.referenciaAnulacionId', 'a.referenciaAnulacion')
            .where('a.referencia_anulacion_id IN (:...ids)', { ids })
            .getMany();
          const byOrigId = new Map<number, any>();
          for (const a of anulaciones) {
            const origId = (a as any).referenciaAnulacionId;
            if (!origId) continue;
            byOrigId.set(origId, {
              id: a.id,
              fecha: a.fecha,
              motivo: ((a as any).observacion || '').replace(/^ANULACION:\s*/i, '').trim(),
              responsableNombre: (a as any).responsable?.persona?.nombre || (a as any).responsable?.nickname || null,
            });
          }
          for (const m of cajaItems) (m as any).anulacion = byOrigId.get(m.id) || null;
        }

        // Mapear a la forma esperada por consolidarCaja (gasto/retiro/referenciaAnulacion como objetos)
        const mapped = cajaItems.map((m: any) => ({
          id: m.id,
          fecha: m.fecha,
          tipoMovimiento: m.tipoMovimiento,
          monto: m.monto,
          moneda: m.moneda,
          formaPago: m.formaPago,
          responsable: m.responsable,
          observacion: m.observacion,
          gasto: m.gasto,
          retiroCaja: m.retiroCaja,
          conteo: m.conteo,
          referenciaAnulacion: m.referenciaAnulacion,
          anulacion: (m as any).anulacion,
        }));
        unificados = unificados.concat(consolidarCaja(mapped));
      }

      // ---- Rama banco ----
      if (incluirBanco) {
        const accountIds = fuenteEsCuenta ? [Number(fuente)] : cuentasVisibles;
        if (accountIds.length > 0) {
          const bancoItems = await getMovimientosBancariosUnificados(dataSource, accountIds, {
            excludePos: true,
            stampFuente: true,
            fechaDesde: filtros?.fechaDesde,
            fechaHasta: filtros?.fechaHasta,
          });
          for (const b of bancoItems) {
            unificados.push({
              fuente: 'BANCO',
              fuenteLabel: b.fuenteLabel || 'BANCO',
              fuenteCuentaId: b.fuenteCuentaId,
              fecha: b.fecha,
              tipoMovimiento: b.tipo,
              tipoLabel: tipoLabelBanco[b.tipo] || b.tipo,
              tipoIsIngreso: b.esIngreso,
              detalles: [{ monedaSimbolo: b.monedaSimbolo || '', formaPagoNombre: undefined, monto: Number(b.monto) }],
              responsableNombre: b.responsable || '-',
              observacion: b.descripcion || '-',
              anulado: !!b.anulado,
              origen: b.origen,
              movimientoIds: [b.id],
              esAnulacion: false,
              anulacion: null,
              contraDeId: undefined,
            });
          }
        }
      }

      // ---- Filtros transversales ----
      if (filtros?.esIngreso !== undefined && filtros?.esIngreso !== null) {
        unificados = unificados.filter((i) => i.tipoIsIngreso === filtros.esIngreso);
      }
      if (filtros?.origen) {
        unificados = unificados.filter((i) => i.origen === filtros.origen);
      }

      // Orden por fecha desc
      unificados.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      // Paginacion
      const total = unificados.length;
      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        return { items: unificados.slice(page * pageSize, (page + 1) * pageSize), total };
      }
      return { items: unificados, total };
    } catch (error) {
      console.error(`Error getting movimientos consolidados for caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-mayor-movimiento', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        ...data,
        fecha: data.fecha || new Date(),
      });

      const currentUser = getEffectiveUser(getCurrentUser);
      if (currentUser) {
        movimiento.responsable = currentUser;
      }
      await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);

      const savedMov = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

      // Actualizar saldo
      await actualizarSaldo(
        queryRunner,
        data.cajaMayor.id || data.cajaMayor,
        data.moneda.id || data.moneda,
        data.formaPago.id || data.formaPago,
        Number(data.monto),
        data.tipoMovimiento
      );

      await queryRunner.commitTransaction();
      return savedMov;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating caja mayor movimiento:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-caja-mayor-movimiento', async (_event: any, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const original = await repo.findOne({
        where: { id },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });
      if (!original) throw new Error(`Movimiento ID ${id} not found`);

      if (original.tipoMovimiento === TipoMovimiento.ANULACION) {
        throw new Error('No se puede anular un movimiento de tipo ANULACION');
      }

      // Bloquear anulacion directa de movimientos vinculados a otros modulos.
      // Estos deben anularse desde el modulo origen (que reverte estados cruzados).
      if (original.liquidacionSueldoId) {
        throw new Error(
          `Este movimiento corresponde a la liquidacion de sueldo #${original.liquidacionSueldoId}. ` +
          `Anular desde el modulo de Liquidaciones de Sueldo (revierte vales, cuotas CPP, aguinaldos y comisiones).`
        );
      }
      if (original.cuentaPorPagarCuotaId) {
        throw new Error(
          `Este movimiento corresponde al pago/cobro de la cuota CPP #${original.cuentaPorPagarCuotaId}. ` +
          `Anular desde el modulo de Cuentas por Pagar (revierte el estado de la cuota y el saldo del CPP).`
        );
      }
      if (original.valeId) {
        throw new Error(
          `Este movimiento corresponde al vale #${original.valeId}. ` +
          `Anular desde el modulo de Vales.`
        );
      }
      if (original.liquidacionComisionId) {
        throw new Error(
          `Este movimiento corresponde a la liquidacion de comision #${original.liquidacionComisionId}. ` +
          `Anular desde el modulo de Comisiones.`
        );
      }
      if (original.cuentaPorCobrarCuotaId) {
        throw new Error(
          `Este movimiento corresponde al cobro de la cuota CPC #${original.cuentaPorCobrarCuotaId}. ` +
          `Anular desde el modulo de Cuentas por Cobrar.`
        );
      }
      if (original.cuentaPorPagarId) {
        throw new Error(
          `Este movimiento corresponde al desembolso del CPP #${original.cuentaPorPagarId}. ` +
          `Anular desde el modulo de Cuentas por Pagar (anula el CPP completo).`
        );
      }
      if (original.compraId) {
        throw new Error(
          `Este movimiento corresponde a la compra #${original.compraId}. ` +
          `Anular desde el modulo de Compras (revierte stock, costo y caja).`
        );
      }

      // Operacion financiera (ej. cambio de divisa): crea 2 movimientos vinculados
      // por el mismo operacionFinancieraId. Anular UNO debe anular la operacion
      // completa (ambos lados + saldo bancario si aplica), no solo este movimiento.
      if (original.operacionFinancieraId) {
        await anularOperacionFinancieraTx(queryRunner, original.operacionFinancieraId, motivo, getCurrentUser());
        await queryRunner.commitTransaction();
        return { success: true };
      }

      // Verificar si ya fue anulado previamente
      const yaAnulado = await repo.findOne({
        where: { referenciaAnulacion: { id: original.id } as any },
      });
      if (yaAnulado) {
        throw new Error(`El movimiento ID ${id} ya fue anulado previamente (anulacion ID ${yaAnulado.id})`);
      }

      // Crear contra-movimiento
      const contraMovimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: original.cajaMayor,
        tipoMovimiento: TipoMovimiento.ANULACION,
        moneda: original.moneda,
        formaPago: original.formaPago,
        monto: original.monto,
        fecha: new Date(),
        observacion: `ANULACION: ${motivo}`,
        referenciaAnulacion: original,
      });

      const currentUser = getEffectiveUser(getCurrentUser);
      if (currentUser) {
        contraMovimiento.responsable = currentUser;
      }
      await setEntityUserTracking(dataSource, contraMovimiento, currentUser?.id, false);

      await queryRunner.manager.save(CajaMayorMovimiento, contraMovimiento);

      // Revertir saldo: si el original era ingreso, el contra es egreso y viceversa
      const tipoContrario = esIngreso(original.tipoMovimiento)
        ? TipoMovimiento.AJUSTE_NEGATIVO  // para restar
        : TipoMovimiento.AJUSTE_POSITIVO; // para sumar

      await actualizarSaldo(
        queryRunner,
        original.cajaMayor.id,
        original.moneda.id,
        original.formaPago.id,
        Number(original.monto),
        tipoContrario
      );

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando movimiento ID ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== GASTO CATEGORIAS =====================

  ipcMain.handle('get-gasto-categorias', async () => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      return await repo.find({
        relations: ['padre', 'hijos'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting gasto categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-gasto-categoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['padre', 'hijos'],
      });
    } catch (error) {
      console.error(`Error getting gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-gasto-categoria', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating gasto categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-gasto-categoria', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`GastoCategoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-gasto-categoria', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`GastoCategoria ID ${id} not found`);
      // Soft delete
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  // ===================== GASTOS =====================

  ipcMain.handle('get-gastos', async (_event: any, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Gasto);
      const qb = repo.createQueryBuilder('gasto')
        .leftJoinAndSelect('gasto.gastoCategoria', 'gastoCategoria')
        .leftJoinAndSelect('gastoCategoria.padre', 'categoriaPadre')
        .leftJoinAndSelect('gasto.moneda', 'moneda')
        .leftJoinAndSelect('gasto.formaPago', 'formaPago')
        .leftJoinAndSelect('gasto.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('gasto.proveedor', 'proveedor')
        .leftJoinAndSelect('gasto.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('gasto.fecha', 'DESC');

      if (filtros?.fechaDesde) {
        qb.andWhere('gasto.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde });
      }
      if (filtros?.fechaHasta) {
        qb.andWhere('gasto.fecha <= :fechaHasta', { fechaHasta: filtros.fechaHasta });
      }
      if (filtros?.gastoCategoriaId) {
        qb.andWhere('gasto.gasto_categoria_id = :catId', { catId: filtros.gastoCategoriaId });
      }
      if (filtros?.estado) {
        qb.andWhere('gasto.estado = :estado', { estado: filtros.estado });
      }
      if (filtros?.cajaMayorId) {
        qb.andWhere('gasto.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting gastos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-gasto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Gasto);
      return await repo.findOne({
        where: { id },
        relations: ['gastoCategoria', 'gastoCategoria.padre', 'moneda', 'formaPago', 'cajaMayor', 'proveedor', 'createdBy', 'createdBy.persona', 'detalles', 'detalles.moneda', 'detalles.formaPago'],
      });
    } catch (error) {
      console.error(`Error getting gasto ID ${id}:`, error);
      throw error;
    }
  });

  // Crear gasto: transaccional (Gasto + GastoDetalles + CajaMayorMovimientos + actualizar saldos)
  // data.detalles = [{ monedaId, formaPagoId, monto, observacion? }]
  ipcMain.handle('create-gasto', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { detalles, fuente, cuentaBancariaId, montoCuentaBancaria, cotizacion, ...gastoData } = data;
      const cajaMayorId = gastoData.cajaMayor?.id || gastoData.cajaMayor;
      const destinoTipo = (gastoData.destinoTipo as GastoDestinoTipo) || GastoDestinoTipo.CAJA_MAYOR;
      const esBanco = fuente === 'CUENTA_BANCARIA';

      // ===== Rama CUENTA_BANCARIA: debita cuenta_bancaria.saldo, sin caja mayor =====
      if (destinoTipo === GastoDestinoTipo.CUENTA_BANCARIA) {
        const cuentaBancariaId = gastoData.cuentaBancaria?.id || gastoData.cuentaBancariaId;
        if (!cuentaBancariaId) throw new Error('cuentaBancariaId requerido para destino CUENTA_BANCARIA');
        const monto = Number(gastoData.monto);
        const monedaId = gastoData.moneda?.id || gastoData.monedaId;
        if (!monedaId) throw new Error('monedaId requerido');
        if (!(monto > 0)) throw new Error('monto debe ser mayor a 0');

        const gastoBanco = queryRunner.manager.create(Gasto, {
          ...gastoData,
          monto,
          moneda: { id: monedaId },
          formaPago: null,
          cuentaBancaria: { id: cuentaBancariaId },
          destinoTipo: GastoDestinoTipo.CUENTA_BANCARIA,
          estado: GastoEstado.PAGADO,
        });
        await setEntityUserTracking(dataSource, gastoBanco, getCurrentUser()?.id, false);
        const savedBanco = await queryRunner.manager.save(Gasto, gastoBanco);

        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = Number(cb.saldo) - monto;
        await queryRunner.manager.save(CuentaBancaria, cb);

        await queryRunner.commitTransaction();
        return savedBanco;
      }

      // ===== Rama CAJA_MAYOR (default): comportamiento histórico =====
      // Calcular monto total desde detalles
      const montoTotal = (detalles || []).reduce((sum: number, d: any) => sum + Number(d.monto), 0);
      // Monto debitado en la moneda de la cuenta (si difiere, viene convertido).
      const montoBanco = Number(montoCuentaBancaria) > 0 ? Number(montoCuentaBancaria) : montoTotal;

      // 1. Crear gasto (moneda y formaPago del primer detalle como referencia)
      const primerDetalle = detalles?.[0];
      const gasto = queryRunner.manager.create(Gasto, {
        ...gastoData,
        monto: montoTotal,
        moneda: primerDetalle ? { id: primerDetalle.monedaId } : null,
        formaPago: primerDetalle ? { id: primerDetalle.formaPagoId } : null,
        destinoTipo: GastoDestinoTipo.CAJA_MAYOR,
        cuentaBancariaId: esBanco ? Number(cuentaBancariaId) : null,
        montoCuentaBancaria: esBanco ? montoBanco : null,
        cotizacion: esBanco && cotizacion ? Number(cotizacion) : null,
        estado: GastoEstado.PAGADO,
      });
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, false);
      const savedGasto = await queryRunner.manager.save(Gasto, gasto);

      // 2. Crear detalles. Si es egreso por banco, debita la cuenta y NO genera
      // movimientos de Caja Mayor; si es caja mayor, crea un movimiento por detalle.
      const currentUser = getEffectiveUser(getCurrentUser);
      for (const det of detalles || []) {
        const monedaId = det.monedaId;
        const formaPagoId = det.formaPagoId;

        // Crear GastoDetalle
        const detalle = queryRunner.manager.create(GastoDetalle, {
          gasto: savedGasto,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto: det.monto,
          observacion: det.observacion || null,
        });
        await queryRunner.manager.save(GastoDetalle, detalle);

        if (esBanco) continue;

        // Crear CajaMayorMovimiento por cada detalle
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.EGRESO_GASTO,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto: det.monto,
          fecha: gastoData.fecha || new Date(),
          observacion: `GASTO: ${gastoData.descripcion || ''}`.toUpperCase(),
          gasto: savedGasto,
        });

        if (currentUser) {
          movimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        // Actualizar saldo
        await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(det.monto), TipoMovimiento.EGRESO_GASTO);
      }

      // Debitar la cuenta bancaria por el total (egreso por banco)
      if (esBanco) {
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: Number(cuentaBancariaId) } });
        if (!cb) throw new Error(`Cuenta bancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = Number(cb.saldo) - montoBanco;
        await queryRunner.manager.save(CuentaBancaria, cb);
      }

      await queryRunner.commitTransaction();
      return savedGasto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating gasto:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-gasto', async (_event: any, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const gastoRepo = queryRunner.manager.getRepository(Gasto);
      const gasto = await gastoRepo.findOne({
        where: { id },
        relations: ['cajaMayor', 'moneda', 'formaPago', 'cuentaBancaria'],
      });
      if (!gasto) throw new Error(`Gasto ID ${id} not found`);

      // Cancelar gasto
      gasto.estado = GastoEstado.CANCELADO;
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Gasto, gasto);

      // Si el gasto se pagó desde cuenta bancaria (vía destinoTipo de #46 o vía
      // cuentaBancariaId de develop): revertir el débito y salir.
      const gastoEsBanco =
        gasto.destinoTipo === GastoDestinoTipo.CUENTA_BANCARIA || !!gasto.cuentaBancariaId;
      if (gastoEsBanco) {
        const cbId = gasto.cuentaBancaria?.id || gasto.cuentaBancariaId;
        if (cbId) {
          const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: cbId } });
          if (cb) {
            const montoBanco = Number(gasto.montoCuentaBancaria) > 0 ? Number(gasto.montoCuentaBancaria) : Number(gasto.monto);
            cb.saldo = Number(cb.saldo) + montoBanco;
            await queryRunner.manager.save(CuentaBancaria, cb);
          }
        }
        await queryRunner.commitTransaction();
        return { success: true };
      }

      // Buscar movimiento original del gasto
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const movOriginal = await movRepo.findOne({
        where: { gasto: { id }, tipoMovimiento: TipoMovimiento.EGRESO_GASTO },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });

      if (movOriginal) {
        // Crear contra-movimiento
        const contraMovimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: movOriginal.cajaMayor,
          tipoMovimiento: TipoMovimiento.ANULACION,
          moneda: movOriginal.moneda,
          formaPago: movOriginal.formaPago,
          monto: movOriginal.monto,
          fecha: new Date(),
          observacion: `ANULACION GASTO: ${motivo}`.toUpperCase(),
          gasto: gasto,
          referenciaAnulacion: movOriginal,
        });

        const currentUser = getEffectiveUser(getCurrentUser);
        if (currentUser) {
          contraMovimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, contraMovimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, contraMovimiento);

        // Revertir saldo (el gasto era egreso, asi que sumamos)
        await actualizarSaldo(
          queryRunner,
          movOriginal.cajaMayor.id,
          movOriginal.moneda.id,
          movOriginal.formaPago.id,
          Number(movOriginal.monto),
          TipoMovimiento.AJUSTE_POSITIVO
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando gasto ID ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Editar gasto: revertir movimientos viejos, actualizar gasto+detalles, crear movimientos nuevos
  ipcMain.handle('edit-gasto', async (_event: any, gastoId: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 1. Buscar gasto y sus movimientos actuales
      const gastoRepo = queryRunner.manager.getRepository(Gasto);
      const gasto = await gastoRepo.findOne({
        where: { id: gastoId },
        relations: ['cajaMayor'],
      });
      if (!gasto) throw new Error(`Gasto ID ${gastoId} not found`);

      // La edicion en modo CUENTA_BANCARIA es delicada (cambia montos en
      // saldo bancario, no en caja mayor). Por ahora exigimos anular + recrear.
      if (gasto.destinoTipo === GastoDestinoTipo.CUENTA_BANCARIA) {
        throw new Error(
          'Los gastos pagados desde cuenta bancaria no se editan: anulá el gasto y creá uno nuevo.',
        );
      }

      const cajaMayorId = gasto.cajaMayor?.id;
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);

      // 2. Revertir el egreso viejo: si fue por banco, acreditar la cuenta;
      // si fue por caja mayor, revertir cada movimiento.
      if (gasto.cuentaBancariaId) {
        const cbOld = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: gasto.cuentaBancariaId } });
        if (cbOld) {
          const montoBancoOld = Number(gasto.montoCuentaBancaria) > 0 ? Number(gasto.montoCuentaBancaria) : Number(gasto.monto);
          cbOld.saldo = Number(cbOld.saldo) + montoBancoOld;
          await queryRunner.manager.save(CuentaBancaria, cbOld);
        }
      } else {
        const movsViejos = await movRepo.find({
          where: { gasto: { id: gastoId }, tipoMovimiento: TipoMovimiento.EGRESO_GASTO },
          relations: ['moneda', 'formaPago'],
        });
        for (const mov of movsViejos) {
          await actualizarSaldo(queryRunner, cajaMayorId, mov.moneda.id, mov.formaPago.id, Number(mov.monto), TipoMovimiento.AJUSTE_POSITIVO);
        }
      }

      // 3. Eliminar movimientos y detalles viejos
      await queryRunner.manager.delete(CajaMayorMovimiento, { gasto: { id: gastoId } });
      await queryRunner.manager.delete(GastoDetalle, { gasto: { id: gastoId } });

      // 4. Actualizar gasto
      const { detalles, fuente, cuentaBancariaId, montoCuentaBancaria, cotizacion, ...gastoData } = data;
      const esBanco = fuente === 'CUENTA_BANCARIA';
      const montoTotal = (detalles || []).reduce((sum: number, d: any) => sum + Number(d.monto), 0);
      const montoBancoNew = Number(montoCuentaBancaria) > 0 ? Number(montoCuentaBancaria) : montoTotal;
      const primerDetalle = detalles?.[0];

      queryRunner.manager.merge(Gasto, gasto, {
        ...gastoData,
        monto: montoTotal,
        moneda: primerDetalle ? { id: primerDetalle.monedaId } : null,
        formaPago: primerDetalle ? { id: primerDetalle.formaPagoId } : null,
        cuentaBancariaId: esBanco ? Number(cuentaBancariaId) : (null as any),
        montoCuentaBancaria: esBanco ? montoBancoNew : (null as any),
        cotizacion: esBanco && cotizacion ? Number(cotizacion) : (null as any),
      });
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Gasto, gasto);

      // 5. Crear nuevos detalles y movimientos (o débito bancario)
      const currentUser = getEffectiveUser(getCurrentUser);
      for (const det of detalles || []) {
        const detalle = queryRunner.manager.create(GastoDetalle, {
          gasto: gasto,
          moneda: { id: det.monedaId },
          formaPago: { id: det.formaPagoId },
          monto: det.monto,
          observacion: det.observacion || null,
        });
        await queryRunner.manager.save(GastoDetalle, detalle);

        if (esBanco) continue;

        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.EGRESO_GASTO,
          moneda: { id: det.monedaId },
          formaPago: { id: det.formaPagoId },
          monto: det.monto,
          fecha: gastoData.fecha || gasto.fecha,
          observacion: `GASTO: ${gastoData.descripcion || gasto.descripcion}`.toUpperCase(),
          gasto: gasto,
        });
        if (currentUser) movimiento.responsable = currentUser;
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        await actualizarSaldo(queryRunner, cajaMayorId, det.monedaId, det.formaPagoId, Number(det.monto), TipoMovimiento.EGRESO_GASTO);
      }

      if (esBanco) {
        const cbNew = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: Number(cuentaBancariaId) } });
        if (!cbNew) throw new Error(`Cuenta bancaria ${cuentaBancariaId} no encontrada`);
        cbNew.saldo = Number(cbNew.saldo) - montoBancoNew;
        await queryRunner.manager.save(CuentaBancaria, cbNew);
      }

      await queryRunner.commitTransaction();
      return gasto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error editing gasto ID ${gastoId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Editar movimiento suelto (ajustes): revertir viejo + crear nuevo
  ipcMain.handle('edit-caja-mayor-movimiento', async (_event: any, movId: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const original = await movRepo.findOne({
        where: { id: movId },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });
      if (!original) throw new Error(`Movimiento ID ${movId} not found`);

      const cajaMayorId = original.cajaMayor.id;

      // 1. Revertir saldo del movimiento original
      const tipoContrario = esIngreso(original.tipoMovimiento)
        ? TipoMovimiento.AJUSTE_NEGATIVO
        : TipoMovimiento.AJUSTE_POSITIVO;
      await actualizarSaldo(queryRunner, cajaMayorId, original.moneda.id, original.formaPago.id, Number(original.monto), tipoContrario);

      // 2. Actualizar el movimiento
      const monedaId = data.moneda?.id || data.monedaId || original.moneda.id;
      const formaPagoId = data.formaPago?.id || data.formaPagoId || original.formaPago.id;
      const monto = data.monto !== undefined ? data.monto : original.monto;

      original.moneda = { id: monedaId } as any;
      original.formaPago = { id: formaPagoId } as any;
      original.monto = monto;
      if (data.observacion !== undefined) original.observacion = data.observacion;
      await setEntityUserTracking(dataSource, original, getCurrentUser()?.id, true);
      await queryRunner.manager.save(CajaMayorMovimiento, original);

      // 3. Aplicar nuevo saldo
      await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(monto), original.tipoMovimiento);

      await queryRunner.commitTransaction();
      return original;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error editing movimiento ID ${movId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-gastos-programados', async () => {
    try {
      const repo = dataSource.getRepository(Gasto);
      return await repo.find({
        where: { esRecurrente: true, estado: GastoEstado.PROGRAMADO },
        relations: ['gastoCategoria', 'moneda', 'formaPago', 'cajaMayor'],
        order: { proximoVencimiento: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting gastos programados:', error);
      throw error;
    }
  });

  // ===================== RETIROS DE CAJA =====================

  ipcMain.handle('get-retiros-caja', async (_event: any, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(RetiroCaja);
      const qb = repo.createQueryBuilder('retiro')
        .leftJoinAndSelect('retiro.caja', 'caja')
        .leftJoinAndSelect('caja.dispositivo', 'dispositivo')
        .leftJoinAndSelect('retiro.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('retiro.responsableRetiro', 'responsableRetiro')
        .leftJoinAndSelect('responsableRetiro.persona', 'retiroPersona')
        .leftJoinAndSelect('retiro.responsableIngreso', 'responsableIngreso')
        .leftJoinAndSelect('responsableIngreso.persona', 'ingresoPersona')
        .leftJoinAndSelect('retiro.detalles', 'detalles')
        .leftJoinAndSelect('detalles.moneda', 'moneda')
        .leftJoinAndSelect('detalles.formaPago', 'formaPago')
        .orderBy('retiro.fechaRetiro', 'DESC');

      if (filtros?.estado) {
        qb.andWhere('retiro.estado = :estado', { estado: filtros.estado });
      }
      if (filtros?.cajaMayorId) {
        qb.andWhere('retiro.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting retiros caja:', error);
      throw error;
    }
  });

  ipcMain.handle('get-retiro-caja', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RetiroCaja);
      return await repo.findOne({
        where: { id },
        relations: [
          'caja', 'caja.dispositivo', 'cajaMayor',
          'responsableRetiro', 'responsableRetiro.persona',
          'responsableIngreso', 'responsableIngreso.persona',
          'detalles', 'detalles.moneda', 'detalles.formaPago',
        ],
      });
    } catch (error) {
      console.error(`Error getting retiro caja ID ${id}:`, error);
      throw error;
    }
  });

  // Crear retiro: si tiene cajaMayor destino queda como VINCULADO_PENDIENTE (no impacta saldos
  // hasta que sea verificado en caja mayor); sin destino queda como FLOTANTE.
  ipcMain.handle('create-retiro-caja', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(RetiroCaja);
      const { detalles, ...retiroData } = data;

      const entity = repo.create({
        ...retiroData,
        fechaRetiro: new Date(),
        estado: retiroData.cajaMayor ? RetiroCajaEstado.VINCULADO_PENDIENTE : RetiroCajaEstado.FLOTANTE,
        detalles: detalles?.map((d: any) => {
          const detalle = new RetiroCajaDetalle();
          detalle.moneda = d.moneda;
          detalle.formaPago = d.formaPago;
          detalle.monto = d.monto;
          return detalle;
        }),
      });

      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      const savedRetiro = Array.isArray(result) ? result[0] : result;

      return savedRetiro;
    } catch (error) {
      console.error('Error creating retiro caja:', error);
      throw error;
    }
  });

  // Ingresar retiro flotante a una caja mayor
  ipcMain.handle('ingresar-retiro-caja', async (_event: any, retiroId: number, cajaMayorId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const retiroRepo = queryRunner.manager.getRepository(RetiroCaja);
      const retiro = await retiroRepo.findOne({
        where: { id: retiroId },
        relations: ['detalles', 'detalles.moneda', 'detalles.formaPago'],
      });
      if (!retiro) throw new Error(`RetiroCaja ID ${retiroId} not found`);
      if (retiro.estado === RetiroCajaEstado.INGRESADO) throw new Error('El retiro ya fue ingresado');

      // Actualizar retiro
      retiro.cajaMayor = { id: cajaMayorId } as any;
      retiro.estado = RetiroCajaEstado.INGRESADO;
      retiro.fechaIngreso = new Date();
      const currentUser = getEffectiveUser(getCurrentUser);
      if (currentUser) {
        retiro.responsableIngreso = currentUser;
      }
      await setEntityUserTracking(dataSource, retiro, currentUser?.id, true);
      await queryRunner.manager.save(RetiroCaja, retiro);

      // Tipo de movimiento según el origen del retiro: un retiro generado desde
      // el cierre de una caja entra como INGRESO_CIERRE_CAJA (distinguible en
      // reportes); un retiro manual entra como INGRESO_RETIRO_CAJA.
      const esCierre = retiro.origen === RetiroCajaOrigen.CIERRE;
      const tipoMov = esCierre ? TipoMovimiento.INGRESO_CIERRE_CAJA : TipoMovimiento.INGRESO_RETIRO_CAJA;
      const etiqueta = esCierre ? `CIERRE CAJA #${retiroId}` : `RETIRO CAJA #${retiroId}`;

      // Crear movimiento por cada detalle
      for (const detalle of retiro.detalles) {
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: tipoMov,
          moneda: detalle.moneda,
          formaPago: detalle.formaPago,
          monto: detalle.monto,
          fecha: new Date(),
          observacion: etiqueta,
          retiroCaja: retiro,
        });

        if (currentUser) {
          movimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        await actualizarSaldo(queryRunner, cajaMayorId, detalle.moneda.id, detalle.formaPago.id, Number(detalle.monto), tipoMov);
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error ingresando retiro ${retiroId} a caja mayor ${cajaMayorId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Genera (manual, desde el cierre) un RetiroCaja por el EFECTIVO contado en el
   * cierre de una caja. Queda FLOTANTE (pendiente): el efectivo recién "se toca"
   * cuando se ingresa a una caja mayor (genera INGRESO_CIERRE_CAJA). Idempotente:
   * si ya existe un retiro para ese conteo de cierre, lo devuelve.
   */
  ipcMain.handle('generar-retiro-cierre-caja', async (_event: any, cajaId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const cajaRepo = dataSource.getRepository(Caja);
      const caja = await cajaRepo.findOne({
        where: { id: cajaId },
        relations: [
          'conteoCierre',
          'conteoCierre.detalles',
          'conteoCierre.detalles.monedaBillete',
          'conteoCierre.detalles.monedaBillete.moneda',
        ],
      });
      if (!caja) throw new Error(`Caja ID ${cajaId} not found`);
      if (!caja.conteoCierre) throw new Error('La caja no tiene conteo de cierre');

      const retiroRepo = dataSource.getRepository(RetiroCaja);
      // Idempotencia: no duplicar el retiro de cierre del mismo conteo.
      const existente = await retiroRepo.findOne({
        where: { conteoCierre: { id: caja.conteoCierre.id } } as any,
        relations: ['detalles'],
      });
      if (existente) return existente;

      // Efectivo por moneda = suma(valor del billete × cantidad) del conteo de cierre.
      const porMoneda = new Map<number, { moneda: any; monto: number }>();
      for (const d of (caja.conteoCierre.detalles || [])) {
        const mb = (d as any).monedaBillete;
        const moneda = mb?.moneda;
        if (!moneda) continue;
        const sub = Number(mb.valor) * Number((d as any).cantidad);
        const cur = porMoneda.get(moneda.id) || { moneda, monto: 0 };
        cur.monto += sub;
        porMoneda.set(moneda.id, cur);
      }
      const monedasConMonto = [...porMoneda.values()].filter((x) => x.monto > 0);
      if (monedasConMonto.length === 0) throw new Error('El cierre no tiene efectivo para retirar');

      // Forma de pago de EFECTIVO: la que mueve caja (preferir la principal).
      const fpRepo = dataSource.getRepository(FormasPago);
      const formasEfectivo = await fpRepo.find({
        where: { movimentaCaja: true, activo: true } as any,
        order: { principal: 'DESC', orden: 'ASC' },
      });
      const formaEfectivo = formasEfectivo[0];
      if (!formaEfectivo) throw new Error('No hay forma de pago de efectivo configurada (movimenta caja)');

      const currentUser = getEffectiveUser(getCurrentUser);
      const retiro = retiroRepo.create({
        caja: { id: cajaId } as any,
        origen: RetiroCajaOrigen.CIERRE,
        estado: RetiroCajaEstado.FLOTANTE,
        conteoCierre: { id: caja.conteoCierre.id } as any,
        fechaRetiro: new Date(),
        observacion: `RETIRO DEL CIERRE DE CAJA #${cajaId}`,
        ...(currentUser ? { responsableRetiro: currentUser } : {}),
        detalles: monedasConMonto.map((x) => {
          const det = new RetiroCajaDetalle();
          det.moneda = { id: x.moneda.id } as any;
          det.formaPago = { id: formaEfectivo.id } as any;
          det.monto = x.monto;
          return det;
        }),
      } as any);
      await setEntityUserTracking(dataSource, retiro, currentUser?.id, false);
      const saved = await retiroRepo.save(retiro);
      return Array.isArray(saved) ? saved[0] : saved;
    } catch (error) {
      console.error(`Error generando retiro de cierre para caja ${cajaId}:`, error);
      throw error;
    }
  });

  /**
   * EGRESO DE CAJA INICIAL (Fase 2). Retira efectivo de la caja mayor para sembrar
   * la apertura de una caja: se cuenta billete por billete (un Conteo tipo APERTURA),
   * se genera un movimiento `EGRESO_CAJA_INICIAL` por moneda (efectivo) y se descuenta
   * el saldo. El Conteo creado se reutiliza luego como conteo de apertura mediante
   * `abrir-caja-desde-conteo`.
   *
   * data = { cajaMayorId, observacion?, detalles: [{ monedaBilleteId, cantidad }] }
   */
  ipcMain.handle('egreso-caja-inicial', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cajaMayorId = data?.cajaMayorId;
      if (!cajaMayorId) throw new Error('cajaMayorId requerido');
      const detallesIn = (data?.detalles || []).filter((d: any) => Number(d.cantidad) > 0);
      if (detallesIn.length === 0) throw new Error('Debe contar al menos un billete');

      // Forma de pago de EFECTIVO (la que mueve caja; preferir la principal).
      const formaEfectivo = await queryRunner.manager.findOne(FormasPago, {
        where: { movimentaCaja: true, activo: true } as any,
        order: { principal: 'DESC', orden: 'ASC' },
      });
      if (!formaEfectivo) throw new Error('No hay forma de pago de efectivo configurada (movimenta caja)');

      const etiqueta = (data?.observacion || 'EGRESO DE CAJA INICIAL').toUpperCase();
      const currentUser = getEffectiveUser(getCurrentUser);

      // 1. Crear el conteo (tipo APERTURA: reutilizable como apertura de caja).
      const conteo = queryRunner.manager.create(Conteo, {
        activo: true,
        tipo: 'APERTURA',
        fecha: new Date(),
        observaciones: etiqueta,
      });
      const savedConteo = await queryRunner.manager.save(Conteo, conteo);

      // 2. Crear los detalles del conteo y acumular el efectivo por moneda.
      const porMoneda = new Map<number, { moneda: any; monto: number }>();
      for (const d of detallesIn) {
        const billete = await queryRunner.manager.findOne(MonedaBillete, {
          where: { id: d.monedaBilleteId },
          relations: ['moneda'],
        });
        if (!billete || !billete.moneda) continue;
        const cantidad = Number(d.cantidad);
        const detalle = queryRunner.manager.create(ConteoDetalle, {
          conteo: { id: savedConteo.id },
          monedaBillete: { id: billete.id },
          cantidad,
          activo: true,
        });
        await queryRunner.manager.save(ConteoDetalle, detalle);
        const sub = Number(billete.valor) * cantidad;
        const cur = porMoneda.get(billete.moneda.id) || { moneda: billete.moneda, monto: 0 };
        cur.monto += sub;
        porMoneda.set(billete.moneda.id, cur);
      }

      const monedasConMonto = [...porMoneda.values()].filter((x) => x.monto > 0);
      if (monedasConMonto.length === 0) throw new Error('El conteo no tiene efectivo');

      // 3. Un movimiento EGRESO_CAJA_INICIAL por moneda (efectivo), vinculado al conteo.
      for (const x of monedasConMonto) {
        const mov = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.EGRESO_CAJA_INICIAL,
          moneda: { id: x.moneda.id },
          formaPago: { id: formaEfectivo.id },
          monto: x.monto,
          fecha: new Date(),
          observacion: etiqueta,
          conteo: { id: savedConteo.id },
        });
        if (currentUser) mov.responsable = currentUser;
        await setEntityUserTracking(dataSource, mov, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, mov);

        await actualizarSaldo(
          queryRunner, cajaMayorId, x.moneda.id, formaEfectivo.id,
          Number(x.monto), TipoMovimiento.EGRESO_CAJA_INICIAL,
        );
      }

      await queryRunner.commitTransaction();
      return { success: true, conteoId: savedConteo.id };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creando egreso de caja inicial:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Abre una caja reutilizando un Conteo ya existente (el generado por un
   * `EGRESO_CAJA_INICIAL`) como su conteo de apertura. Valida que el conteo no haya
   * sido usado ya para abrir otra caja y que el dispositivo no tenga una caja abierta.
   */
  ipcMain.handle('abrir-caja-desde-conteo', async (_event: any, conteoId: number, dispositivoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    try {
      if (!conteoId) throw new Error('conteoId requerido');
      if (!dispositivoId) throw new Error('Debe seleccionar un dispositivo');

      const conteoRepo = dataSource.getRepository(Conteo);
      const conteo = await conteoRepo.findOne({ where: { id: conteoId } });
      if (!conteo) throw new Error(`Conteo ${conteoId} no encontrado`);

      const cajaRepo = dataSource.getRepository(Caja);
      // El conteo no debe estar ya usado como apertura de otra caja.
      const yaUsado = await cajaRepo.findOne({ where: { conteoApertura: { id: conteoId } } as any });
      if (yaUsado) throw new Error(`Este conteo ya fue usado para abrir la caja #${yaUsado.id}`);

      // El dispositivo no debe tener una caja abierta.
      const abierta = await cajaRepo.findOne({
        where: { dispositivo: { id: dispositivoId }, estado: CajaEstado.ABIERTO } as any,
      });
      if (abierta) throw new Error('El dispositivo ya tiene una caja abierta');

      const currentUser = getEffectiveUser(getCurrentUser);
      const caja = cajaRepo.create({
        dispositivo: { id: dispositivoId } as any,
        estado: CajaEstado.ABIERTO,
        fechaApertura: new Date(),
        conteoApertura: { id: conteoId } as any,
        activo: true,
      });
      await setEntityUserTracking(dataSource, caja, currentUser?.id, false);
      const saved = await cajaRepo.save(caja);
      return Array.isArray(saved) ? saved[0] : saved;
    } catch (error) {
      console.error(`Error abriendo caja desde conteo ${conteoId}:`, error);
      throw error;
    }
  });

  // ===================== ENTRADA VARIA CATEGORIAS =====================

  ipcMain.handle('get-entrada-varia-categorias', async () => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      return await repo.find({ relations: ['padre', 'hijos'], order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting entrada varia categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-entrada-varia-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      return await repo.findOne({ where: { id }, relations: ['padre', 'hijos'] });
    } catch (error) {
      console.error(`Error getting entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-entrada-varia-categoria', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = repo.create({ ...data, nombre: data.nombre?.toUpperCase() });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating entrada varia categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-entrada-varia-categoria', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`EntradaVariaCategoria ${id} no encontrada`);
      const merge: any = { ...data };
      if (data.nombre) merge.nombre = data.nombre.toUpperCase();
      repo.merge(entity, merge);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-entrada-varia-categoria', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`EntradaVariaCategoria ${id} no encontrada`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  // ===================== ENTRADAS VARIAS =====================

  ipcMain.handle('get-entradas-varias', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(EntradaVaria);
      const qb = repo.createQueryBuilder('ev')
        .leftJoinAndSelect('ev.entradaVariaCategoria', 'cat')
        .leftJoinAndSelect('cat.padre', 'catPadre')
        .leftJoinAndSelect('ev.moneda', 'moneda')
        .leftJoinAndSelect('ev.formaPago', 'formaPago')
        .leftJoinAndSelect('ev.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('ev.cuentaBancaria', 'cuentaBancaria')
        .leftJoinAndSelect('ev.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('ev.fecha', 'DESC');

      if (filtros?.fechaDesde) qb.andWhere('ev.fecha >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) qb.andWhere('ev.fecha <= :fh', { fh: filtros.fechaHasta });
      if (filtros?.entradaVariaCategoriaId) qb.andWhere('ev.entrada_varia_categoria_id = :catId', { catId: filtros.entradaVariaCategoriaId });
      if (filtros?.cajaMayorId) qb.andWhere('ev.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      if (filtros?.anulado !== undefined) qb.andWhere('ev.anulado = :anulado', { anulado: filtros.anulado });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting entradas varias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-entrada-varia', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(EntradaVaria);
      return await repo.findOne({
        where: { id },
        relations: ['entradaVariaCategoria', 'entradaVariaCategoria.padre', 'moneda', 'formaPago', 'cajaMayor', 'createdBy', 'createdBy.persona'],
      });
    } catch (error) {
      console.error(`Error getting entrada varia ${id}:`, error);
      throw error;
    }
  });

  // Crear entrada varia: transaccional. Soporta dos destinos:
  // 1. Caja Mayor: crea EntradaVaria + CajaMayorMovimiento INGRESO_ENTRADA_VARIA + actualiza saldo CM
  // 2. Cuenta Bancaria: crea EntradaVaria + suma a saldo de cuenta bancaria
  ipcMain.handle('create-entrada-varia', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const destinoTipo = data.destinoTipo || 'CAJA_MAYOR';
      const cajaMayorId = data.cajaMayor?.id || data.cajaMayor || data.cajaMayorId || null;
      const cuentaBancariaId = data.cuentaBancaria?.id || data.cuentaBancariaId || null;
      const monedaId = data.moneda?.id || data.moneda || data.monedaId;
      const formaPagoId = data.formaPago?.id || data.formaPago || data.formaPagoId;
      const monto = Number(data.monto);

      const entrada = queryRunner.manager.create(EntradaVaria, {
        entradaVariaCategoria: data.entradaVariaCategoria || (data.entradaVariaCategoriaId ? { id: data.entradaVariaCategoriaId } : null),
        descripcion: data.descripcion?.toUpperCase(),
        monto,
        numeroComprobante: data.numeroComprobante?.toUpperCase() || null,
        observacion: data.observacion?.toUpperCase() || null,
        fecha: data.fecha || new Date(),
        moneda: { id: monedaId },
        formaPago: { id: formaPagoId },
        cajaMayor: destinoTipo === 'CAJA_MAYOR' && cajaMayorId ? { id: cajaMayorId } : null,
        cuentaBancaria: destinoTipo === 'CUENTA_BANCARIA' && cuentaBancariaId ? { id: cuentaBancariaId } : null,
      });
      await setEntityUserTracking(dataSource, entrada, getCurrentUser()?.id, false);
      const saved = await queryRunner.manager.save(EntradaVaria, entrada);

      if (destinoTipo === 'CAJA_MAYOR') {
        if (!cajaMayorId) throw new Error('cajaMayorId requerido para destino CAJA_MAYOR');
        const currentUser = getEffectiveUser(getCurrentUser);
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.INGRESO_ENTRADA_VARIA,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto,
          fecha: data.fecha || new Date(),
          observacion: `ENTRADA VARIA: ${data.descripcion || ''}`.toUpperCase(),
          entradaVariaId: saved.id,
        });
        if (currentUser) movimiento.responsable = currentUser;
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
        await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.INGRESO_ENTRADA_VARIA);
      } else if (destinoTipo === 'CUENTA_BANCARIA') {
        if (!cuentaBancariaId) throw new Error('cuentaBancariaId requerido para destino CUENTA_BANCARIA');
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = Number(cb.saldo) + monto;
        await queryRunner.manager.save(CuentaBancaria, cb);
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating entrada varia:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-entrada-varia', async (_event, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(EntradaVaria);
      const entrada = await repo.findOne({
        where: { id },
        relations: ['cajaMayor', 'cuentaBancaria', 'moneda', 'formaPago'],
      });
      if (!entrada) throw new Error(`EntradaVaria ${id} no encontrada`);
      if (entrada.anulado) throw new Error('La entrada varia ya esta anulada');

      entrada.anulado = true;
      await setEntityUserTracking(dataSource, entrada, getCurrentUser()?.id, true);
      await queryRunner.manager.save(EntradaVaria, entrada);

      if (entrada.cajaMayor) {
        const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
        const movOriginal = await movRepo.findOne({
          where: { entradaVariaId: id, tipoMovimiento: TipoMovimiento.INGRESO_ENTRADA_VARIA },
          relations: ['cajaMayor', 'moneda', 'formaPago'],
        });
        if (movOriginal) {
          const contra = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: movOriginal.cajaMayor,
            tipoMovimiento: TipoMovimiento.ANULACION,
            moneda: movOriginal.moneda,
            formaPago: movOriginal.formaPago,
            monto: movOriginal.monto,
            fecha: new Date(),
            observacion: `ANULACION ENTRADA VARIA: ${motivo}`.toUpperCase(),
            entradaVariaId: id,
            referenciaAnulacion: movOriginal,
          });
          const currentUser = getEffectiveUser(getCurrentUser);
          if (currentUser) contra.responsable = currentUser;
          await setEntityUserTracking(dataSource, contra, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, contra);

          await actualizarSaldo(
            queryRunner,
            movOriginal.cajaMayor.id,
            movOriginal.moneda.id,
            movOriginal.formaPago.id,
            Number(movOriginal.monto),
            TipoMovimiento.AJUSTE_NEGATIVO,
          );
        }
      }

      if (entrada.cuentaBancaria) {
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: entrada.cuentaBancaria.id } });
        if (cb) {
          cb.saldo = Number(cb.saldo) - Number(entrada.monto);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando entrada varia ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== OPERACION FINANCIERA CATEGORIAS =====================

  ipcMain.handle('get-operacion-financiera-categorias', async () => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      return await repo.find({ relations: ['padre', 'hijos'], order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting operacion financiera categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-operacion-financiera-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      return await repo.findOne({ where: { id }, relations: ['padre', 'hijos'] });
    } catch (error) {
      console.error(`Error getting operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-operacion-financiera-categoria', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = repo.create({ ...data, nombre: data.nombre?.toUpperCase() });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating operacion financiera categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-operacion-financiera-categoria', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`OperacionFinancieraCategoria ${id} no encontrada`);
      const merge: any = { ...data };
      if (data.nombre) merge.nombre = data.nombre.toUpperCase();
      repo.merge(entity, merge);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-operacion-financiera-categoria', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`OperacionFinancieraCategoria ${id} no encontrada`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  // ===================== OPERACIONES FINANCIERAS =====================

  ipcMain.handle('get-operaciones-financieras', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(OperacionFinanciera);
      const qb = repo.createQueryBuilder('op')
        .leftJoinAndSelect('op.operacionFinancieraCategoria', 'cat')
        .leftJoinAndSelect('op.cajaMayorOrigen', 'cmO')
        .leftJoinAndSelect('op.cajaMayorDestino', 'cmD')
        .leftJoinAndSelect('op.monedaOrigen', 'monO')
        .leftJoinAndSelect('op.monedaDestino', 'monD')
        .leftJoinAndSelect('op.formaPagoOrigen', 'fpO')
        .leftJoinAndSelect('op.formaPagoDestino', 'fpD')
        .leftJoinAndSelect('op.cuentaBancariaOrigen', 'cbO')
        .leftJoinAndSelect('op.cuentaBancariaDestino', 'cbD')
        .leftJoinAndSelect('op.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('op.fecha', 'DESC');

      if (filtros?.tipoOperacion) qb.andWhere('op.tipo_operacion = :t', { t: filtros.tipoOperacion });
      if (filtros?.fechaDesde) qb.andWhere('op.fecha >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) qb.andWhere('op.fecha <= :fh', { fh: filtros.fechaHasta });
      if (filtros?.cajaMayorId) {
        qb.andWhere('(op.caja_mayor_origen_id = :cmId OR op.caja_mayor_destino_id = :cmId)', { cmId: filtros.cajaMayorId });
      }
      if (filtros?.anulado !== undefined) qb.andWhere('op.anulado = :anulado', { anulado: filtros.anulado });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting operaciones financieras:', error);
      throw error;
    }
  });

  ipcMain.handle('get-operacion-financiera', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(OperacionFinanciera);
      return await repo.findOne({
        where: { id },
        relations: [
          'operacionFinancieraCategoria',
          'cajaMayorOrigen', 'cajaMayorDestino',
          'monedaOrigen', 'monedaDestino',
          'formaPagoOrigen', 'formaPagoDestino',
          'cuentaBancariaOrigen', 'cuentaBancariaDestino',
          'createdBy', 'createdBy.persona',
        ],
      });
    } catch (error) {
      console.error(`Error getting operacion financiera ${id}:`, error);
      throw error;
    }
  });

  // Crear operacion financiera transaccional con form dinamico segun tipo:
  // CAMBIO_DIVISA, DEPOSITO_BANCARIO, RETIRO_BANCARIO, TRANSFERENCIA_ENTRE_CAJAS
  ipcMain.handle('create-operacion-financiera', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const tipoOp = data.tipoOperacion as TipoOperacionFinanciera;
      const currentUser = getEffectiveUser(getCurrentUser);

      const op = queryRunner.manager.create(OperacionFinanciera, {
        tipoOperacion: tipoOp,
        operacionFinancieraCategoria: data.operacionFinancieraCategoriaId
          ? { id: data.operacionFinancieraCategoriaId }
          : null,
        descripcion: (data.descripcion || '').toUpperCase(),
        fecha: data.fecha || new Date(),
        cotizacion: data.cotizacion || null,
        numeroComprobante: data.numeroComprobante?.toUpperCase() || null,
        comprobanteUrl: data.comprobanteUrl || null,
        diferencia: data.diferencia || 0,
        diferenciaDestinoTipo: data.diferenciaDestinoTipo || null,
        diferenciaObservacion: data.diferenciaObservacion?.toUpperCase() || null,
        observacion: data.observacion?.toUpperCase() || null,
        cajaMayorOrigen: data.cajaMayorOrigenId ? { id: data.cajaMayorOrigenId } : null,
        monedaOrigen: data.monedaOrigenId ? { id: data.monedaOrigenId } : null,
        formaPagoOrigen: data.formaPagoOrigenId ? { id: data.formaPagoOrigenId } : null,
        montoOrigen: data.montoOrigen || null,
        cuentaBancariaOrigen: data.cuentaBancariaOrigenId ? { id: data.cuentaBancariaOrigenId } : null,
        cajaMayorDestino: data.cajaMayorDestinoId ? { id: data.cajaMayorDestinoId } : null,
        monedaDestino: data.monedaDestinoId ? { id: data.monedaDestinoId } : null,
        formaPagoDestino: data.formaPagoDestinoId ? { id: data.formaPagoDestinoId } : null,
        montoDestino: data.montoDestino || null,
        cuentaBancariaDestino: data.cuentaBancariaDestinoId ? { id: data.cuentaBancariaDestinoId } : null,
      });
      await setEntityUserTracking(dataSource, op, currentUser?.id, false);
      const savedOp = await queryRunner.manager.save(OperacionFinanciera, op);
      const opId = savedOp.id;

      switch (tipoOp) {
        case TipoOperacionFinanciera.CAMBIO_DIVISA: {
          const cmId = data.cajaMayorOrigenId;
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.EGRESO_OPERACION_FINANCIERA,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `CAMBIO DIVISA (SALIDA): ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, cmId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.EGRESO_OPERACION_FINANCIERA);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.INGRESO_OPERACION_FINANCIERA,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `CAMBIO DIVISA (ENTRADA): ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, cmId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.INGRESO_OPERACION_FINANCIERA);
          break;
        }

        case TipoOperacionFinanciera.DEPOSITO_BANCARIO: {
          const cmId = data.cajaMayorOrigenId;
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.EGRESO_DEPOSITO_BANCO,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `DEPOSITO BANCO: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, cmId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.EGRESO_DEPOSITO_BANCO);

          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: data.cuentaBancariaDestinoId } });
          if (!cb) throw new Error(`Cuenta bancaria destino ${data.cuentaBancariaDestinoId} no encontrada`);
          cb.saldo = Number(cb.saldo) + Number(data.montoDestino);
          await queryRunner.manager.save(CuentaBancaria, cb);
          break;
        }

        case TipoOperacionFinanciera.RETIRO_BANCARIO: {
          const cmId = data.cajaMayorDestinoId;
          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: data.cuentaBancariaOrigenId } });
          if (!cb) throw new Error(`Cuenta bancaria origen ${data.cuentaBancariaOrigenId} no encontrada`);
          cb.saldo = Number(cb.saldo) - Number(data.montoOrigen);
          await queryRunner.manager.save(CuentaBancaria, cb);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.INGRESO_RETIRO_BANCO,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `RETIRO BANCO: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, cmId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.INGRESO_RETIRO_BANCO);
          break;
        }

        case TipoOperacionFinanciera.TRANSFERENCIA_ENTRE_CAJAS: {
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: data.cajaMayorOrigenId },
            tipoMovimiento: TipoMovimiento.TRANSFERENCIA_SALIDA,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `TRANSFERENCIA → CM #${data.cajaMayorDestinoId}: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, data.cajaMayorOrigenId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.TRANSFERENCIA_SALIDA);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: data.cajaMayorDestinoId },
            tipoMovimiento: TipoMovimiento.TRANSFERENCIA_ENTRADA,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `TRANSFERENCIA ← CM #${data.cajaMayorOrigenId}: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, data.cajaMayorDestinoId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.TRANSFERENCIA_ENTRADA);
          break;
        }
      }

      // Diferencia opcional → AJUSTE_POSITIVO/NEGATIVO en moneda destino
      if (data.diferencia && Number(data.diferencia) !== 0 && data.diferenciaDestinoTipo && data.diferenciaDestinoTipo !== DiferenciaDestinoTipo.IGNORAR) {
        const diferencia = Number(data.diferencia);
        const cmId = data.cajaMayorDestinoId || data.cajaMayorOrigenId;
        const monId = data.monedaDestinoId || data.monedaOrigenId;
        const fpId = data.formaPagoDestinoId || data.formaPagoOrigenId;
        const tipoMov = diferencia > 0 ? TipoMovimiento.AJUSTE_POSITIVO : TipoMovimiento.AJUSTE_NEGATIVO;
        const tipoMovDescriptor = data.diferenciaDestinoTipo === DiferenciaDestinoTipo.GASTO ? 'GASTO POR DIFERENCIA' : 'VALE POR DIFERENCIA';

        const movDif = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cmId },
          tipoMovimiento: tipoMov,
          moneda: { id: monId },
          formaPago: { id: fpId },
          monto: Math.abs(diferencia),
          fecha: data.fecha || new Date(),
          observacion: `${tipoMovDescriptor}: ${data.diferenciaObservacion || ''}`.toUpperCase(),
          operacionFinancieraId: opId,
        });
        if (currentUser) movDif.responsable = currentUser;
        await setEntityUserTracking(dataSource, movDif, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movDif);
        await actualizarSaldo(queryRunner, cmId, monId, fpId, Math.abs(diferencia), tipoMov);
      }

      await queryRunner.commitTransaction();
      return savedOp;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating operacion financiera:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-operacion-financiera', async (_event, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await anularOperacionFinancieraTx(queryRunner, id, motivo, getEffectiveUser(getCurrentUser));

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando operacion financiera ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== CONFIGURACION CAJA MAYOR =====================

  ipcMain.handle('get-caja-mayor-configuracion', async (_event: any, cajaMayorId: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayorConfiguracion);
      const config = await repo
        .createQueryBuilder('cfg')
        .leftJoinAndSelect('cfg.formasPagoVisibles', 'fp')
        .leftJoinAndSelect('cfg.cuentasBancariasVisibles', 'cb')
        .leftJoinAndSelect('cb.moneda', 'cbMoneda')
        .where('cfg.caja_mayor_id = :cajaMayorId', { cajaMayorId })
        .getOne();
      return config || null;
    } catch (error) {
      console.error(`Error getting configuracion caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle(
    'save-caja-mayor-configuracion',
    async (
      _event: any,
      cajaMayorId: number,
      data: {
        formaPagoIds: number[];
        cuentaBancariaIds: number[];
        mostrarCuentasPorPagar?: boolean;
        mostrarCuentasPorCobrar?: boolean;
      }
    ) => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const cajaMayor = await queryRunner.manager.findOne(CajaMayor, { where: { id: cajaMayorId } });
        if (!cajaMayor) throw new Error(`Caja Mayor ID ${cajaMayorId} not found`);

        const repo = queryRunner.manager.getRepository(CajaMayorConfiguracion);
        let config = await repo
          .createQueryBuilder('cfg')
          .leftJoinAndSelect('cfg.formasPagoVisibles', 'fp')
          .leftJoinAndSelect('cfg.cuentasBancariasVisibles', 'cb')
          .where('cfg.caja_mayor_id = :cajaMayorId', { cajaMayorId })
          .getOne();

        if (!config) {
          config = repo.create({ cajaMayor });
          await setEntityUserTracking(dataSource, config, getCurrentUser()?.id, false);
        } else {
          await setEntityUserTracking(dataSource, config, getCurrentUser()?.id, true);
        }

        const fpIds = Array.isArray(data?.formaPagoIds) ? data.formaPagoIds : [];
        const cbIds = Array.isArray(data?.cuentaBancariaIds) ? data.cuentaBancariaIds : [];

        config.formasPagoVisibles = fpIds.map((id) => ({ id })) as any;
        config.cuentasBancariasVisibles = cbIds.map((id) => ({ id })) as any;
        config.mostrarCuentasPorPagar = data?.mostrarCuentasPorPagar === true;
        config.mostrarCuentasPorCobrar = data?.mostrarCuentasPorCobrar === true;

        const saved = await queryRunner.manager.save(CajaMayorConfiguracion, config);
        await queryRunner.commitTransaction();
        return saved;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error(`Error saving configuracion caja mayor ${cajaMayorId}:`, error);
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  );

  // Resumen CPP por moneda con buckets {esteMes, mesQueViene, total, vencidas}.
  // Lista cuotas pendientes/parciales agrupadas por moneda.
  ipcMain.handle('get-caja-mayor-cpp-resumen', async () => {
    try {
      const ahora = new Date();
      const anio = ahora.getFullYear();
      const mes = ahora.getMonth();
      const finEsteMes = new Date(anio, mes + 1, 0, 23, 59, 59, 999);
      const finProxMes = new Date(anio, mes + 2, 0, 23, 59, 59, 999);
      const inicioHoy = new Date(anio, mes, ahora.getDate(), 0, 0, 0, 0);

      const rows: any[] = await dataSource
        .getRepository(CuentaPorPagarCuota)
        .createQueryBuilder('cuota')
        .leftJoin('cuota.cuentaPorPagar', 'cpp')
        .leftJoin('cpp.moneda', 'moneda')
        .select('moneda.id', 'monedaId')
        .addSelect('moneda.simbolo', 'monedaSimbolo')
        .addSelect('moneda.denominacion', 'monedaDenominacion')
        .addSelect('cuota.fechaVencimiento', 'fechaVencimiento')
        .addSelect('cuota.monto', 'monto')
        .addSelect('cuota.montoPagado', 'montoPagado')
        .where("cuota.estado IN ('PENDIENTE', 'PARCIAL')")
        // CPP = deudas a proveedores; los prestamos a funcionarios son "a cobrar".
        .andWhere("cpp.tipo <> 'PRESTAMO_FUNCIONARIO'")
        .getRawMany();

      const grupos = new Map<number, {
        monedaId: number;
        monedaSimbolo: string;
        monedaDenominacion: string;
        esteMes: number;
        mesQueViene: number;
        total: number;
        vencidas: number;
      }>();

      for (const r of rows) {
        const monedaId = Number(r.monedaId) || 0;
        if (!monedaId) continue;
        const venc = r.fechaVencimiento ? new Date(r.fechaVencimiento) : null;
        const saldo = +(Number(r.monto) - Number(r.montoPagado)).toFixed(2);
        if (saldo <= 0 || !venc) continue;

        let g = grupos.get(monedaId);
        if (!g) {
          g = {
            monedaId,
            monedaSimbolo: r.monedaSimbolo || '',
            monedaDenominacion: r.monedaDenominacion || '',
            esteMes: 0,
            mesQueViene: 0,
            total: 0,
            vencidas: 0,
          };
          grupos.set(monedaId, g);
        }
        g.total += saldo;
        if (venc < inicioHoy) g.vencidas += saldo;
        if (venc <= finEsteMes) g.esteMes += saldo;
        else if (venc <= finProxMes) g.mesQueViene += saldo;
      }

      return Array.from(grupos.values()).map((g) => ({
        monedaId: g.monedaId,
        monedaSimbolo: g.monedaSimbolo,
        monedaDenominacion: g.monedaDenominacion,
        esteMes: +g.esteMes.toFixed(2),
        mesQueViene: +g.mesQueViene.toFixed(2),
        total: +g.total.toFixed(2),
        vencidas: +g.vencidas.toFixed(2),
      }));
    } catch (error) {
      console.error('Error getting CPP resumen:', error);
      throw error;
    }
  });

  // Resumen CPC por moneda con buckets {esteMes, mesQueViene, total, vencidas}.
  ipcMain.handle('get-caja-mayor-cpc-resumen', async () => {
    try {
      const ahora = new Date();
      const anio = ahora.getFullYear();
      const mes = ahora.getMonth();
      const finEsteMes = new Date(anio, mes + 1, 0, 23, 59, 59, 999);
      const finProxMes = new Date(anio, mes + 2, 0, 23, 59, 59, 999);
      const inicioHoy = new Date(anio, mes, ahora.getDate(), 0, 0, 0, 0);

      const rows: any[] = await dataSource
        .getRepository(CuentaPorCobrarCuota)
        .createQueryBuilder('cuota')
        .leftJoin('cuota.cuentaPorCobrar', 'cpc')
        .leftJoin('cpc.moneda', 'moneda')
        .select('moneda.id', 'monedaId')
        .addSelect('moneda.simbolo', 'monedaSimbolo')
        .addSelect('moneda.denominacion', 'monedaDenominacion')
        .addSelect('cuota.fechaVencimiento', 'fechaVencimiento')
        .addSelect('cuota.monto', 'monto')
        .addSelect('cuota.montoCobrado', 'montoCobrado')
        .where("cuota.estado IN ('PENDIENTE', 'PARCIAL')")
        .getRawMany();

      const grupos = new Map<number, {
        monedaId: number;
        monedaSimbolo: string;
        monedaDenominacion: string;
        esteMes: number;
        mesQueViene: number;
        total: number;
        vencidas: number;
      }>();

      for (const r of rows) {
        const monedaId = Number(r.monedaId) || 0;
        if (!monedaId) continue;
        const venc = r.fechaVencimiento ? new Date(r.fechaVencimiento) : null;
        const saldo = +(Number(r.monto) - Number(r.montoCobrado)).toFixed(2);
        if (saldo <= 0 || !venc) continue;

        let g = grupos.get(monedaId);
        if (!g) {
          g = {
            monedaId,
            monedaSimbolo: r.monedaSimbolo || '',
            monedaDenominacion: r.monedaDenominacion || '',
            esteMes: 0,
            mesQueViene: 0,
            total: 0,
            vencidas: 0,
          };
          grupos.set(monedaId, g);
        }
        g.total += saldo;
        if (venc < inicioHoy) g.vencidas += saldo;
        if (venc <= finEsteMes) g.esteMes += saldo;
        else if (venc <= finProxMes) g.mesQueViene += saldo;
      }

      return Array.from(grupos.values()).map((g) => ({
        monedaId: g.monedaId,
        monedaSimbolo: g.monedaSimbolo,
        monedaDenominacion: g.monedaDenominacion,
        esteMes: +g.esteMes.toFixed(2),
        mesQueViene: +g.mesQueViene.toFixed(2),
        total: +g.total.toFixed(2),
        vencidas: +g.vencidas.toFixed(2),
      }));
    } catch (error) {
      console.error('Error getting CPC resumen:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cuenta-bancaria-resumen', async (_event: any, cuentaBancariaId: number) => {
    try {
      const cbRepo = dataSource.getRepository(CuentaBancaria);
      const cb = await cbRepo.findOne({
        where: { id: cuentaBancariaId },
        relations: ['moneda'],
      });
      if (!cb) throw new Error(`CuentaBancaria ID ${cuentaBancariaId} not found`);

      const futuroRow = await dataSource
        .getRepository(AcreditacionPos)
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.montoEsperado), 0)', 'futuro')
        .where('a.cuenta_bancaria_id = :id', { id: cuentaBancariaId })
        .andWhere('a.estado = :estado', { estado: AcreditacionPosEstado.PENDIENTE })
        .getRawOne();

      return {
        id: cb.id,
        nombre: cb.nombre,
        banco: (cb as any).banco,
        numeroCuenta: (cb as any).numeroCuenta,
        moneda: cb.moneda,
        saldo: Number(cb.saldo) || 0,
        saldoReservado: Number((cb as any).saldoReservado) || 0,
        saldoFuturo: Number(futuroRow?.futuro) || 0,
      };
    } catch (error) {
      console.error(`Error getting resumen cuenta bancaria ${cuentaBancariaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-cuentas-bancarias-resumenes', async (_event: any, ids: number[]) => {
    try {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const cbRepo = dataSource.getRepository(CuentaBancaria);
      const cuentas = await cbRepo
        .createQueryBuilder('cb')
        .leftJoinAndSelect('cb.moneda', 'moneda')
        .where('cb.id IN (:...ids)', { ids })
        .getMany();

      const futuros = await dataSource
        .getRepository(AcreditacionPos)
        .createQueryBuilder('a')
        .select('a.cuenta_bancaria_id', 'cuentaBancariaId')
        .addSelect('COALESCE(SUM(a.montoEsperado), 0)', 'futuro')
        .where('a.cuenta_bancaria_id IN (:...ids)', { ids })
        .andWhere('a.estado = :estado', { estado: AcreditacionPosEstado.PENDIENTE })
        .groupBy('a.cuenta_bancaria_id')
        .getRawMany();

      const futuroByCb = new Map<number, number>();
      for (const r of futuros) {
        futuroByCb.set(Number(r.cuentaBancariaId), Number(r.futuro) || 0);
      }

      return cuentas.map((cb: any) => ({
        id: cb.id,
        nombre: cb.nombre,
        banco: cb.banco,
        numeroCuenta: cb.numeroCuenta,
        moneda: cb.moneda,
        saldo: Number(cb.saldo) || 0,
        saldoReservado: Number(cb.saldoReservado) || 0,
        saldoFuturo: futuroByCb.get(cb.id) || 0,
      }));
    } catch (error) {
      console.error('Error getting resumenes cuentas bancarias:', error);
      throw error;
    }
  });
}
