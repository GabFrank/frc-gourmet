import { DataSource } from 'typeorm';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import {
  TicketLine, ticketText, ticketSeparador,
  FormateadorMonedas, ticketRubroMultimoneda, montoAPrincipal, tasaVsPrincipal,
} from './ticket.utils';

/**
 * Pagos YA REGISTRADOS de una venta, para imprimirlos en los tickets de
 * delivery.
 *
 * El problema que resuelve: un delivery puede tener plata cargada antes de que
 * el ticket se imprima —cobro anticipado, una ronda de cobro parcial, un pedido
 * de la web pagado online— y hasta 2026-08 el papel no decía nada de eso. El
 * repartidor salía con un "A COBRAR <total>" que ya estaba pago a medias, y el
 * cajero que finalizaba no tenía cómo saber qué se había cargado antes.
 *
 * La organización (forma de pago agrupando, moneda adentro) es deliberadamente
 * la misma del resumen de cierre de caja: `ticketRubroMultimoneda`, el helper
 * que los dos comparten.
 */

/** Una fila del desglose: una forma de pago en una moneda. */
export interface PagoRegistradoLinea {
  formaPago: string;
  monedaId: number;
  total: number;
  /** La forma de pago NO mueve el cajón (CREDITO). No es plata entrando. */
  sinMovimientoDeCaja: boolean;
}

export interface PagosRegistrados {
  /** Filas de tipo PAGO, agrupadas por (forma de pago, moneda). */
  lineas: PagoRegistradoLinea[];
  /** Vueltos entregados, agrupados por moneda. */
  vueltos: { monedaId: number; total: number }[];
  /** Neto ya cobrado (PAGO − VUELTO), convertido a la moneda principal. */
  totalEnPrincipal: number;
  hayPagos: boolean;
  /**
   * Alguna línea está en una moneda distinta de la principal y **no hay
   * cotización vigente** para convertirla.
   *
   * `totalEnPrincipal` no sirve para calcular un saldo en ese caso:
   * `montoAPrincipal` cae a "1 a 1" cuando no encuentra tasa, así que 60 USD
   * cuentan como 60 guaraníes. Con un adelanto en dólares y la cotización
   * vencida, el saldo impreso quedaba prácticamente igual al total y el cliente
   * pagaba dos veces. El ticket usa este flag para NO imprimir un número que no
   * puede sostener.
   */
  sinCotizacion: boolean;
}

const VACIO: PagosRegistrados = {
  lineas: [], vueltos: [], totalEnPrincipal: 0, hayPagos: false, sinCotizacion: false,
};

/**
 * Lee las líneas del `Pago` de una venta y las agrupa.
 *
 * - Sólo `activo = true`: anular una ronda de cobro parcial hace soft-delete de
 *   sus líneas, y una línea anulada no es plata cobrada.
 * - `DESCUENTO` / `AUMENTO` quedan **fuera**: no son dinero entregado por el
 *   cliente sino ajustes del precio, y ya están reflejados en el TOTAL impreso.
 *   Contarlos acá los sumaría dos veces.
 * - El `VUELTO` **no se netea contra su forma de pago**, se lleva aparte. Si el
 *   cliente paga con tarjeta y se le da vuelto en efectivo, netear por clave
 *   produciría una fila `EFECTIVO -20.000`. El resumen de cierre tampoco lo
 *   netea en su desglose; sí se resta del total cobrado, que es lo que importa
 *   para el saldo.
 */
