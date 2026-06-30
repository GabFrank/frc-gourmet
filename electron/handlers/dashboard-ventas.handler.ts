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

// El "total" real de una venta NO vive en la columna ventas.total (no poblada),
// sino en pagos_detalles (PAGO - VUELTO). Estos helpers calculan el monto cobrado
// en la moneda principal, igual que getVentasTotalByCaja / getResumenCaja.
async function getMonedaPrincipalId(dataSource: DataSource): Promise<number> {
  const rows: any[] = await dbQuery(
    dataSource,
    `SELECT id FROM monedas WHERE principal = true LIMIT 1`,
    [],
  );
  return Number(rows?.[0]?.id || 0);
}

async function sumaVentasRango(
  dataSource: DataSource,
  monedaPrincipalId: number,
  desdeISO: string,
  hastaISO: string,
): Promise<{ cnt: number; suma: number }> {
  const rows: any[] = await dbQuery(dataSource, `
    SELECT COUNT(DISTINCT v.id) as cnt,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as suma
    FROM ventas v
    LEFT JOIN pagos p ON v.pago_id = p.id
    LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.moneda_id = ?
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
  `, [monedaPrincipalId, VentaEstado.CONCLUIDA, desdeISO, hastaISO]);
  return { cnt: Number(rows?.[0]?.cnt || 0), suma: Number(rows?.[0]?.suma || 0) };
}

