import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CompraItemClase, COMPRA_ITEM_DESTINOS } from '../../src/app/database/entities/compras/compra-item-clase.entity';
import { OcrAliasProducto } from '../../src/app/database/entities/compras/ocr-alias-producto.entity';
import { Compra } from '../../src/app/database/entities/compras/compra.entity';
import { CompraDetalle } from '../../src/app/database/entities/compras/compra-detalle.entity';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { agruparReporteCompras, resolverClaseLinea } from '../utils/compra-clase.utils';

/**
 * Clase que se guarda en una línea de compra nueva: la que trae la línea o, si no
 * trae, la heredada del producto / su subfamilia. Queda fija aunque después se
 * reclasifique el producto. Clientes viejos (sin `claseId`) heredan acá.
 */
export async function claseParaLineaNueva(manager: any, claseId: any, productoId: any): Promise<number | null> {
  if (claseId !== undefined && claseId !== null && claseId !== '') return Number(claseId);
  if (!productoId) return null;
  const producto = await manager.getRepository(Producto).findOne({
    where: { id: Number(productoId) },
    relations: ['subfamilia'],
  });
  return resolverClaseLinea(null, producto as any);
}

const texto = (v: any, max: number) => {
  if (v === undefined) return undefined;
  const s = v === null ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
};

