import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { CuotaEstado, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { ChequeEstado } from '../../src/app/database/entities/financiero/cheques-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';

const TIPOS_INGRESO: TipoMovimiento[] = [
  TipoMovimiento.INGRESO_RETIRO_CAJA,
  TipoMovimiento.INGRESO_CIERRE_CAJA,
  TipoMovimiento.INGRESO_ENTRADA_VARIA,
  TipoMovimiento.INGRESO_OPERACION_FINANCIERA,
  TipoMovimiento.INGRESO_RETIRO_BANCO,
  TipoMovimiento.INGRESO_COBRO_CLIENTE,
  TipoMovimiento.INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO,
  TipoMovimiento.TRANSFERENCIA_ENTRADA,
  TipoMovimiento.AJUSTE_POSITIVO,
];
const TIPOS_EGRESO: TipoMovimiento[] = [
  TipoMovimiento.EGRESO_GASTO,
  TipoMovimiento.EGRESO_COMPRA,
  TipoMovimiento.EGRESO_CUOTA_COMPRA,
  TipoMovimiento.EGRESO_CUOTA_PRESTAMO,
  TipoMovimiento.EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO,
  TipoMovimiento.EGRESO_VALE,
  TipoMovimiento.EGRESO_SALARIO,
  TipoMovimiento.EGRESO_CHEQUE,
  TipoMovimiento.EGRESO_OPERACION_FINANCIERA,
  TipoMovimiento.EGRESO_DEPOSITO_BANCO,
  TipoMovimiento.EGRESO_CAJA_INICIAL,
  TipoMovimiento.TRANSFERENCIA_SALIDA,
  TipoMovimiento.AJUSTE_NEGATIVO,
];

export function registerDashboardCajaMayorHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-caja-mayor-kpis', async () => {
    try {
      // 1. Saldos por moneda principal/USD/BRL
      const monedaRepo = dataSource.getRepository(Moneda);
      const principal = await monedaRepo.findOne({ where: { principal: true, activo: true } });
      const usd = await monedaRepo.createQueryBuilder('m')
        .where('m.activo = true AND UPPER(m.simbolo) IN (:...s)', { s: ['USD', '$', 'US$'] })
        .getOne();
      const brl = await monedaRepo.createQueryBuilder('m')
        .where('m.activo = true AND UPPER(m.simbolo) IN (:...s)', { s: ['BRL', 'R$'] })
        .getOne();

      const saldoPorMoneda = async (monedaId?: number): Promise<number> => {
        if (!monedaId) return 0;
        const rows: any[] = await dbQuery(dataSource, `
          SELECT COALESCE(SUM(saldo), 0) as total
          FROM cajas_mayor_saldos WHERE moneda_id = ?
        `, [monedaId]);
        return Number(rows?.[0]?.total || 0);
      };
      const saldoPYG = await saldoPorMoneda(principal?.id);
      const saldoUSD = await saldoPorMoneda(usd?.id);
      const saldoBRL = await saldoPorMoneda(brl?.id);

      // 2. CPP vencidos (cuotas con fecha < hoy y pendientes)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const hoyStr = today.toISOString().slice(0, 10);
      const cppVencidasRows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt, COALESCE(SUM(c.monto - c.monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas c
        JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
        WHERE c.estado IN (?, ?)
          AND cpp.estado = ?
          AND c.fecha_vencimiento < ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuentaPorPagarEstado.ACTIVO, hoyStr]);
      const cppVencidos = Number(cppVencidasRows?.[0]?.cnt || 0);
      const cppMontoTotalPYG = Number(cppVencidasRows?.[0]?.suma || 0);

      // 3. Cheques por vencer (proximos 7 dias, estado DIFERIDO)
      const en7 = new Date(today); en7.setDate(en7.getDate() + 7);
      const chequesRows: any[] = await dbQuery(dataSource, `
        SELECT COUNT(*) as cnt FROM cheques
        WHERE estado = ? AND fecha_pago IS NOT NULL
          AND fecha_pago BETWEEN ? AND ?
      `, [ChequeEstado.DIFERIDO, today.toISOString(), en7.toISOString()]);
      const chequesPorVencer = Number(chequesRows?.[0]?.cnt || 0);

      // 4. Movimientos ultimos 30 dias (entradas vs salidas)
      const movimientos30d = await buildMovimientos30d(dataSource);

      // 5. Proximos vencimientos (CPP + cheques) ordenado por fecha
      const cppListRows: any[] = await dbQuery(dataSource, `
        SELECT 'cpp' as tipo, c.id, c.fecha_vencimiento as fecha,
               (c.monto - c.monto_pagado) as monto,
               COALESCE(pr.razon_social, pr.nombre, cpp.descripcion) as descripcion
        FROM cuentas_por_pagar_cuotas c
        JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
        LEFT JOIN proveedores pr ON pr.id = cpp.proveedor_id
        WHERE c.estado IN (?, ?) AND cpp.estado = ?
          AND c.fecha_vencimiento <= ?
        LIMIT 10
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuentaPorPagarEstado.ACTIVO, en7.toISOString().slice(0, 10)]);

      const chequeListRows: any[] = await dbQuery(dataSource, `
        SELECT 'cheque' as tipo, ch.id, ch.fecha_pago as fecha,
               ch.monto, COALESCE(ch.beneficiario, 'CHEQUE') as descripcion
        FROM cheques ch
        WHERE ch.estado = ? AND ch.fecha_pago IS NOT NULL
          AND ch.fecha_pago BETWEEN ? AND ?
        LIMIT 10
      `, [ChequeEstado.DIFERIDO, today.toISOString(), en7.toISOString()]);

      const proximosVencimientos = [...cppListRows, ...chequeListRows]
        .map(r => {
          const fv = new Date(r.fecha);
          fv.setHours(0, 0, 0, 0);
          const dias = Math.floor((fv.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
          return {
            tipo: r.tipo,
            descripcion: String(r.descripcion || '').toUpperCase(),
            monto: Number(r.monto || 0),
            fechaVencimiento: r.fecha,
            dias,
          };
        })
        .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime())
        .slice(0, 10);

      return {
        saldoPYG,
        saldoUSD,
        saldoBRL,
        cppVencidos,
        cppMontoTotalPYG,
        chequesPorVencer,
        movimientos30d,
        proximosVencimientos,
      };
    } catch (error) {
      console.error('Error get-dashboard-caja-mayor-kpis:', error);
      throw error;
    }
  });
}

async function buildMovimientos30d(
  dataSource: DataSource,
): Promise<{ labels: string[]; entradas: number[]; salidas: number[] }> {
  const labels: string[] = [];
  const entradas: number[] = [];
  const salidas: number[] = [];

  // Solo moneda principal
  const principal = await dataSource.getRepository(Moneda).findOne({ where: { principal: true, activo: true } });
  if (!principal) {
    return { labels, entradas, salidas };
  }

  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const f = new Date(d); f.setHours(23, 59, 59, 999);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);

    const ingRows: any[] = await dbQuery(dataSource, `
      SELECT COALESCE(SUM(monto), 0) as suma
      FROM cajas_mayor_movimientos
      WHERE moneda_id = ?
        AND fecha BETWEEN ? AND ?
        AND tipo_movimiento IN (${TIPOS_INGRESO.map(() => '?').join(',')})
    `, [principal.id, d.toISOString(), f.toISOString(), ...TIPOS_INGRESO]);
    entradas.push(Number(ingRows?.[0]?.suma || 0));

    const egRows: any[] = await dbQuery(dataSource, `
      SELECT COALESCE(SUM(monto), 0) as suma
      FROM cajas_mayor_movimientos
      WHERE moneda_id = ?
        AND fecha BETWEEN ? AND ?
        AND tipo_movimiento IN (${TIPOS_EGRESO.map(() => '?').join(',')})
    `, [principal.id, d.toISOString(), f.toISOString(), ...TIPOS_EGRESO]);
    salidas.push(Number(egRows?.[0]?.suma || 0));
  }

  return { labels, entradas, salidas };
}
