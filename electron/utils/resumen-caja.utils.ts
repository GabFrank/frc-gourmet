/**
 * Cómputo del resumen de una caja de venta (apertura, cierre, ventas por forma
 * de pago, gastos, retiros, descuentos/aumentos, esperado y diferencia por
 * moneda).
 *
 * Extraído del handler `getResumenCaja` (ventas.handler.ts) a un util compartido
 * para que también lo consuma el ticket de cierre de caja
 * (`documentos-tickets.handler.ts`) sin duplicar la lógica.
 */

import { DataSource } from 'typeorm';
import { Caja } from '../../src/app/database/entities/financiero/caja.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { GastoCaja } from '../../src/app/database/entities/financiero/gasto-caja.entity';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaOrigen } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { dbQuery } from './db-query';

export interface ResumenCajaConteoMoneda {
  monedaId: number;
  monedaSimbolo: string;
  monedaDenominacion: string;
  total: number;
}

export interface ResumenCaja {
  caja: Caja;
  conteoApertura: ResumenCajaConteoMoneda[];
  conteoCierre: ResumenCajaConteoMoneda[];
  ventasPorFormaPago: { formaPago: string; monedaId: number; monedaSimbolo: string; total: number }[];
  ventasTotalPorMoneda: { monedaId: number; monedaSimbolo: string; total: number }[];
  cantidadVentas: number;
  efectivoPorMoneda: { [monedaId: number]: number };
  esperadoPorMoneda: { [monedaId: number]: number };
  diferenciaPorMoneda: { [monedaId: number]: number };
  descuentosPorMoneda: { [monedaId: number]: number };
  aumentosPorMoneda: { [monedaId: number]: number };
  gastos: any[];
  retiros: any[];
}

/**
 * Calcula el resumen completo de una caja. No hace throw controlado: si la caja
 * no existe lanza Error (el caller decide).
 */