export async function obtenerPagosRegistrados(
  dataSource: DataSource,
  ventaId: number,
  principal: any,
  cambios: any[],
): Promise<PagosRegistrados> {
  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['pago'],
  });
  const pagoId = (venta?.pago as any)?.id;
  if (!pagoId) return VACIO;

  const detalles = await dataSource.getRepository(PagoDetalle).find({
    where: { pago: { id: pagoId } as any, activo: true },
    relations: ['moneda', 'formaPago'],
    order: { id: 'ASC' },
  });
  if (!detalles.length) return VACIO;

  const porClave = new Map<string, PagoRegistradoLinea>();
  const porMonedaVuelto = new Map<number, number>();
  let totalEnPrincipal = 0;
  let sinCotizacion = false;

  for (const d of detalles) {
    const moneda: any = (d as any).moneda;
    if (!moneda?.id) continue;
    const valor = Number((d as any).valor || 0);
    if (!valor) continue;
    // Sólo es "sin cotización" si hay una moneda principal identificada y esta
    // línea es de otra. Un local que opera únicamente en guaraníes nunca entra
    // acá, así que su ticket no pierde el saldo. Si NO hay moneda principal
    // marcada tampoco se marca: no habría con qué comparar y bloquearíamos el
    // saldo de todos los tickets.
    if (principal?.id != null && moneda.id !== principal.id
        && tasaVsPrincipal(cambios, principal, moneda) <= 0) {
      sinCotizacion = true;
    }
    const enPrincipal = montoAPrincipal(valor, moneda, principal, cambios);

    if (d.tipo === TipoDetalle.PAGO) {
      const fp: any = (d as any).formaPago;
      const nombre = String(fp?.nombre || fp?.descripcion || 'SIN FORMA').toUpperCase();
      const clave = `${nombre}__${moneda.id}`;
      const fila = porClave.get(clave) || {
        formaPago: nombre,
        monedaId: moneda.id,
        total: 0,
        // `movimentaCaja: false` es la marca de la venta a crédito: se genera
        // una línea PAGO por el total con forma de pago CREDITO, pero no entró
        // un guaraní al cajón.
        sinMovimientoDeCaja: fp?.movimentaCaja === false,
      };
      fila.total += valor;
      porClave.set(clave, fila);
      totalEnPrincipal += enPrincipal;
    } else if (d.tipo === TipoDetalle.VUELTO) {
      porMonedaVuelto.set(moneda.id, (porMonedaVuelto.get(moneda.id) || 0) + valor);
      totalEnPrincipal -= enPrincipal;
    }
  }

  const lineas = [...porClave.values()].filter((l) => Math.abs(l.total) > 0.005);
  const vueltos = [...porMonedaVuelto.entries()]
    .map(([monedaId, total]) => ({ monedaId, total }))
    .filter((v) => Math.abs(v.total) > 0.005);

  return {
    lineas,
    vueltos,
    totalEnPrincipal,
    hayPagos: lineas.length > 0 || vueltos.length > 0,
    sinCotizacion,
  };
}

/**
 * Bloque imprimible del desglose.
 *
 * Una forma de pago con una sola moneda ocupa una línea; con varias, el nombre
 * va como encabezado y las monedas indentadas debajo — exactamente el layout
 * del resumen de cierre.
 *
 * `anchoClave` acota el nombre de la forma de pago para que el importe no se
 * caiga a la línea siguiente en una impresora de 32 columnas.
 */
export function buildBloquePagosRegistrados(
  pagos: PagosRegistrados,
  fmt: FormateadorMonedas,
  width: number,
  titulo = 'PAGOS REGISTRADOS',
): TicketLine[] {
  if (!pagos.hayPagos) return [];
  const anchoClave = Math.max(8, width - 14);

  const lines: TicketLine[] = [ticketSeparador('-'), ticketText(titulo, { bold: true })];

  // Agrupado por forma de pago: con una sola moneda sale en una línea, con
  // varias el nombre encabeza y las monedas van indentadas. Es el layout del
  // resumen de cierre.
  for (const g of agruparPorFormaPago(pagos.lineas)) {
    // El sufijo va en la etiqueta y no en una línea aparte para que quede pegado
    // a la forma de pago que califica, incluso cuando hay varias.
    const etiqueta = g.sinMovimientoDeCaja ? `${g.formaPago} (A CREDITO)` : g.formaPago;
    lines.push(...ticketRubroMultimoneda(etiqueta, g.montos, fmt, { anchoClave }));
  }

  if (pagos.vueltos.length) {
    lines.push(...ticketRubroMultimoneda(
      'VUELTO',
      pagos.vueltos.map((v) => ({ monedaId: v.monedaId, total: -v.total })),
      fmt,
      { anchoClave },
    ));
  }

  return lines;
}

/**
 * Agrupa las filas por forma de pago para el caso multimoneda.
 *
 * `buildBloquePagosRegistrados` imprime una fila por (forma, moneda), lo que en
 * una forma de pago con dos monedas repetiría el nombre. Esta función arma la
 * estructura que espera `ticketRubroMultimoneda` para que el nombre salga una
 * sola vez como encabezado.
 */
export function agruparPorFormaPago(
  lineas: PagoRegistradoLinea[],
): { formaPago: string; sinMovimientoDeCaja: boolean; montos: { monedaId: number; total: number }[] }[] {
  const orden: string[] = [];
  const mapa = new Map<string, { formaPago: string; sinMovimientoDeCaja: boolean; montos: { monedaId: number; total: number }[] }>();
  for (const l of lineas) {
    if (!mapa.has(l.formaPago)) {
      mapa.set(l.formaPago, { formaPago: l.formaPago, sinMovimientoDeCaja: l.sinMovimientoDeCaja, montos: [] });
      orden.push(l.formaPago);
    }
    const g = mapa.get(l.formaPago)!;
    g.montos.push({ monedaId: l.monedaId, total: l.total });
    // Basta una línea sin movimiento de caja para que el rubro lo advierta.
    g.sinMovimientoDeCaja = g.sinMovimientoDeCaja || l.sinMovimientoDeCaja;
  }
  return orden.map((n) => mapa.get(n)!);
}
