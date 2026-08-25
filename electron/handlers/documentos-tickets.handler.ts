/**
 * Handlers IPC para impresión de tickets térmicos.
 *
 * Esquema general:
 * - Cada handler `print-*` retorna `{ ok: boolean, printed: [...], errors: [...] }`.
 *   **Nunca hace throw** — el caller (PdV / cobrador / cajero) decide si bloquea
 *   o solo muestra un toast.
 * - Para multi-impresora simultánea (caso `print-comanda` con productos
 *   multi-sector), el resultado lista TODAS las impresiones realizadas + errores
 *   parciales.
 * - La generación del contenido va por `TicketSpec` (estructurado) y la
 *   impresión real por `printTicketSpec(printer, spec)` de `ticket.utils.ts`.
 *
 * Permisos:
 * - `print-comanda` / `print-precuenta`: `VENTAS_PDV` o `DOCUMENTOS_IMPRIMIR_TICKET`.
 * - `print-venta-ticket`: `VENTAS_PDV` o `DOCUMENTOS_REIMPRIMIR_TICKET_VENTA`.
 * - resto: `DOCUMENTOS_IMPRIMIR_TICKET` (o el del dominio si es más específico).
 *
 * Las funciones `printXxxInternal(...)` son llamadas también desde hooks
 * (auto-imprimir al cobrar/agregar items) sin pasar por IPC, así que NO
 * incluyen chequeo de permisos — esos viven en los wrappers IPC.
 */

import { ipcMain } from 'electron';
import type { DataSource } from 'typeorm';
import { In as TIn } from 'typeorm';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem, EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemAdicional } from '../../src/app/database/entities/ventas/venta-item-adicional.entity';
import { VentaItemSabor } from '../../src/app/database/entities/ventas/venta-item-sabor.entity';
import { VentaItemObservacion } from '../../src/app/database/entities/ventas/venta-item-observacion.entity';
import { VentaItemIngredienteModificacion } from '../../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity';
import { componerDetalleVariacion } from '../utils/nombre-variacion.utils';
import { Printer } from '../../src/app/database/entities/printer.entity';
import { SectorImpresora, SectorImpresoraRol } from '../../src/app/database/entities/ventas/sector-impresora.entity';
import { ProductoSector } from '../../src/app/database/entities/productos/producto-sector.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Delivery } from '../../src/app/database/entities/ventas/delivery.entity';
import { ensurePermission } from '../utils/auth.utils';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import {
  TicketSpec, TicketLine,
  ticketText, ticketSeparador, ticketBlank, ticketKv, ticketColumns,
  ticketLineasFirma, ticketHeaderEmpresa,
  ticketFmtMonto, ticketFmtFecha, ticketFmtFechaHora,
  printTicketSpec, printerWidthToChars, monedaSimboloAscii,
} from '../utils/ticket.utils';
import { broadcastPrinterEvent, PrinterEventPayload } from '../utils/printer-events.utils';
import { computeResumenCaja } from '../utils/resumen-caja.utils';

type GetCurrentUser = () => Usuario | null;

// ============================================================
// HELPERS COMUNES
// ============================================================

/**
 * Busca la impresora a usar según rol. Orden de prioridad:
 *
 * 1. `printerId` explícito (si vino) gana.
 * 2. `dispositivoId` + rol TICKET_VENTA o PRECUENTA → `Dispositivo.printerTicket`
 *    (impresora local del PdV). Es lo más común para multi-caja.
 * 3. `sectorId` específico → M2M `SectorImpresora` para ese sector + rol.
 * 4. Fallback global: `Printer.rol = X`.
 * 5. Última opción: `Printer.isDefault = true`.
 */
async function getPrinterByRol(
  dataSource: DataSource,
  rol: SectorImpresoraRol | string,
  opts: { sectorId?: number; printerId?: number; dispositivoId?: number } = {},
): Promise<Printer | null> {
  // 1. Si vino printerId explícito, gana
  if (opts.printerId) {
    return await dataSource.getRepository(Printer).findOneBy({ id: opts.printerId });
  }

  // 2. Dispositivo + rol de tickets → impresora local del PdV
  const esRolTicket = rol === SectorImpresoraRol.TICKET_VENTA || rol === SectorImpresoraRol.PRECUENTA
    || rol === 'TICKET_VENTA' || rol === 'PRECUENTA';
  if (opts.dispositivoId && esRolTicket) {
    const { Dispositivo } = require('../../src/app/database/entities/financiero/dispositivo.entity');
    const disp = await dataSource.getRepository(Dispositivo).findOne({
      where: { id: opts.dispositivoId },
      relations: ['printerTicket'],
    });
    const p = (disp as any)?.printerTicket;
    if (p?.id) return p;
  }

  // 3. Sector específico → M2M
  if (opts.sectorId) {
    const sis = await dataSource.getRepository(SectorImpresora).find({
      where: { sector: { id: opts.sectorId } as any, rol: rol as any, activo: true },
      relations: ['printer'],
    });
    const printers = sis.map(s => s.printer).filter(Boolean);
    if (printers.length > 0) return printers[0];
  }

  // 4. Fallback global por rol
  const byRol = await dataSource.getRepository(Printer).findOne({ where: { rol: rol as any } });
  if (byRol) return byRol;

  // 5. Última opción: impresora default del sistema
  return await dataSource.getRepository(Printer).findOne({ where: { isDefault: true } });
}

/**
 * Append a `impresiones` JSON un registro de intento de impresión sobre un
 * VentaItem. Si todos los sectores esperados del item ya están impresos OK,
 * marca `impreso=true`.
 *
 * `expectedSectores` = lista de sector_id a los que el item debería ir
 * (calculada al inicio del flujo). Si NULL/empty, con un registro OK alcanza.
 */
async function registrarImpresion(
  dataSource: DataSource,
  ventaItemId: number,
  registro: { sectorId?: number | null; printerId?: number; ok: boolean; error?: string },
  expectedSectores: number[] | null = null,
): Promise<void> {
  const repo = dataSource.getRepository(VentaItem);
  const item = await repo.findOneBy({ id: ventaItemId });
  if (!item) return;

  const log: any[] = item.impresiones ? safeParseJson(item.impresiones) : [];
  log.push({
    sectorId: registro.sectorId ?? null,
    printerId: registro.printerId ?? null,
    ts: new Date().toISOString(),
    ok: registro.ok,
    ...(registro.error ? { error: registro.error } : {}),
  });
  item.impresiones = JSON.stringify(log);

  if (registro.ok) {
    item.fechaImpresion = new Date();
    if (expectedSectores && expectedSectores.length > 0) {
      const impresosOk = new Set(
        log.filter((e: any) => e.ok && e.sectorId != null).map((e: any) => e.sectorId),
      );
      const todosImpresos = expectedSectores.every(sid => impresosOk.has(sid));
      if (todosImpresos) item.impreso = true;
    } else {
      item.impreso = true;
    }
  }

  await repo.save(item);
}

/**
 * Encabezado de identificacion de un ticket: MESA y/o COMANDA.
 *
 * Antes era un `if (mesa) / else if (comanda) / else PARA LLEVAR`, asi que una
 * comanda CON mesa nunca imprimia su numero: dos cuentas en la misma mesa
 * producian dos tickets identicos y el mozo no sabia cual era cual. Ahora salen
 * las dos referencias cuando existen las dos.
 *
 * Funcion pura para poder testearla sin hardware, igual que
 * `buildVentaTicketLines`.
 */
export function buildEncabezadoUbicacion(
  mesaNumero: number | null | undefined,
  comandaRef: string | null | undefined,
  ticketText: (t: string, o?: any) => any,
): any[] {
  const lines: any[] = [];
  const hayMesa = mesaNumero !== null && mesaNumero !== undefined && `${mesaNumero}` !== '';
  const hayComanda = !!comandaRef;

  if (!hayMesa && !hayComanda) {
    lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
    return lines;
  }
  if (hayMesa) {
    lines.push(ticketText('MESA', { align: 'C' }));
    lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));
  }
  if (hayComanda) {
    // Con mesa, la comanda va en tamano normal: la mesa es la referencia de
    // ubicacion y la comanda desempata entre cuentas de esa misma mesa.
    lines.push(ticketText('COMANDA', { align: 'C' }));
    lines.push(ticketText(String(comandaRef), {
      align: 'C', bold: true, size: hayMesa ? 'tall' : 'big',
    }));
  }
  return lines;
}

/**
 * Texto de una `VentaItemObservacion` para la comanda de cocina.
 *
 * `observacionLibre` gana: la fila de la nota libre cuelga del sentinel
 * `NOTA DEL CLIENTE`, y lo que le importa a cocina es el texto escrito, no el
 * nombre del sentinel. Antes esto leía `o.descripcion` — un campo que
 * **no existe** en la entidad — así que la nota libre nunca llegaba a imprimirse.
 */
export function textoObservacionParaTicket(o: any): string {
  return String(o?.observacionLibre || o?.observacion?.descripcion || '').toUpperCase().trim();
}

function safeParseJson(s: string): any[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
  catch { return []; }
}



/**
 * Parte un texto de detalle en varias líneas que entren en el ancho dado.
 *
 * `ticketColumns` TRUNCA lo que no entra, y en una impresora de 58mm la
 * descripción tiene ~26 columnas: «GRANDE · 1/2 CALABRESA + 1/2 4 QUESOS»
 * salía cortado en «GRANDE · 1/2 CALABRESA +», o sea que el cliente no veía la
 * mitad que pidió. Cortar por palabra y seguir abajo es lo mínimo aceptable
 * para algo que el cliente usa para verificar su pedido.
 */
function envolverDetalle(texto: string, ancho: number): string[] {
  const limpio = String(texto || '').trim();
  if (!limpio) return [];
  if (limpio.length <= ancho) return [limpio];

  const salida: string[] = [];
  let actual = '';
  for (const palabra of limpio.split(/\s+/)) {
    // Una palabra sola más larga que el ancho se corta duro: no hay alternativa.
    if (palabra.length > ancho) {
      if (actual) { salida.push(actual); actual = ''; }
      for (let i = 0; i < palabra.length; i += ancho) salida.push(palabra.slice(i, i + ancho));
      continue;
    }
    if (!actual) actual = palabra;
    else if (actual.length + 1 + palabra.length <= ancho) actual += ' ' + palabra;
    else { salida.push(actual); actual = palabra; }
  }
  if (actual) salida.push(actual);
  return salida;
}

