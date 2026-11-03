/**
 * La factura de una venta, calculada desde la venta.
 *
 * Antes el diálogo de factura precargaba cada renglón con `precioVentaUnitario`
 * y dejaba afuera los adicionales, el descuento del ítem, el envío y los ajustes
 * globales del cobro: la caja cobraba ₲ 112.000 y la factura salía por ₲ 102.000
 * (#325). Y `create-factura` guardaba lo que le mandaran (#240).
 *
 * Ahora la propuesta sale de acá, y la usan los dos: el diálogo la pide para
 * precargar (`get-factura-propuesta-venta`) y `create-factura` la usa para
 * validar lo que llega. El total es, por construcción, el que cobra la caja
 * (`getEstadoCobroVentaInternal`: `deudaBruta − descuentoGlobal + aumentoGlobal`).
 *
 * Decisiones de Gabriel (2026-11-02): el envío va como renglón `SERVICIO DE
 * DELIVERY` IVA 10; el aumento del cobro, como renglón `RECARGO` IVA 10; el
 * descuento del cobro va al campo `descuento` y se reparte entre las tasas
 * (`calcularTotalesFactura`).
 */
import type { DataSource, EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem, EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemAdicional } from '../../src/app/database/entities/ventas/venta-item-adicional.entity';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { calcularTotalesFactura, normalizarIvaTipo } from '../../src/app/shared/utils/factura-totales.util';
import { precioUnitarioNetoItem } from './venta-total.utils';

export const DESCRIPCION_DELIVERY = 'SERVICIO DE DELIVERY';
export const DESCRIPCION_RECARGO = 'RECARGO';

export type TipoLineaPropuesta = 'ITEM' | 'DELIVERY' | 'RECARGO';

export interface LineaPropuesta {
  tipo: TipoLineaPropuesta;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  ivaTipo: 10 | 5 | 0;
  total: number;
  ventaItemId: number | null;
  productoId: number | null;
  productoNombre: string;
}

export interface FacturaPropuesta {
  ventaId: number;
  lineas: LineaPropuesta[];
  bruto: number;
  descuento: number;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  totalIva: number;
  total: number;
}

/** Ítem ya leído, con lo justo para facturarlo. */
export interface ItemParaFactura {
  id: number;
  cantidad: number | string;
  precioVentaUnitario: number | string;
  precioAdicionales: number | string | null;
  descuentoUnitario: number | string | null;
  productoId: number | null;
  productoNombre: string;
  presentacionNombre?: string | null;
  ensambladoDescripcion?: string | null;
  ivaTipo: number | null | undefined;
  /** Nombres de los adicionales (los del ítem y los de cada sabor). Sólo para la descripción. */
  adicionales: string[];
}

export interface DatosVentaParaFactura {
  ventaId: number;
  items: ItemParaFactura[];
  costoDelivery: number | string | null;
  descuentoGlobal: number;
  aumentoGlobal: number;
}

function descripcionItem(it: ItemParaFactura): string {
  const base = `${it.productoNombre || ''}${it.presentacionNombre ? ' (' + it.presentacionNombre + ')' : ''}`.trim();
  const partes = [base];
  if (it.ensambladoDescripcion) partes.push(String(it.ensambladoDescripcion));
  const adic = Array.from(new Set((it.adicionales || []).filter(Boolean)));
  let desc = partes.filter(Boolean).join(' ');
  if (adic.length) desc += ` + ${adic.join(' + ')}`;
  return desc.toUpperCase();
}

