import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';

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
      const sinPrecioRows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(DISTINCT p.id) as cnt
        FROM producto p
        WHERE p.activo = true
          AND NOT EXISTS (
            SELECT 1 FROM precio_venta pv
            WHERE pv.activo = true
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

      // 5. Productos con precio costo desactualizado (>30 dias)
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      hace30.setHours(0, 0, 0, 0);
      const desactRows: any[] = await dbQuery(dataSource, `
        SELECT p.id, p.nombre, MAX(pc.fecha) as ultima_fecha
        FROM producto p
        JOIN presentacion pr ON pr.producto_id = p.id
        JOIN precio_costo pc ON pc.presentacion_id = pr.id AND pc.activo = true
        WHERE p.activo = true
        GROUP BY p.id, p.nombre
        HAVING MAX(pc.fecha) < ?
        ORDER BY MAX(pc.fecha) ASC
        LIMIT 10
      `, [hace30.toISOString().slice(0, 10)]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const productosPrecioDesactualizado = desactRows.map(r => {
        const ult = new Date(r.ultima_fecha);
        const dias = Math.floor((today.getTime() - ult.getTime()) / (24 * 60 * 60 * 1000));
        return {
          producto: String(r.nombre || '').toUpperCase(),
          ultimaActualizacion: r.ultima_fecha,
          dias,
        };
      });

      // 6. Top vendidos del mes (cruce con Ventas)
      const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
      const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      const topRows: any[] = await dbQuery(dataSource, `
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
        nombre: String(r.nombre || '').toUpperCase(),
        cantidad: Number(r.cantidad || 0),
        total: Number(r.total || 0),
        porcentaje: maxTopTotal > 0 ? Math.round((Number(r.total || 0) / maxTopTotal) * 100) : 0,
      }));

      // 7. Lista de productos parciales (los primeros 10)
      const parcialesRows: any[] = await dbQuery(dataSource, `
        SELECT id, nombre FROM producto
        WHERE activo = true AND registro_completo = false
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
        productosPrecioDesactualizado,
        topVendidos,
        productosParcialesLista,
      };
    } catch (error) {
      console.error('Error get-dashboard-productos-kpis:', error);
      throw error;
    }
  });
}
