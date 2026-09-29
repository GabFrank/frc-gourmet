import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { GastoCaja } from '../../src/app/database/entities/financiero/gasto-caja.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { selectUsuarioPublico } from '../utils/select-usuario-publico.util';
import {
  assertCajaOperableConAjuste,
  emitirCambioDeCajaAjustada,
  estamparTrazaAjuste,
} from '../utils/caja-abierta.utils';
import { enTransaccionSiPostgres } from '../utils/tx.utils';

/**
 * Handlers de gastos pagados con el efectivo de la caja de venta (PdV).
 * Modelo simple (una fila por gasto); descuenta del cajón y se lista en el
 * resumen de cierre. No pasa por Caja Mayor.
 *
 * ⚠️ **Los tres canales corren guard + escritura + traza en UNA sola
 * transacción** (hallazgos M7/P7), vía `enTransaccionSiPostgres`:
 *  - sin transacción, `assertCajaOperableConAjuste` recibía el `DataSource`, así
 *    que `puedeBloquear` devolvía `false` y nunca se tomaba el `FOR SHARE`: el
 *    TOCTOU con un cierre concurrente quedaba abierto justo en los canales de
 *    los que habla D6;
 *  - y si `estamparTrazaAjuste` fallaba, el gasto ya estaba commiteado: el
 *    llamador recibía un error por una operación que sí había ocurrido, y la
 *    caja quedaba ajustada sin `revisado`/`motivoAjuste`.
 * En SQLite el helper NO abre transacción a propósito (ver su encabezado: dos
 * `dataSource.transaction()` intercalados comparten la transacción física y el
 * rollback de uno se lleva los INSERT del otro).
 */