/** Arma la propuesta con datos ya leídos (pura, testeable sin base). */
export function armarFacturaDesdeVenta(datos: DatosVentaParaFactura): FacturaPropuesta {
  const lineas: Omit<LineaPropuesta, 'total'>[] = [];

  for (const it of datos.items || []) {
    lineas.push({
      tipo: 'ITEM',
      descripcion: descripcionItem(it),
      cantidad: Number(it.cantidad) || 0,
      // El mismo precio por unidad que cobra la caja (`computeNetoBrutoItem`).
      precioUnitario: precioUnitarioNetoItem(it),
      ivaTipo: normalizarIvaTipo(it.ivaTipo ?? 10),
      ventaItemId: it.id,
      productoId: it.productoId ?? null,
      productoNombre: it.productoNombre || '',
    });
  }

  const costoDelivery = Number(datos.costoDelivery ?? 0) || 0;
  if (costoDelivery > 0) {
    lineas.push({
      tipo: 'DELIVERY', descripcion: DESCRIPCION_DELIVERY, cantidad: 1, precioUnitario: costoDelivery,
      ivaTipo: 10, ventaItemId: null, productoId: null, productoNombre: '',
    });
  }

  const aumento = Number(datos.aumentoGlobal) || 0;
  if (aumento > 0) {
    lineas.push({
      tipo: 'RECARGO', descripcion: DESCRIPCION_RECARGO, cantidad: 1, precioUnitario: aumento,
      ivaTipo: 10, ventaItemId: null, productoId: null, productoNombre: '',
    });
  }

  const t = calcularTotalesFactura(lineas, Number(datos.descuentoGlobal) || 0);
  return {
    ventaId: datos.ventaId,
    lineas: lineas.map((l, i) => ({ ...l, total: t.totalesLinea[i] })),
    bruto: t.bruto,
    descuento: t.descuento,
    gravada10: t.gravada10,
    gravada5: t.gravada5,
    exenta: t.exenta,
    iva10: t.iva10,
    iva5: t.iva5,
    totalIva: t.totalIva,
    total: t.total,
  };
}

/**
 * Lee la venta y arma su propuesta. `null` si la venta no existe.
 *
 * Lee los ajustes del cobro igual que `getEstadoCobroVentaInternal` (suma de
 * `valor` de las líneas activas): el cobro los guarda siempre en la moneda
 * principal. Si alguna vez dejara de ser así, los dos cambian juntos y el test
 * de paridad lo marca.
 */
export async function calcularFacturaDeVenta(
  ejecutor: DataSource | EntityManager,
  ventaId: number,
): Promise<FacturaPropuesta | null> {
  const venta = await ejecutor.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['pago'],
  });
  if (!venta) return null;

  const items = await ejecutor.getRepository(VentaItem).find({
    where: { venta: { id: ventaId }, estado: EstadoVentaItem.ACTIVO },
    relations: ['producto', 'presentacion'],
    order: { id: 'ASC' },
  });

  const nombresAdicionales = new Map<number, string[]>();
  if (items.length) {
    const adicionales = await ejecutor.getRepository(VentaItemAdicional).find({
      where: { ventaItem: { id: In(items.map((i) => i.id)) }, activo: true },
      relations: ['ventaItem', 'adicional'],
      order: { id: 'ASC' },
    });
    for (const a of adicionales) {
      const id = (a as any).ventaItem?.id;
      const nombre = (a as any).adicional?.nombre;
      if (!id || !nombre) continue;
      const lista = nombresAdicionales.get(id) || [];
      lista.push(String(nombre));
      nombresAdicionales.set(id, lista);
    }
  }

  let descuentoGlobal = 0;
  let aumentoGlobal = 0;
  const pagoId = (venta as any).pago?.id;
  if (pagoId) {
    const detalles = await ejecutor.getRepository(PagoDetalle).find({
      where: { pago: { id: pagoId }, activo: true },
    });
    for (const d of detalles) {
      if (d.tipo === TipoDetalle.DESCUENTO) descuentoGlobal += Number(d.valor || 0);
      else if (d.tipo === TipoDetalle.AUMENTO) aumentoGlobal += Number(d.valor || 0);
    }
  }

  return armarFacturaDesdeVenta({
    ventaId,
    items: items.map((it) => {
      const prod: any = (it as any).producto;
      const pres: any = (it as any).presentacion;
      return {
        id: it.id,
        cantidad: it.cantidad,
        precioVentaUnitario: it.precioVentaUnitario,
        precioAdicionales: it.precioAdicionales,
        descuentoUnitario: it.descuentoUnitario,
        productoId: prod?.id ?? null,
        productoNombre: prod?.nombre ?? '',
        presentacionNombre: pres?.nombre ?? null,
        ensambladoDescripcion: (it as any).ensambladoDescripcion ?? null,
        ivaTipo: prod?.iva,
        adicionales: nombresAdicionales.get(it.id) || [],
      };
    }),
    costoDelivery: (venta as any).costoDelivery,
    descuentoGlobal,
    aumentoGlobal,
  });
}

// ---------------------------------------------------------------------------
// Validación de `create-factura` (#240)
// ---------------------------------------------------------------------------

/** Tolerancia de montos en guaraníes: el redondeo a entero de la factura. */
const TOL_MONTO = 1;

/**
 * Error de negocio de la factura: el mensaje es para el cajero.
 *
 * Sin `name` propio a propósito: IPC lo serializa como `<name>: <mensaje>` y
 * `mensajeDeError` sólo desenvuelve el `Error: ` estándar.
 */
