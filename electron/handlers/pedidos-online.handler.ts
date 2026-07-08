import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { registerPublicOperation } from '../server/public-routes';

/**
 * Handlers de PEDIDOS ONLINE (web app) — Fase 1: menú publicable.
 *
 * `get-menu-online` arma el snapshot de la carta que consume la web de pedidos:
 * solo productos marcados `disponibleOnline` y no `pausadoOnline` (86ing), con
 * su precio ONLINE (o principal como fallback) y agrupados por familia.
 *
 * Se expone en la superficie pública `/pub/*` como operación `menu.get`
 * (lectura, sin auth) vía `registerPublicOperation`. NO se llega por `/api/rpc`.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 1).
 */

const ONLINE_TIPO = 'ONLINE';

/** Elige el PrecioVenta a mostrar online: ONLINE > principal > primero activo. */
function resolvePrecio(presentacion: any): any | null {
  const precios = (presentacion?.preciosVenta || []).filter((p: any) => p && p.activo);
  if (!precios.length) return null;
  const online = precios.find(
    (p: any) => String(p.tipoPrecio?.descripcion || '').toUpperCase() === ONLINE_TIPO,
  );
  return online || precios.find((p: any) => p.principal) || precios[0];
}

function mapMoneda(moneda: any): any | null {
  if (!moneda) return null;
  return {
    id: moneda.id,
    denominacion: moneda.denominacion ?? moneda.nombre ?? null,
    simbolo: moneda.simbolo ?? null,
  };
}

export function registerPedidosOnlineHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => any,
): void {
  // ============== MENU ONLINE (público, lectura) ==============
  ipcMain.handle('get-menu-online', async () => {
    const repo = dataSource.getRepository(Producto);

    const productos = await repo.find({
      where: {
        activo: true,
        esVendible: true,
        disponibleOnline: true,
        pausadoOnline: false,
      },
      relations: [
        'subfamilia',
        'subfamilia.familia',
        'presentaciones',
        'presentaciones.preciosVenta',
        'presentaciones.preciosVenta.moneda',
        'presentaciones.preciosVenta.tipoPrecio',
      ],
      order: { nombre: 'ASC' },
    });

    // Categorías presentes (por familia), derivadas de los productos publicados.
    const categoriasMap = new Map<number | string, { id: number | string; nombre: string }>();
    const SIN_CAT = { id: 'SIN_CATEGORIA', nombre: 'SIN CATEGORÍA' };

    const items = productos.map((p: any) => {
      const familia = p.subfamilia?.familia || null;
      const catId = familia?.id ?? SIN_CAT.id;
      const catNombre = familia?.nombre ?? SIN_CAT.nombre;
      if (!categoriasMap.has(catId)) categoriasMap.set(catId, { id: catId, nombre: catNombre });

      const presentaciones = (p.presentaciones || [])
        .map((pres: any) => {
          const precio = resolvePrecio(pres);
          return {
            id: pres.id,
            nombre: pres.nombre,
            principal: !!pres.principal,
            precio: precio ? Number(precio.valor) : null,
            moneda: precio ? mapMoneda(precio.moneda) : null,
          };
        })
        // En la carta online no mostramos presentaciones sin precio publicable.
        .filter((pr: any) => pr.precio != null);

      return {
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        iva: p.iva,
        imageUrl: p.imageUrl ?? null,
        categoriaId: catId,
        categoriaNombre: catNombre,
        subfamilia: p.subfamilia ? { id: p.subfamilia.id, nombre: p.subfamilia.nombre } : null,
        presentaciones,
      };
    })
      // Un producto sin ninguna presentación con precio no se publica.
      .filter((it: any) => it.presentaciones.length > 0);

    return {
      categorias: Array.from(categoriasMap.values()),
      productos: items,
      total: items.length,
      publicadoEn: new Date().toISOString(),
    };
  });

  // Exponer el menú en la superficie pública `/pub/rpc` como `menu.get` (sin auth).
  registerPublicOperation('menu.get', {
    channel: 'get-menu-online',
    requiresAuth: false,
    description: 'Carta online publicada (productos disponibles online).',
  });
}
