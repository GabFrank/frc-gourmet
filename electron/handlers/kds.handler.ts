/**
 * Handlers IPC del KDS (Kitchen Display System).
 *
 * - `get-kds-comandas`: feed de items en preparación para una/varias pantallas
 *   (filtrado por sectores). Devuelve filas planas con todo lo que la card
 *   necesita; el front agrupa por venta en "tickets".
 * - `update-comanda-item-estado`: transición de estado (PENDIENTE →
 *   EN_PREPARACION → LISTO → ENTREGADO, o CANCELADO). Sella timestamps y
 *   `updated_by`, y emite evento para refrescar las pantallas en vivo.
 * - `bump-comanda-item`: avanza al siguiente estado (atajo para el "bump bar"
 *   numpad/mouse de la pantalla).
 *
 * El KDS reusa el ruteo por sector (M2M producto_sectores) ya existente; estos
 * handlers no imprimen nada — solo mueven estado digital.
 */

import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { KdsPantalla } from '../../src/app/database/entities/ventas/kds-pantalla.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { broadcastComandaEvent } from '../utils/comanda-events.utils';

type GetCurrentUser = () => Usuario | null;

/** Estados que el KDS muestra por defecto (cola activa de cocina). */
const ESTADOS_ACTIVOS = [
  ComandaItemEstado.PENDIENTE,
  ComandaItemEstado.EN_PREPARACION,
  ComandaItemEstado.LISTO,
];

/** Orden lógico para el "bump" (avanzar al siguiente). */
const FLUJO: ComandaItemEstado[] = [
  ComandaItemEstado.PENDIENTE,
  ComandaItemEstado.EN_PREPARACION,
  ComandaItemEstado.LISTO,
  ComandaItemEstado.ENTREGADO,
];

export interface GetKdsComandasParams {
  sectorIds?: number[];      // pantallas filtran por sus sectores; vacío/undef = todos
  estados?: string[];        // default: PENDIENTE/EN_PREPARACION/LISTO
  incluirEntregados?: boolean; // para vista histórica
}

/**
 * Devuelve las filas del feed KDS. Una fila por (ventaItem, sector). El front
 * agrupa por `ventaId` en tickets y ordena por `createdAt` (más viejo arriba).
 */
async function getKdsComandas(dataSource: DataSource, params: GetKdsComandasParams = {}): Promise<any[]> {
  const estados = (params.estados && params.estados.length > 0)
    ? params.estados
    : (params.incluirEntregados ? [...ESTADOS_ACTIVOS, ComandaItemEstado.ENTREGADO] : ESTADOS_ACTIVOS);

  const qb = dataSource.getRepository(ComandaItem)
    .createQueryBuilder('ci')
    .innerJoin('ci.ventaItem', 'vi')
    .innerJoin('vi.venta', 'venta')
    .leftJoin('vi.producto', 'producto')
    .leftJoin('ci.sector', 'sector')
    .leftJoin('venta.mesa', 'mesa')
    .leftJoin('venta.comanda', 'comanda')
    .select([
      'ci.id AS "id"',
      'ci.estado AS "estado"',
      'ci.observacion AS "observacion"',
      'ci.created_at AS "createdAt"',
      'ci.fecha_en_preparacion AS "fechaEnPreparacion"',
      'ci.fecha_listo AS "fechaListo"',
      'sector.id AS "sectorId"',
      'sector.nombre AS "sectorNombre"',
      'venta.id AS "ventaId"',
      'vi.id AS "ventaItemId"',
      'vi.cantidad AS "cantidad"',
      'vi.ensamblado_descripcion AS "ensambladoDescripcion"',
      'producto.nombre AS "productoNombre"',
      'mesa.numero AS "mesaNumero"',
      'comanda.codigo AS "comandaCodigo"',
      'comanda.numero AS "comandaNumero"',
    ])
    .where('ci.activo = :activo', { activo: true })
    .andWhere('ci.estado IN (:...estados)', { estados })
    .orderBy('ci.created_at', 'ASC');

  if (params.sectorIds && params.sectorIds.length > 0) {
    qb.andWhere('ci.sector_id IN (:...secs)', { secs: params.sectorIds });
  }

  return await qb.getRawMany();
}

