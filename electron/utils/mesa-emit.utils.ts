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
 * Avisa a las terminales que una caja cambió de estado (se abrió, se cerró o
 * se ajustó). Es lo que hace que el PdV deje de operar contra una caja que ya
 * se cerró sin que el cajero toque nada.
 *
 * ⚠️ **Se llama SIEMPRE DESPUÉS DEL COMMIT.** Emitir adentro de la transacción
 * avisaría de un cambio que todavía puede hacer rollback, y el cliente
 * revalidaría contra `get-caja` leyendo el estado viejo: quedaría convencido de
 * que la caja sigue abierta justo cuando dejó de estarlo.
 *
 * ⚠️ **`seq` es `Date.now()`**, no la columna `seq` de la entidad: `cajas` no
 * tiene esa columna (ver `MesaEventPayload.seq`). El cliente no compara este
 * `seq` contra los de mesa/comanda.
 *
 * Best-effort de punta a punta: nunca lanza. El invariante de caja lo sostiene
 * el guard del backend (`caja-abierta.utils.ts`); este evento sólo adelanta el
 * aviso, así que un fallo del bus no puede romper la apertura ni el cierre.
 */
export async function emitCajaCambio(
  ds: DataSource | EntityManager,
  cajaId: number,
  estado: string,
  dispositivoId?: number | null,
): Promise<void> {
  try {
    const id = Number(cajaId) || 0;
    if (!id) return;

    let disp = dispositivoId ?? null;
    if (disp == null) {
      const manager = ds instanceof DataSource ? ds.manager : ds;
      const fila = await manager
        .createQueryBuilder()
        .select('c.dispositivo_id', 'dispositivoId')
        .from('cajas', 'c')
        .where('c.id = :id', { id })
        .getRawOne();
      disp = fila?.dispositivoId != null ? Number(fila.dispositivoId) : null;
    }

    broadcastMesaEvent({
      tipo: 'CAJA_CAMBIO',
      cajaId: id,
      cajaEstado: String(estado || '').toUpperCase(),
      dispositivoId: disp,
      seq: Date.now(),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(`[mesa-emit] no se pudo emitir CAJA_CAMBIO de la caja ${cajaId}:`, e);
  }
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
