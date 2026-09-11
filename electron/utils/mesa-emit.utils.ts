/**
 * Helper para emitir eventos SSE de mesas/comandas del PdV.
 *
 * Incrementa el seq de la entidad y emite el evento. DEBE llamarse DENTRO de
 * withMesaLock / withComandaLock para garantizar el orden de seq.
 */
import { DataSource, EntityManager } from 'typeorm';
import { broadcastMesaEvent, MesaEventTipo } from './mesa-events.utils';

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

  // Incrementar seq
  await manager.query(
    `UPDATE pdv_mesas SET seq = COALESCE(seq, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [mesaId],
  );

  // Leer el seq actualizado para el evento
  const result = await manager.query(`SELECT seq FROM pdv_mesas WHERE id = ?`, [mesaId]);
  const seq = result[0]?.seq ?? Date.now();

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

  // Incrementar seq
  await manager.query(
    `UPDATE comandas SET seq = COALESCE(seq, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [comandaId],
  );

  // Leer el seq actualizado
  const result = await manager.query(`SELECT seq FROM comandas WHERE id = ?`, [comandaId]);
  const seq = result[0]?.seq ?? Date.now();

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
    .createQueryBuilder()
    .select('v')
    .from('ventas', 'v')
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