async function transicionar(
  dataSource: DataSource,
  getCurrentUser: GetCurrentUser,
  comandaItemId: number,
  nuevoEstado: ComandaItemEstado,
): Promise<ComandaItem> {
  const repo = dataSource.getRepository(ComandaItem);
  const ci = await repo.findOne({ where: { id: comandaItemId }, relations: ['sector', 'ventaItem', 'ventaItem.venta'] });
  if (!ci) throw new Error(`ComandaItem ${comandaItemId} no encontrado`);

  ci.estado = nuevoEstado;
  if (nuevoEstado === ComandaItemEstado.EN_PREPARACION && !ci.fechaEnPreparacion) {
    ci.fechaEnPreparacion = new Date();
  }
  if (nuevoEstado === ComandaItemEstado.LISTO && !ci.fechaListo) {
    ci.fechaListo = new Date();
  }
  await setEntityUserTracking(dataSource, ci, getCurrentUser()?.id, true);
  const saved = await repo.save(ci);

  const ventaId = (ci as any).ventaItem?.venta?.id ?? null;
  const sectorId = (ci as any).sector?.id ?? null;
  broadcastComandaEvent({
    tipo: nuevoEstado === ComandaItemEstado.CANCELADO ? 'CANCELADO' : 'ESTADO',
    comandaItemId: saved.id,
    ventaId,
    sectorId,
    estado: nuevoEstado,
  });
  return saved;
}

export function registerKdsHandlers(
  dataSource: DataSource,
  getCurrentUser: GetCurrentUser,
) {
  ipcMain.handle('get-kds-comandas', async (_event, params: GetKdsComandasParams = {}) => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_VER', 'VENTAS_PDV']);
    return await getKdsComandas(dataSource, params);
  });

  ipcMain.handle('update-comanda-item-estado', async (_event, comandaItemId: number, nuevoEstado: string) => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_OPERAR', 'VENTAS_PDV']);
    if (!Object.values(ComandaItemEstado).includes(nuevoEstado as ComandaItemEstado)) {
      throw new Error(`Estado inválido: ${nuevoEstado}`);
    }
    return await transicionar(dataSource, getCurrentUser, comandaItemId, nuevoEstado as ComandaItemEstado);
  });

  // Avanza al siguiente estado del flujo (bump). Desde LISTO → ENTREGADO.
  ipcMain.handle('bump-comanda-item', async (_event, comandaItemId: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_OPERAR', 'VENTAS_PDV']);
    const repo = dataSource.getRepository(ComandaItem);
    const ci = await repo.findOne({ where: { id: comandaItemId } });
    if (!ci) throw new Error(`ComandaItem ${comandaItemId} no encontrado`);
    const idx = FLUJO.indexOf(ci.estado);
    const siguiente = idx >= 0 && idx < FLUJO.length - 1 ? FLUJO[idx + 1] : ci.estado;
    return await transicionar(dataSource, getCurrentUser, comandaItemId, siguiente);
  });

  // Recall: retrocede un paso (deshacer un bump accidental).
  ipcMain.handle('recall-comanda-item', async (_event, comandaItemId: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_OPERAR', 'VENTAS_PDV']);
    const repo = dataSource.getRepository(ComandaItem);
    const ci = await repo.findOne({ where: { id: comandaItemId } });
    if (!ci) throw new Error(`ComandaItem ${comandaItemId} no encontrado`);
    const idx = FLUJO.indexOf(ci.estado);
    const anterior = idx > 0 ? FLUJO[idx - 1] : ci.estado;
    return await transicionar(dataSource, getCurrentUser, comandaItemId, anterior);
  });

  // ─── ABM de pantallas KDS (config) ──────────────────────────────────────
  ipcMain.handle('get-kds-pantallas', async () => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_VER', 'VENTAS_PDV']);
    return await dataSource.getRepository(KdsPantalla).find({ order: { nombre: 'ASC' } });
  });

  ipcMain.handle('get-kds-pantalla', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['COMANDAS_KDS_VER', 'VENTAS_PDV']);
    return await dataSource.getRepository(KdsPantalla).findOne({ where: { id } });
  });

  ipcMain.handle('create-kds-pantalla', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMANDAS_KDS_CONFIGURAR');
    const repo = dataSource.getRepository(KdsPantalla);
    const entity = repo.create(normalizarPantalla(data));
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-kds-pantalla', async (_event, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMANDAS_KDS_CONFIGURAR');
    const repo = dataSource.getRepository(KdsPantalla);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new Error(`Pantalla KDS ${id} no encontrada`);
    repo.merge(entity, normalizarPantalla(data));
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('delete-kds-pantalla', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMANDAS_KDS_CONFIGURAR');
    const repo = dataSource.getRepository(KdsPantalla);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) return false;
    await repo.remove(entity);
    return true;
  });
}

/**
 * Normaliza el payload de pantalla: `sectores` puede llegar como array de ids
 * (del front) → se guarda como JSON string. nombre en MAYÚSCULAS.
 */
function normalizarPantalla(data: any): any {
  const out: any = { ...data };
  if (Array.isArray(data?.sectores)) {
    out.sectores = JSON.stringify(data.sectores.map((n: any) => Number(n)).filter((n: number) => !!n));
  }
  if (typeof data?.nombre === 'string') out.nombre = data.nombre.toUpperCase();
  return out;
}
