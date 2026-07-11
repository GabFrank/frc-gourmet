import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaAdicionalVinculacion } from '../../src/app/database/entities/productos/receta-adicional-vinculacion.entity';
import { ProductoObservacion } from '../../src/app/database/entities/productos/producto-observacion.entity';
import { registerPublicOperation } from '../server/public-routes';

/**
 * Handlers de PEDIDOS ONLINE — menú publicable (carta) para el storefront.
 *
 * `get-menu-online` arma el snapshot de la carta con el precio correcto de CADA
 * tipo de producto (RETAIL, ELABORADO_SIN/CON_VARIACION, COMBO) + los
 * modificadores para personalizar (adicionales, observaciones). Solo productos
 * `disponibleOnline && !pausadoOnline`.
 *
 * Expuesto en `/pub/*` como `menu.get` (lectura, sin auth).
 * Ver docs/arquitectura/webapp-pedidos-plan.md.
 */

const ONLINE_TIPO = 'ONLINE';

function mapMoneda(moneda: any): any | null {
  if (!moneda) return null;
  return {
    id: moneda.id,
    denominacion: moneda.denominacion ?? moneda.nombre ?? null,
    simbolo: moneda.simbolo ?? null,
    decimales: moneda.decimales ?? 0,
  };
}

/** De una lista de PrecioVenta activos, elige ONLINE > principal > primero. */
function pickPrecio(precios: any[]): any | null {
  const activos = (precios || []).filter((p: any) => p && p.activo);
  if (!activos.length) return null;
  const online = activos.find(
    (p: any) => String(p.tipoPrecio?.descripcion || '').toUpperCase() === ONLINE_TIPO,
  );
  return online || activos.find((p: any) => p.principal) || activos[0];
}