export class FacturaInvalidaError extends Error {}

function idVentaItemDe(it: any): number | null {
  const id = Number(it?.ventaItem?.id ?? it?.ventaItemId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function gs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString('es-PY')}`;
}

/** Renglón listo para guardar: sólo los campos que acepta `create-factura`. */
export interface RenglonFactura {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  ivaTipo: 10 | 5 | 0;
  unidadMedida?: string;
  producto?: { id: number };
  ventaItem?: { id: number };
}

export interface FacturaValidada {
  propuesta: FacturaPropuesta;
  renglones: RenglonFactura[];
  descuento: number;
}

/** Descripción del payload en MAYÚSCULA; si viene vacía, la de respaldo. */
function descripcionDe(it: any, respaldo: string): string {
  const d = String(it?.descripcion ?? '').trim().toUpperCase();
  return d || respaldo;
}

/**
 * Renglones de una factura **sin venta** (manual), reducidos a los campos que se
 * guardan. Un `id`, un `factura` o cualquier otro campo del payload se descarta:
 * con `...it` un `id` ajeno hacía que `save()` pisara un renglón de otra factura.
 */
export function renglonesManuales(items: any[]): RenglonFactura[] {
  return (Array.isArray(items) ? items : []).map((it) => {
    if (idVentaItemDe(it) != null) {
      throw new FacturaInvalidaError('Un renglón vinculado a un ítem de venta necesita la venta de la factura');
    }
    const r: RenglonFactura = {
      descripcion: descripcionDe(it, ''),
      cantidad: Number(it?.cantidad) || 0,
      precioUnitario: Number(it?.precioUnitario) || 0,
      ivaTipo: normalizarIvaTipo(it?.ivaTipo),
    };
    if (it?.unidadMedida) r.unidadMedida = String(it.unidadMedida);
    const prodId = Number(it?.producto?.id);
    if (Number.isFinite(prodId) && prodId > 0) r.producto = { id: prodId };
    return r;
  });
}

/**
 * Verifica que lo que se quiere facturar sea la venta y devuelve los renglones
 * a guardar, con los montos **de la propuesta** (no los del payload, aunque
 * difieran dentro de la tolerancia).
 *
 * `/api/rpc` es default-allow: este es el único lugar donde se garantiza que un
 * comprobante legal dice lo mismo que la venta. Se aceptan dos formas:
 *
 * - **Detallado:** cada renglón con `ventaItem` es un ítem ACTIVO de esta venta,
 *   sin repetir, con la cantidad, el precio y el IVA de la propuesta; los
 *   renglones sin `ventaItem` son los sintéticos de la propuesta (envío,
 *   recargo), emparejados por monto e IVA —la descripción se toma de la
 *   propuesta—; y el descuento es el del cobro.
 * - **Resumido:** un único renglón sin ítems de venta (la `CONSUMISION` del
 *   diálogo): cantidad 1, IVA 10 y descuento 0. Sin esas tres condiciones un
 *   renglón «exento por el total» o un descuento inventado pasaban con sólo
 *   cuadrar el total.
 *
 * En los dos, el total recalculado tiene que ser el de la propuesta.
 */
export async function validarFacturaContraVenta(
  manager: EntityManager,
  ventaId: number,
  items: any[],
  descuento: number,
): Promise<FacturaValidada> {
  const propuesta = await calcularFacturaDeVenta(manager, ventaId);
  if (!propuesta) throw new FacturaInvalidaError(`La venta ${ventaId} no existe`);

  const lineas = Array.isArray(items) ? items : [];
  const deVenta = lineas.filter((it) => idVentaItemDe(it) != null);
  const sinVinculo = lineas.filter((it) => idVentaItemDe(it) == null);
  const resumido = deVenta.length === 0 && sinVinculo.length === 1;
  const desc = Number(descuento) || 0;
  const renglones: RenglonFactura[] = [];

  if (resumido) {
    const it = sinVinculo[0];
    if (Math.abs((Number(it?.cantidad) || 0) - 1) > 0.0005 || normalizarIvaTipo(it?.ivaTipo) !== 10 || Math.abs(desc) > 0) {
      throw new FacturaInvalidaError('La factura resumida es un único renglón por el total, cantidad 1, IVA 10 y sin descuento');
    }
    renglones.push({ descripcion: descripcionDe(it, 'CONSUMISION'), cantidad: 1, precioUnitario: Number(it?.precioUnitario) || 0, ivaTipo: 10 });
  } else {
    const porId = new Map<number, LineaPropuesta>();
    for (const l of propuesta.lineas) if (l.ventaItemId) porId.set(l.ventaItemId, l);

    const vistos = new Set<number>();
    for (const it of deVenta) {
      const id = idVentaItemDe(it)!;
      const esperada = porId.get(id);
      if (!esperada) {
        const vi: any = await manager.getRepository(VentaItem).findOne({ where: { id }, relations: ['venta'] });
        if (!vi || Number(vi.venta?.id) !== Number(ventaId)) {
          throw new FacturaInvalidaError(`El ítem ${id} no pertenece a la venta ${ventaId}`);
        }
        throw new FacturaInvalidaError(`El ítem ${id} de la venta está cancelado: no se puede facturar`);
      }
      if (vistos.has(id)) throw new FacturaInvalidaError(`El ítem ${id} está dos veces en la factura`);
      vistos.add(id);

      const cantidad = Number(it?.cantidad) || 0;
      const precio = Number(it?.precioUnitario) || 0;
      if (Math.abs(cantidad - esperada.cantidad) > 0.0005
        || Math.abs(precio - esperada.precioUnitario) > 0.01
        || normalizarIvaTipo(it?.ivaTipo) !== esperada.ivaTipo) {
        throw new FacturaInvalidaError(
          `«${esperada.descripcion}» no coincide con la venta: se cobró ${esperada.cantidad} × ${gs(esperada.precioUnitario)} (IVA ${esperada.ivaTipo || 'exenta'})`,
        );
      }
      // La descripción es lo único editable; el resto sale de la venta.
      const r: RenglonFactura = {
        descripcion: descripcionDe(it, esperada.descripcion),
        cantidad: esperada.cantidad,
        precioUnitario: esperada.precioUnitario,
        ivaTipo: esperada.ivaTipo,
        ventaItem: { id },
      };
      if (esperada.productoId) r.producto = { id: esperada.productoId };
      renglones.push(r);
    }

    const sinteticas = propuesta.lineas.filter((l) => !l.ventaItemId);
    for (const it of sinVinculo) {
      const idx = sinteticas.findIndex((l) =>
        Math.abs((Number(it?.cantidad) || 0) - l.cantidad) <= 0.0005
        && Math.abs((Number(it?.precioUnitario) || 0) - l.precioUnitario) <= 0.01
        && normalizarIvaTipo(it?.ivaTipo) === l.ivaTipo);
      if (idx < 0) {
        throw new FacturaInvalidaError(`El renglón «${descripcionDe(it, '(sin descripción)')}» no corresponde a la venta`);
      }
      const l = sinteticas.splice(idx, 1)[0];
      renglones.push({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, ivaTipo: l.ivaTipo });
    }

    if (Math.abs(desc - propuesta.descuento) > TOL_MONTO) {
      throw new FacturaInvalidaError(
        `El descuento de la factura (${gs(desc)}) no es el del cobro (${gs(propuesta.descuento)})`,
      );
    }
  }

  const descuentoFinal = resumido ? 0 : propuesta.descuento;
  const totales = calcularTotalesFactura(renglones, descuentoFinal);
  if (Math.abs(totales.total - propuesta.total) > TOL_MONTO) {
    throw new FacturaInvalidaError(
      `La factura (${gs(totales.total)}) no coincide con la venta (${gs(propuesta.total)})`,
    );
  }
  return { propuesta, renglones, descuento: descuentoFinal };
}

/**
 * Serializa las emisiones de factura dentro de este proceso.
 *
 * En SQLite TypeORM tiene **una sola conexión**: dos `dataSource.transaction()`
 * intercaladas comparten la misma transacción física (ver `tx.utils.ts` y
 * `withAperturaCajaLock`). Sin este candado, dos emisiones simultáneas leen el
 * mismo `numeroActual` y las dos ven que la venta no tiene factura. En Postgres
 * el control real es el `FOR UPDATE` de `create-factura`; esto sólo ordena.
 */
let colaFactura: Promise<void> = Promise.resolve();
export async function withFacturaLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = colaFactura;
  let release!: () => void;
  const miTurno = new Promise<void>((res) => (release = res));
  colaFactura = prev.then(() => miTurno);
  await prev.catch(() => { /* el turno anterior falló: igual nos toca */ });
  try {
    return await fn();
  } finally {
    release();
  }
}
