import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { CuotaEstado, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerDashboardComprasHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-compras-kpis', async () => {
    try {
      const now = new Date();
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
      inicioMes.setHours(0, 0, 0, 0);
      const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const en7dias = new Date(now); en7dias.setDate(en7dias.getDate() + 7);

      // 1. Compras del mes
      const totalMesRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
        FROM compras
        WHERE estado IN (?, ?)
          AND created_at >= ? AND created_at <= ?
      `, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, inicioMes.toISOString(), finMes.toISOString()]);
      const comprasMes = Number(totalMesRows?.[0]?.cnt || 0);
      const totalMesPYG = Number(totalMesRows?.[0]?.suma || 0);

      // 2. CPP por vencer (proximos 7 dias)
      const cppPorVencerRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(monto - monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas
        WHERE estado IN (?, ?)
          AND fecha_vencimiento <= ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, en7dias.toISOString().slice(0, 10)]);
      const cppPorVencer = Number(cppPorVencerRows?.[0]?.cnt || 0);

      // 3. CPP vencidas (fecha_vencimiento < today)
      const hoyStr = now.toISOString().slice(0, 10);
      const cppVencidasRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(monto - monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas
        WHERE estado IN (?, ?)
          AND fecha_vencimiento < ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, hoyStr]);
      const totalCppVencidoPYG = Number(cppVencidasRows?.[0]?.suma || 0);

      // 4. Top proveedores del mes
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
      `, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, inicioMes.toISOString(), finMes.toISOString()]);
      const maxTotal = topRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topProveedores = topRows.map(r => ({
        nombre: String(r.nombre || '').toUpperCase(),
        totalCompras: Number(r.total || 0),
        cantidad: Number(r.cnt || 0),
        porcentaje: maxTotal > 0 ? Math.round((Number(r.total || 0) / maxTotal) * 100) : 0,
      }));

      // 5. Proximos vencimientos (siguientes 14 dias, todos los CPP activos)
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
        const dias = Math.floor((fv.getTime() - now.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
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

      // 6. Compras por periodo (6 meses)
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const labels: string[] = [];
      const compras: number[] = [];
      const cantidades: number[] = [];
      const refDate = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
        const f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const rows: any[] = await dataSource.query(`
          SELECT COUNT(*) as cnt, COALESCE(SUM(total), 0) as suma
          FROM compras
          WHERE estado IN (?, ?)
            AND created_at >= ? AND created_at <= ?
        `, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, d.toISOString(), f.toISOString()]);
        labels.push(meses[d.getMonth()]);
        compras.push(Number(rows?.[0]?.suma || 0));
        cantidades.push(Number(rows?.[0]?.cnt || 0));
      }

      return {
        comprasMes,
        totalMesPYG,
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