export function registerPedidosOnlineHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => any,
): void {
  ipcMain.handle('get-menu-online', async () => {
    const productoRepo = dataSource.getRepository(Producto);
    const pvRepo = dataSource.getRepository(PrecioVenta);
    const recetaRepo = dataSource.getRepository(Receta);
    const vincRepo = dataSource.getRepository(RecetaAdicionalVinculacion);
    const obsRepo = dataSource.getRepository(ProductoObservacion);

    const productos = await productoRepo.find({
      where: { activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false },
      relations: [
        'subfamilia',
        'subfamilia.familia',
        'receta',
        'presentaciones',
        'presentaciones.preciosVenta',
        'presentaciones.preciosVenta.moneda',
        'presentaciones.preciosVenta.tipoPrecio',
      ],
      order: { nombre: 'ASC' },
    });

    const categoriasMap = new Map<number | string, { id: number | string; nombre: string }>();
    const SIN_CAT = { id: 'SIN_CATEGORIA', nombre: 'OTROS' };

    const items: any[] = [];

    for (const p of productos as any[]) {
      const opciones: any[] = [];

      if (p.tipo === 'RETAIL' || p.tipo === 'RETAIL_INGREDIENTE' || p.tipo === 'BUFFET_POR_PESO') {
        // Cada presentación con precio es una opción.
        for (const pres of p.presentaciones || []) {
          const precio = pickPrecio(pres.preciosVenta);
          if (!precio) continue;
          opciones.push({
            key: `pres-${pres.id}`,
            tipo: 'PRESENTACION',
            label: pres.nombre,
            precio: Number(precio.valor),
            moneda: mapMoneda(precio.moneda),
            presentacionId: pres.id,
          });
        }
      } else if (p.tipo === 'ELABORADO_SIN_VARIACION') {
        // Precio ligado a la receta del producto.
        const recetaId = p.receta?.id;
        if (recetaId) {
          const precios = await pvRepo.find({
            where: { receta: { id: recetaId }, activo: true },
            relations: ['moneda', 'tipoPrecio'],
            order: { principal: 'DESC', id: 'ASC' },
          });
          const precio = pickPrecio(precios);
          if (precio) {
            opciones.push({
              key: `rec-${recetaId}`,
              tipo: 'RECETA',
              label: 'Estándar',
              precio: Number(precio.valor),
              moneda: mapMoneda(precio.moneda),
              recetaId,
            });
          }
        }
      } else if (p.tipo === 'ELABORADO_CON_VARIACION') {
        // Cada variación (receta con productoVariacion = este producto) es una opción.
        const variaciones = await recetaRepo.find({
          where: { productoVariacion: { id: p.id }, activo: true } as any,
          relations: ['preciosVenta', 'preciosVenta.moneda', 'preciosVenta.tipoPrecio'],
          order: { nombre: 'ASC' },
        });
        for (const v of variaciones as any[]) {
          const precio = pickPrecio(v.preciosVenta);
          if (!precio) continue;
          opciones.push({
            key: `var-${v.id}`,
            tipo: 'VARIACION',
            label: v.nombre,
            precio: Number(precio.valor),
            moneda: mapMoneda(precio.moneda),
            recetaId: v.id,
          });
        }
      } else if (p.tipo === 'COMBO') {
        const precios = await pvRepo.find({
          where: { producto: { id: p.id }, activo: true },
          relations: ['moneda', 'tipoPrecio'],
          order: { principal: 'DESC', id: 'ASC' },
        });
        const precio = pickPrecio(precios);
        if (precio) {
          opciones.push({
            key: `combo-${p.id}`,
            tipo: 'COMBO',
            label: 'Combo',
            precio: Number(precio.valor),
            moneda: mapMoneda(precio.moneda),
          });
        }
      }

      // Sin ninguna opción con precio → no se publica.
      if (!opciones.length) continue;

      // Adicionales: de las recetas asociadas (SIN_VARIACION: la receta del
      // producto; CON_VARIACION: las recetas de las variaciones). Dedupe por adicional.
      const recetaIds: number[] = [];
      if (p.receta?.id) recetaIds.push(p.receta.id);
      for (const op of opciones) if (op.recetaId) recetaIds.push(op.recetaId);
      const adicionales: any[] = [];
      const vistos = new Set<number>();
      if (recetaIds.length) {
        const vincs = await vincRepo.find({
          where: recetaIds.map((rid) => ({ receta: { id: rid }, activo: true })) as any,
          relations: ['adicional'],
        });
        for (const v of vincs as any[]) {
          const ad = v.adicional;
          if (!ad || !ad.activo || vistos.has(ad.id)) continue;
          vistos.add(ad.id);
          adicionales.push({ id: ad.id, nombre: ad.nombre, precio: Number(v.precioAdicional ?? ad.precio ?? 0) });
        }
      }

      // Observaciones predefinidas del producto.
      const obsVinc = await obsRepo.find({
        where: { producto: { id: p.id }, activo: true } as any,
        relations: ['observacion'],
      });
      const observaciones = (obsVinc as any[])
        .map((o) => o.observacion)
        .filter((o) => o && o.activo)
        .map((o) => ({ id: o.id, descripcion: o.descripcion }));

      // Categoría
      const familia = p.subfamilia?.familia || null;
      const catId = familia?.id ?? SIN_CAT.id;
      const catNombre = familia?.nombre ?? SIN_CAT.nombre;
      if (!categoriasMap.has(catId)) categoriasMap.set(catId, { id: catId, nombre: catNombre });

      const precioDesde = Math.min(...opciones.map((o) => o.precio));
      const moneda = opciones[0].moneda;

      items.push({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.receta?.descripcion ?? null,
        tipo: p.tipo,
        iva: p.iva,
        imageUrl: p.imageUrl ?? null,
        categoriaId: catId,
        categoriaNombre: catNombre,
        subfamilia: p.subfamilia ? { id: p.subfamilia.id, nombre: p.subfamilia.nombre } : null,
        opciones,
        precioDesde,
        moneda,
        adicionales,
        observaciones,
      });
    }

    return {
      categorias: Array.from(categoriasMap.values()),
      productos: items,
      total: items.length,
      publicadoEn: new Date().toISOString(),
    };
  });

  registerPublicOperation('menu.get', {
    channel: 'get-menu-online',
    requiresAuth: false,
    description: 'Carta online publicada (productos disponibles online).',
  });
}
