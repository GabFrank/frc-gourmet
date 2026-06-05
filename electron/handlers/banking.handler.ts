import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MaquinaPos } from '../../src/app/database/entities/financiero/maquina-pos.entity';
import { AcreditacionPos } from '../../src/app/database/entities/financiero/acreditacion-pos.entity';
import { MovimientoBancario, MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { Chequera } from '../../src/app/database/entities/financiero/chequera.entity';
import { Cheque } from '../../src/app/database/entities/financiero/cheque.entity';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { AcreditacionPosEstado } from '../../src/app/database/entities/financiero/banking-enums';
import { ChequeEstado, ChequeraEstado } from '../../src/app/database/entities/financiero/cheques-enums';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';
import { ensurePermission } from '../utils/auth.utils';

// Incrementa el numero de cheque (soporta sufijos no numericos: extrae digitos finales)
function siguienteNumeroCheque(actual: string): string {
  const match = actual.match(/^(\D*)(\d+)$/);
  if (!match) return actual;
  const [, prefijo, numero] = match;
  const len = numero.length;
  const next = (Number(numero) + 1).toString().padStart(len, '0');
  return prefijo + next;
}

// Extrae la parte numerica para comparar dos numeros de cheque
function numeroChequeAsInt(n: string): number {
  const m = n?.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

// Procesa acreditaciones pendientes vencidas (sin pasar por IPC).
// Usado por: scheduler en main process, lazy-on-access desde el handler IPC.
export async function procesarAcreditacionesPendientes(dataSource: DataSource): Promise<{ procesadas: number }> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const repo = queryRunner.manager.getRepository(AcreditacionPos);
    const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
    const ahora = new Date();

    const pendientes = await repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.cuentaBancaria', 'cb')
      .where('a.estado = :estado', { estado: AcreditacionPosEstado.PENDIENTE })
      .andWhere('a.fechaEsperadaAcreditacion <= :ahora', { ahora })
      .getMany();

    let procesadas = 0;
    for (const acred of pendientes) {
      const cb = await cbRepo.findOne({ where: { id: acred.cuentaBancaria.id } });
      if (!cb) continue;
      cb.saldo = Number(cb.saldo) + Number(acred.montoEsperado);
      await queryRunner.manager.save(CuentaBancaria, cb);

      acred.estado = AcreditacionPosEstado.ACREDITADO_AUTO;
      acred.fechaAcreditacionReal = new Date();
      acred.montoAcreditado = Number(acred.montoEsperado);
      await queryRunner.manager.save(AcreditacionPos, acred);
      procesadas++;
    }

    await queryRunner.commitTransaction();
    return { procesadas };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// Inicia un scheduler que procesa acreditaciones cada N minutos.
// Devuelve el handle para poder cancelarlo si hace falta.
export function startAcreditacionesScheduler(dataSource: DataSource, intervalMinutos = 5): NodeJS.Timeout {
  const ms = Math.max(1, intervalMinutos) * 60_000;
  // Disparo inicial al arrancar (no bloqueante)
  procesarAcreditacionesPendientes(dataSource)
    .then(r => {
      if (r.procesadas > 0) {
        console.log(`[Acreditaciones scheduler] inicial: ${r.procesadas} procesadas`);
      }
    })
    .catch(e => console.error('[Acreditaciones scheduler] error inicial:', e));

  return setInterval(() => {
    procesarAcreditacionesPendientes(dataSource)
      .then(r => {
        if (r.procesadas > 0) {
          console.log(`[Acreditaciones scheduler] tick: ${r.procesadas} procesadas`);
        }
      })
      .catch(e => console.error('[Acreditaciones scheduler] error tick:', e));
  }, ms);
}

export function registerBankingHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ===================== CUENTAS BANCARIAS =====================

  ipcMain.handle('get-cuentas-bancarias', async () => {
    try {
      const repo = dataSource.getRepository(CuentaBancaria);
      return await repo.find({
        relations: ['moneda'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting cuentas bancarias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cuenta-bancaria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(CuentaBancaria);
      return await repo.findOne({ where: { id }, relations: ['moneda'] });
    } catch (error) {
      console.error(`Error getting cuenta bancaria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-cuenta-bancaria', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(CuentaBancaria);
      const entity = repo.create({
        ...data,
        nombre: data.nombre?.toUpperCase(),
        banco: data.banco?.toUpperCase(),
        numeroCuenta: data.numeroCuenta?.toUpperCase(),
        titular: data.titular?.toUpperCase(),
        alias: data.alias?.toUpperCase(),
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error creating cuenta bancaria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-cuenta-bancaria', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(CuentaBancaria);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CuentaBancaria ${id} no encontrada`);

      const updateData = { ...data };
      if (data.nombre) updateData.nombre = data.nombre.toUpperCase();
      if (data.banco) updateData.banco = data.banco.toUpperCase();
      if (data.numeroCuenta) updateData.numeroCuenta = data.numeroCuenta.toUpperCase();
      if (data.titular) updateData.titular = data.titular.toUpperCase();
      if (data.alias) updateData.alias = data.alias.toUpperCase();

      Object.assign(existing, updateData);
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating cuenta bancaria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-cuenta-bancaria', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(CuentaBancaria);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CuentaBancaria ${id} no encontrada`);
      existing.activo = false;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      await repo.save(existing);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting cuenta bancaria ${id}:`, error);
      throw error;
    }
  });

  // ===================== MAQUINAS POS =====================

  ipcMain.handle('get-maquinas-pos', async () => {
    try {
      const repo = dataSource.getRepository(MaquinaPos);
      return await repo.find({
        relations: ['cuentaBancaria', 'cuentaBancaria.moneda'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting maquinas pos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-maquina-pos', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(MaquinaPos);
      return await repo.findOne({
        where: { id },
        relations: ['cuentaBancaria', 'cuentaBancaria.moneda'],
      });
    } catch (error) {
      console.error(`Error getting maquina pos ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-maquina-pos', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(MaquinaPos);
      const entity = repo.create({
        ...data,
        nombre: data.nombre?.toUpperCase(),
        proveedor: data.proveedor?.toUpperCase(),
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error creating maquina pos:', error);
      throw error;
    }
  });

  ipcMain.handle('update-maquina-pos', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(MaquinaPos);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`MaquinaPos ${id} no encontrada`);

      const updateData = { ...data };
      if (data.nombre) updateData.nombre = data.nombre.toUpperCase();
      if (data.proveedor) updateData.proveedor = data.proveedor.toUpperCase();

      Object.assign(existing, updateData);
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating maquina pos ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-maquina-pos', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(MaquinaPos);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`MaquinaPos ${id} no encontrada`);
      existing.activo = false;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      await repo.save(existing);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting maquina pos ${id}:`, error);
      throw error;
    }
  });

  // ===================== ACREDITACIONES POS =====================

  ipcMain.handle('get-acreditaciones-pos', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(AcreditacionPos);
      const qb = repo.createQueryBuilder('a')
        .leftJoinAndSelect('a.maquinaPos', 'maquinaPos')
        .leftJoinAndSelect('a.cuentaBancaria', 'cuentaBancaria')
        .leftJoinAndSelect('cuentaBancaria.moneda', 'moneda')
        .leftJoinAndSelect('a.verificadoPor', 'verificadoPor')
        .orderBy('a.fechaTransaccion', 'DESC');

      if (filtros?.estado) {
        qb.andWhere('a.estado = :estado', { estado: filtros.estado });
      }
      if (filtros?.maquinaPosId) {
        qb.andWhere('a.maquina_pos_id = :mp', { mp: filtros.maquinaPosId });
      }
      if (filtros?.cuentaBancariaId) {
        qb.andWhere('a.cuenta_bancaria_id = :cb', { cb: filtros.cuentaBancariaId });
      }
      if (filtros?.fechaDesde) {
        qb.andWhere('a.fechaTransaccion >= :fd', { fd: filtros.fechaDesde });
      }
      if (filtros?.fechaHasta) {
        qb.andWhere('a.fechaTransaccion <= :fh', { fh: filtros.fechaHasta });
      }

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting acreditaciones pos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-acreditacion-pos', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(AcreditacionPos);
      return await repo.findOne({
        where: { id },
        relations: ['maquinaPos', 'cuentaBancaria', 'cuentaBancaria.moneda', 'verificadoPor'],
      });
    } catch (error) {
      console.error(`Error getting acreditacion pos ${id}:`, error);
      throw error;
    }
  });

  // Crea acreditacion (uso interno o desde flujo de cobro)
  // No actualiza saldo bancario hasta que sea acreditada (auto o verificada)
  ipcMain.handle('create-acreditacion-pos', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(AcreditacionPos);
      const maquinaRepo = dataSource.getRepository(MaquinaPos);

      const maquinaPosId = data.maquinaPos?.id || data.maquinaPosId;
      const maquina = await maquinaRepo.findOne({
        where: { id: maquinaPosId },
        relations: ['cuentaBancaria'],
      });
      if (!maquina) throw new Error(`MaquinaPos ${maquinaPosId} no encontrada`);

      const montoOriginal = Number(data.montoOriginal);
      const porcComision = Number(maquina.porcentajeComision || 0);
      const montoComision = +(montoOriginal * (porcComision / 100)).toFixed(2);
      const montoEsperado = +(montoOriginal - montoComision).toFixed(2);

      const fechaTransaccion = data.fechaTransaccion ? new Date(data.fechaTransaccion) : new Date();
      const fechaEsperada = new Date(fechaTransaccion);
      fechaEsperada.setMinutes(fechaEsperada.getMinutes() + (maquina.minutosAcreditacion || 0));

      const entity = repo.create({
        maquinaPos: { id: maquinaPosId } as any,
        cuentaBancaria: { id: maquina.cuentaBancaria?.id } as any,
        montoOriginal,
        montoComision,
        montoEsperado,
        fechaTransaccion,
        fechaEsperadaAcreditacion: fechaEsperada,
        estado: AcreditacionPosEstado.PENDIENTE,
        ventaId: data.ventaId || null,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error creating acreditacion pos:', error);
      throw error;
    }
  });

  // Procesa acreditaciones pendientes vencidas (manual / lazy on access)
  ipcMain.handle('procesar-acreditaciones-auto', async () => {
    try {
      return await procesarAcreditacionesPendientes(dataSource);
    } catch (error) {
      console.error('Error procesando acreditaciones auto:', error);
      throw error;
    }
  });

  // Verificar manualmente: usuario ingresa montoAcreditado real.
  // Si difiere del esperado → CON_DIFERENCIA y se ajusta saldo bancario.
  // Si coincide → VERIFICADO y se suma saldo (si aun no estaba acreditado).
  ipcMain.handle('verificar-acreditacion-pos', async (_event, id: number, montoAcreditado: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(AcreditacionPos);
      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);

      const acred = await repo.findOne({
        where: { id },
        relations: ['cuentaBancaria'],
      });
      if (!acred) throw new Error(`AcreditacionPos ${id} no encontrada`);

      const cb = await cbRepo.findOne({ where: { id: acred.cuentaBancaria.id } });
      if (!cb) throw new Error('Cuenta bancaria no encontrada');

      const montoEsperado = Number(acred.montoEsperado);
      const montoReal = Number(montoAcreditado);
      const diferencia = +(montoReal - montoEsperado).toFixed(2);

      // Estado previo
      const yaAcreditadoAuto = acred.estado === AcreditacionPosEstado.ACREDITADO_AUTO;

      if (yaAcreditadoAuto) {
        // Ya se sumo montoEsperado al saldo. Ajustar por la diferencia (puede ser + o -)
        if (diferencia !== 0) {
          cb.saldo = Number(cb.saldo) + diferencia;
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      } else {
        // Aun no acreditada: sumar el monto real al saldo
        cb.saldo = Number(cb.saldo) + montoReal;
        await queryRunner.manager.save(CuentaBancaria, cb);
      }

      acred.montoAcreditado = montoReal;
      acred.diferencia = diferencia;
      acred.estado = diferencia === 0
        ? AcreditacionPosEstado.VERIFICADO
        : AcreditacionPosEstado.CON_DIFERENCIA;
      acred.fechaAcreditacionReal = acred.fechaAcreditacionReal || new Date();
      acred.fechaVerificacion = new Date();
      const currentUser = getCurrentUser();
      if (currentUser) {
        acred.verificadoPor = currentUser;
      }
      await setEntityUserTracking(dataSource, acred, currentUser?.id, true);
      await queryRunner.manager.save(AcreditacionPos, acred);

      await queryRunner.commitTransaction();
      return acred;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error verificando acreditacion ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Acreditar transferencia bancaria: suma instantanea al saldo de la cuenta.
  // Usado en el flujo de cobro cuando la formaPago es transferencia/PIX.
  // No tiene comision, no genera AcreditacionPos.
  ipcMain.handle('acreditar-transferencia-bancaria', async (_event, payload: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const cuentaBancariaId = payload.cuentaBancariaId;
      const monto = Number(payload.monto);
      if (!cuentaBancariaId || monto <= 0) {
        throw new Error('Datos invalidos');
      }
      const repo = dataSource.getRepository(CuentaBancaria);
      const cb = await repo.findOne({ where: { id: cuentaBancariaId } });
      if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);
      cb.saldo = Number(cb.saldo) + monto;
      await repo.save(cb);
      return { success: true, saldoActual: Number(cb.saldo) };
    } catch (error) {
      console.error('Error acreditando transferencia bancaria:', error);
      throw error;
    }
  });

  // ===================== MOVIMIENTOS BANCARIOS (HISTORICO + AJUSTES MANUALES) =====================

  // Devuelve el historial completo de movimientos de una cuenta bancaria,
  // unificando MovimientosBancarios manuales + Cheques + AcreditacionesPos + OperacionesFinancieras + EntradasVarias
  ipcMain.handle('get-movimientos-cuenta-bancaria', async (_event, cuentaBancariaId: number, filtros?: any) => {
    try {
      const items: any[] = [];

      // 1. Movimientos manuales
      const mbRepo = dataSource.getRepository(MovimientoBancario);
      const mbQb = mbRepo.createQueryBuilder('mb')
        .leftJoinAndSelect('mb.responsable', 'responsable')
        .leftJoinAndSelect('responsable.persona', 'persona')
        .where('mb.cuenta_bancaria_id = :id', { id: cuentaBancariaId });
      if (filtros?.fechaDesde) mbQb.andWhere('mb.fecha >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) mbQb.andWhere('mb.fecha <= :fh', { fh: filtros.fechaHasta });
      const movs = await mbQb.getMany();
      for (const m of movs) {
        items.push({
          fecha: m.fecha,
          tipo: m.tipoMovimiento,
          monto: Number(m.monto),
          esIngreso: m.tipoMovimiento === MovimientoBancarioTipo.ENTRADA_MANUAL || m.tipoMovimiento === MovimientoBancarioTipo.AJUSTE_POSITIVO,
          descripcion: m.observacion || '-',
          numeroComprobante: m.numeroComprobante,
          responsable: m.responsable?.persona?.nombre || m.responsable?.nickname || '-',
          origen: 'MANUAL',
          id: m.id,
          anulado: m.anulado,
        });
      }

      // 2. Cheques (egresos cuando son cobrados)
      const chequeRows = await dbQuery(dataSource, 
        `SELECT id, monto, estado, fecha_cobro AS "fechaCobro", fecha_emision AS "fechaEmision",
                numero_cheque AS "numeroCheque", beneficiario, es_diferido AS "esDiferido"
         FROM cheques WHERE cuenta_bancaria_id = ?`,
        [cuentaBancariaId],
      );
      for (const ch of chequeRows) {
        if (ch.estado === 'COBRADO') {
          items.push({
            fecha: ch.fechaCobro || ch.fechaEmision,
            tipo: 'CHEQUE_COBRADO',
            monto: Number(ch.monto),
            esIngreso: false,
            descripcion: `Cheque #${ch.numeroCheque} - ${ch.beneficiario || 'AL PORTADOR'}`,
            numeroComprobante: ch.numeroCheque,
            responsable: '-',
            origen: 'CHEQUE',
            id: ch.id,
            anulado: false,
          });
        }
      }

      // 3. Acreditaciones POS (ingresos cuando se acreditan)
      const acredRows = await dbQuery(dataSource, 
        `SELECT a.id, a.monto_acreditado AS "montoAcreditado", a.monto_esperado AS "montoEsperado",
                a.fecha_acreditacion_real AS "fechaReal", a.fecha_transaccion AS "fechaTrans",
                a.estado, mp.nombre AS "maquinaNombre"
         FROM acreditaciones_pos a
         LEFT JOIN maquinas_pos mp ON a.maquina_pos_id = mp.id
         WHERE a.cuenta_bancaria_id = ?`,
        [cuentaBancariaId],
      );
      for (const a of acredRows) {
        if (a.estado === 'ACREDITADO_AUTO' || a.estado === 'VERIFICADO' || a.estado === 'CON_DIFERENCIA') {
          items.push({
            fecha: a.fechaReal || a.fechaTrans,
            tipo: 'ACREDITACION_POS',
            monto: Number(a.montoAcreditado || a.montoEsperado),
            esIngreso: true,
            descripcion: `Acreditacion POS - ${a.maquinaNombre || ''}`,
            numeroComprobante: null,
            responsable: '-',
            origen: 'POS',
            id: a.id,
            anulado: false,
          });
        }
      }

      // 4. Operaciones financieras (DEPOSITO_BANCARIO destino, RETIRO_BANCARIO origen)
      const opRows = await dbQuery(dataSource, 
        `SELECT id, tipo_operacion AS "tipoOp", descripcion, fecha,
                monto_origen AS "montoOrigen", monto_destino AS "montoDestino",
                cuenta_bancaria_origen_id AS "cbOrigenId", cuenta_bancaria_destino_id AS "cbDestinoId",
                anulado
         FROM operaciones_financieras
         WHERE (cuenta_bancaria_origen_id = ? OR cuenta_bancaria_destino_id = ?) AND anulado = false`,
        [cuentaBancariaId, cuentaBancariaId],
      );
      for (const op of opRows) {
        if (op.tipoOp === 'DEPOSITO_BANCARIO' && op.cbDestinoId === cuentaBancariaId) {
          items.push({
            fecha: op.fecha,
            tipo: 'DEPOSITO',
            monto: Number(op.montoDestino),
            esIngreso: true,
            descripcion: op.descripcion || 'Deposito bancario',
            numeroComprobante: null,
            responsable: '-',
            origen: 'OP_FIN',
            id: op.id,
            anulado: false,
          });
        } else if (op.tipoOp === 'RETIRO_BANCARIO' && op.cbOrigenId === cuentaBancariaId) {
          items.push({
            fecha: op.fecha,
            tipo: 'RETIRO',
            monto: Number(op.montoOrigen),
            esIngreso: false,
            descripcion: op.descripcion || 'Retiro bancario',
            numeroComprobante: null,
            responsable: '-',
            origen: 'OP_FIN',
            id: op.id,
            anulado: false,
          });
        }
      }

      // 5. Entradas Varias con destino cuenta bancaria
      const evRows = await dbQuery(dataSource, 
        `SELECT ev.id, ev.descripcion, ev.fecha, ev.monto, ev.anulado,
                cat.nombre AS "catNombre"
         FROM entradas_varias ev
         LEFT JOIN entradas_varias_categorias cat ON ev.entrada_varia_categoria_id = cat.id
         WHERE ev.cuenta_bancaria_id = ? AND ev.anulado = false`,
        [cuentaBancariaId],
      );
      for (const ev of evRows) {
        items.push({
          fecha: ev.fecha,
          tipo: 'ENTRADA_VARIA',
          monto: Number(ev.monto),
          esIngreso: true,
          descripcion: `${ev.catNombre || ''}: ${ev.descripcion}`,
          numeroComprobante: null,
          responsable: '-',
          origen: 'ENTRADA_VARIA',
          id: ev.id,
          anulado: !!ev.anulado,
        });
      }

      // 6. Gastos pagados desde esta cuenta bancaria (egresos)
      const gastoRows = await dbQuery(dataSource,
        `SELECT g.id, g.descripcion, g.fecha, g.created_at AS "createdAt",
                COALESCE(g.monto_cuenta_bancaria, g.monto) AS monto,
                g.numero_comprobante AS "numeroComprobante", cat.nombre AS "catNombre"
         FROM gastos g
         LEFT JOIN gastos_categorias cat ON g.gasto_categoria_id = cat.id
         WHERE g.cuenta_bancaria_id = ? AND g.estado <> 'CANCELADO'`,
        [cuentaBancariaId],
      );
      for (const g of gastoRows) {
        items.push({
          fecha: g.createdAt || g.fecha,
          tipo: 'GASTO',
          monto: Number(g.monto),
          esIngreso: false,
          descripcion: `${g.catNombre ? g.catNombre + ': ' : ''}${g.descripcion || ''}`.trim(),
          numeroComprobante: g.numeroComprobante || null,
          responsable: '-',
          origen: 'GASTO',
          id: g.id,
          anulado: false,
        });
      }

      // 7. Vales egresados desde esta cuenta bancaria (egresos)
      const valeRows = await dbQuery(dataSource,
        `SELECT v.id, v.descripcion, v.fecha, v.created_at AS "createdAt",
                COALESCE(v.monto_cuenta_bancaria, v.monto) AS monto,
                p.nombre AS "nombre", p.apellido AS "apellido"
         FROM vales v
         LEFT JOIN funcionarios f ON v.funcionario_id = f.id
         LEFT JOIN personas p ON f.persona_id = p.id
         WHERE v.cuenta_bancaria_id = ? AND v.estado <> 'ANULADO'`,
        [cuentaBancariaId],
      );
      for (const v of valeRows) {
        const func = `${v.nombre || ''} ${v.apellido || ''}`.trim();
        items.push({
          fecha: v.createdAt || v.fecha,
          tipo: 'VALE',
          monto: Number(v.monto),
          esIngreso: false,
          descripcion: `Vale${func ? ' - ' + func : ''}${v.descripcion ? ': ' + v.descripcion : ''}`,
          numeroComprobante: null,
          responsable: '-',
          origen: 'VALE',
          id: v.id,
          anulado: false,
        });
      }

      // 8. Cobros de cuotas CPC acreditados a esta cuenta bancaria (ingresos);
      //    los AJUSTE_NEGATIVO (anulaciones de cobro) figuran como egresos para
      //    que el neto coincida con el saldo.
      const cobroRows = await dbQuery(dataSource,
        `SELECT mc.id, mc.fecha, COALESCE(mc.monto_cuenta_bancaria, mc.monto) AS monto, mc.tipo, mc.observacion
         FROM movimientos_cliente mc
         WHERE mc.cuenta_bancaria_id = ? AND mc.tipo IN ('PAGO', 'AJUSTE_NEGATIVO')`,
        [cuentaBancariaId],
      );
      for (const mc of cobroRows) {
        const esPago = mc.tipo === 'PAGO';
        items.push({
          fecha: mc.fecha,
          tipo: 'COBRO_CLIENTE',
          monto: Number(mc.monto),
          esIngreso: esPago,
          descripcion: mc.observacion || (esPago ? 'Cobro cliente' : 'Anulación cobro cliente'),
          numeroComprobante: null,
          responsable: '-',
          origen: 'COBRO_CLIENTE',
          id: mc.id,
          anulado: false,
        });
      }

      // Filtros locales: fechas (sobre items unificados)
      let filtered = items;
      if (filtros?.fechaDesde) {
        const desde = new Date(filtros.fechaDesde);
        filtered = filtered.filter(i => new Date(i.fecha) >= desde);
      }
      if (filtros?.fechaHasta) {
        const hasta = new Date(filtros.fechaHasta);
        filtered = filtered.filter(i => new Date(i.fecha) <= hasta);
      }
      if (filtros?.tipo) {
        filtered = filtered.filter(i => i.tipo === filtros.tipo);
      }
      if (filtros?.esIngreso !== undefined && filtros?.esIngreso !== null) {
        filtered = filtered.filter(i => i.esIngreso === filtros.esIngreso);
      }

      // Ordenar por fecha desc
      filtered.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      // Paginacion
      const total = filtered.length;
      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        return { items: filtered.slice(page * pageSize, (page + 1) * pageSize), total };
      }

      return { items: filtered, total };
    } catch (error) {
      console.error(`Error getting movimientos cuenta bancaria ${cuentaBancariaId}:`, error);
      throw error;
    }
  });

  // Crear movimiento manual de cuenta bancaria (entrada/salida con motivo)
  ipcMain.handle('create-movimiento-bancario', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
      const mbRepo = queryRunner.manager.getRepository(MovimientoBancario);

      const cuentaBancariaId = data.cuentaBancariaId;
      const tipo = data.tipoMovimiento as MovimientoBancarioTipo;
      const monto = Number(data.monto);
      if (!cuentaBancariaId || monto <= 0) throw new Error('Datos invalidos');

      const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
      if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);

      const esIngreso = tipo === MovimientoBancarioTipo.ENTRADA_MANUAL || tipo === MovimientoBancarioTipo.AJUSTE_POSITIVO;
      cb.saldo = Number(cb.saldo) + (esIngreso ? monto : -monto);
      await queryRunner.manager.save(CuentaBancaria, cb);

      const currentUser = getCurrentUser();
      const mov = mbRepo.create({
        cuentaBancaria: { id: cuentaBancariaId } as any,
        tipoMovimiento: tipo,
        monto,
        fecha: data.fecha || new Date(),
        observacion: data.observacion?.toUpperCase() || null,
        numeroComprobante: data.numeroComprobante?.toUpperCase() || null,
        responsable: currentUser || undefined,
      });
      await setEntityUserTracking(dataSource, mov, currentUser?.id, false);
      const saved = await queryRunner.manager.save(MovimientoBancario, mov);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating movimiento bancario:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Obtener pendientes (atajo)
  ipcMain.handle('get-acreditaciones-pendientes', async () => {
    try {
      const repo = dataSource.getRepository(AcreditacionPos);
      return await repo.find({
        where: [
          { estado: AcreditacionPosEstado.PENDIENTE },
          { estado: AcreditacionPosEstado.ACREDITADO_AUTO },
        ],
        relations: ['maquinaPos', 'cuentaBancaria', 'cuentaBancaria.moneda'],
        order: { fechaTransaccion: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting acreditaciones pendientes:', error);
      throw error;
    }
  });

  // ===================== CHEQUERAS =====================

  ipcMain.handle('get-chequeras', async () => {
    try {
      const repo = dataSource.getRepository(Chequera);
      return await repo.find({
        relations: ['cuentaBancaria', 'cuentaBancaria.moneda'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting chequeras:', error);
      throw error;
    }
  });

  ipcMain.handle('get-chequera', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Chequera);
      return await repo.findOne({
        where: { id },
        relations: ['cuentaBancaria', 'cuentaBancaria.moneda'],
      });
    } catch (error) {
      console.error(`Error getting chequera ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-chequera', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(Chequera);
      const entity = repo.create({
        ...data,
        nombre: data.nombre?.toUpperCase(),
        numeroInicial: data.numeroInicial?.toUpperCase(),
        numeroFinal: data.numeroFinal?.toUpperCase(),
        siguienteNumero: data.siguienteNumero?.toUpperCase() || data.numeroInicial?.toUpperCase(),
        observacion: data.observacion?.toUpperCase() || null,
        cuentaBancaria: data.cuentaBancariaId ? { id: data.cuentaBancariaId } : data.cuentaBancaria,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating chequera:', error);
      throw error;
    }
  });

  ipcMain.handle('update-chequera', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(Chequera);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Chequera ${id} no encontrada`);
      const merge: any = { ...data };
      if (data.nombre) merge.nombre = data.nombre.toUpperCase();
      if (data.numeroInicial) merge.numeroInicial = data.numeroInicial.toUpperCase();
      if (data.numeroFinal) merge.numeroFinal = data.numeroFinal.toUpperCase();
      if (data.siguienteNumero) merge.siguienteNumero = data.siguienteNumero.toUpperCase();
      if (data.observacion) merge.observacion = data.observacion.toUpperCase();
      repo.merge(entity, merge);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating chequera ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-chequera', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
      const repo = dataSource.getRepository(Chequera);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Chequera ${id} no encontrada`);
      entity.estado = ChequeraEstado.ANULADA;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting chequera ${id}:`, error);
      throw error;
    }
  });

  // ===================== CHEQUES =====================

  ipcMain.handle('get-cheques', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Cheque);
      const qb = repo.createQueryBuilder('ch')
        .leftJoinAndSelect('ch.chequera', 'chequera')
        .leftJoinAndSelect('ch.cuentaBancaria', 'cuentaBancaria')
        .leftJoinAndSelect('ch.moneda', 'moneda')
        .leftJoinAndSelect('ch.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('ch.formaPago', 'formaPago')
        .leftJoinAndSelect('ch.proveedor', 'proveedor')
        .leftJoinAndSelect('proveedor.persona', 'proveedorPersona')
        .leftJoinAndSelect('ch.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('ch.fechaEmision', 'DESC');

      if (filtros?.estado) qb.andWhere('ch.estado = :estado', { estado: filtros.estado });
      if (filtros?.chequeraId) qb.andWhere('ch.chequera_id = :chId', { chId: filtros.chequeraId });
      if (filtros?.cuentaBancariaId) qb.andWhere('ch.cuenta_bancaria_id = :cbId', { cbId: filtros.cuentaBancariaId });
      if (filtros?.fechaDesde) qb.andWhere('ch.fechaEmision >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) qb.andWhere('ch.fechaEmision <= :fh', { fh: filtros.fechaHasta });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting cheques:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cheque', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Cheque);
      return await repo.findOne({
        where: { id },
        relations: ['chequera', 'cuentaBancaria', 'cuentaBancaria.moneda', 'moneda', 'cajaMayor', 'formaPago', 'createdBy', 'createdBy.persona'],
      });
    } catch (error) {
      console.error(`Error getting cheque ${id}:`, error);
      throw error;
    }
  });

  // Emitir cheque transaccional:
  // - Diferido: suma a saldoReservado de la cuenta. NO genera EGRESO_CHEQUE en caja mayor todavia.
  // - No diferido (a la vista): descuenta saldo cuenta bancaria + genera EGRESO_CHEQUE en caja mayor.
  // - Avanza el siguienteNumero de la chequera.
  ipcMain.handle('emitir-cheque', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const chequeraRepo = queryRunner.manager.getRepository(Chequera);
      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
      const chequeraId = data.chequeraId || data.chequera?.id;
      const chequera = await chequeraRepo.findOne({
        where: { id: chequeraId },
        relations: ['cuentaBancaria'],
      });
      if (!chequera) throw new Error(`Chequera ${chequeraId} no encontrada`);
      if (chequera.estado !== ChequeraEstado.ACTIVA) throw new Error('La chequera no esta activa');

      const cuentaBancariaId = chequera.cuentaBancaria.id;
      const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
      if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);

      const monto = Number(data.monto);
      const esDiferido = !!data.esDiferido;

      const cheque = queryRunner.manager.create(Cheque, {
        chequera: { id: chequeraId },
        cuentaBancaria: { id: cuentaBancariaId },
        numeroCheque: (data.numeroCheque || chequera.siguienteNumero).toUpperCase(),
        monto,
        moneda: { id: data.monedaId },
        beneficiario: data.beneficiario?.toUpperCase() || null,
        proveedor: data.proveedorId ? { id: data.proveedorId } : null,
        fechaEmision: data.fechaEmision || new Date(),
        fechaPago: data.fechaPago || null,
        estado: esDiferido ? ChequeEstado.DIFERIDO : ChequeEstado.EMITIDO,
        esDiferido,
        cajaMayor: data.cajaMayorId ? { id: data.cajaMayorId } : null,
        formaPago: data.formaPagoId ? { id: data.formaPagoId } : null,
        observacion: data.observacion?.toUpperCase() || null,
      });
      await setEntityUserTracking(dataSource, cheque, getCurrentUser()?.id, false);
      const saved = await queryRunner.manager.save(Cheque, cheque);

      // Avanzar siguienteNumero (comparacion numerica para detectar AGOTADA)
      chequera.siguienteNumero = siguienteNumeroCheque(chequera.siguienteNumero);
      if (numeroChequeAsInt(chequera.siguienteNumero) > numeroChequeAsInt(chequera.numeroFinal)) {
        chequera.estado = ChequeraEstado.AGOTADA;
      }
      await queryRunner.manager.save(Chequera, chequera);

      if (esDiferido) {
        cb.saldoReservado = Number(cb.saldoReservado) + monto;
        await queryRunner.manager.save(CuentaBancaria, cb);
      } else {
        cb.saldo = Number(cb.saldo) - monto;
        await queryRunner.manager.save(CuentaBancaria, cb);

        if (data.cajaMayorId && data.monedaId && data.formaPagoId) {
          const currentUser = getCurrentUser();
          const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: data.cajaMayorId },
            tipoMovimiento: TipoMovimiento.EGRESO_CHEQUE,
            moneda: { id: data.monedaId },
            formaPago: { id: data.formaPagoId },
            monto,
            fecha: data.fechaEmision || new Date(),
            observacion: `CHEQUE #${saved.numeroCheque} - ${data.beneficiario || ''}`.toUpperCase(),
            chequeId: saved.id,
          });
          if (currentUser) movimiento.responsable = currentUser;
          await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
          await actualizarSaldoCajaMayor(queryRunner, data.cajaMayorId, data.monedaId, data.formaPagoId, monto, TipoMovimiento.EGRESO_CHEQUE);
        }

        saved.estado = ChequeEstado.COBRADO;
        saved.fechaCobro = new Date();
        await queryRunner.manager.save(Cheque, saved);
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error emitiendo cheque:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Cobrar cheque diferido: descuenta saldo real de cuenta + libera saldoReservado
  ipcMain.handle('cobrar-cheque', async (_event, id: number, data?: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const chequeRepo = queryRunner.manager.getRepository(Cheque);
      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);

      const cheque = await chequeRepo.findOne({
        where: { id },
        relations: ['cuentaBancaria', 'moneda', 'cajaMayor', 'formaPago'],
      });
      if (!cheque) throw new Error(`Cheque ${id} no encontrado`);
      if (cheque.estado === ChequeEstado.COBRADO) throw new Error('El cheque ya fue cobrado');
      if (cheque.estado === ChequeEstado.ANULADO) throw new Error('El cheque esta anulado');

      const cb = await cbRepo.findOne({ where: { id: cheque.cuentaBancaria.id } });
      if (!cb) throw new Error('Cuenta bancaria no encontrada');

      const monto = Number(cheque.monto);

      if (cheque.esDiferido) {
        cb.saldoReservado = Math.max(0, Number(cb.saldoReservado) - monto);
      }
      cb.saldo = Number(cb.saldo) - monto;
      await queryRunner.manager.save(CuentaBancaria, cb);

      if (cheque.cajaMayor && cheque.moneda && cheque.formaPago) {
        const currentUser = getCurrentUser();
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cheque.cajaMayor.id },
          tipoMovimiento: TipoMovimiento.EGRESO_CHEQUE,
          moneda: { id: cheque.moneda.id },
          formaPago: { id: cheque.formaPago.id },
          monto,
          fecha: new Date(),
          observacion: `COBRO CHEQUE #${cheque.numeroCheque}`.toUpperCase(),
          chequeId: cheque.id,
        });
        if (currentUser) movimiento.responsable = currentUser;
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
        await actualizarSaldoCajaMayor(queryRunner, cheque.cajaMayor.id, cheque.moneda.id, cheque.formaPago.id, monto, TipoMovimiento.EGRESO_CHEQUE);
      }

      cheque.estado = ChequeEstado.COBRADO;
      cheque.fechaCobro = data?.fechaCobro || new Date();
      await setEntityUserTracking(dataSource, cheque, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Cheque, cheque);

      await queryRunner.commitTransaction();
      return cheque;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error cobrando cheque ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Anular cheque: libera saldo reservado si era diferido. Si ya estaba cobrado, no se permite.
  ipcMain.handle('anular-cheque', async (_event, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const chequeRepo = queryRunner.manager.getRepository(Cheque);
      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);

      const cheque = await chequeRepo.findOne({
        where: { id },
        relations: ['cuentaBancaria'],
      });
      if (!cheque) throw new Error(`Cheque ${id} no encontrado`);
      if (cheque.estado === ChequeEstado.COBRADO) throw new Error('No se puede anular un cheque cobrado');
      if (cheque.estado === ChequeEstado.ANULADO) throw new Error('El cheque ya esta anulado');

      if (cheque.esDiferido) {
        const cb = await cbRepo.findOne({ where: { id: cheque.cuentaBancaria.id } });
        if (cb) {
          cb.saldoReservado = Math.max(0, Number(cb.saldoReservado) - Number(cheque.monto));
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      }

      cheque.estado = ChequeEstado.ANULADO;
      cheque.motivoAnulacion = motivo?.toUpperCase() || null;
      await setEntityUserTracking(dataSource, cheque, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Cheque, cheque);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando cheque ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });
}
