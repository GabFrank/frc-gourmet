import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';

type Rango = 'today' | 'week' | 'month' | '3months' | '6months';

function rangoToFechas(rango: Rango): { desde: Date; hasta: Date } {
  const hasta = new Date();
  hasta.setHours(23, 59, 59, 999);
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  switch (rango) {
    case 'today': break;
    case 'week': desde.setDate(desde.getDate() - 6); break;
    case 'month': desde.setDate(desde.getDate() - 29); break;
    case '3months': desde.setMonth(desde.getMonth() - 3); break;
    case '6months': desde.setMonth(desde.getMonth() - 6); break;
  }
  return { desde, hasta };
}

export function registerDashboardVentasHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-ventas-kpis', async (_event, rango: Rango = 'week') => {
    try {
      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date();
      hoyFin.setHours(23, 59, 59, 999);

      // 1. Ventas hoy + total hoy
      const ventasHoyRows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM ventas
        WHERE estado = ?
          AND created_at >= ?
          AND created_at <= ?
      `, [VentaEstado.CONCLUIDA, hoyInicio.toISOString(), hoyFin.toISOString()]);
      const ventasHoy = Number(ventasHoyRows?.[0]?.cnt || 0);
      const totalHoyPYG = Number(ventasHoyRows?.[0]?.suma || 0);
      const ticketPromedio = ventasHoy > 0 ? Math.round(totalHoyPYG / ventasHoy) : 0;

      // 2. Mesas
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasTotal = await mesaRepo.count({ where: { activo: true } as any });
      const mesasOcupadas = await mesaRepo
        .createQueryBuilder('m')
        .where('m.activo = :a', { a: true })
        .andWhere('m.estado = :e', { e: 'OCUPADO' })
        .getCount();

      // 3. Comandas pendientes en cocina
      let comandasPendientes = 0;
      try {
        comandasPendientes = await dataSource.getRepository(ComandaItem)
          .createQueryBuilder('ci')
          .where('ci.estado = :e', { e: ComandaItemEstado.PENDIENTE })
          .getCount();
      } catch { /* opt */ }

      // 4. Cajas abiertas
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

        // Ventas + monto de la caja
        const cajaTotalsRows: any[] = await dbQuery(dataSource, `
          SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
          FROM ventas WHERE caja_id = ? AND estado = ?
        `, [caja.id, VentaEstado.CONCLUIDA]);
        const cantidadVentas = Number(cajaTotalsRows?.[0]?.cnt || 0);
        const ventaTotal = Number(cajaTotalsRows?.[0]?.suma || 0);

        // Mesas distintas atendidas
        const mesasRows: any[] = await dbQuery(dataSource, `
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

      // 5. Top productos (en el rango)
      const { desde, hasta } = rangoToFechas(rango);
      const topRows: any[] = await dbQuery(dataSource, `
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

      // 6. Ventas por periodo (chart)
      const periodoData = await buildVentasPorPeriodo(dataSource, rango);

      return {
        ventasHoy,
        totalHoyPYG,
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
  const labels: string[] = [];
  const ventas: number[] = [];
  const cantidades: number[] = [];

  const now = new Date();
  if (rango === 'today' || rango === 'week') {
    const diasNombre = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setHours(23, 59, 59, 999);
      const rows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM ventas
        WHERE estado = ? AND created_at >= ? AND created_at <= ?
      `, [VentaEstado.CONCLUIDA, d.toISOString(), f.toISOString()]);
      labels.push(diasNombre[d.getDay()]);
      ventas.push(Number(rows?.[0]?.suma || 0));
      cantidades.push(Number(rows?.[0]?.cnt || 0));
    }
  } else if (rango === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setHours(23, 59, 59, 999);
      const rows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM ventas WHERE estado = ? AND created_at >= ? AND created_at <= ?
      `, [VentaEstado.CONCLUIDA, d.toISOString(), f.toISOString()]);
      labels.push(`${d.getDate()}`);
      ventas.push(Number(rows?.[0]?.suma || 0));
      cantidades.push(Number(rows?.[0]?.cnt || 0));
    }
  } else if (rango === '3months') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7) - 6);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setDate(f.getDate() + 6); f.setHours(23, 59, 59, 999);
      const rows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM ventas WHERE estado = ? AND created_at >= ? AND created_at <= ?
      `, [VentaEstado.CONCLUIDA, d.toISOString(), f.toISOString()]);
      labels.push(`S${12 - i}`);
      ventas.push(Number(rows?.[0]?.suma || 0));
      cantidades.push(Number(rows?.[0]?.cnt || 0));
    }
  } else { // 6months
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const rows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM ventas WHERE estado = ? AND created_at >= ? AND created_at <= ?
      `, [VentaEstado.CONCLUIDA, d.toISOString(), f.toISOString()]);
      labels.push(meses[d.getMonth()]);
      ventas.push(Number(rows?.[0]?.suma || 0));
      cantidades.push(Number(rows?.[0]?.cnt || 0));
    }
  }

  return { labels, ventas, cantidades };
}