/** Detalle de cada ítem vendido, para armar el ticket o la comanda. */
export interface DetalleDeItems {
  /** Adicionales, ya con el prefijo `+`. */
  adicionalesByItem: Map<number, string[]>;
  /** Observaciones (predefinidas y nota libre), con el prefijo `>>`. */
  observacionesByItem: Map<number, string[]>;
  /** Ingredientes sacados, sin prefijo: cada ticket decide cómo destacarlos. */
  removidosByItem: Map<number, string[]>;
  /** Cambios de ingrediente, en formato `X POR Y`. */
  cambiosByItem: Map<number, string[]>;
  /** Variación: tamaño + sabores con su proporción. */
  pizzaByItem: Map<number, { presentacion: string; mostrarPresentacion: boolean; sabores: { nombre: string; proporcion: number }[] }>;
}

/**
 * Carga de una sola vez los modificadores de un conjunto de `VentaItem`.
 *
 * Vivía adentro de `printComandaInternal`, así que la comanda de cocina era el
 * único ticket que mostraba la variación, los ingredientes sacados y las
 * observaciones: el ticket del cliente imprimía sólo el nombre del producto —
 * «1 PIZZA» en vez de «1 PIZZA GRANDE CALABRESA, sin cebolla». Extraída acá la
 * usan los tres tickets.
 *
 * Nunca lanza: si los modificadores fallan, el ticket sale igual sin ellos. Es
 * preferible un ticket incompleto a un ticket que no sale.
 */
export async function cargarDetalleDeItems(
  dataSource: DataSource,
  itemIds: number[],
): Promise<DetalleDeItems> {
  const adicionalesByItem = new Map<number, string[]>();
  const observacionesByItem = new Map<number, string[]>();
  // Se separan las remociones (SIN X) de los cambios (CAMBIAR X POR Y) para
  // darle a cada una el énfasis que corresponde en el ticket de cocina.
  const removidosByItem = new Map<number, string[]>();
  const cambiosByItem = new Map<number, string[]>();
  // Pizzas (producto con variación): tamaño + sabores por mitad, para imprimirlos
  // en grande y separados en la comanda.
  const pizzaByItem = new Map<number, { presentacion: string; mostrarPresentacion: boolean; sabores: { nombre: string; proporcion: number }[] }>();
  const pushMap = (m: Map<number, string[]>, k: number, v: string) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(v);
  };
  if (itemIds.length > 0) {
    try {
      const adics = await dataSource.getRepository(VentaItemAdicional).find({
        where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
        relations: ['adicional', 'ventaItem'],
      });
      for (const a of adics) {
        const iid = (a as any).ventaItem?.id;
        if (!iid) continue;
        const cant = Number((a as any).cantidad || 1);
        const nom = ((a as any).adicional?.nombre || 'ADICIONAL').toUpperCase();
        // Sin prefijo: la comanda de cocina lo muestra como «ADD X» y el ticket
        // del cliente como «+ X». Cada uno pone el suyo.
        pushMap(adicionalesByItem, iid, cant > 1 ? `${cant}x ${nom}` : nom);
      }

      const obs = await dataSource.getRepository(VentaItemObservacion).find({
        where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
        relations: ['observacion', 'ventaItem'],
      });
      for (const o of obs) {
        const iid = (o as any).ventaItem?.id;
        if (!iid) continue;
        const txt = textoObservacionParaTicket(o);
        // Sin prefijo: la comanda lo marca con «>>»; el ticket del cliente lo
        // muestra tal cual. Cada uno decide su énfasis.
        if (txt) pushMap(observacionesByItem, iid, txt);
      }

      const mods = await dataSource.getRepository(VentaItemIngredienteModificacion).find({
        where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
        relations: ['recetaIngrediente', 'recetaIngrediente.ingrediente', 'ingredienteReemplazo', 'ventaItem'],
      });
      for (const m of mods) {
        const iid = (m as any).ventaItem?.id;
        if (!iid) continue;
        const ing = String((m as any).recetaIngrediente?.ingrediente?.nombre || (m as any).recetaIngrediente?.descripcion || 'INGREDIENTE').toUpperCase();
        if ((m as any).tipoModificacion === 'REMOVIDO') {
          pushMap(removidosByItem, iid, ing);
        } else {
          const rep = String((m as any).ingredienteReemplazo?.nombre || '').toUpperCase();
          pushMap(cambiosByItem, iid, rep ? `${ing} POR ${rep}` : ing);
        }
      }

      // Sabores de pizza (VentaItemSabor): tamaño + cada mitad, para la comanda.
      const vsabores = await dataSource.getRepository(VentaItemSabor).find({
        where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
        relations: ['ventaItem', 'recetaPresentacion', 'recetaPresentacion.sabor', 'recetaPresentacion.presentacion'],
      });
      for (const vs of vsabores) {
        const iid = (vs as any).ventaItem?.id;
        const saborNombre = String((vs as any).recetaPresentacion?.sabor?.nombre || '').toUpperCase().trim();
        if (!iid || !saborNombre) continue;
        if (!pizzaByItem.has(iid)) {
          const pres = (vs as any).recetaPresentacion?.presentacion;
          pizzaByItem.set(iid, {
            presentacion: String(pres?.nombre || '').toUpperCase().trim(),
            // El operador puede marcar que el nombre de esta parte no figure:
            // hay presentaciones de relleno («TRADICIONAL») que sólo existen
            // porque el nombre es obligatorio.
            mostrarPresentacion: pres?.mostrarEnNombre !== false,
            sabores: [],
          });
        }
        if ((vs as any).recetaPresentacion?.sabor?.mostrarEnNombre === false) continue;
        pizzaByItem.get(iid)!.sabores.push({ nombre: saborNombre, proporcion: Number((vs as any).proporcion) || 0 });
      }
    } catch (e) {
      // Los modificadores son opcionales: si fallan, se imprime la comanda igual.
      console.warn('[cargarDetalleDeItems] no se pudieron cargar los modificadores del ítem:', e);
    }
  }

  return { adicionalesByItem, observacionesByItem, removidosByItem, cambiosByItem, pizzaByItem };
}

// ============================================================
// PRINT COMANDA (lógica multi-sector)
// ============================================================

export interface PrintComandaOpts {
  soloItemsNoImpresos?: boolean;  // default true — omite items ya impresos
  sectorIdFilter?: number;        // si se pasa, solo enruta a ese sector (reimpresión selectiva)
  forceReprint?: boolean;         // ignora `impreso=true` y reimprime todo
  retryFailed?: boolean;          // worker de retry: incluye también items con intentos fallidos previos (no solo nunca intentados)
  silent?: boolean;               // no emitir toast al renderer aunque haya errores (lo usa el worker de retry para no spamear)
}

/**
 * Tope de reintentos fallidos por item en el worker de auto-retry. Cuenta las
 * entradas con `ok=false` en `impresiones`. Con el worker corriendo cada 5s,
 * ~180 fallos ≈ 15 min de reintentos para un item de un solo sector (menos si
 * tiene varios sectores). Pasado el tope, el worker deja de reintentar ese item
 * (el usuario igual puede forzar la reimpresión manual con forceReprint).
 */
const MAX_COMANDA_FAILED_RETRIES = 180;

/** Cantidad de intentos fallidos (ok=false) registrados para un item. */
function contarIntentosFallidos(item: { impresiones?: string | null }): number {
  return safeParseJson(item.impresiones || '[]').filter((e: any) => !e.ok).length;
}

export interface ImpresionResultado {
  ok: boolean;
  printed: {
    itemId: number;
    sectorId: number | null;
    printerId: number;
    printerName: string;
  }[];
  errors: {
    sectorId?: number | null;
    printerId?: number;
    message: string;
  }[];
}

/**
 * Imprime los tickets de cocina ("comandas") para una `Venta`, enrutando
 * cada `VentaItem` a las impresoras de TODOS los sectores configurados en
 * el producto (M2M `producto_sectores`).
 *
 * **Pre-condición**: la venta debe tener `mesa` o `comanda` asignada.
 * Ambos disparan impresión; son flujos PdV independientes.
 *
 * Reglas:
 * - `producto.requiereComanda = false` → item ignorado silenciosamente
 *   (servicio, propina, descuento, etc.).
 * - `producto.requiereComanda = true` + sin sectores configurados → warning
 *   visible en `errors` ("producto X requiere comanda pero no tiene sector").
 * - Routing 100% por M2M `producto_sectores`. La mesa/comanda solo decide
 *   SI imprimir (no DÓNDE).
 *
 * Reusable como función — el hook auto-imprimir en `ventas.handler.ts` la
 * invoca directamente sin pasar por IPC.
 */
