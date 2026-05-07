import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { CuotaEstado, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Rango, rangoToFechas, bucketsForRango } from '../utils/dashboard-rangos.util';

async function comprasAggregateRange(
  dataSource: DataSource,
  desde: Date,
  hasta: Date,
): Promise<{ cnt: number; total: number }> {
  const rows: any[] = await dataSource.query(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
    FROM compras
    WHERE estado IN (?, ?)
      AND created_at >= ? AND created_at <= ?
  `, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, desde.toISOString(), hasta.toISOString()]);
  return {
    cnt: Number(rows?.[0]?.cnt || 0),
    total: Number(rows?.[0]?.suma || 0),
  };
}

export function registerDashboardComprasHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-compras-kpis', async (_event, rango: Rango = 'month') => {
    try {
      const now = new Date();
      const en7dias = new Date(now); en7dias.setDate(en7dias.getDate() + 7);

      // Stat chips sincronizados con rango
      const { desde, hasta } = rangoToFechas(rango);
      const periodo = await comprasAggregateRange(dataSource, desde, hasta);
      const comprasPeriodo = periodo.cnt;
      const totalPeriodoPYG = periodo.total;

      // CPP por vencer / vencidas — siempre referidos a hoy (no agregables por período)
      const cppPorVencerRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(monto - monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas
        WHERE estado IN (?, ?)
          AND fecha_vencimiento <= ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, en7dias.toISOString().slice(0, 10)]);
      const cppPorVencer = Number(cppPorVencerRows?.[0]?.cnt || 0);

      const hoyStr = now.toISOString().slice(0, 10);
      const cppVencidasRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(monto - monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas
        WHERE estado IN (?, ?)
          AND fecha_vencimiento < ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, hoyStr]);
      const totalCppVencidoPYG = Number(cppVencidasRows?.[0]?.suma || 0);

      // Top proveedores en el rango
      const topRows: any[] = await dataSource.query(`
        SELECT pr.id, COALESCE(pr.razon_social, pr.nombre) as nombre,
               COUNT(c.id) as cnt,
               COALESCE(SUM(c.total), 0) as total
        FROM compras c
        JOIN proveedores pr ON pr.id = c.proveedor_id
        WHERE c.estado IN (?, ?)
          AND c.created_at >= ? AND c.created_at <= ?
        GROUP BY pr.id, pr.razon_social, pr.nombre
        ORDER BY total DESC
        LIMIT 5
      `, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, desde.toISOString(), hasta.toISOString()]);
      const maxTotal = topRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topProveedores = topRows.map(r => ({
        nombre: String(r.nombre || '').toUpperCase(),
        totalCompras: Number(r.total || 0),
        cantidad: Number(r.cnt || 0),
        porcentaje: maxTotal > 0 ? Math.round((Number(r.total || 0) / maxTotal) * 100) : 0,
      }));

      // Próximos vencimientos (siguientes 14 días, todos los CPP activos)
      const en14 = new Date(now); en14.setDate(en14.getDate() + 14);
      const venRows: any[] = await dataSource.query(`
        SELECT c.id, c.fecha_vencimiento, c.monto, c.monto_pagado,
               cpp.descripcion, COALESCE(pr.razon_social, pr.nombre) as proveedor
        FROM cuentas_por_pagar_cuotas c
        JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
        LEFT JOIN proveedores pr ON pr.id = cpp.proveedor_id
        WHERE c.estado IN (?, ?)
          AND cpp.estado = ?
          AND c.fecha_vencimiento <= ?
        ORDER BY c.fecha_vencimiento ASC
        LIMIT 10
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuentaPorPagarEstado.ACTIVO, en14.toISOString().slice(0, 10)]);
      const proximosVencimientos = venRows.map(r => {
        const fv = new Date(r.fecha_vencimiento);
        fv.setHours(0, 0, 0, 0);
        const today0 = new Date(); today0.setHours(0, 0, 0, 0);
        const dias = Math.floor((fv.getTime() - today0.getTime()) / (24 * 60 * 60 * 1000));
        let urgencia: 'vencida' | 'urgente' | 'proxima' = 'proxima';
        if (dias < 0) urgencia = 'vencida';
        else if (dias <= 3) urgencia = 'urgente';
        return {
          proveedor: String(r.proveedor || r.descripcion || '').toUpperCase(),
          monto: Number(r.monto || 0) - Number(r.monto_pagado || 0),
          fechaVencimiento: r.fecha_vencimiento,
          diasRestantes: dias,
          urgencia,
        };
      });

      // Compras por periodo (chart) — buckets dinámicos
      const buckets = bucketsForRango(rango);
      const labels: string[] = [];
      const compras: number[] = [];
      const cantidades: number[] = [];
      for (const b of buckets) {
        const agg = await comprasAggregateRange(dataSource, b.desde, b.hasta);
        labels.push(b.label);
        compras.push(agg.total);
        cantidades.push(agg.cnt);
      }

      return {
        // legacy keys (compat)
        comprasMes: comprasPeriodo,
        totalMesPYG: totalPeriodoPYG,
        // nuevos coherentes con rango
        comprasPeriodo,
        totalPeriodoPYG,
        cppPorVencer,
        totalCppVencidoPYG,
        topProveedores,
        proximosVencimientos,
        comprasPorPeriodo: { labels, compras, cantidades },
      };
    } catch (error) {
      console.error('Error get-dashboard-compras-kpis:', error);
      throw error;
    }
  });
}