export function registerGastosCajaHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // Crear un gasto de caja de venta
  ipcMain.handle('create-gasto-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const repo = dataSource.getRepository(GastoCaja);
    const cu = getCurrentUser();

    const monto = Number(data.monto);
    if (!data.cajaId) throw new Error('Falta la caja');
    if (!monto || monto <= 0) throw new Error('El monto debe ser mayor a cero');
    if (!data.descripcion?.trim()) throw new Error('La descripción es obligatoria');

    const entity = repo.create({
      caja: { id: data.cajaId } as any,
      gastoCategoria: data.gastoCategoriaId ? ({ id: data.gastoCategoriaId } as any) : null,
      descripcion: String(data.descripcion).toUpperCase().trim(),
      monto,
      moneda: data.monedaId ? ({ id: data.monedaId } as any) : null,
      formaPago: data.formaPagoId ? ({ id: data.formaPagoId } as any) : null,
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      estado: 'ACTIVO',
    });
    await setEntityUserTracking(dataSource, entity, cu?.id, false);

    // Invariante de caja + llave de ajuste (D6). El PdV nunca manda `ajuste`;
    // Financiero › Cajas sí, para "agregar el gasto que faltó" sobre una caja ya
    // cerrada. El permiso operativo ya se chequeó arriba: el de ajuste va
    // después, para que un cajero que se equivoca de caja lea «la caja #N ya fue
    // cerrada» y no «PERMISO REQUERIDO».
    const { guardado, ajuste } = await enTransaccionSiPostgres(dataSource, async (manager) => {
      const esAjuste = await assertCajaOperableConAjuste(manager, data.cajaId, data.ajuste, {
        dataSource,
        getCurrentUser,
        contexto: 'create-gasto-caja',
        lock: 'read',
      });
      const fila = await manager.getRepository(GastoCaja).save(entity);
      if (esAjuste.esAjuste) {
        await estamparTrazaAjuste(manager, Number(data.cajaId), esAjuste.motivo!, getCurrentUser);
      }
      return { guardado: fila, ajuste: esAjuste };
    });
    // Aviso a las terminales DESPUÉS del commit (P8): un ajuste cambia el arqueo
    // y `revisado` de una caja que el PdV y los resúmenes están mirando. Sólo se
    // emite en el ajuste: un gasto del turno normal no mueve el estado de la
    // caja y no vale spamear el bus en cada hielo.
    if (ajuste.esAjuste) await emitirCambioDeCajaAjustada(dataSource, data.cajaId);
    return guardado;
  });

  // Listar gastos de una caja (por defecto solo ACTIVOS)
  ipcMain.handle('get-gastos-caja', async (_event, cajaId: number, incluirAnulados?: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
    const repo = dataSource.getRepository(GastoCaja);
    const qb = repo.createQueryBuilder('gasto')
      .leftJoinAndSelect('gasto.gastoCategoria', 'gastoCategoria')
      .leftJoinAndSelect('gasto.moneda', 'moneda')
      .leftJoinAndSelect('gasto.formaPago', 'formaPago')
      .where('gasto.caja_id = :cajaId', { cajaId })
      .orderBy('gasto.fecha', 'DESC')
      .addOrderBy('gasto.id', 'DESC');
    if (!incluirAnulados) qb.andWhere('gasto.estado = :estado', { estado: 'ACTIVO' });
    // `createdBy` recortado: con `relations` viajaba la `Persona` del cajero.
    selectUsuarioPublico(qb, 'gasto.createdBy', 'createdBy');
    return await qb.getMany();
  });

  // Anular un gasto (no se borra; queda registro)
  ipcMain.handle('anular-gasto-caja', async (_event, gastoId: number, motivo?: string, opts?: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const repo = dataSource.getRepository(GastoCaja);
    // ⚠️ `findOneBy` NO trae la relación `caja`: sin ella el guard sería un
    // no-op silencioso (mismo modo de falla que documenta `createPagoDetalle`).
    const entity = await repo.findOne({ where: { id: gastoId }, relations: ['caja'] });
    if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);

    // Anular un gasto cambia el esperado del arqueo tanto como crearlo.
    const cajaId = (entity.caja as any)?.id ?? null;
    entity.estado = 'ANULADO';
    entity.motivoAnulacion = (motivo || '').toUpperCase().trim() || undefined;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);

    const { guardado, ajuste } = await enTransaccionSiPostgres(dataSource, async (manager) => {
      const esAjuste = await assertCajaOperableConAjuste(manager, cajaId, opts?.ajuste, {
        dataSource,
        getCurrentUser,
        contexto: 'anular-gasto-caja',
        lock: 'read',
      });
      const fila = await manager.getRepository(GastoCaja).save(entity);
      if (esAjuste.esAjuste && cajaId) {
        await estamparTrazaAjuste(manager, Number(cajaId), esAjuste.motivo!, getCurrentUser);
      }
      return { guardado: fila, ajuste: esAjuste };
    });
    if (ajuste.esAjuste && cajaId) await emitirCambioDeCajaAjustada(dataSource, cajaId);
    return guardado;
  });

  // Editar un gasto activo (solo admin y gerente)
  ipcMain.handle('edit-gasto-caja', async (_event, gastoId: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    const repo = dataSource.getRepository(GastoCaja);
    const cu = getCurrentUser();

    // Ídem `anular-gasto-caja`: la relación `caja` es lo que hace efectivo el guard.
    const entity = await repo.findOne({ where: { id: gastoId }, relations: ['caja'] });
    if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
    if (entity.estado === 'ANULADO') {
      throw new Error('No se puede editar un gasto anulado. Creá uno nuevo si hace falta.');
    }

    // Validar datos editables
    const nuevoMonto = data.monto != null ? Number(data.monto) : entity.monto;
    if (!nuevoMonto || nuevoMonto <= 0) {
      throw new Error('El monto debe ser mayor a cero');
    }
    if (data.descripcion && !String(data.descripcion).trim()) {
      throw new Error('La descripción no puede estar vacía');
    }

    // Editar cambia el monto → cambia el esperado del arqueo. Mismo tratamiento
    // que crear y anular.
    const cajaId = (entity.caja as any)?.id ?? null;

    // Actualizar campos editables: monto, descripción, categoría
    entity.monto = nuevoMonto;
    if (data.descripcion != null) {
      entity.descripcion = String(data.descripcion).toUpperCase().trim();
    }
    if (data.gastoCategoriaId !== undefined) {
      entity.gastoCategoria = data.gastoCategoriaId ? ({ id: data.gastoCategoriaId } as any) : null;
    }

    // Auditoría: updatedBy + updatedAt (BaseModel)
    await setEntityUserTracking(dataSource, entity, cu?.id, true);

    const { guardado, ajuste } = await enTransaccionSiPostgres(dataSource, async (manager) => {
      const esAjuste = await assertCajaOperableConAjuste(manager, cajaId, data.ajuste, {
        dataSource,
        getCurrentUser,
        contexto: 'edit-gasto-caja',
        lock: 'read',
      });
      const fila = await manager.getRepository(GastoCaja).save(entity);
      if (esAjuste.esAjuste && cajaId) {
        await estamparTrazaAjuste(manager, Number(cajaId), esAjuste.motivo!, getCurrentUser);
      }
      return { guardado: fila, ajuste: esAjuste };
    });
    if (ajuste.esAjuste && cajaId) await emitirCambioDeCajaAjustada(dataSource, cajaId);
    return guardado;
  });

  // Obtener un gasto por ID (para edición)
  ipcMain.handle('get-gasto-caja', async (_event, gastoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    const repo = dataSource.getRepository(GastoCaja);
    const entity = await repo.findOne({
      where: { id: gastoId },
      relations: ['gastoCategoria', 'moneda', 'formaPago', 'caja'],
    });
    if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
    return entity;
  });
}