export async function printComandaInternal(
  dataSource: DataSource,
  ventaId: number,
  opts: PrintComandaOpts = {},
): Promise<ImpresionResultado> {
  const printed: ImpresionResultado['printed'] = [];
  const errors: ImpresionResultado['errors'] = [];

  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['mesa', 'comanda'],
  });
  if (!venta) {
    return { ok: false, printed, errors: [{ message: `Venta ${ventaId} no encontrada` }] };
  }
  const mesa: any = (venta as any).mesa;
  const comanda: any = (venta as any).comanda;
  if (!mesa?.id && !comanda?.id) {
    // Venta sin mesa ni comanda → no aplica ticket de cocina.
    return { ok: true, printed, errors };
  }

  // 1. Cargar VentaItems activos con producto
  const viRepo = dataSource.getRepository(VentaItem);
  const items = await viRepo.find({
    where: { venta: { id: ventaId } as any, estado: EstadoVentaItem.ACTIVO },
    relations: ['producto', 'presentacion'],
  });
  if (items.length === 0) {
    return { ok: true, printed, errors };
  }

  // Filtrar por estado de impresión + requiereComanda.
  // - forceReprint=true → todos los items
  // - soloItemsNoImpresos=true + retryFailed=true (worker) → todos los `!impreso`
  //   (incluye fallidos previos, para auto-retry cuando vuelve la impresora)
  // - soloItemsNoImpresos=true (hook auto-print, default) → SOLO items
  //   "nunca intentados" (sin entrada en `impresiones`). Evita duplicados en
  //   cocina cuando se agrega un item nuevo y hay fallidos previos.
  // - soloItemsNoImpresos=false → todos los `!impreso` (reimpresión solicitada).
  const soloPendientes = opts.soloItemsNoImpresos !== false && !opts.forceReprint;
  const baseSet = opts.forceReprint
    ? items
    : soloPendientes
      ? (opts.retryFailed
          ? items.filter(i => !i.impreso && contarIntentosFallidos(i) < MAX_COMANDA_FAILED_RETRIES)
          : items.filter(i => !i.impreso && !(i.impresiones && safeParseJson(i.impresiones).length > 0)))
      : items.filter(i => !i.impreso);
  const itemsAImprimir = baseSet
    .filter(i => (i as any).producto?.requiereComanda !== false);
  if (itemsAImprimir.length === 0) {
    return { ok: true, printed, errors };
  }

  // 1.b Cargar modificadores por ítem (adicionales, observaciones, opcionales/
  // modificaciones de ingredientes) para mostrarlos en la comanda de cocina.
  const itemIds = itemsAImprimir.map(i => i.id);
  const {
    adicionalesByItem, observacionesByItem, removidosByItem, cambiosByItem, pizzaByItem,
  } = await cargarDetalleDeItems(dataSource, itemIds);

  // 2. Cargar M2M producto_sectores para todos los producto_id involucrados
  const productoIds = Array.from(new Set(
    itemsAImprimir.map(i => (i as any).producto?.id).filter((x): x is number => !!x),
  ));

  const productoSectoresMap = new Map<number, { sectorId: number; prioridad: number }[]>();
  if (productoIds.length > 0) {
    const psRows = await dataSource.getRepository(ProductoSector).find({
      where: { producto: { id: TIn(productoIds) } as any, activo: true },
      relations: ['sector', 'producto'],
    });
    for (const ps of psRows) {
      const pid = (ps as any).producto?.id ?? (ps as any).productoId;
      const sid = (ps as any).sector?.id ?? (ps as any).sectorId;
      if (!pid || !sid) continue;
      if (!productoSectoresMap.has(pid)) productoSectoresMap.set(pid, []);
      productoSectoresMap.get(pid)!.push({ sectorId: sid, prioridad: ps.prioridad ?? 0 });
    }
  }

  // 3. Resolver M2M sectores_impresoras para todos los sectores involucrados
  const allSectores = new Set<number>();
  for (const item of itemsAImprimir) {
    const pid = (item as any).producto?.id;
    const sectores = pid ? productoSectoresMap.get(pid) : null;
    if (sectores && sectores.length > 0) {
      sectores.forEach(s => allSectores.add(s.sectorId));
    }
  }

  // Aplicar sectorIdFilter (reimpresión selectiva)
  const sectoresActivos = opts.sectorIdFilter
    ? new Set([opts.sectorIdFilter].filter(s => allSectores.has(s)))
    : allSectores;

  // sector_id → Printer[]
  const sectorPrintersMap = new Map<number, Printer[]>();
  if (sectoresActivos.size > 0) {
    const siRows = await dataSource.getRepository(SectorImpresora).find({
      where: {
        sector: { id: TIn(Array.from(sectoresActivos)) } as any,
        rol: SectorImpresoraRol.COMANDA as any,
        activo: true,
      },
      relations: ['printer', 'sector'],
    });
    for (const si of siRows) {
      const sid = (si as any).sector?.id;
      if (!sid || !si.printer) continue;
      if (!sectorPrintersMap.has(sid)) sectorPrintersMap.set(sid, []);
      sectorPrintersMap.get(sid)!.push(si.printer);
    }
  }

  // 4. Por cada printer, juntar los items que le tocan
  type Job = { printer: Printer; sectorId: number; items: { item: VentaItem; expectedSectores: number[] }[] };
  const jobsByPrinter = new Map<string, Job>(); // key = `${printerId}|${sectorId}`

  for (const item of itemsAImprimir) {
    const pid = (item as any).producto?.id;
    const sectoresItem: number[] = (pid && productoSectoresMap.has(pid))
      ? productoSectoresMap.get(pid)!.sort((a, b) => a.prioridad - b.prioridad).map(s => s.sectorId)
      : [];
    if (sectoresItem.length === 0) {
      const nombre = (item as any).producto?.nombre || `id=${pid}`;
      errors.push({ message: `Producto "${nombre}" requiere comanda pero no tiene sectores configurados` });
      continue;
    }

    for (const sid of sectoresItem) {
      if (opts.sectorIdFilter && opts.sectorIdFilter !== sid) continue;
      const printers = sectorPrintersMap.get(sid);
      if (!printers || printers.length === 0) {
        errors.push({ sectorId: sid, message: `Sector ${sid} sin impresoras configuradas (rol=COMANDA)` });
        continue;
      }
      for (const printer of printers) {
        const key = `${printer.id}|${sid}`;
        if (!jobsByPrinter.has(key)) {
          jobsByPrinter.set(key, { printer, sectorId: sid, items: [] });
        }
        // Idempotencia: si esta combinación (item, sector) ya está en `impresiones` con ok=true, skip
        const yaImpresoEnSector = (safeParseJson(item.impresiones || '[]') as any[])
          .some(e => e.ok && e.sectorId === sid);
        if (!opts.forceReprint && yaImpresoEnSector) continue;
        jobsByPrinter.get(key)!.items.push({ item, expectedSectores: sectoresItem });
      }
    }
  }

  if (jobsByPrinter.size === 0) {
    return { ok: errors.length === 0, printed, errors };
  }

  const refMesa = mesa?.numero ? `MESA ${mesa.numero}` : null;
  const refComanda = comanda?.codigo || (comanda?.numero ? `#${comanda.numero}` : null);
  const refStr = refMesa || (refComanda ? `COMANDA ${refComanda}` : 'PARA LLEVAR');

  // 5. Por cada job: construir spec, imprimir, registrar
  for (const job of jobsByPrinter.values()) {
    if (job.items.length === 0) continue;

    const width = printerWidthToChars(job.printer.width);
    const sectorNombre = await getSectorNombre(dataSource, job.sectorId);

    // Comanda de cocina: sin datos de empresa/RUC. Se enfatizan MESA y N° de
    // ticket (venta) en grande para identificar el pedido de un vistazo.
    const lines: TicketLine[] = [
      ticketText(`** COMANDA - ${sectorNombre} **`, { align: 'C', bold: true }),
      ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
      ticketSeparador('='),
    ];
    lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
    lines.push(ticketText(`TICKET #${ventaId}`, { align: 'C', bold: true, size: 'tall' }));
    lines.push(ticketSeparador('='));

    for (const j of job.items) {
      const v = j.item;
      const nombre = ((v as any).producto?.nombre || 'PRODUCTO').toUpperCase();
      const qty = Number(v.cantidad || 1);
      lines.push(ticketText(`${qty}  ${nombre}`, { bold: true, size: 'tall' }));
      const pizza = pizzaByItem.get(v.id);
      if (pizza && pizza.sabores.length) {
        // Pizza: tamaño y cada mitad en GRANDE, uno por línea.
        const tamano = `${nombre} ${pizza.presentacion}`.trim();
        lines.push(ticketText(tamano, { bold: true, size: 'tall' }));
        const n = pizza.sabores.length;
        const iguales = pizza.sabores.every(s => Math.abs(s.proporcion - pizza.sabores[0].proporcion) < 0.001);
        for (const s of pizza.sabores) {
          let frac = '';
          if (n > 1) frac = iguales ? `1/${n}` : `${Math.round(s.proporcion * 100)}%`;
          lines.push(ticketText(`${frac} ${s.nombre}`.trim(), { bold: true, size: 'tall' }));
        }
      } else if (v.ensambladoDescripcion) {
        lines.push(ticketText(`   ${String(v.ensambladoDescripcion).toUpperCase()}`));
      }
      // QUITAR — lo más crítico en cocina: se imprime invertido (fondo negro).
      // El video inverso ya destaca por sí solo, sin agrandar la fuente.
      for (const ing of (removidosByItem.get(v.id) || [])) {
        lines.push(ticketText(`SIN ${ing}`, { bold: true, invert: true }));
      }
      // CAMBIAR — destacado en negrita, tamaño normal.
      for (const c of (cambiosByItem.get(v.id) || [])) {
        lines.push(ticketText(`CAMBIAR ${c}`, { bold: true }));
      }
      // AGREGAR — en negrita para diferenciar de las observaciones.
      for (const t of (adicionalesByItem.get(v.id) || [])) lines.push(ticketText(`   ADD ${t}`, { bold: true }));
      for (const t of (observacionesByItem.get(v.id) || [])) lines.push(ticketText(`   >> ${t}`));
      lines.push(ticketBlank());
    }

    lines.push(ticketSeparador('='));
    // El margen inferior antes del corte lo agrega printTicketSpec de forma
    // centralizada (BOTTOM_SAFE_FEED) para todos los tickets por igual.

    const spec: TicketSpec = { printerWidth: width, lines, cutAtEnd: true };

    const res = await printTicketSpec(job.printer, spec);
    for (const j of job.items) {
      await registrarImpresion(
        dataSource,
        j.item.id,
        {
          sectorId: job.sectorId,
          printerId: job.printer.id,
          ok: res.ok,
          error: res.error,
        },
        j.expectedSectores,
      );
    }

    if (res.ok) {
      for (const j of job.items) {
        printed.push({
          itemId: j.item.id,
          sectorId: job.sectorId,
          printerId: job.printer.id,
          printerName: job.printer.name,
        });
      }
    } else {
      errors.push({
        sectorId: job.sectorId,
        printerId: job.printer.id,
        message: res.error || 'Error desconocido al imprimir',
      });
    }
  }

  const result = {
    ok: errors.length === 0,
    printed,
    errors,
  };

  // Notificar al renderer (toast en PdV). Solo si hubo errores o nada se imprimió,
  // y nunca cuando el llamador pide `silent` (worker de retry, para no spamear).
  if (errors.length > 0 && !opts.silent) {
    broadcastPrinterEvent({
      level: printed.length > 0 ? 'warning' : 'error',
      handler: 'print-comanda',
      entityRef: { tipo: 'VENTA', id: ventaId },
      printed: printed.length,
      errors,
      message: printed.length > 0
        ? `Comanda parcial (${refStr}): ${printed.length} OK, ${errors.length} con error`
        : `Comanda no se imprimió (${refStr}): ${errors.length} error${errors.length > 1 ? 'es' : ''}`,
    });
  }

  return result;
}

async function getSectorNombre(dataSource: DataSource, sectorId: number): Promise<string> {
  try {
    const s = await dataSource.query(`SELECT nombre FROM sectores WHERE id = ${Number(sectorId)}`);
    return (s?.[0]?.nombre || `SECTOR ${sectorId}`).toString().toUpperCase();
  } catch { return `SECTOR ${sectorId}`; }
}

// ============================================================
// PRINT VENTA TICKET
// ============================================================

/**
 * Cotización (compraLocal) entre la moneda principal y otra. compraLocal =
 * cuántos principal vale 1 unidad de la otra moneda. Toma la más reciente
 * (`cambios` viene ordenado por createdAt DESC). 0 si no hay.
 */
function buscarCotizacion(cambios: any[], principal: any, moneda: any): number {
  if (!principal || !moneda) return 0;
  const c = (cambios || []).find((x: any) =>
    (x.monedaOrigen?.id === principal.id && x.monedaDestino?.id === moneda.id) ||
    (x.monedaOrigen?.id === moneda.id && x.monedaDestino?.id === principal.id));
  return c ? Number(c.compraLocal || 0) : 0;
}

