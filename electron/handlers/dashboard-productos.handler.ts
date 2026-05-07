import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerDashboardProductosHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-productos-kpis', async () => {
    try {
      const productoRepo = dataSource.getRepository(Producto);
      const recetaRepo = dataSource.getRepository(Receta);

      // 1. Productos activos
      const productosActivos = await productoRepo.count({ where: { activo: true } });

      // 2. Productos sin precio (sin PrecioVenta activo asociado)
      const sinPrecioRows: any[] = await dataSource.query(`
        SELECT COUNT(DISTINCT p.id) as cnt
        FROM producto p
        WHERE p.activo = 1
          AND NOT EXISTS (
            SELECT 1 FROM precio_venta pv
            WHERE pv.activo = 1
              AND (pv.producto_id = p.id OR EXISTS (
                SELECT 1 FROM presentacion pr
                WHERE pr.producto_id = p.id AND (pv.presentacion_id = pr.id)
              ))
          )
      `);
      const productosSinPrecio = Number(sinPrecioRows?.[0]?.cnt || 0);

      // 3. Productos parciales (registroCompleto = false)
      const productosParciales = await productoRepo.count({ where: { activo: true, registroCompleto: false } });

      // 4. Recetas activas
      const recetasActivas = await recetaRepo.count({ where: { activo: true } });

      // 5. Top CMV — productos con mejor margen
      // CMV requiere precio_venta principal activo + precio_costo activo más reciente.
      // Margen % = (precio_venta - precio_costo) / precio_venta * 100
      // El precio_venta puede estar directo en producto o vía presentación.
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cmvRows: any[] = await dataSource.query(`
        SELECT * FROM (
          SELECT p.id, p.nombre,
            (SELECT pv.valor FROM precio_venta pv
              LEFT JOIN presentacion pre ON pre.id = pv.presentacion_id
              WHERE pv.activo = 1
                AND (pv.producto_id = p.id OR pre.producto_id = p.id)
              ORDER BY pv.principal DESC, pv.id DESC LIMIT 1) as precio_venta,
            (SELECT pc.valor FROM precio_costo pc
              WHERE pc.activo = 1 AND pc.producto_id = p.id
              ORDER BY pc.fecha DESC, pc.id DESC LIMIT 1) as precio_costo
          FROM producto p
          WHERE p.activo = 1
        ) sub
        WHERE precio_venta IS NOT NULL AND precio_costo IS NOT NULL
          AND precio_venta > 0 AND precio_costo > 0
          AND precio_venta > precio_costo
        ORDER BY ((precio_venta - precio_costo) * 1.0 / precio_venta) DESC
        LIMIT 10
      `);
      const topCmv = cmvRows.map(r => {
        const pv = Number(r.precio_venta || 0);
        const pc = Number(r.precio_costo || 0);
        const margen = pv > 0 ? ((pv - pc) / pv) * 100 : 0;
        return {
          id: Number(r.id),
          nombre: String(r.nombre || '').toUpperCase(),
          precioVenta: pv,
          precioCosto: pc,
          margen: Math.round(margen * 10) / 10, // 1 decimal
        };
      });

      // 6. Top vendidos del mes (cruce con Ventas)
      const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
      const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      const topRows: any[] = await dataSource.query(`
        SELECT p.id, p.nombre,
               SUM(vi.cantidad) as cantidad,
               SUM(vi.cantidad * vi.precio_venta_unitario) as total
        FROM venta_items vi
        JOIN ventas v ON v.id = vi.venta_id
        JOIN producto p ON p.id = vi.producto_id
        WHERE v.estado = ?
          AND vi.estado = ?
          AND v.created_at >= ? AND v.created_at <= ?
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT 8
      `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, inicioMes.toISOString(), finMes.toISOString()]);
      const maxTopTotal = topRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topVendidos = topRows.map(r => ({
        id: Number(r.id),
        nombre: String(r.nombre || '').toUpperCase(),
        cantidad: Number(r.cantidad || 0),
        total: Number(r.total || 0),
        porcentaje: maxTopTotal > 0 ? Math.round((Number(r.total || 0) / maxTopTotal) * 100) : 0,
      }));

      // 7. Lista de productos parciales (los primeros 10)
      const parcialesRows: any[] = await dataSource.query(`
        SELECT id, nombre FROM producto
        WHERE activo = 1 AND registro_completo = 0
        ORDER BY created_at DESC LIMIT 10
      `);
      const productosParcialesLista = parcialesRows.map(r => ({
        id: r.id,
        nombre: String(r.nombre || '').toUpperCase(),
      }));

      return {
        productosActivos,
        productosSinPrecio,
        productosParciales,
        recetasActivas,
        topCmv,
        topVendidos,
        productosParcialesLista,
      };
    } catch (error) {
      console.error('Error get-dashboard-productos-kpis:', error);
      throw error;
    }
  });
}
