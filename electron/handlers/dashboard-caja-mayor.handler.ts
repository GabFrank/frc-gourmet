import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { CajaMayor } from '../../src/app/database/entities/financiero/caja-mayor.entity';
import { CajaMayorEstado, TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { CuotaEstado, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { ChequeEstado } from '../../src/app/database/entities/financiero/cheques-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Rango, bucketsForRango } from '../utils/dashboard-rangos.util';

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

  ipcMain.handle('get-dashboard-caja-mayor-kpis', async (_event, rango: Rango = 'month') => {
    try {
      // Saldos por moneda principal/USD/BRL (estado actual)
      const monedaRepo = dataSource.getRepository(Moneda);
      const principal = await monedaRepo.findOne({ where: { principal: true, activo: true } });
      const usd = await monedaRepo.createQueryBuilder('m')
        .where('m.activo = 1 AND UPPER(m.simbolo) IN (:...s)', { s: ['USD', '$', 'US$'] })
        .getOne();
      const brl = await monedaRepo.createQueryBuilder('m')
        .where('m.activo = 1 AND UPPER(m.simbolo) IN (:...s)', { s: ['BRL', 'R$'] })
        .getOne();

      const saldoPorMoneda = async (monedaId?: number): Promise<number> => {
        if (!monedaId) return 0;
        const rows: any[] = await dataSource.query(`
          SELECT COALESCE(SUM(saldo), 0) as total
          FROM cajas_mayor_saldos WHERE moneda_id = ?
        `, [monedaId]);
        return Number(rows?.[0]?.total || 0);
      };
      const saldoPYG = await saldoPorMoneda(principal?.id);
      const saldoUSD = await saldoPorMoneda(usd?.id);
      const saldoBRL = await saldoPorMoneda(brl?.id);

      // CPP vencidos / cheques (estado actual)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const hoyStr = today.toISOString().slice(0, 10);
      const cppVencidasRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(c.monto - c.monto_pagado), 0) as suma
        FROM cuentas_por_pagar_cuotas c
        JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
        WHERE c.estado IN (?, ?)
          AND cpp.estado = ?
          AND c.fecha_vencimiento < ?
      `, [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuentaPorPagarEstado.ACTIVO, hoyStr]);
      const cppVencidos = Number(cppVencidasRows?.[0]?.cnt || 0);
      const cppMontoTotalPYG = Number(cppVencidasRows?.[0]?.suma || 0);

      const en7 = new Date(today); en7.setDate(en7.getDate() + 7);
      const chequesRows: any[] = await dataSource.query(`
        SELECT COUNT(*) as cnt FROM cheques
        WHERE estado = ? AND fecha_pago IS NOT NULL
          AND fecha_pago BETWEEN ? AND ?
      `, [ChequeEstado.DIFERIDO, today.toISOString(), en7.toISOString()]);
      const chequesPorVencer = Number(chequesRows?.[0]?.cnt || 0);

      // Cajas mayor en estado ABIERTA con saldo PYG (para click-to-detail)
      const cajaMayorRepo = dataSource.getRepository(CajaMayor);
      const cmAbiertas = await cajaMayorRepo.find({
        where: { estado: CajaMayorEstado.ABIERTA, activo: true },
        order: { fechaApertura: 'ASC' },
      });
      const cajasMayorAbiertas: any[] = [];
      for (const cm of cmAbiertas) {
        const saldoCajaPYG = principal?.id
          ? Number(((await dataSource.query(
              `SELECT COALESCE(SUM(saldo), 0) as total FROM cajas_mayor_saldos WHERE caja_mayor_id = ? AND moneda_id = ?`,
              [cm.id, principal.id],
            )) as any[])?.[0]?.total || 0)
          : 0;
        cajasMayorAbiertas.push({
          id: cm.id,
          nombre: String(cm.nombre || '').toUpperCase(),
          saldoPYG: saldoCajaPYG,
          fechaApertura: cm.fechaApertura,
        });
      }

      // Movimientos por rango (entradas vs salidas)
      const movimientosPorRango = await buildMovimientosPorRango(dataSource, rango, principal?.id);

      // Proximos vencimientos (CPP + cheques) ordenado por fecha
      const cppListRows: any[] = await dataSource.query(`
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

      const chequeListRows: any[] = await dataSource.query(`
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
        cajasMayorAbiertas,
        // legacy key (compat)
        movimientos30d: movimientosPorRango,
        movimientosPorRango,
        proximosVencimientos,
      };
    } catch (error) {
      console.error('Error get-dashboard-caja-mayor-kpis:', error);
      throw error;
    }
  });
}

async function buildMovimientosPorRango(
  dataSource: DataSource,
  rango: Rango,
  monedaId?: number,
): Promise<{ labels: string[]; entradas: number[]; salidas: number[] }> {
  const labels: string[] = [];
  const entradas: number[] = [];
  const salidas: number[] = [];

  if (!monedaId) {
    return { labels, entradas, salidas };
  }

  const buckets = bucketsForRango(rango);
  for (const b of buckets) {
    labels.push(b.label);

    const ingRows: any[] = await dataSource.query(`
      SELECT COALESCE(SUM(monto), 0) as suma
      FROM cajas_mayor_movimientos
      WHERE moneda_id = ?
        AND fecha BETWEEN ? AND ?
        AND tipo_movimiento IN (${TIPOS_INGRESO.map(() => '?').join(',')})
    `, [monedaId, b.desde.toISOString(), b.hasta.toISOString(), ...TIPOS_INGRESO]);
    entradas.push(Number(ingRows?.[0]?.suma || 0));

    const egRows: any[] = await dataSource.query(`
      SELECT COALESCE(SUM(monto), 0) as suma
      FROM cajas_mayor_movimientos
      WHERE moneda_id = ?
        AND fecha BETWEEN ? AND ?
        AND tipo_movimiento IN (${TIPOS_EGRESO.map(() => '?').join(',')})
    `, [monedaId, b.desde.toISOString(), b.hasta.toISOString(), ...TIPOS_EGRESO]);
    salidas.push(Number(egRows?.[0]?.suma || 0));
  }

  return { labels, entradas, salidas };
}