/** Convierte un valor expresado en `moneda` a la moneda principal. */
function convertirAPrincipal(valor: number, moneda: any, principal: any, cambios: any[]): number {
  if (!moneda || !principal || moneda.id === principal.id) return valor;
  const rate = buscarCotizacion(cambios, principal, moneda);
  return rate > 0 ? valor * rate : valor; // 1 moneda = rate principal
}

/**
 * Adicionales/extras **activos** de cada ítem, ya formateados (`2x TOCINO` /
 * `TOCINO`), indexados por `ventaItem.id`. Mismo criterio que la comanda de
 * cocina: `activo = false` es un extra dado de baja y no se muestra.
 *
 * Best-effort: si la consulta falla, devuelve un mapa vacío — el ticket se
 * imprime igual, sin el detalle de extras.
 */
async function getAdicionalesActivosPorItem(
  dataSource: DataSource,
  itemIds: number[],
): Promise<Map<number, string[]>> {
  const porItem = new Map<number, string[]>();
  if (itemIds.length === 0) return porItem;
  try {
    const adics = await dataSource.getRepository(VentaItemAdicional).find({
      where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
      relations: ['adicional', 'ventaItem'],
    });
    for (const a of adics) {
      const iid = (a as any).ventaItem?.id;
      if (!iid) continue;
      const cant = Number((a as any).cantidad || 1);
      const nom = ((a as any).adicional?.nombre || 'ADICIONAL').toUpperCase();
      if (!porItem.has(iid)) porItem.set(iid, []);
      porItem.get(iid)!.push(cant > 1 ? `${cant}x ${nom}` : nom);
    }
  } catch (e) {
    console.warn('[getAdicionalesActivosPorItem] no se pudieron cargar los extras del ítem:', e);
  }
  return porItem;
}

/** Resultado de armar el contenido del ticket de venta / pre-cuenta. */
export interface VentaTicketBuild {
  lines: TicketLine[];
  /** Bruto de los ítems impresos (precio + adicionales, sin descuentos). */
  bruto: number;
  /** Descuento de nivel ítem de los ítems impresos. */
  descItems: number;
  /** Descuento total (ítems + ajustes del pago). */
  descuentoTotal: number;
  /** Total en moneda principal, tal como sale impreso. */
  totalPrincipal: number;
  /** Cantidad de ítems que entraron al ticket (excluye cancelados). */
  itemsImpresos: number;
}

/**
 * Arma el contenido del ticket de venta (o pre-cuenta) de una `Venta`, sin
 * tocar impresoras. Separado de `printVentaTicketInternal` para poder testear
 * el contenido sin hardware.
 *
 * **Sólo entran los ítems `estado = ACTIVO`**: un ítem cancelado en el PdV no
 * se imprime ni suma a los totales — mismo criterio que la comanda de cocina,
 * el cobro (`cobrar-venta-dialog`), el descuento de stock y los reportes.
 * Afecta directo al TOTAL: `Venta.total` **no se persiste nunca** (ver el
 * cálculo de `totalPrincipal` abajo), así que el total impreso sale siempre del
 * cálculo local y un ítem cancelado lo inflaba, tanto en la pre-cuenta como en
 * el comprobante post-cobro.
 *
 * Devuelve `null` si la venta no existe.
 */
export async function buildVentaTicketLines(
  dataSource: DataSource,
  ventaId: number,
  opts: { width: number; isPrecuenta?: boolean },
): Promise<VentaTicketBuild | null> {
  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['cliente', 'cliente.persona', 'mesa', 'comanda', 'formaPago', 'pago'],
  });
  if (!venta) return null;

  const items = await dataSource.getRepository(VentaItem).find({
    where: { venta: { id: ventaId } as any, estado: EstadoVentaItem.ACTIVO },
    relations: ['producto', 'presentacion'],
  });

  // Adicionales/extras activos de esos ítems, para detallarlos bajo el producto.
  // El monto NO se imprime por adicional: en pizzas `VentaItem.precioAdicionales`
  // está ponderado por la proporción de cada sabor, así que la suma de los
  // `precioCobrado` de las filas no coincidiría con lo que se cobra.
  const {
    adicionalesByItem, observacionesByItem, removidosByItem, cambiosByItem, pizzaByItem,
  } = await cargarDetalleDeItems(dataSource, items.map(i => i.id));

  const width = opts.width;
  const headerLines = await ticketHeaderEmpresa(dataSource, width, { showTimbrado: !opts.isPrecuenta });

  // Monedas activas + cotizaciones para mostrar los totales en cada moneda.
  const monedaRepo = dataSource.getRepository(Moneda);
  const [principalMoneda, monedasActivas, cambios] = await Promise.all([
    monedaRepo.findOne({ where: { principal: true } as any }),
    monedaRepo.find({ where: { activo: true } as any }),
    dataSource.getRepository(MonedaCambio).find({
      where: { activo: true } as any,
      relations: ['monedaOrigen', 'monedaDestino'],
      order: { createdAt: 'DESC' } as any,
    }),
  ]);

  // Totales: bruto (sin descuento) y descuento de nivel ítem.
  let bruto = 0;
  let descItems = 0;
  for (const it of items) {
    const qty = Number(it.cantidad || 1);
    const pu = Number(it.precioVentaUnitario || 0) + Number(it.precioAdicionales || 0);
    bruto += qty * pu;
    descItems += qty * Number(it.descuentoUnitario || 0);
  }
  // Descuentos/aumentos a nivel de pago (ajustes del cobro).
  let descPago = 0;
  let aumPago = 0;
  const pagoId = (venta as any).pago?.id;
  if (pagoId) {
    try {
      const detalles = await dataSource.getRepository(PagoDetalle).find({
        where: { pago: { id: pagoId } as any, activo: true },
        relations: ['moneda'],
      });
      for (const d of detalles) {
        const valP = convertirAPrincipal(Number((d as any).valor || 0), (d as any).moneda, principalMoneda, cambios);
        if ((d as any).tipo === TipoDetalle.DESCUENTO) descPago += valP;
        else if ((d as any).tipo === TipoDetalle.AUMENTO) aumPago += valP;
      }
    } catch (e) {
      console.warn('[buildVentaTicketLines] no se pudieron cargar ajustes del pago:', e);
    }
  }
  const descuentoTotal = descItems + descPago;

  // Costo del envío: cargo de la venta, no un ítem. Va como línea propia en el
  // bloque de totales. `decimal` → string en Postgres, de ahí el Number().
  const costoDelivery = Number((venta as any).costoDelivery ?? 0) || 0;
  // OJO: hoy `Venta.total` NO se escribe en ningún flujo del repo — ni al cobrar
  // (`cobrar-venta-dialog` manda estado/formaPago/pago/fechaCierre, sin total),
  // ni en la venta a crédito. La rama de abajo es defensiva por si algún día se
  // persiste; el camino real SIEMPRE es el recálculo local. Por eso el ítem
  // cancelado inflaba también el comprobante post-cobro, no sólo la pre-cuenta.
  const totalPrincipal = Number((venta as any).total) > 0
    ? Number((venta as any).total)
    : bruto - descItems - descPago + aumPago + costoDelivery;

  const lines: TicketLine[] = [...headerLines];

  // MESA y/o COMANDA en grande — identifica el pedido de un vistazo (reemplaza el
  // título "PRE-CUENTA", que era redundante). La comanda no aparecia NUNCA en
  // este ticket: dos cuentas de la misma mesa salian identicas.
  const mesaNro = (venta.mesa as any)?.numero ?? null;
  const comandaObj: any = (venta as any).comanda;
  const comandaRef = comandaObj?.codigo || (comandaObj?.numero ? `#${comandaObj.numero}` : null);
  if (mesaNro || comandaRef) {
    lines.push(ticketSeparador('='));
    lines.push(...buildEncabezadoUbicacion(mesaNro, comandaRef, ticketText));
  }

  lines.push(ticketSeparador('='));
  // El comprobante conserva su título; la pre-cuenta no lo necesita.
  if (!opts.isPrecuenta) {
    lines.push(ticketText('COMPROBANTE DE VENTA', { align: 'C', bold: true }));
  }
  lines.push(ticketText(`N° ${ventaId}`, { align: 'C' }));
  lines.push(ticketText(ticketFmtFechaHora((venta as any).fechaCierre || new Date()), { align: 'C' }));
  lines.push(ticketSeparador('-'));

  const clienteTxt = (venta.cliente as any)?.razon_social || (venta.cliente as any)?.persona?.nombre;
  if (clienteTxt) lines.push(ticketKv('CLIENTE', clienteTxt));

  // Ancho de la columna CANT: mínimo 5 para que "CANT" (4) + la cantidad no
  // queden pegados a DESCRIPCION (el padding derecho de la celda deja el
  // espacio). Con anchos chicos (32/40 col) floor(width*0.12) daba 3-4 → sin
  // separación. TOTAL usa 12 col fijos.
  const totalW = 12;
  const cantW = Math.max(5, Math.min(6, Math.floor(width * 0.12)));
  const descW = width - cantW - totalW;
  lines.push(ticketSeparador('-'));
  lines.push(ticketColumns([
    { text: 'CANT', width: cantW, align: 'L' },
    { text: 'DESCRIPCION', width: descW, align: 'L' },
    { text: 'TOTAL', width: totalW, align: 'R' },
  ]));
  lines.push(ticketSeparador('-'));

  for (const it of items) {
    const qty = Number(it.cantidad || 1);
    const precio = Number(it.precioVentaUnitario || 0) + Number(it.precioAdicionales || 0);
    const total = qty * precio - qty * Number(it.descuentoUnitario || 0);
    const nombre = (it.producto?.nombre || 'PRODUCTO').toUpperCase();
    lines.push(ticketColumns([
      { text: String(qty), width: cantW, align: 'L' },
      { text: nombre, width: descW, align: 'L' },
      { text: ticketFmtMonto(total), width: totalW, align: 'R' },
    ]));

    // El detalle va en líneas propias debajo, no pegado al nombre: en una
    // impresora de 58mm la descripción tiene 15 columnas, así que
    // «PAPAS FRITAS GRANDE BACON Y CHEDDAR» no entra ni de cerca en la línea
    // del precio. Todo lo de abajo es sangrado y sin importe.
    const anchoDetalle = descW + totalW - 2;
    const detalle = (txt: string) => {
      for (const parte of envolverDetalle(txt, anchoDetalle)) {
        lines.push(ticketColumns([
          { text: '', width: cantW, align: 'L' },
          { text: `  ${parte}`, width: descW + totalW, align: 'L' },
        ]));
      }
    };

    // Variación (tamaño + sabor). Con más de un sabor sale la fracción de cada
    // mitad, que es lo que el cliente pidió y por lo que se le cobró.
    const variacion = pizzaByItem.get(it.id);
    if (variacion) {
      const txt = componerDetalleVariacion(variacion.presentacion, variacion.sabores, {
        mostrarPresentacion: variacion.mostrarPresentacion,
      });
      if (txt) detalle(txt);
    } else if ((it as any).ensambladoDescripcion) {
      // Productos armados por el PdV que no pasan por RecetaPresentacion.
      detalle(String((it as any).ensambladoDescripcion).toUpperCase());
    }

    // Ingredientes sacados: le sirven al cliente para verificar que su pedido
    // salió como lo pidió. Sin el video invertido de la comanda, que es énfasis
    // para quien cocina.
    for (const ing of (removidosByItem.get(it.id) || [])) detalle(`SIN ${ing}`);
    for (const c of (cambiosByItem.get(it.id) || [])) detalle(`CAMBIAR ${c}`);

    // Extras: SIN importe propio. Su precio ya está sumado dentro del TOTAL de
    // la línea del producto (`precioAdicionales`), así que mostrarlo al lado
    // haría creer que se cobra aparte.
    for (const extra of (adicionalesByItem.get(it.id) || [])) detalle(`+ ${extra}`);

    for (const obs of (observacionesByItem.get(it.id) || [])) detalle(obs);
  }

  lines.push(ticketSeparador('-'));
  if (descuentoTotal > 0 || costoDelivery > 0) {
    lines.push(ticketKv('SUBTOTAL', `Gs. ${ticketFmtMonto(bruto)}`));
  }
  if (descuentoTotal > 0) {
    lines.push(ticketKv('DESCUENTO', `Gs. -${ticketFmtMonto(descuentoTotal)}`));
  }
  if (aumPago > 0) lines.push(ticketKv('AUMENTO', `Gs. ${ticketFmtMonto(aumPago)}`));
  if (costoDelivery > 0) lines.push(ticketKv('ENVIO', `Gs. ${ticketFmtMonto(costoDelivery)}`));
  lines.push(ticketKv('TOTAL', `Gs. ${ticketFmtMonto(totalPrincipal)}`, true));

  // Totales en las demás monedas configuradas (según cotización vigente).
  const otrasMonedas = (monedasActivas || []).filter((m: any) => m.id !== (principalMoneda as any)?.id);
  const totalesMonedaLines: TicketLine[] = [];
  for (const m of otrasMonedas) {
    const rate = buscarCotizacion(cambios, principalMoneda, m);
    if (!rate || rate <= 0) continue;
    const val = totalPrincipal / rate;
    const label = String((m as any).denominacion || (m as any).simbolo || '').toUpperCase();
    totalesMonedaLines.push(ticketKv(`TOTAL ${label}`, ticketFmtMonto(val, Number((m as any).decimales) || 0)));
  }
  if (totalesMonedaLines.length) {
    lines.push(ticketSeparador('-'));
    lines.push(...totalesMonedaLines);
  }

  if (!opts.isPrecuenta && venta.formaPago) {
    lines.push(ticketKv('FORMA PAGO', (venta.formaPago as any).nombre || (venta.formaPago as any).descripcion || ''));
  }

  lines.push(ticketBlank());
  if (opts.isPrecuenta) {
    lines.push(ticketText('*** NO ES COMPROBANTE FISCAL ***', { align: 'C' }));
  } else {
    lines.push(ticketText('GRACIAS POR SU COMPRA', { align: 'C', bold: true }));
  }

  return {
    lines,
    bruto,
    descItems,
    descuentoTotal,
    totalPrincipal,
    itemsImpresos: items.length,
  };
}