export function registerCompraClasesHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // ===== Clases (catálogo configurable) =====
  // Lectura sin permiso: la usan el diálogo de producto, subfamilia y compras.
  ipcMain.handle('get-compra-item-clases', async (_e: any, opts: { incluirInactivas?: boolean } = {}) => {
    return dataSource.getRepository(CompraItemClase).find({
      where: opts?.incluirInactivas ? {} : { activo: true },
      order: { orden: 'ASC', id: 'ASC' },
    });
  });

  const validar = (data: any, parcial: boolean) => {
    if (!parcial || data.nombre !== undefined) {
      if (!String(data.nombre || '').trim()) throw new Error('La clase necesita un nombre.');
    }
    if (!parcial || data.destino !== undefined) {
      if (!COMPRA_ITEM_DESTINOS.includes(data.destino)) {
        throw new Error(`Destino inválido: use ${COMPRA_ITEM_DESTINOS.join(', ')}.`);
      }
    }
  };

  ipcMain.handle('create-compra-item-clase', async (_e: any, data: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    validar(data, false);
    const repo = dataSource.getRepository(CompraItemClase);
    const nombre = String(data.nombre).trim().toUpperCase();
    const existe = await repo.createQueryBuilder('c').where('UPPER(c.nombre) = :n', { n: nombre }).getOne();
    if (existe) throw new Error(`Ya existe la clase «${existe.nombre}».`);
    const ent = repo.create({
      nombre,
      destino: data.destino,
      controlaStockPorDefecto: data.controlaStockPorDefecto ?? true,
      orden: Number(data.orden ?? 0),
      activo: data.activo ?? true,
    });
    await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, false);
    return repo.save(ent);
  });

  // Sin delete: una clase se desactiva; lo que ya la tiene la conserva.
  ipcMain.handle('update-compra-item-clase', async (_e: any, id: number, data: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    validar(data, true);
    const repo = dataSource.getRepository(CompraItemClase);
    const ent = await repo.findOneBy({ id: Number(id) });
    if (!ent) throw new Error(`Clase ID ${id} no encontrada`);
    if (data.nombre !== undefined) {
      const nombre = String(data.nombre).trim().toUpperCase();
      const otra = await repo.createQueryBuilder('c')
        .where('UPPER(c.nombre) = :n AND c.id <> :id', { n: nombre, id: ent.id }).getOne();
      if (otra) throw new Error(`Ya existe la clase «${otra.nombre}».`);
      ent.nombre = nombre;
    }
    if (data.destino !== undefined) ent.destino = data.destino;
    if (data.controlaStockPorDefecto !== undefined) ent.controlaStockPorDefecto = !!data.controlaStockPorDefecto;
    if (data.orden !== undefined) ent.orden = Number(data.orden) || 0;
    if (data.activo !== undefined) ent.activo = !!data.activo;
    await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, true);
    return repo.save(ent);
  });

  // ===== Alias de ítem de proveedor → producto (marca, contenido) =====
  ipcMain.handle('get-alias-productos-proveedor', async (_e: any, proveedorId: number, opts: { incluirInactivos?: boolean } = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_VER');
    if (!proveedorId) throw new Error('Falta el proveedor.');
    const qb = dataSource.getRepository(OcrAliasProducto).createQueryBuilder('a')
      .leftJoin('a.producto', 'p')
      .leftJoin('a.presentacion', 'pr')
      .select([
        'a.id', 'a.textoOcr', 'a.vecesUsado', 'a.marca', 'a.contenido', 'a.codigoProveedor', 'a.activo', 'a.updatedAt',
        'p.id', 'p.nombre', 'p.claseId', 'pr.id', 'pr.nombre', 'pr.cantidad',
      ])
      .where('a.proveedor_id = :pid', { pid: Number(proveedorId) })
      .orderBy('a.vecesUsado', 'DESC')
      .addOrderBy('a.id', 'ASC');
    if (!opts?.incluirInactivos) qb.andWhere('a.activo = :act', { act: true });
    return qb.getMany();
  });

  // Crea o actualiza por la unique (proveedor + texto + producto). Si viene `id`, actualiza ese.
  ipcMain.handle('upsert-alias-producto', async (_e: any, data: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const repo = dataSource.getRepository(OcrAliasProducto);
    let ent: OcrAliasProducto | null = null;
    if (data.id) {
      ent = await repo.findOne({ where: { id: Number(data.id) }, relations: ['proveedor', 'producto'] });
      if (!ent) throw new Error(`Alias ID ${data.id} no encontrado`);
    } else {
      const textoOcr = String(data.textoOcr || '').trim();
      if (!data.proveedorId || !textoOcr || !data.productoId) {
        throw new Error('El alias necesita proveedorId, textoOcr y productoId.');
      }
      ent = await repo.findOne({
        where: {
          proveedor: { id: Number(data.proveedorId) },
          textoOcr: textoOcr.slice(0, 500),
          producto: { id: Number(data.productoId) },
        } as any,
      });
      if (!ent) {
        ent = repo.create({
          proveedor: { id: Number(data.proveedorId) } as any,
          textoOcr: textoOcr.slice(0, 500),
          producto: { id: Number(data.productoId) } as any,
          vecesUsado: 1,
          activo: true,
        });
        await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, false);
      }
    }
    if (data.presentacionId !== undefined) ent.presentacion = data.presentacionId ? ({ id: Number(data.presentacionId) } as any) : null;
    const marca = texto(data.marca, 120); if (marca !== undefined) ent.marca = marca;
    const contenido = texto(data.contenido, 120); if (contenido !== undefined) ent.contenido = contenido;
    const codigo = texto(data.codigoProveedor, 60); if (codigo !== undefined) ent.codigoProveedor = codigo;
    if (data.activo !== undefined) ent.activo = !!data.activo;
    if (ent.id) await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, true);
    const saved = await repo.save(ent);
    return repo.findOne({ where: { id: saved.id }, relations: ['producto', 'presentacion'] });
  });

  // ===== Reporte de compras por clase y destino =====
  // params: { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD', monedaId? } — por fecha de la compra.
  // Compras no anuladas (FINALIZADO / ACTIVO); los borradores (ABIERTO) se informan aparte.
  // No incluye gastos de caja: son otro origen (evita doble conteo).
  ipcMain.handle('get-reporte-compras-por-clase', async (_e: any, params: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_DASHBOARD_VER');
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(String(params.desde || '')) || !re.test(String(params.hasta || ''))) {
      throw new Error('desde y hasta van como AAAA-MM-DD.');
    }
    const base = () => {
      const qb = dataSource.getRepository(Compra).createQueryBuilder('c')
        .leftJoin('c.moneda', 'm')
        .select(['c.id AS "id"', 'c.total AS "total"', 'm.id AS "monedaId"', 'c.simplificada AS "simplificada"', 'c.estado AS "estado"'])
        .where('c.fecha_compra >= :desde AND c.fecha_compra <= :hasta', { desde: params.desde, hasta: params.hasta });
      if (params.monedaId) qb.andWhere('c.moneda_id = :mid', { mid: Number(params.monedaId) });
      return qb;
    };
    const compras: any[] = await base()
      .andWhere('c.estado IN (:...est)', { est: [CompraEstado.FINALIZADO, CompraEstado.ACTIVO] })
      .getRawMany();
    const borradores: any[] = await base().andWhere('c.estado = :ab', { ab: CompraEstado.ABIERTO }).getRawMany();

    const ids = compras.map((c) => Number(c.id));
    const lineas: any[] = ids.length
      ? await dataSource.getRepository(CompraDetalle).createQueryBuilder('d')
        .select(['d.compra_id AS "compraId"', 'd.subtotal AS "subtotal"', 'd.clase_id AS "claseId"'])
        .where('d.compra_id IN (:...ids)', { ids })
        .andWhere('d.activo = :act', { act: true })
        .getRawMany()
      : [];
    const clases = await dataSource.getRepository(CompraItemClase).find();

    const rep = agruparReporteCompras(
      compras.map((c) => ({
        id: Number(c.id), total: Number(c.total) || 0,
        monedaId: c.monedaId != null ? Number(c.monedaId) : null,
        simplificada: c.simplificada === true || c.simplificada === 1 || c.simplificada === '1',
      })),
      lineas.map((l) => ({ compraId: Number(l.compraId), subtotal: Number(l.subtotal) || 0, claseId: l.claseId != null ? Number(l.claseId) : null })),
      clases.map((c) => ({ id: c.id, nombre: c.nombre, destino: c.destino, activo: c.activo })),
    );
    const borradoresPorMoneda = new Map<number | null, { cantidad: number; total: number }>();
    for (const b of borradores) {
      const k = b.monedaId != null ? Number(b.monedaId) : null;
      const t = borradoresPorMoneda.get(k) || { cantidad: 0, total: 0 };
      t.cantidad += 1; t.total += Number(b.total) || 0;
      borradoresPorMoneda.set(k, t);
    }
    return {
      desde: params.desde,
      hasta: params.hasta,
      compras: compras.length,
      ...rep,
      borradores: [...borradoresPorMoneda.entries()].map(([monedaId, t]) => ({ monedaId, ...t })),
      nota: 'Solo compras (no incluye gastos de caja). Monto = subtotal de la línea prorrateado al total de la compra.',
    };
  });
}
