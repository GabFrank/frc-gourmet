/**
 * #189 — revertir el costo promedio al anular una compra
 * (docs/planes/PLAN-189-costo-anular-compra.md, decisión del propietario 14/11/2026, opción A).
 *
 * - Última compra que movió el costo → vuelve EXACTO al costo previo (snapshot en la línea).
 * - Hubo cambios por compra después, o la compra es vieja sin snapshot → RECALCULADO desde cero
 *   con las compras vigentes (no anuladas), reproduciendo el promedio ponderado.
 * - El costo activo lo cargó alguien a mano o una receta → SIN_CAMBIO (con aviso).
 */
import { PrecioCosto, FuenteCosto } from '../../src/app/database/entities/productos/precio-costo.entity';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { CompraDetalle } from '../../src/app/database/entities/compras/compra-detalle.entity';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { setEntityUserTracking } from './entity.utils';

export type ModoReversionCosto = 'EXACTO' | 'RECALCULADO' | 'SIN_CAMBIO';

export interface ReversionCosto {
  productoId: number;
  modo: ModoReversionCosto;
  costoAnterior: number | null;
  costoNuevo: number | null;
  aviso?: string;
}

/** Signo de un movimiento de stock (misma tabla que getStockActualUnidadBase). */
export function deltaStock(tipo: string, cantidad: number): number {
  switch (tipo) {
    case StockMovimientoTipo.COMPRA:
    case StockMovimientoTipo.AJUSTE_POSITIVO:
    case StockMovimientoTipo.PRODUCCION_ENTRADA:
      return cantidad;
    case StockMovimientoTipo.VENTA:
    case StockMovimientoTipo.AJUSTE_NEGATIVO:
    case StockMovimientoTipo.DESCARTE:
    case StockMovimientoTipo.PRODUCCION_SALIDA:
      return -cantidad;
    default:
      return 0; // TRANSFERENCIA: neutra a nivel producto
  }
}

/** Misma fórmula que aplicarCostoPromedioPonderado (sin redondear). */
export function promedioPonderado(stock: number, costo: number | null, cantidad: number, costoNuevo: number): number {
  if (stock <= 0 || costo === null) return costoNuevo;
  const total = stock + cantidad;
  return total > 0 ? (stock * costo + cantidad * costoNuevo) / total : costoNuevo;
}

export interface MovimientoReplay {
  tipo: string;
  cantidad: number;
  compraId?: number | null;
  /** Costo cargado a mano o por receta en ese momento: reemplaza el costo acumulado. */
  costoFijo?: number;
}

/**
 * Reproduce el costo promedio con los movimientos vigentes (ya filtrados y en orden).
 * `costoLinea(compraId)` da la lista de [cantidad, costo en unidad base] de las líneas de esa compra
 * para el producto, en orden de id; cada movimiento COMPRA consume la siguiente línea de su compra.
 * Devuelve null si no hubo ninguna compra vigente.
 */
export function reproducirCosto(
  movs: MovimientoReplay[],
  lineasPorCompra: Map<number, { costo: number }[]>,
): number | null {
  let stock = 0;
  let costo: number | null = null;
  const usadas = new Map<number, number>();
  for (const m of movs) {
    if (m.costoFijo !== undefined) { costo = m.costoFijo; continue; }
    if (m.tipo === StockMovimientoTipo.COMPRA && m.compraId != null && lineasPorCompra.has(m.compraId)) {
      const lineas = lineasPorCompra.get(m.compraId)!;
      const i = usadas.get(m.compraId) || 0;
      const linea = lineas[Math.min(i, lineas.length - 1)];
      usadas.set(m.compraId, i + 1);
      costo = +promedioPonderado(stock, costo, m.cantidad, linea.costo).toFixed(2);
    }
    stock += deltaStock(m.tipo, m.cantidad);
  }
  return costo;
}