export async function printVentaTicketInternal(
  dataSource: DataSource,
  ventaId: number,
  opts: { printerId?: number; isPrecuenta?: boolean; dispositivoId?: number } = {},
): Promise<ImpresionResultado> {
  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['dispositivo'],
  });
  if (!venta) {
    return { ok: false, printed: [], errors: [{ message: `Venta ${ventaId} no encontrada` }] };
  }

  // Resolver dispositivoId: opts gana, sino el de la venta
  const dispositivoId = opts.dispositivoId ?? (venta as any).dispositivo?.id;

  const rolTicket = opts.isPrecuenta ? SectorImpresoraRol.PRECUENTA : SectorImpresoraRol.TICKET_VENTA;
  const printer = await getPrinterByRol(dataSource, rolTicket, { printerId: opts.printerId, dispositivoId })
    // Fallback: si pidió PRECUENTA y no hay, intentar con TICKET_VENTA
    || (opts.isPrecuenta ? await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: opts.printerId, dispositivoId }) : null);
  if (!printer) {
    return { ok: false, printed: [], errors: [{ message: 'No hay impresora configurada para tickets de venta' }] };
  }

  const width = printerWidthToChars(printer.width);
  const build = await buildVentaTicketLines(dataSource, ventaId, { width, isPrecuenta: opts.isPrecuenta });
  if (!build) {
    return { ok: false, printed: [], errors: [{ message: `Venta ${ventaId} no encontrada` }] };
  }

  // Sin ítems activos no hay nada que mostrar: imprimir sólo el encabezado y un
  // "TOTAL Gs. 0" gasta papel y confunde. Pasa cuando se cancelaron todos los
  // ítems de la venta. El caller muestra el mensaje (snackbar en el PdV).
  if (build.itemsImpresos === 0) {
    return {
      ok: false,
      printed: [],
      errors: [{ printerId: printer.id, message: 'La venta no tiene ítems activos para imprimir' }],
    };
  }

  const spec: TicketSpec = { printerWidth: width, lines: build.lines, cutAtEnd: true };
  const res = await printTicketSpec(printer, spec);

  if (!res.ok) {
    broadcastPrinterEvent({
      level: 'error',
      handler: opts.isPrecuenta ? 'print-precuenta' : 'print-venta-ticket',
      entityRef: { tipo: 'VENTA', id: ventaId },
      errors: [{ printerId: printer.id, message: res.error || 'Error desconocido' }],
      message: `No se pudo imprimir ${opts.isPrecuenta ? 'la pre-cuenta' : 'el ticket'} de venta ${ventaId}`,
    });
    return {
      ok: false,
      printed: [],
      errors: [{ printerId: printer.id, message: res.error || 'Error desconocido' }],
    };
  }
  return {
    ok: true,
    printed: [{ itemId: ventaId, sectorId: null, printerId: printer.id, printerName: printer.name }],
    errors: [],
  };
}

// ============================================================
// PRINT RECIBO COBRO CPC CUOTA
// ============================================================

