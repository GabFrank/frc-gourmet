import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import {
  Rango,
  rangoToFechas,
  bucketsForRango,
} from '../utils/dashboard-rangos.util';

async function ventasAggregateRange(
  dataSource: DataSource,
  desde: Date,
  hasta: Date,
): Promise<{ cnt: number; total: number }> {
  // Suma desde venta_items para evitar Venta.total que es nullable.
  // LEFT JOIN preserva ventas sin items. COUNT(DISTINCT) evita duplicar.
  const rows: any[] = await dataSource.query(`
    SELECT COUNT(DISTINCT v.id) as cnt,
           COALESCE(SUM(vi.cantidad * vi.precio_venta_unitario), 0) as suma
    FROM ventas v
    LEFT JOIN venta_items vi ON vi.venta_id = v.id AND vi.estado = ?
    WHERE v.estado = ?
      AND v.created_at >= ?
      AND v.created_at <= ?
  `, [EstadoVentaItem.ACTIVO, VentaEstado.CONCLUIDA, desde.toISOString(), hasta.toISOString()]);
  return {
    cnt: Number(rows?.[0]?.cnt || 0),
    total: Number(rows?.[0]?.suma || 0),
  };
}

export function registerDashboardVentasHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-ventas-kpis', async (_event, rango: Rango = 'today') => {
    try {
      // Stat chips sincronizados con el rango seleccionado
      const { desde, hasta } = rangoToFechas(rango);
      const periodo = await ventasAggregateRange(dataSource, desde, hasta);
      const ventasPeriodo = periodo.cnt;
      const totalPeriodoPYG = periodo.total;
      const ticketPromedio = ventasPeriodo > 0 ? Math.round(totalPeriodoPYG / ventasPeriodo) : 0;

      // Mesas (estado actual, no agregable por período)
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasTotal = await mesaRepo.count({ where: { activo: true } as any });
      const mesasOcupadas = await mesaRepo
        .createQueryBuilder('m')
        .where('m.activo = :a', { a: true })
        .andWhere('m.estado = :e', { e: 'OCUPADO' })
        .getCount();

      // Comandas pendientes en cocina (estado actual)
      let comandasPendientes = 0;
      try {
        comandasPendientes = await dataSource.getRepository(ComandaItem)
          .createQueryBuilder('ci')
          .where('ci.estado = :e', { e: ComandaItemEstado.PENDIENTE })
          .getCount();
      } catch { /* opt */ }

      // Cajas abiertas (estado actual)
      const cajasAbiertasEntities = await dataSource.getRepository(Caja).find({
        where: { estado: CajaEstado.ABIERTO, activo: true },
        relations: ['createdBy', 'createdBy.persona', 'dispositivo'],
        order: { fechaApertura: 'ASC' },
      });

      const cajasAbiertas: any[] = [];
      for (const caja of cajasAbiertasEntities) {
        const cajeroPersona: any = (caja.createdBy as any)?.persona;
        const cajero = (cajeroPersona?.nombre || (caja.createdBy as any)?.nickname || 'SIN USUARIO').toUpperCase();
        const horaApertura = caja.fechaApertura;
        const ms = Date.now() - new Date(horaApertura).getTime();
        const totalMin = Math.max(0, Math.floor(ms / 60000));
        const horas = Math.floor(totalMin / 60);
        const min = totalMin % 60;
        const horasAbierto = `${horas}h ${min}m`;

        // Ventas + monto de la caja (suma desde venta_items, no SUM(total))
        const cajaTotalsRows: any[] = await dataSource.query(`
          SELECT COUNT(DISTINCT v.id) as cnt,
                 COALESCE(SUM(vi.cantidad * vi.precio_venta_unitario), 0) as suma
          FROM ventas v
          LEFT JOIN venta_items vi ON vi.venta_id = v.id AND vi.estado = ?
          WHERE v.caja_id = ? AND v.estado = ?
        `, [EstadoVentaItem.ACTIVO, caja.id, VentaEstado.CONCLUIDA]);
        const cantidadVentas = Number(cajaTotalsRows?.[0]?.cnt || 0);
        const ventaTotal = Number(cajaTotalsRows?.[0]?.suma || 0);

        // Mesas distintas atendidas
        const mesasRows: any[] = await dataSource.query(`
          SELECT COUNT(DISTINCT mesa_id) as cnt FROM ventas WHERE caja_id = ? AND mesa_id IS NOT NULL
        `, [caja.id]);
        const mesasAtendidas = Number(mesasRows?.[0]?.cnt || 0);

        cajasAbiertas.push({
          id: caja.id,
          cajero,
          horaApertura,
          horasAbierto,
          valorAperturaPYG: 0,
          valorAperturaUSD: 0,
          ventaTotal,
          mesasAtendidas,
          cantidadVentas,
        });
      }

      // Top productos (en el rango)
      const topRows: any[] = await dataSource.query(`
        SELECT p.id, p.nombre, SUM(vi.cantidad) as cantidad,
               SUM(vi.cantidad * vi.precio_venta_unitario) as total
        FROM venta_items vi
        JOIN ventas v ON v.id = vi.venta_id
        JOIN producto p ON p.id = vi.producto_id
        WHERE v.estado = ?
          AND vi.estado = ?
          AND v.created_at >= ?
          AND v.created_at <= ?
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT 8
      `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, desde.toISOString(), hasta.toISOString()]);

      const maxTotal = topRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topProductos = topRows.map(r => ({
        nombre: String(r.nombre || '').toUpperCase(),
        cantidad: Number(r.cantidad || 0),
        total: Number(r.total || 0),
        porcentaje: maxTotal > 0 ? Math.round((Number(r.total || 0) / maxTotal) * 100) : 0,
      }));

      // Ventas por periodo (chart) — buckets dinámicos según rango
      const periodoData = await buildVentasPorPeriodo(dataSource, rango);

      return {
        // legacy keys (compat con frontends que aún no migraron)
        ventasHoy: ventasPeriodo,
        totalHoyPYG: totalPeriodoPYG,
        // nuevos labels coherentes con rango
        ventasPeriodo,
        totalPeriodoPYG,
        ticketPromedio,
        mesasOcupadas,
        mesasTotal,
        comandasPendientes,
        cajasAbiertas,
        topProductos,
        ventasPorPeriodo: periodoData,
      };
    } catch (error) {
      console.error('Error get-dashboard-ventas-kpis:', error);
      throw error;
    }
  });
}

async function buildVentasPorPeriodo(
  dataSource: DataSource,
  rango: Rango,
): Promise<{ labels: string[]; ventas: number[]; cantidades: number[] }> {
  const buckets = bucketsForRango(rango);
  const labels: string[] = [];
  const ventas: number[] = [];
  const cantidades: number[] = [];

  for (const b of buckets) {
    const agg = await ventasAggregateRange(dataSource, b.desde, b.hasta);
    labels.push(b.label);
    ventas.push(agg.total);
    cantidades.push(agg.cnt);
  }

  return { labels, ventas, cantidades };
}