export async function computeResumenCaja(dataSource: DataSource, cajaId: number): Promise<ResumenCaja> {
  const cajaRepo = dataSource.getRepository(Caja);
  const caja = await cajaRepo.findOne({
    where: { id: cajaId },
    relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'createdBy', 'createdBy.persona'],
  });
  if (!caja) throw new Error(`Caja ${cajaId} not found`);

  // Conteo apertura por moneda
  const conteoApertura: ResumenCajaConteoMoneda[] = [];
  if (caja.conteoApertura?.id) {
    const rows = await dbQuery(dataSource, `
      SELECT mb.moneda_id, m.simbolo, m.denominacion, SUM(COALESCE(cd.monto, cd.cantidad * mb.valor)) as total
      FROM conteos_detalles cd
      JOIN monedas_billetes mb ON cd.moneda_billete_id = mb.id
      JOIN monedas m ON mb.moneda_id = m.id
      WHERE cd.conteo_id = ?
      GROUP BY mb.moneda_id, m.simbolo, m.denominacion
    `, [caja.conteoApertura.id]);
    for (const r of rows) {
      conteoApertura.push({ monedaId: r.moneda_id, monedaSimbolo: r.simbolo, monedaDenominacion: r.denominacion, total: r.total || 0 });
    }
  }

  // Conteo cierre por moneda
  const conteoCierre: ResumenCajaConteoMoneda[] = [];
  if (caja.conteoCierre?.id) {
    const rows = await dbQuery(dataSource, `
      SELECT mb.moneda_id, m.simbolo, m.denominacion, SUM(COALESCE(cd.monto, cd.cantidad * mb.valor)) as total
      FROM conteos_detalles cd
      JOIN monedas_billetes mb ON cd.moneda_billete_id = mb.id
      JOIN monedas m ON mb.moneda_id = m.id
      WHERE cd.conteo_id = ?
      GROUP BY mb.moneda_id, m.simbolo, m.denominacion
    `, [caja.conteoCierre.id]);
    for (const r of rows) {
      conteoCierre.push({ monedaId: r.moneda_id, monedaSimbolo: r.simbolo, monedaDenominacion: r.denominacion, total: r.total || 0 });
    }
  }

  // Ventas de esta caja
  const ventaRepo = dataSource.getRepository(Venta);
  const ventas = await ventaRepo.find({
    where: { caja: { id: cajaId }, estado: VentaEstado.CONCLUIDA },
    relations: ['pago'],
  });

  const cantidadVentas = ventas.length;
  const ventasPorFormaPagoMap: { [key: string]: any } = {};
  const ventasTotalPorMonedaMap: { [key: string]: any } = {};
  const efectivoPorMoneda: { [monedaId: number]: number } = {};
  const descuentosPorMoneda: { [monedaId: number]: number } = {};
  const aumentosPorMoneda: { [monedaId: number]: number } = {};

  const pagoDetalleRepo = dataSource.getRepository(PagoDetalle);
  for (const venta of ventas) {
    if (!venta.pago?.id) continue;
    const detalles = await pagoDetalleRepo.find({
      // `activo: true` excluye líneas anuladas por `anularCobroParcial` (soft-delete),
      // que de otro modo inflan el efectivo esperado y generan faltantes falsos.
      where: { pago: { id: venta.pago.id }, activo: true },
      relations: ['moneda', 'formaPago'],
    });
    for (const d of detalles) {
      if (!d.moneda) continue;
      const monedaId = d.moneda.id;
      const simbolo = d.moneda.simbolo || '';

      if (d.tipo === TipoDetalle.PAGO) {
        if (!d.formaPago) continue;
        const fpKey = `${d.formaPago.nombre}_${monedaId}`;
        if (!ventasPorFormaPagoMap[fpKey]) {
          ventasPorFormaPagoMap[fpKey] = { formaPago: d.formaPago.nombre, monedaId, monedaSimbolo: simbolo, total: 0 };
        }
        ventasPorFormaPagoMap[fpKey].total += d.valor || 0;

        const mKey = `${monedaId}`;
        if (!ventasTotalPorMonedaMap[mKey]) {
          ventasTotalPorMonedaMap[mKey] = { monedaId, monedaSimbolo: simbolo, total: 0 };
        }
        ventasTotalPorMonedaMap[mKey].total += d.valor || 0;

        if ((d.formaPago as any).movimentaCaja) {
          efectivoPorMoneda[monedaId] = (efectivoPorMoneda[monedaId] || 0) + (d.valor || 0);
        }
      } else if (d.tipo === TipoDetalle.VUELTO) {
        const mKey = `${monedaId}`;
        if (!ventasTotalPorMonedaMap[mKey]) {
          ventasTotalPorMonedaMap[mKey] = { monedaId, monedaSimbolo: simbolo, total: 0 };
        }
        ventasTotalPorMonedaMap[mKey].total -= d.valor || 0;

        if ((d.formaPago as any)?.movimentaCaja) {
          efectivoPorMoneda[monedaId] = (efectivoPorMoneda[monedaId] || 0) - (d.valor || 0);
        }
      } else if (d.tipo === TipoDetalle.DESCUENTO) {
        descuentosPorMoneda[monedaId] = (descuentosPorMoneda[monedaId] || 0) + (d.valor || 0);
      } else if (d.tipo === TipoDetalle.AUMENTO) {
        aumentosPorMoneda[monedaId] = (aumentosPorMoneda[monedaId] || 0) + (d.valor || 0);
      }
    }
  }

  // Gastos pagados con el efectivo de esta caja de venta (ACTIVOS).
  const gastosCaja = await dataSource.getRepository(GastoCaja).find({
    where: { caja: { id: cajaId } as any, estado: 'ACTIVO' },
    relations: ['moneda', 'formaPago', 'gastoCategoria'],
    order: { fecha: 'DESC', id: 'DESC' } as any,
  });
  const gastosEfectivoPorMoneda: { [monedaId: number]: number } = {};
  const gastos = gastosCaja.map(g => {
    const monedaId = (g.moneda as any)?.id;
    const monto = Number(g.monto || 0);
    if (monedaId && (g.formaPago as any)?.movimentaCaja) {
      gastosEfectivoPorMoneda[monedaId] = (gastosEfectivoPorMoneda[monedaId] || 0) + monto;
    }
    return {
      id: g.id,
      descripcion: g.descripcion,
      monto,
      monedaId,
      monedaSimbolo: (g.moneda as any)?.simbolo || '',
      monedaDenominacion: (g.moneda as any)?.denominacion || '',
      formaPago: (g.formaPago as any)?.nombre || '',
      categoria: (g.gastoCategoria as any)?.nombre || '',
      fecha: g.fecha,
    };
  });

  // Retiros MANUALES de esta caja. El retiro de CIERRE se genera del propio
  // conteo (mueve el efectivo contado a caja mayor) y NO debe descontarse del
  // esperado; solo los manuales, que salieron del cajón durante el turno.
  const retirosCaja = await dataSource.getRepository(RetiroCaja).find({
    where: { caja: { id: cajaId } as any, origen: RetiroCajaOrigen.MANUAL as any },
    relations: ['detalles', 'detalles.moneda', 'detalles.formaPago', 'responsableRetiro', 'responsableRetiro.persona'],
    order: { fechaRetiro: 'DESC' } as any,
  });
  const retirosEfectivoPorMoneda: { [monedaId: number]: number } = {};
  const retiros = retirosCaja.map(r => {
    const detalles = (r.detalles || []).map((d: any) => {
      const monedaId = d.moneda?.id;
      const monto = Number(d.monto || 0);
      if (monedaId && d.formaPago?.movimentaCaja) {
        retirosEfectivoPorMoneda[monedaId] = (retirosEfectivoPorMoneda[monedaId] || 0) + monto;
      }
      return {
        monedaId,
        monedaSimbolo: d.moneda?.simbolo || '',
        monedaDenominacion: d.moneda?.denominacion || '',
        monto,
      };
    });
    return {
      id: r.id,
      fecha: r.fechaRetiro,
      responsable: (r.responsableRetiro as any)?.persona?.nombre || '',
      observacion: r.observacion || '',
      estado: r.estado,
      detalles,
    };
  });

  // Calcular esperado y diferencia. Todo lo que salió del cajón (gastos y
  // retiros manuales en efectivo) reduce el esperado en su moneda.
  const esperadoPorMoneda: { [monedaId: number]: number } = {};
  const diferenciaPorMoneda: { [monedaId: number]: number } = {};
  const allMonedaIds = new Set<number>();
  conteoApertura.forEach(c => allMonedaIds.add(c.monedaId));
  conteoCierre.forEach(c => allMonedaIds.add(c.monedaId));
  Object.keys(efectivoPorMoneda).forEach(k => allMonedaIds.add(Number(k)));
  Object.keys(gastosEfectivoPorMoneda).forEach(k => allMonedaIds.add(Number(k)));
  Object.keys(retirosEfectivoPorMoneda).forEach(k => allMonedaIds.add(Number(k)));

  for (const monedaId of allMonedaIds) {
    const apertura = conteoApertura.find(c => c.monedaId === monedaId)?.total || 0;
    const cierre = conteoCierre.find(c => c.monedaId === monedaId)?.total || 0;
    const efectivo = efectivoPorMoneda[monedaId] || 0;
    const gastoEfectivo = gastosEfectivoPorMoneda[monedaId] || 0;
    const retiroEfectivo = retirosEfectivoPorMoneda[monedaId] || 0;
    esperadoPorMoneda[monedaId] = apertura + efectivo - gastoEfectivo - retiroEfectivo;
    diferenciaPorMoneda[monedaId] = cierre - esperadoPorMoneda[monedaId];
  }

  return {
    caja,
    conteoApertura,
    conteoCierre,
    ventasPorFormaPago: Object.values(ventasPorFormaPagoMap),
    ventasTotalPorMoneda: Object.values(ventasTotalPorMonedaMap),
    cantidadVentas,
    efectivoPorMoneda,
    esperadoPorMoneda,
    diferenciaPorMoneda,
    descuentosPorMoneda,
    aumentosPorMoneda,
    gastos,
    retiros,
  };
}