// Desglose del total cobrado en un rango: por moneda y por forma de pago, con
// CADA moneda convertida a la moneda principal (Gs) usando la cotización
// (compra_local) más reciente de monedas_cambio. El total en Gs suma TODAS las
// monedas convertidas, no solo la principal.
async function desgloseVentasRango(
  dataSource: DataSource,
  monedaPrincipalId: number,
  desdeISO: string,
  hastaISO: string,
): Promise<{
  totalGs: number;
  porMoneda: any[];
  porFormaPago: any[];
}> {
  // Totales (PAGO - VUELTO) agrupados por moneda y forma de pago.
  const rows: any[] = await dbQuery(dataSource, `
    SELECT pd.moneda_id      as moneda_id,
           m.simbolo         as simbolo,
           m.denominacion    as denominacion,
           m.decimales       as decimales,
           m.principal       as principal,
           pd.forma_pago_id  as forma_pago_id,
           fp.nombre         as forma_pago_nombre,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    JOIN pagos p ON v.pago_id = p.id
    JOIN pagos_detalles pd ON pd.pago_id = p.id
    JOIN monedas m ON m.id = pd.moneda_id
    LEFT JOIN formas_pago fp ON fp.id = pd.forma_pago_id
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY pd.moneda_id, m.simbolo, m.denominacion, m.decimales, m.principal, pd.forma_pago_id, fp.nombre
  `, [VentaEstado.CONCLUIDA, desdeISO, hastaISO]);

  // Cotización (compraLocal) más reciente de cada moneda origen → principal.
  // La columna en monedas_cambio es "compraLocal" (camelCase): el entity
  // MonedaCambio.compraLocal no define `name:` y no hay naming strategy snake,
  // así que TypeORM la creó camelCase. Se cita y se aliasea a compra_local.
  const cambioRows: any[] = await dbQuery(dataSource, `
    SELECT moneda_origen_id, "compraLocal" AS compra_local, created_at
    FROM monedas_cambio
    WHERE moneda_destino_id = ? AND activo = true
    ORDER BY created_at DESC
  `, [monedaPrincipalId]);
  const cotizacionPorMoneda: { [monedaId: number]: number } = {};
  for (const c of cambioRows) {
    const oid = Number(c.moneda_origen_id);
    if (cotizacionPorMoneda[oid] == null) cotizacionPorMoneda[oid] = Number(c.compra_local || 0);
  }

  const esPrincipalFlag = (v: any) => v === true || v === 1 || v === '1';

  const porMonedaMap: { [monedaId: number]: any } = {};
  const porFormaPago: any[] = [];
  let totalGs = 0;

  for (const r of rows) {
    const monedaId = Number(r.moneda_id);
    const esPrincipal = esPrincipalFlag(r.principal);
    const total = Number(r.total || 0);
    const cotizacion = esPrincipal ? 1 : (cotizacionPorMoneda[monedaId] || 0);
    const totalEnGs = Math.round(total * cotizacion);

    if (!porMonedaMap[monedaId]) {
      porMonedaMap[monedaId] = {
        monedaId,
        simbolo: r.simbolo || '',
        denominacion: String(r.denominacion || '').toUpperCase(),
        decimales: Number(r.decimales || 0),
        esPrincipal,
        cotizacion,
        total: 0,
        totalEnGs: 0,
      };
    }
    porMonedaMap[monedaId].total += total;
    porMonedaMap[monedaId].totalEnGs += totalEnGs;

    porFormaPago.push({
      formaPago: String(r.forma_pago_nombre || 'SIN FORMA').toUpperCase(),
      monedaId,
      simbolo: r.simbolo || '',
      total,
      totalEnGs,
      cotizacion,
    });

    totalGs += totalEnGs;
  }

  // Orden: principal primero, luego por aporte en Gs descendente.
  const porMoneda = Object.values(porMonedaMap).sort((a: any, b: any) => {
    if (a.esPrincipal !== b.esPrincipal) return a.esPrincipal ? -1 : 1;
    return b.totalEnGs - a.totalEnGs;
  });
  porFormaPago.sort((a: any, b: any) => b.totalEnGs - a.totalEnGs);

  return { totalGs, porMoneda, porFormaPago };
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

      const monedaPrincipalId = await getMonedaPrincipalId(dataSource);

      // 1. Ventas hoy + total hoy. El total incluye TODAS las monedas y formas
      // de pago, convertidas y sumadas a Gs (no solo la moneda principal).
      const { cnt: ventasHoy } = await sumaVentasRango(
        dataSource, monedaPrincipalId, hoyInicio.toISOString(), hoyFin.toISOString(),
      );
      const desgloseHoy = await desgloseVentasRango(
        dataSource, monedaPrincipalId, hoyInicio.toISOString(), hoyFin.toISOString(),
      );
      const totalHoyPYG = desgloseHoy.totalGs;
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

        // Ventas + monto de la caja (monto cobrado en moneda principal)
        const cajaTotalsRows: any[] = await dbQuery(dataSource, `
          SELECT COUNT(DISTINCT v.id) as cnt,
                 COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as suma
          FROM ventas v
          LEFT JOIN pagos p ON v.pago_id = p.id
          LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.moneda_id = ?
          WHERE v.caja_id = ? AND v.estado = ?
        `, [monedaPrincipalId, caja.id, VentaEstado.CONCLUIDA]);
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
        // Desglose del total de hoy por moneda y forma de pago (todo en Gs).
        desgloseVentasHoy: desgloseHoy,
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

  const monedaPrincipalId = await getMonedaPrincipalId(dataSource);
  const now = new Date();
  if (rango === 'today' || rango === 'week') {
    const diasNombre = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setHours(23, 59, 59, 999);
      const r = await sumaVentasRango(dataSource, monedaPrincipalId, d.toISOString(), f.toISOString());
      labels.push(diasNombre[d.getDay()]);
      ventas.push(r.suma);
      cantidades.push(r.cnt);
    }
  } else if (rango === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setHours(23, 59, 59, 999);
      const r = await sumaVentasRango(dataSource, monedaPrincipalId, d.toISOString(), f.toISOString());
      labels.push(`${d.getDate()}`);
      ventas.push(r.suma);
      cantidades.push(r.cnt);
    }
  } else if (rango === '3months') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7) - 6);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d); f.setDate(f.getDate() + 6); f.setHours(23, 59, 59, 999);
      const r = await sumaVentasRango(dataSource, monedaPrincipalId, d.toISOString(), f.toISOString());
      labels.push(`S${12 - i}`);
      ventas.push(r.suma);
      cantidades.push(r.cnt);
    }
  } else { // 6months
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const r = await sumaVentasRango(dataSource, monedaPrincipalId, d.toISOString(), f.toISOString());
      labels.push(meses[d.getMonth()]);
      ventas.push(r.suma);
      cantidades.push(r.cnt);
    }
  }

  return { labels, ventas, cantidades };
}