/** El ajuste que deja anular-compra: AJUSTE_NEGATIVO, referencia = compra, «ANULACION COMPRA #n». */
function esAjusteDeAnulacion(m: any): boolean {
  return m.tipo === StockMovimientoTipo.AJUSTE_NEGATIVO &&
    m.tipoReferencia === StockMovimientoTipoReferencia.AJUSTE &&
    /^ANULACION COMPRA #/i.test(m.observaciones || '');
}

/** PG: serializa finalizar/anular sobre los mismos productos (READ COMMITTED no alcanza). */
export async function bloquearProductosParaCosto(qr: any, productoIds: number[]): Promise<void> {
  if (qr.connection?.options?.type !== 'postgres') return;
  const ids = [...new Set(productoIds.filter((x) => x != null))].sort((a, b) => a - b);
  if (!ids.length) return;
  await qr.query(`SELECT "id" FROM "producto" WHERE "id" = ANY($1) ORDER BY "id" FOR UPDATE`, [ids]);
}

function costoUnidadBase(det: any): number {
  const presCant = det.presentacion?.cantidad ? Number(det.presentacion.cantidad) : 1;
  const c = presCant > 0 ? Number(det.costoUnitarioPresentacion) / presCant : Number(det.costoUnitarioPresentacion);
  return +c.toFixed(2);
}

async function desactivarIds(qr: any, ids: number[]): Promise<void> {
  if (!ids.length) return;
  await qr.manager.getRepository(PrecioCosto).createQueryBuilder()
    .update(PrecioCosto).set({ activo: false })
    .where('id IN (:...ids)', { ids })
    .execute();
}

async function activarSolo(qr: any, productoId: number, precioCostoId: number | null): Promise<void> {
  await qr.manager.getRepository(PrecioCosto).createQueryBuilder()
    .update(PrecioCosto).set({ activo: false })
    .where('producto_id = :pid AND activo = true', { pid: productoId })
    .execute();
  if (precioCostoId != null) {
    await qr.manager.getRepository(PrecioCosto).createQueryBuilder()
      .update(PrecioCosto).set({ activo: true })
      .where('id = :id AND producto_id = :pid', { id: precioCostoId, pid: productoId })
      .execute();
  }
}

/**
 * El costo previo se puede volver a activar si sigue existiendo y no lo creó una compra anulada
 * (ni esta). Si no, devuelve null: el producto queda sin costo de compra.
 */
async function previoReactivable(qr: any, previoId: number | null | undefined, compraId: number): Promise<PrecioCosto | null> {
  if (previoId == null) return null;
  const previo: PrecioCosto | null = await qr.manager.getRepository(PrecioCosto).findOne({ where: { id: previoId } });
  if (!previo) return null;
  const deCompra: any[] = await qr.manager.getRepository(CompraDetalle).createQueryBuilder('d')
    .innerJoinAndSelect('d.compra', 'c')
    .where('d.precio_costo_id = :id', { id: previoId })
    .getMany();
  if (deCompra.some((d) => d.compra.id === compraId || d.compra.estado === CompraEstado.CANCELADO)) return null;
  return previo;
}

async function costoActivo(qr: any, productoId: number): Promise<PrecioCosto | null> {
  return await qr.manager.getRepository(PrecioCosto).createQueryBuilder('pc')
    .leftJoinAndSelect('pc.moneda', 'moneda')
    .where('pc.producto_id = :pid', { pid: productoId })
    .andWhere('pc.activo = true')
    .orderBy('pc.id', 'DESC')
    .getOne();
}

/**
 * Revierte el costo de los productos de una compra que se está anulando. Llamar dentro de la
 * transacción de anular-compra, con la compra todavía sin marcar CANCELADO (se la excluye por id).
 * `detalles` con producto y presentacion.
 */