async function printReciboCobroCuotaInternal(
  dataSource: DataSource,
  cuotaId: number,
  opts: { printerId?: number; montoCobrado?: number; formaPago?: string } = {},
): Promise<ImpresionResultado> {
  const cuota = await dataSource.getRepository(CuentaPorCobrarCuota).findOne({
    where: { id: cuotaId },
    relations: ['cuentaPorCobrar', 'cuentaPorCobrar.cliente', 'cuentaPorCobrar.cliente.persona'],
  });
  if (!cuota) {
    return { ok: false, printed: [], errors: [{ message: `Cuota ${cuotaId} no encontrada` }] };
  }

  const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: opts.printerId });
  if (!printer) {
    return { ok: false, printed: [], errors: [{ message: 'No hay impresora configurada' }] };
  }

  const width = printerWidthToChars(printer.width);
  const headerLines = await ticketHeaderEmpresa(dataSource, width);

  const cliente = (cuota.cuentaPorCobrar as any)?.cliente;
  const clienteNombre = cliente?.razon_social || cliente?.persona?.nombre || '—';
  const monto = opts.montoCobrado ?? Number(cuota.montoCobrado || cuota.monto || 0);

  const lines: TicketLine[] = [
    ...headerLines,
    ticketSeparador('='),
    ticketText('RECIBO DE COBRO', { align: 'C', bold: true, size: 'tall' }),
    ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
    ticketSeparador('-'),
    ticketKv('CLIENTE', clienteNombre),
    ticketKv('CUOTA N°', String(cuota.numero)),
    ticketKv('VENCIMIENTO', ticketFmtFecha(cuota.fechaVencimiento)),
    ticketKv('MONTO COBRADO', `Gs. ${ticketFmtMonto(monto)}`, true),
  ];
  if (opts.formaPago) lines.push(ticketKv('FORMA PAGO', opts.formaPago));
  lines.push(...ticketLineasFirma(width, 'FIRMA CLIENTE'));

  const spec: TicketSpec = { printerWidth: width, lines };
  const res = await printTicketSpec(printer, spec);
  return res.ok
    ? { ok: true, printed: [{ itemId: cuotaId, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
    : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
}

// ============================================================
// REGISTRO DE HANDLERS IPC
// ============================================================

export function registerDocumentosTicketsHandlers(
  dataSource: DataSource,
  getCurrentUser: GetCurrentUser,
) {

  // ─── COMANDA (ticket de cocina) ─────────────────────────────────────────
  // Recibe `ventaId`. La venta debe tener mesa o comanda asignada.
  ipcMain.handle('print-comanda', async (_event, params: {
    ventaId: number;
    soloItemsNoImpresos?: boolean;
    sectorIdFilter?: number;
    forceReprint?: boolean;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printComandaInternal(dataSource, params.ventaId, {
      soloItemsNoImpresos: params.soloItemsNoImpresos,
      sectorIdFilter: params.sectorIdFilter,
      forceReprint: params.forceReprint,
    });
  });

  // ─── VENTA TICKET ───────────────────────────────────────────────────────
  ipcMain.handle('print-venta-ticket', async (_event, params: {
    ventaId: number;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_REIMPRIMIR_TICKET_VENTA']);
    const dispositivoId = resolveRequestDeviceId(_event) ?? undefined;
    return await printVentaTicketInternal(dataSource, params.ventaId, {
      printerId: params.printerId,
      dispositivoId,
    });
  });

  // ─── PRE-CUENTA ─────────────────────────────────────────────────────────
  ipcMain.handle('print-precuenta', async (_event, params: {
    ventaId: number;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    const dispositivoId = resolveRequestDeviceId(_event) ?? undefined;
    return await printVentaTicketInternal(dataSource, params.ventaId, {
      printerId: params.printerId,
      isPrecuenta: true,
      dispositivoId,
    });
  });

  // ─── RECIBO COBRO CPC ───────────────────────────────────────────────────
  ipcMain.handle('print-recibo-cobro-cuota-ticket', async (_event, params: {
    cuotaId: number;
    montoCobrado?: number;
    formaPago?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['CPC_COBRAR', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printReciboCobroCuotaInternal(dataSource, params.cuotaId, params);
  });

  // ─── RECIBO PAGO CPP ────────────────────────────────────────────────────
  // Simétrico al de cobro — usa el mismo helper reutilizando la lógica pero
  // con título "RECIBO DE PAGO". Implementación con genérico para reducir copy.
  ipcMain.handle('print-recibo-pago-cuota-ticket', async (_event, params: {
    cuotaId: number;
    montoPagado?: number;
    formaPago?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['CAJA_MAYOR_OPERAR', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printReciboGenericoInternal(dataSource, {
      titulo: 'RECIBO DE PAGO',
      idLabel: 'CUOTA N°',
      numeroRef: String(params.cuotaId),
      monto: params.montoPagado ?? 0,
      formaPago: params.formaPago,
      contraparteLabel: 'PROVEEDOR',
      contraparteValor: '—',
      firmaLabel: 'FIRMA PROVEEDOR',
      printerId: params.printerId,
    });
  });

  // ─── RETIRO DE CAJA ─────────────────────────────────────────────────────
  ipcMain.handle('print-retiro-caja-ticket', async (_event, params: {
    retiroId: number;
    monto?: number;
    responsable?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['CAJA_MAYOR_OPERAR', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printReciboGenericoInternal(dataSource, {
      titulo: 'RETIRO DE CAJA',
      idLabel: 'RETIRO N°',
      numeroRef: String(params.retiroId),
      monto: params.monto ?? 0,
      contraparteLabel: 'RESPONSABLE',
      contraparteValor: params.responsable || '—',
      firmaLabel: 'FIRMA RESPONSABLE',
      printerId: params.printerId,
    });
  });

  // ─── VALE FUNCIONARIO ───────────────────────────────────────────────────
  ipcMain.handle('print-vale-ticket', async (_event, params: {
    valeId: number;
    monto?: number;
    funcionario?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['RRHH_VALE_CONFIRMAR', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printReciboGenericoInternal(dataSource, {
      titulo: 'VALE / ADELANTO',
      idLabel: 'VALE N°',
      numeroRef: String(params.valeId),
      monto: params.monto ?? 0,
      contraparteLabel: 'FUNCIONARIO',
      contraparteValor: params.funcionario || '—',
      firmaLabel: 'FIRMA FUNCIONARIO',
      printerId: params.printerId,
    });
  });

  // ─── PAGARÉ CPC (venta a crédito) ───────────────────────────────────────
  // Ticket para que el cliente firme tras aprobar la venta a crédito.
  ipcMain.handle('print-pagare-cpc-ticket', async (_event, params: {
    cpcId: number;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    const dispositivoId = resolveRequestDeviceId(_event) ?? undefined;
    return await printPagareCpcTicketInternal(dataSource, params.cpcId, {
      printerId: params.printerId,
      dispositivoId,
    });
  });

  // ─── TICKET DELIVERY ────────────────────────────────────────────────────
  // Reemplaza a la vieja `print-etiqueta-delivery`, que era código muerto (no
  // estaba en preload.ts ni en el mapa de canales, así que nadie podía
  // invocarla) y además imprimía sólo cliente/tel/dirección: sin ítems, sin
  // totales y sin cuánto cobrar, es decir inútil para el repartidor.
  // El handler IPC vive ahora en `delivery.handler.ts`
  // (`delivery-imprimir-ticket`); acá abajo queda el armado del ticket, en
  // `printDeliveryTicketInternal`.
  // ─── ACREDITACIÓN POS ───────────────────────────────────────────────────
  ipcMain.handle('print-acreditacion-pos-ticket', async (_event, params: {
    acreditacionId: number;
    monto?: number;
    maquina?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['BANCOS_GESTIONAR', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    return await printReciboGenericoInternal(dataSource, {
      titulo: 'ACREDITACIÓN POS',
      idLabel: 'ACR. N°',
      numeroRef: String(params.acreditacionId),
      monto: params.monto ?? 0,
      contraparteLabel: 'MAQUINA POS',
      contraparteValor: params.maquina || '—',
      firmaLabel: 'OPERADOR',
      printerId: params.printerId,
    });
  });

  // ─── CONTEO CAJA (acta breve) ───────────────────────────────────────────
  ipcMain.handle('print-conteo-caja-ticket', async (_event, params: {
    conteoId: number;
    total?: number;
    diferencia?: number;
    cajaNombre?: string;
    responsable?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['FINANCIERO_CAJA_VER', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: params.printerId });
    if (!printer) return { ok: false, printed: [], errors: [{ message: 'Sin impresora' }] };
    const width = printerWidthToChars(printer.width);
    const headerLines = await ticketHeaderEmpresa(dataSource, width);
    const lines: TicketLine[] = [
      ...headerLines,
      ticketSeparador('='),
      ticketText('ACTA DE CONTEO DE CAJA', { align: 'C', bold: true }),
      ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
      ticketSeparador('-'),
      ticketKv('CAJA', (params.cajaNombre || '—').toUpperCase()),
      ticketKv('CONTEO N°', String(params.conteoId)),
      ticketKv('TOTAL CONTADO', `Gs. ${ticketFmtMonto(params.total ?? 0)}`, true),
      ticketKv('DIFERENCIA', `Gs. ${ticketFmtMonto(params.diferencia ?? 0)}`),
      ...ticketLineasFirma(width, 'FIRMA RESPONSABLE'),
    ];
    const res = await printTicketSpec(printer, { printerWidth: width, lines });
    return res.ok
      ? { ok: true, printed: [{ itemId: params.conteoId, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
      : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
  });

  // ─── CIERRE DE CAJA (reporte completo del turno) ────────────────────────
  ipcMain.handle('print-cierre-caja', async (_event, params: {
    cajaId: number;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['FINANCIERO_CAJA_VER', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    const dispositivoId = resolveRequestDeviceId(_event) ?? undefined;
    return await printCierreCajaInternal(dataSource, params.cajaId, {
      printerId: params.printerId,
      dispositivoId,
    });
  });
}

// ============================================================
// HELPER GENÉRICO DE RECIBO (recibos cortos sin lógica de venta)
// ============================================================

interface ReciboGenericoOpts {
  titulo: string;
  idLabel: string;
  numeroRef: string;
  monto: number;
  formaPago?: string;
  contraparteLabel: string;
  contraparteValor: string;
  firmaLabel: string;
  printerId?: number;
}

/**
 * Imprime un pagaré para venta a crédito. Reusable como función (llamado
 * también desde `cobrar-venta-credito` para auto-print tras finalizar venta).
 */
export async function printPagareCpcTicketInternal(
  dataSource: DataSource,
  cpcId: number,
  opts: { printerId?: number; dispositivoId?: number } = {},
): Promise<ImpresionResultado> {
  const { CuentaPorCobrar } = require('../../src/app/database/entities/financiero/cuenta-por-cobrar.entity');
  const cpc = await dataSource.getRepository(CuentaPorCobrar).findOne({
    where: { id: cpcId },
    relations: ['cliente', 'cliente.persona', 'moneda', 'cuotas'],
  });
  if (!cpc) return { ok: false, printed: [], errors: [{ message: `CPC ${cpcId} no encontrada` }] };

  const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, {
    printerId: opts.printerId,
    dispositivoId: opts.dispositivoId,
  });
  if (!printer) return { ok: false, printed: [], errors: [{ message: 'Sin impresora TICKET_VENTA' }] };

  const width = printerWidthToChars(printer.width);
  const headerLines = await ticketHeaderEmpresa(dataSource, width);

  const cliente: any = (cpc as any).cliente;
  const clienteNombre = (cliente?.razon_social || cliente?.persona?.nombre || '—').toUpperCase();
  const clienteDoc = (cliente?.ruc || cliente?.persona?.documento || '—').toUpperCase();
  const monedaSimbolo = monedaSimboloAscii((cpc as any).moneda);
  const fechaInicio = ticketFmtFecha((cpc as any).fechaInicio);
  const cuotas: any[] = ((cpc as any).cuotas || []).sort((a: any, b: any) => (a.numero || a.numeroCuota || 0) - (b.numero || b.numeroCuota || 0));

  const lines: TicketLine[] = [
    ...headerLines,
    ticketSeparador('='),
    ticketText('PAGARE', { align: 'C', bold: true, size: 'tall' }),
    ticketText(`CPC N${ String.fromCharCode(248) } ${cpc.id}`, { align: 'C' }),
    ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
    ticketSeparador('-'),
    ticketKv('CLIENTE', clienteNombre),
    ticketKv('DOCUMENTO', clienteDoc),
    ticketKv('MONTO TOTAL', `${monedaSimbolo} ${ticketFmtMonto(Number((cpc as any).montoTotal || 0))}`, true),
    ticketKv('CUOTAS', String((cpc as any).cantidadCuotas || cuotas.length)),
    ticketKv('FECHA INICIO', fechaInicio),
    ticketSeparador('-'),
    ticketText('DETALLE DE CUOTAS:', { bold: true }),
  ];

  for (const c of cuotas) {
    lines.push(ticketColumns([
      { text: `${c.numero || c.numeroCuota || ''}`, width: 4, align: 'L' },
      { text: ticketFmtFecha(c.fechaVencimiento), width: 12, align: 'L' },
      { text: `${monedaSimbolo} ${ticketFmtMonto(Number(c.monto || 0))}`, width: Math.max(8, width - 16), align: 'R' },
    ]));
  }

  lines.push(ticketSeparador('-'));
  lines.push(ticketText(
    'Por el presente PAGARE me obligo a pagar al beneficiario las cuotas detalladas en las fechas indicadas, sin protesto. La falta de pago de cualquier cuota faculta al cobro inmediato del saldo total.',
    { align: 'L' }
  ));
  // Sección de firma con nombre del cliente debajo. Padding inferior
  // para que el corte de papel no recorte el texto.
  lines.push(ticketBlank(3));
  lines.push(ticketText('_'.repeat(Math.min(width - 2, 32)), { align: 'C' }));
  lines.push(ticketText(clienteNombre, { align: 'C', bold: true }));
  lines.push(ticketText('FIRMA DEL CLIENTE', { align: 'C' }));
  // El margen inferior antes del corte lo agrega printTicketSpec (BOTTOM_SAFE_FEED).

  const res = await printTicketSpec(printer, { printerWidth: width, lines, cutAtEnd: true });
  return res.ok
    ? { ok: true, printed: [{ itemId: cpcId, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
    : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
}

async function printReciboGenericoInternal(
  dataSource: DataSource,
  opts: ReciboGenericoOpts,
): Promise<ImpresionResultado> {
  const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: opts.printerId });
  if (!printer) return { ok: false, printed: [], errors: [{ message: 'Sin impresora' }] };
  const width = printerWidthToChars(printer.width);
  const headerLines = await ticketHeaderEmpresa(dataSource, width);

  const lines: TicketLine[] = [
    ...headerLines,
    ticketSeparador('='),
    ticketText(opts.titulo, { align: 'C', bold: true, size: 'tall' }),
    ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
    ticketSeparador('-'),
    ticketKv(opts.idLabel, opts.numeroRef),
    ticketKv(opts.contraparteLabel, opts.contraparteValor.toUpperCase()),
    ticketKv('MONTO', `Gs. ${ticketFmtMonto(opts.monto)}`, true),
  ];
  if (opts.formaPago) lines.push(ticketKv('FORMA PAGO', opts.formaPago));
  lines.push(...ticketLineasFirma(width, opts.firmaLabel));

  const res = await printTicketSpec(printer, { printerWidth: width, lines });
  return res.ok
    ? { ok: true, printed: [{ itemId: 0, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
    : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
}

// ============================================================
// CIERRE DE CAJA (reporte completo del turno)
// ============================================================

/** Formatea "Xh Ym" a partir de dos fechas (apertura → cierre). */
function formatDuracion(desde?: Date | string | null, hasta?: Date | string | null): string {
  if (!desde) return '—';
  const d1 = typeof desde === 'string' ? new Date(desde) : desde;
  const d2 = hasta ? (typeof hasta === 'string' ? new Date(hasta) : hasta) : new Date();
  const ms = d2.getTime() - d1.getTime();
  if (!isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (dias > 0) parts.push(`${dias}d`);
  parts.push(`${horas}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

/**
 * Imprime el TICKET DE CIERRE DE CAJA: reporte completo del turno con datos de
 * la caja, ventas por forma de pago, gastos, retiros, descuentos/aumentos y el
 * arqueo (apertura, cierre, esperado y diferencia por moneda).
 *
 * Reusable como función (auto-print al cerrar la caja) sin chequeo de permisos.
 */
export async function printCierreCajaInternal(
  dataSource: DataSource,
  cajaId: number,
  opts: { printerId?: number; dispositivoId?: number } = {},
): Promise<ImpresionResultado> {
  let resumen;
  try {
    resumen = await computeResumenCaja(dataSource, cajaId);
  } catch (e: any) {
    return { ok: false, printed: [], errors: [{ message: e?.message || `No se pudo calcular el resumen de la caja ${cajaId}` }] };
  }

  const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, {
    printerId: opts.printerId,
    dispositivoId: opts.dispositivoId,
  });
  if (!printer) return { ok: false, printed: [], errors: [{ message: 'Sin impresora' }] };
  const width = printerWidthToChars(printer.width);

  // Mapa moneda → { decimales, simbolo ASCII } para formateo correcto por moneda.
  const monedas = await dataSource.getRepository(Moneda).find();
  const monedaInfo: { [id: number]: { decimales: number; simbolo: string } } = {};
  for (const m of monedas) {
    monedaInfo[m.id] = { decimales: Number((m as any).decimales) || 0, simbolo: monedaSimboloAscii(m) };
  }
  const fmtMoneda = (monedaId: number, monto: number): string => {
    const info = monedaInfo[monedaId] || { decimales: 0, simbolo: '' };
    return `${info.simbolo} ${ticketFmtMonto(monto, info.decimales)}`.trim();
  };
  const simboloMoneda = (monedaId: number): string => (monedaInfo[monedaId]?.simbolo || '');
  const fmtMontoMoneda = (monedaId: number, monto: number): string =>
    ticketFmtMonto(monto, monedaInfo[monedaId]?.decimales ?? 0);

  // Renderiza un total/rubro etiquetado que puede tener varias monedas:
  //  - 1 moneda  → una sola línea "ETIQUETA .......... Gs 5.300.000"
  //  - N monedas → la ETIQUETA va como encabezado y cada moneda indentada
  //    debajo (sin repetir la etiqueta), igual que el bloque de ARQUEO.
  const pushTotalMultimoneda = (
    label: string,
    montos: { monedaId: number; total: number }[],
    bold = false,
  ): void => {
    if (montos.length === 0) return;
    if (montos.length === 1) {
      lines.push(ticketKv(label, fmtMoneda(montos[0].monedaId, montos[0].total), bold));
      return;
    }
    lines.push(ticketText(label, { bold }));
    for (const m of montos) {
      lines.push(ticketKv(`  ${simboloMoneda(m.monedaId)}`, fmtMontoMoneda(m.monedaId, m.total), bold));
    }
  };

  const caja = resumen.caja as any;
  const cajero = caja?.createdBy?.persona?.nombre
    || caja?.createdBy?.nickname
    || caja?.createdBy?.usuario
    || '—';
  const dispositivo = caja?.dispositivo?.nombre || '—';

  const headerLines = await ticketHeaderEmpresa(dataSource, width);
  const lines: TicketLine[] = [
    ...headerLines,
    ticketSeparador('='),
    ticketText('CIERRE DE CAJA', { align: 'C', bold: true, size: 'tall' }),
    ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
    ticketSeparador('='),
    ticketKv('CAJA N°', String(caja?.id ?? cajaId)),
    ticketKv('DISPOSITIVO', String(dispositivo).toUpperCase()),
    ticketKv('CAJERO', String(cajero).toUpperCase()),
    ticketKv('APERTURA', ticketFmtFechaHora(caja?.fechaApertura)),
    ticketKv('CIERRE', ticketFmtFechaHora(caja?.fechaCierre)),
    ticketKv('TIEMPO ABIERTO', formatDuracion(caja?.fechaApertura, caja?.fechaCierre)),
    ticketKv('N° VENTAS', String(resumen.cantidadVentas)),
  ];

  // ── Ventas por forma de pago ──────────────────────────────
  lines.push(ticketSeparador('-'));
  lines.push(ticketText('VENTAS POR FORMA DE PAGO', { align: 'C', bold: true }));
  if (resumen.ventasPorFormaPago.length === 0) {
    lines.push(ticketText('Sin ventas', { align: 'C' }));
  } else {
    // Agrupar por forma de pago para no repetir el nombre en cada moneda.
    const porForma = new Map<string, { monedaId: number; total: number }[]>();
    for (const fp of resumen.ventasPorFormaPago) {
      const nombre = `${fp.formaPago}`.toUpperCase();
      if (!porForma.has(nombre)) porForma.set(nombre, []);
      porForma.get(nombre)!.push({ monedaId: fp.monedaId, total: fp.total });
    }
    for (const [nombre, montos] of porForma) {
      pushTotalMultimoneda(nombre, montos);
    }
    lines.push(ticketSeparador('.'));
    pushTotalMultimoneda(
      'TOTAL VENTAS',
      resumen.ventasTotalPorMoneda.map(vt => ({ monedaId: vt.monedaId, total: vt.total })),
      true,
    );
  }

  // ── Descuentos / Aumentos ─────────────────────────────────
  const descMonedas = Object.keys(resumen.descuentosPorMoneda).map(Number).filter(id => resumen.descuentosPorMoneda[id]);
  const aumMonedas = Object.keys(resumen.aumentosPorMoneda).map(Number).filter(id => resumen.aumentosPorMoneda[id]);
  if (descMonedas.length > 0 || aumMonedas.length > 0) {
    lines.push(ticketSeparador('-'));
    lines.push(ticketText('DESCUENTOS / AUMENTOS', { align: 'C', bold: true }));
    pushTotalMultimoneda('TOTAL DESCUENTOS', descMonedas.map(id => ({ monedaId: id, total: resumen.descuentosPorMoneda[id] })));
    pushTotalMultimoneda('TOTAL AUMENTOS', aumMonedas.map(id => ({ monedaId: id, total: resumen.aumentosPorMoneda[id] })));
  }

  // ── Gastos ────────────────────────────────────────────────
  if (resumen.gastos.length > 0) {
    lines.push(ticketSeparador('-'));
    lines.push(ticketText('GASTOS', { align: 'C', bold: true }));
    const gastoTotalPorMoneda: { [id: number]: number } = {};
    for (const g of resumen.gastos) {
      const desc = `${g.descripcion || g.categoria || 'GASTO'}`.toUpperCase().slice(0, width - 14);
      lines.push(ticketKv(desc, fmtMoneda(g.monedaId, g.monto)));
      gastoTotalPorMoneda[g.monedaId] = (gastoTotalPorMoneda[g.monedaId] || 0) + g.monto;
    }
    lines.push(ticketSeparador('.'));
    pushTotalMultimoneda(
      'TOTAL GASTOS',
      Object.keys(gastoTotalPorMoneda).map(Number).map(id => ({ monedaId: id, total: gastoTotalPorMoneda[id] })),
      true,
    );
  }

  // ── Egresos (Vales / Compras pagados del cajón) ───────────
  if ((resumen.egresos || []).length > 0) {
    lines.push(ticketSeparador('-'));
    lines.push(ticketText('EGRESOS (VALES / COMPRAS)', { align: 'C', bold: true }));
    const egresoTotalPorMoneda: { [id: number]: number } = {};
    for (const e of resumen.egresos) {
      const desc = `${e.tipo || 'EGRESO'}: ${e.descripcion || ''}`.toUpperCase().slice(0, width - 14);
      lines.push(ticketKv(desc, fmtMoneda(e.monedaId, e.monto)));
      egresoTotalPorMoneda[e.monedaId] = (egresoTotalPorMoneda[e.monedaId] || 0) + e.monto;
    }
    lines.push(ticketSeparador('.'));
    pushTotalMultimoneda(
      'TOTAL EGRESOS',
      Object.keys(egresoTotalPorMoneda).map(Number).map(id => ({ monedaId: id, total: egresoTotalPorMoneda[id] })),
      true,
    );
  }

  // ── Retiros ───────────────────────────────────────────────
  if (resumen.retiros.length > 0) {
    lines.push(ticketSeparador('-'));
    lines.push(ticketText('RETIROS', { align: 'C', bold: true }));
    const retiroTotalPorMoneda: { [id: number]: number } = {};
    for (const r of resumen.retiros) {
      const etiqueta = `RETIRO N° ${r.id}${r.responsable ? ' - ' + String(r.responsable).toUpperCase() : ''}`.slice(0, width - 12);
      lines.push(ticketText(etiqueta));
      for (const d of (r.detalles || [])) {
        lines.push(ticketKv(`  ${d.monedaDenominacion || ''}`.trimEnd() || '  ', fmtMoneda(d.monedaId, d.monto)));
        retiroTotalPorMoneda[d.monedaId] = (retiroTotalPorMoneda[d.monedaId] || 0) + d.monto;
      }
    }
    lines.push(ticketSeparador('.'));
    pushTotalMultimoneda(
      'TOTAL RETIROS',
      Object.keys(retiroTotalPorMoneda).map(Number).map(id => ({ monedaId: id, total: retiroTotalPorMoneda[id] })),
      true,
    );
  }

  // ── Arqueo (apertura / cierre / esperado / diferencia por moneda) ──
  lines.push(ticketSeparador('='));
  lines.push(ticketText('ARQUEO DE CAJA', { align: 'C', bold: true }));
  const arqueoMonedaIds = new Set<number>();
  resumen.conteoApertura.forEach(c => arqueoMonedaIds.add(c.monedaId));
  resumen.conteoCierre.forEach(c => arqueoMonedaIds.add(c.monedaId));
  Object.keys(resumen.esperadoPorMoneda).forEach(k => arqueoMonedaIds.add(Number(k)));
  Object.keys(resumen.diferenciaPorMoneda).forEach(k => arqueoMonedaIds.add(Number(k)));
  if (arqueoMonedaIds.size === 0) {
    lines.push(ticketText('Sin datos de conteo', { align: 'C' }));
  } else {
    for (const id of arqueoMonedaIds) {
      const info = monedaInfo[id];
      const apertura = resumen.conteoApertura.find(c => c.monedaId === id)?.total || 0;
      const cierre = resumen.conteoCierre.find(c => c.monedaId === id)?.total || 0;
      const esperado = resumen.esperadoPorMoneda[id] || 0;
      const diferencia = resumen.diferenciaPorMoneda[id] || 0;
      lines.push(ticketSeparador('.'));
      lines.push(ticketText((info?.simbolo || `MONEDA ${id}`).toUpperCase(), { bold: true }));
      lines.push(ticketKv('  MONTO APERTURA', fmtMoneda(id, apertura)));
      lines.push(ticketKv('  MONTO CIERRE', fmtMoneda(id, cierre)));
      lines.push(ticketKv('  ESPERADO', fmtMoneda(id, esperado)));
      lines.push(ticketKv('  DIFERENCIA', fmtMoneda(id, diferencia), true));
    }
  }

  lines.push(...ticketLineasFirma(width, 'FIRMA CAJERO'));

  const res = await printTicketSpec(printer, { printerWidth: width, lines });
  return res.ok
    ? { ok: true, printed: [{ itemId: caja?.id ?? cajaId, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
    : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
}

// ============================================================
// TICKET DE DELIVERY (comanda de reparto)
// ============================================================

/**
 * Ticket que se lleva el repartidor.
 *
 * A diferencia del comprobante de venta, tiene que responder tres preguntas de
 * un vistazo: **a dónde va**, **qué lleva** y **cuánto tiene que cobrar**. La
 * vieja `print-etiqueta-delivery` sólo cubría la primera — y ni siquiera se
 * podía invocar, no estaba expuesta en `preload.ts`.
 *
 * El costo del envío sale como línea propia: es un cargo de la venta
 * (`Venta.costoDelivery`, congelado al asignar la zona), no un ítem del
 * pedido, así que no puede ir mezclado con los productos.
 */
export async function printDeliveryTicketInternal(
  dataSource: DataSource,
  deliveryId: number,
  opts: { printerId?: number; dispositivoId?: number } = {},
): Promise<ImpresionResultado> {
  const delivery = await dataSource.getRepository(Delivery).findOne({
    where: { id: deliveryId },
    relations: [
      'precioDelivery',
      'cliente',
      'cliente.persona',
      'entregadoPorFuncionario',
      'entregadoPorFuncionario.persona',
    ],
  });
  if (!delivery) {
    return { ok: false, printed: [], errors: [{ message: `Delivery ${deliveryId} no encontrado` }] };
  }

  const venta = await dataSource.getRepository(Venta).findOne({
    where: { delivery: { id: deliveryId } },
    relations: ['pago'],
  });

  const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, {
    printerId: opts.printerId,
    dispositivoId: opts.dispositivoId,
  });
  if (!printer) {
    return { ok: false, printed: [], errors: [{ message: 'No hay impresora configurada para tickets de venta' }] };
  }

  const width = printerWidthToChars(printer.width);
  const headerLines = await ticketHeaderEmpresa(dataSource, width, { showTimbrado: false });

  const items = venta
    ? await dataSource.getRepository(VentaItem).find({
        where: { venta: { id: venta.id } as any, estado: EstadoVentaItem.ACTIVO },
        relations: ['producto', 'presentacion'],
      })
    : [];
  const {
    adicionalesByItem, observacionesByItem, removidosByItem, cambiosByItem, pizzaByItem,
  } = await cargarDetalleDeItems(dataSource, items.map((i) => i.id));

  let bruto = 0;
  let descuentoItems = 0;
  for (const it of items) {
    const qty = Number(it.cantidad || 1);
    bruto += qty * (Number(it.precioVentaUnitario || 0) + Number(it.precioAdicionales || 0));
    descuentoItems += qty * Number(it.descuentoUnitario || 0);
  }
  // `costoDelivery` es `decimal`: en Postgres llega como string. Sin `Number()`
  // se concatenaría en vez de sumarse.
  const costoEnvio = Number(venta?.costoDelivery ?? 0) || 0;
  const total = bruto - descuentoItems + costoEnvio;

  const cobrada = venta?.estado === 'CONCLUIDA';
  const nombreCliente = (delivery.nombre
    || (delivery.cliente as any)?.persona?.nombre
    || '—').toUpperCase();
  const repartidor = (delivery.entregadoPorFuncionario as any)?.persona?.nombre;

  const lines: TicketLine[] = [...headerLines];
  lines.push(ticketSeparador('='));
  lines.push(ticketText('DELIVERY', { align: 'C', bold: true, size: 'tall' }));
  lines.push(ticketText(`N° ${deliveryId}${venta ? ` · VENTA #${venta.id}` : ''}`, { align: 'C' }));
  lines.push(ticketText(ticketFmtFechaHora(delivery.fechaAbierto || new Date()), { align: 'C' }));
  lines.push(ticketSeparador('='));

  // Bloque de entrega. La dirección va en su propia línea a ancho completo:
  // en 32 columnas un `ticketKv` la truncaría justo donde importa.
  lines.push(ticketKv('CLIENTE', nombreCliente));
  lines.push(ticketKv('TEL', delivery.telefono || '—'));
  lines.push(ticketText('DIRECCION:', { bold: true }));
  lines.push(ticketText((delivery.direccion || '—').toUpperCase()));
  if (delivery.observacion) {
    lines.push(ticketText('OBSERVACION:', { bold: true }));
    lines.push(ticketText(delivery.observacion.toUpperCase()));
  }
  if (delivery.precioDelivery?.descripcion) {
    lines.push(ticketKv('ZONA', String(delivery.precioDelivery.descripcion).toUpperCase()));
  }
  if (repartidor) lines.push(ticketKv('REPARTIDOR', String(repartidor).toUpperCase()));

  // Ítems, con el mismo layout de columnas que el comprobante de venta.
  const totalW = 12;
  const cantW = Math.max(5, Math.min(6, Math.floor(width * 0.12)));
  const descW = width - cantW - totalW;
  lines.push(ticketSeparador('-'));
  lines.push(ticketColumns([
    { text: 'CANT', width: cantW, align: 'L' },
    { text: 'DESCRIPCION', width: descW, align: 'L' },
    { text: 'TOTAL', width: totalW, align: 'R' },
  ]));
  lines.push(ticketSeparador('-'));
  for (const it of items) {
    const qty = Number(it.cantidad || 1);
    const precio = Number(it.precioVentaUnitario || 0) + Number(it.precioAdicionales || 0);
    const totalLinea = qty * precio - qty * Number(it.descuentoUnitario || 0);
    lines.push(ticketColumns([
      { text: String(qty), width: cantW, align: 'L' },
      { text: (it.producto?.nombre || 'PRODUCTO').toUpperCase(), width: descW, align: 'L' },
      { text: ticketFmtMonto(totalLinea), width: totalW, align: 'R' },
    ]));
    // Mismo detalle que el ticket de venta: en delivery el cliente recibe esta
    // hoja y es su única forma de verificar que le mandaron lo que pidió.
    const anchoDetalle = descW + totalW - 2;
    const detalle = (txt: string) => {
      for (const parte of envolverDetalle(txt, anchoDetalle)) {
        lines.push(ticketColumns([
          { text: '', width: cantW, align: 'L' },
          { text: `  ${parte}`, width: descW + totalW, align: 'L' },
        ]));
      }
    };
    const variacion = pizzaByItem.get(it.id);
    if (variacion) {
      const txt = componerDetalleVariacion(variacion.presentacion, variacion.sabores, {
        mostrarPresentacion: variacion.mostrarPresentacion,
      });
      if (txt) detalle(txt);
    } else if ((it as any).ensambladoDescripcion) {
      detalle(String((it as any).ensambladoDescripcion).toUpperCase());
    }
    for (const ing of (removidosByItem.get(it.id) || [])) detalle(`SIN ${ing}`);
    for (const c of (cambiosByItem.get(it.id) || [])) detalle(`CAMBIAR ${c}`);
    for (const extra of (adicionalesByItem.get(it.id) || [])) detalle(`+ ${extra}`);
    for (const obs of (observacionesByItem.get(it.id) || [])) detalle(obs);
  }
  if (items.length === 0) {
    lines.push(ticketText('(SIN ITEMS CARGADOS)', { align: 'C' }));
  }

  lines.push(ticketSeparador('-'));
  if (descuentoItems > 0 || costoEnvio > 0) {
    lines.push(ticketKv('SUBTOTAL', `Gs. ${ticketFmtMonto(bruto)}`));
  }
  if (descuentoItems > 0) lines.push(ticketKv('DESCUENTO', `Gs. -${ticketFmtMonto(descuentoItems)}`));
  if (costoEnvio > 0) lines.push(ticketKv('ENVIO', `Gs. ${ticketFmtMonto(costoEnvio)}`));
  lines.push(ticketKv('TOTAL', `Gs. ${ticketFmtMonto(total)}`, true));

  // Lo más importante del ticket: si el repartidor cobra o no.
  lines.push(ticketSeparador('='));
  if (cobrada) {
    lines.push(ticketText('PAGADO — NO COBRAR', { align: 'C', bold: true, size: 'tall' }));
  } else {
    lines.push(ticketText('A COBRAR', { align: 'C', bold: true }));
    lines.push(ticketText(`Gs. ${ticketFmtMonto(total)}`, { align: 'C', bold: true, size: 'tall' }));
  }
  lines.push(ticketSeparador('='));
  lines.push(ticketBlank());

  const res = await printTicketSpec(printer, { printerWidth: width, lines, cutAtEnd: true });
  if (!res.ok) {
    broadcastPrinterEvent({
      level: 'error',
      handler: 'delivery-imprimir-ticket',
      entityRef: { tipo: 'VENTA', id: venta?.id ?? deliveryId },
      errors: [{ printerId: printer.id, message: res.error || 'Error desconocido' }],
      message: `No se pudo imprimir el ticket del delivery ${deliveryId}`,
    });
    return { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error desconocido' }] };
  }
  return {
    ok: true,
    printed: [{ itemId: deliveryId, sectorId: null, printerId: printer.id, printerName: printer.name }],
    errors: [],
  };
}
