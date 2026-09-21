/**
 * Helper para emitir eventos SSE de mesas/comandas del PdV.
 *
 * Incrementa el seq de la entidad y emite el evento. DEBE llamarse DENTRO de
 * withMesaLock / withComandaLock para garantizar el orden de seq.
 */
import { DataSource, EntityManager } from 'typeorm';
import { broadcastMesaEvent, MesaEventTipo } from './mesa-events.utils';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { Comanda } from '../../src/app/database/entities/ventas/comanda.entity';

/**
 * Incrementa seq de una mesa y emite evento MESA_CAMBIO.
 *
 * @param ds DataSource o EntityManager (para transacciones)
 * @param mesaId ID de la mesa que cambió
 */
export async function emitMesaCambio(
  ds: DataSource | EntityManager,
  mesaId: number,
): Promise<void> {
  const manager = ds instanceof DataSource ? ds.manager : ds;

  // Incrementar seq con TypeORM QueryBuilder (funciona en SQLite y Postgres)
  await manager
    .createQueryBuilder()
    .update('pdv_mesas')
    .set({
      seq: () => 'COALESCE(seq, 0) + 1',
      updatedAt: () => 'CURRENT_TIMESTAMP',
    })
    .where('id = :mesaId', { mesaId })
    .execute();

  // Leer el seq actualizado para el evento
  const result = await manager
    .createQueryBuilder()
    .select('seq')
    .from('pdv_mesas', 'mesa')
    .where('id = :mesaId', { mesaId })
    .getRawOne();
  const seq = result?.seq ?? Date.now();

  broadcastMesaEvent({
    tipo: 'MESA_CAMBIO',
    mesaId,
    seq,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Incrementa seq de una comanda y emite evento COMANDA_CAMBIO.
 *
 * @param ds DataSource o EntityManager (para transacciones)
 * @param comandaId ID de la comanda que cambió
 */
export async function emitComandaCambio(
  ds: DataSource | EntityManager,
  comandaId: number,
): Promise<void> {
  const manager = ds instanceof DataSource ? ds.manager : ds;

  // Incrementar seq con TypeORM QueryBuilder (funciona en SQLite y Postgres)
  await manager
    .createQueryBuilder()
    .update('comandas')
    .set({
      seq: () => 'COALESCE(seq, 0) + 1',
      updatedAt: () => 'CURRENT_TIMESTAMP',
    })
    .where('id = :comandaId', { comandaId })
    .execute();

  // Leer el seq actualizado
  const result = await manager
    .createQueryBuilder()
    .select('seq')
    .from('comandas', 'comanda')
    .where('id = :comandaId', { comandaId })
    .getRawOne();
  const seq = result?.seq ?? Date.now();

  broadcastMesaEvent({
    tipo: 'COMANDA_CAMBIO',
    comandaId,
    seq,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Emite evento para una venta según su contenedor (mesa o comanda).
 * Lee la venta con sus relaciones y emite el evento correspondiente.
 *
 * @param ds DataSource o EntityManager
 * @param ventaId ID de la venta que cambió
 */
export async function emitVentaCambio(
  ds: DataSource | EntityManager,
  ventaId: number,
): Promise<void> {
  const manager = ds instanceof DataSource ? ds.manager : ds;

  // Leer venta con mesa y comanda (sin cargar ítems completos)
  const venta = await manager
    .createQueryBuilder(Venta, 'v')
    .leftJoin('v.mesa', 'mesa')
    .leftJoin('v.comanda', 'comanda')
    .addSelect(['mesa.id', 'comanda.id'])
    .where('v.id = :ventaId', { ventaId })
    .getOne();

  if (!venta) return;

  // Emitir según el contenedor
  if ((venta as any).mesa?.id) {
    await emitMesaCambio(manager, (venta as any).mesa.id);
  } else if ((venta as any).comanda?.id) {
    await emitComandaCambio(manager, (venta as any).comanda.id);
  }
}