export async function revertirCostoAlAnularCompra(
  qr: any,
  compraId: number,
  detalles: any[],
  monedaId: number,
  userId: number | undefined,
): Promise<ReversionCosto[]> {
  const porProducto = new Map<number, any[]>();
  for (const d of detalles || []) {
    if (!d.producto?.id) continue;
    const arr = porProducto.get(d.producto.id) || [];
    arr.push(d);
    porProducto.set(d.producto.id, arr);
  }
  const out: ReversionCosto[] = [];

  for (const [productoId, lineas] of porProducto) {
    lineas.sort((a, b) => a.id - b.id);
    const activo = await costoActivo(qr, productoId);
    const costoAnterior = activo ? Number(activo.valor) : null;
    const conSnapshot = lineas.every((l) => l.precioCostoId != null);
    // Por orden de creación del costo (finalizar no garantiza recorrer las líneas por id).
    const porCosto = conSnapshot ? [...lineas].sort((a, b) => a.precioCostoId - b.precioCostoId) : lineas;
    const primera = porCosto[0];
    const ultima = porCosto[porCosto.length - 1];

    // Exacto: nadie movió el costo después de esta compra.
    if (conSnapshot && activo && activo.id === ultima.precioCostoId) {
      const previo = await previoReactivable(qr, primera.precioCostoPrevioId, compraId);
      await activarSolo(qr, productoId, previo?.id ?? null);
      out.push({
        productoId, modo: 'EXACTO', costoAnterior, costoNuevo: previo ? Number(previo.valor) : null,
        ...(primera.precioCostoPrevioId != null && !previo ? { aviso: 'El costo previo ya no vale (era de una compra anulada): queda sin costo de compra.' } : {}),
      });
      continue;
    }

    // Un costo manual o de receta posterior manda: no se pisa (pero los de esta compra se apagan).
    if (activo && activo.fuente !== FuenteCosto.COMPRA) {
      await desactivarIds(qr, lineas.map((l) => l.precioCostoId).filter((x) => x != null));
      out.push({
        productoId, modo: 'SIN_CAMBIO', costoAnterior, costoNuevo: costoAnterior,
        aviso: `El costo activo es ${activo.fuente} (cargado después): no se recalcula.`,
      });
      continue;
    }

    // Recalcular desde cero con las compras vigentes.
    const vigentes: any[] = await qr.manager.getRepository(CompraDetalle).createQueryBuilder('d')
      .innerJoinAndSelect('d.compra', 'c')
      .leftJoinAndSelect('d.presentacion', 'pres')
      .leftJoinAndSelect('c.moneda', 'cm')
      .where('d.producto_id = :pid', { pid: productoId })
      .andWhere('c.estado = :fin', { fin: CompraEstado.FINALIZADO })
      .andWhere('c.id <> :cid', { cid: compraId })
      .orderBy('c.fecha_compra', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .addOrderBy('d.id', 'ASC')
      .getMany();
    const lineasPorCompra = new Map<number, { costo: number }[]>();
    for (const d of vigentes) {
      const arr = lineasPorCompra.get(d.compra.id) || [];
      arr.push({ costo: costoUnidadBase(d) });
      lineasPorCompra.set(d.compra.id, arr);
    }

    const controlaStock = !!primera.producto?.controlaStock;
    let recalculado: number | null = null;
    if (controlaStock) {
      const movs: any[] = await qr.manager.getRepository(StockMovimiento).createQueryBuilder('m')
        .where('m.producto_id = :pid', { pid: productoId })
        .andWhere('m.activo = true')
        .orderBy('m.id', 'ASC')
        .getMany();
      // Compras anuladas por anular-compra: su COMPRA y su ajuste «ANULACION COMPRA #n» se sacan juntos.
      // (Una cancelada con el deleteCompra viejo no tiene ajuste: su stock sigue contando, sin costo.)
      const anuladas = new Set<number>([compraId]);
      for (const m of movs) {
        if (esAjusteDeAnulacion(m) && m.referencia != null) anuladas.add(Number(m.referencia));
      }
      const manuales: any[] = await qr.manager.getRepository(PrecioCosto).createQueryBuilder('pc')
        .where('pc.producto_id = :pid', { pid: productoId })
        .andWhere('pc.fuente <> :f', { f: FuenteCosto.COMPRA })
        .orderBy('pc.id', 'ASC')
        .getMany();
      const eventos: { t: number; orden: number; ev: MovimientoReplay }[] = [];
      for (const pc of manuales) {
        eventos.push({ t: new Date(pc.createdAt).getTime(), orden: 0, ev: { tipo: 'COSTO', cantidad: 0, costoFijo: Number(pc.valor) } });
      }
      for (const m of movs) {
        const ref = m.referencia != null ? Number(m.referencia) : null;
        const esDeCompra = m.tipoReferencia === StockMovimientoTipoReferencia.COMPRA && m.tipo === StockMovimientoTipo.COMPRA;
        const esAjusteAnulacion = esAjusteDeAnulacion(m);
        if ((esDeCompra || esAjusteAnulacion) && ref != null && anuladas.has(ref)) continue;
        eventos.push({
          t: new Date(m.createdAt).getTime(), orden: 1,
          ev: { tipo: m.tipo, cantidad: Number(m.cantidad), compraId: esDeCompra ? ref : null },
        });
      }
      // Orden temporal; empate (mismo segundo en SQLite): primero el costo fijo, después los movimientos en orden de id.
      eventos.sort((a, b) => (a.t - b.t) || (a.orden - b.orden));
      const replay = eventos.map((e) => e.ev);
      recalculado = reproducirCosto(replay, lineasPorCompra);
      // Sin compras vigentes no hay costo de compra que reproducir (un costo fijo solo no cuenta).
      if (!vigentes.length) recalculado = null;
    } else if (vigentes.length) {
      // Sin stock la fórmula siempre toma el costo de la compra: queda el de la última vigente
      // en orden de finalización (precio_costo_id; las viejas sin snapshot van antes, por fecha e id).
      const ordenFin = [...vigentes].sort((a, b) => (a.precioCostoId ?? 0) - (b.precioCostoId ?? 0));
      recalculado = costoUnidadBase(ordenFin[ordenFin.length - 1]);
    }

    if (recalculado === null) {
      const previo = conSnapshot ? await previoReactivable(qr, primera.precioCostoPrevioId, compraId) : null;
      await activarSolo(qr, productoId, previo?.id ?? null);
      out.push({
        productoId, modo: 'RECALCULADO', costoAnterior, costoNuevo: previo ? Number(previo.valor) : null,
        ...(previo ? {} : { aviso: 'No quedan compras vigentes del producto: queda sin costo de compra.' }),
      });
      continue;
    }

    const ultimaVigente = vigentes[vigentes.length - 1];
    const monedas = new Set(vigentes.map((d) => d.compra?.moneda?.id).filter((x) => x != null));
    await activarSolo(qr, productoId, null);
    const pc = qr.manager.create(PrecioCosto, {
      fuente: FuenteCosto.COMPRA,
      valor: recalculado,
      // Fecha de la última compra vigente: el aviso de costo desactualizado sigue valiendo.
      fecha: ultimaVigente?.compra?.fechaCompra || new Date(),
      activo: true,
      producto: { id: productoId } as any,
      moneda: { id: ultimaVigente?.compra?.moneda?.id ?? activo?.moneda?.id ?? monedaId } as any,
    });
    await setEntityUserTracking(qr.connection, pc, userId, false);
    await qr.manager.save(PrecioCosto, pc);
    out.push({
      productoId, modo: 'RECALCULADO', costoAnterior, costoNuevo: recalculado,
      ...(monedas.size > 1 ? { aviso: 'Las compras vigentes están en monedas distintas: el promedio no las convierte.' } : {}),
    });
  }
  return out;
}
