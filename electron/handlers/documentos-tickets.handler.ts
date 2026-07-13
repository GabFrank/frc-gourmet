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
import { Printer } from '../../src/app/database/entities/printer.entity';
import { SectorImpresora, SectorImpresoraRol } from '../../src/app/database/entities/ventas/sector-impresora.entity';
import { ProductoSector } from '../../src/app/database/entities/productos/producto-sector.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
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

function safeParseJson(s: string): any[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
  catch { return []; }
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
  const adicionalesByItem = new Map<number, string[]>();
  const observacionesByItem = new Map<number, string[]>();
  // Se separan las remociones (SIN X) de los cambios (CAMBIAR X POR Y) para
  // darle a cada una el énfasis que corresponde en el ticket de cocina.
  const removidosByItem = new Map<number, string[]>();
  const cambiosByItem = new Map<number, string[]>();
  // Pizzas (producto con variación): tamaño + sabores por mitad, para imprimirlos
  // en grande y separados en la comanda.
  const pizzaByItem = new Map<number, { presentacion: string; sabores: { nombre: string; proporcion: number }[] }>();
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
        pushMap(adicionalesByItem, iid, cant > 1 ? `ADD ${cant}x ${nom}` : `ADD ${nom}`);
      }

      const obs = await dataSource.getRepository(VentaItemObservacion).find({
        where: { ventaItem: { id: TIn(itemIds) } as any, activo: true },
        relations: ['observacion', 'ventaItem'],
      });
      for (const o of obs) {
        const iid = (o as any).ventaItem?.id;
        if (!iid) continue;
        const txt = String((o as any).descripcion || (o as any).observacion?.descripcion || '').toUpperCase().trim();
        if (txt) pushMap(observacionesByItem, iid, `>> ${txt}`);
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
          pizzaByItem.set(iid, {
            presentacion: String((vs as any).recetaPresentacion?.presentacion?.nombre || '').toUpperCase().trim(),
            sabores: [],
          });
        }
        pizzaByItem.get(iid)!.sabores.push({ nombre: saborNombre, proporcion: Number((vs as any).proporcion) || 0 });
      }
    } catch (e) {
      // Los modificadores son opcionales: si fallan, se imprime la comanda igual.
      console.warn('[printComandaInternal] no se pudieron cargar modificadores del ítem:', e);
    }
  }

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
    if (mesa?.numero) {
      lines.push(ticketText('MESA', { align: 'C' }));
      lines.push(ticketText(String(mesa.numero), { align: 'C', bold: true, size: 'big' }));
    } else if (refComanda) {
      lines.push(ticketText('COMANDA', { align: 'C' }));
      lines.push(ticketText(String(refComanda), { align: 'C', bold: true, size: 'big' }));
    } else {
      lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
    }
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
      for (const t of (adicionalesByItem.get(v.id) || [])) lines.push(ticketText(`   ${t}`, { bold: true }));
      for (const t of (observacionesByItem.get(v.id) || [])) lines.push(ticketText(`   ${t}`));
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

export async function printVentaTicketInternal(
  dataSource: DataSource,
  ventaId: number,
  opts: { printerId?: number; isPrecuenta?: boolean; dispositivoId?: number } = {},
): Promise<ImpresionResultado> {
  const errors: ImpresionResultado['errors'] = [];

  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['cliente', 'cliente.persona', 'mesa', 'formaPago', 'dispositivo', 'pago'],
  });
  if (!venta) {
    return { ok: false, printed: [], errors: [{ message: `Venta ${ventaId} no encontrada` }] };
  }

  // Resolver dispositivoId: opts gana, sino el de la venta
  const dispositivoId = opts.dispositivoId ?? (venta as any).dispositivo?.id;

  const items = await dataSource.getRepository(VentaItem).find({
    where: { venta: { id: ventaId } as any },
    relations: ['producto', 'presentacion'],
  });

  const rolTicket = opts.isPrecuenta ? SectorImpresoraRol.PRECUENTA : SectorImpresoraRol.TICKET_VENTA;
  const printer = await getPrinterByRol(dataSource, rolTicket, { printerId: opts.printerId, dispositivoId })
    // Fallback: si pidió PRECUENTA y no hay, intentar con TICKET_VENTA
    || (opts.isPrecuenta ? await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: opts.printerId, dispositivoId }) : null);
  if (!printer) {
    return { ok: false, printed: [], errors: [{ message: 'No hay impresora configurada para tickets de venta' }] };
  }

  const width = printerWidthToChars(printer.width);
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
      console.warn('[printVentaTicketInternal] no se pudieron cargar ajustes del pago:', e);
    }
  }
  const descuentoTotal = descItems + descPago;
  const totalPrincipal = Number((venta as any).total) > 0
    ? Number((venta as any).total)
    : bruto - descItems - descPago + aumPago;

  const lines: TicketLine[] = [...headerLines];

  // MESA en grande — identifica el pedido de un vistazo (reemplaza el título
  // "PRE-CUENTA", que era redundante).
  const mesaNro = (venta.mesa as any)?.numero;
  if (mesaNro) {
    lines.push(ticketSeparador('='));
    lines.push(ticketText('MESA', { align: 'C' }));
    lines.push(ticketText(String(mesaNro), { align: 'C', bold: true, size: 'big' }));
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
  }

  lines.push(ticketSeparador('-'));
  if (descuentoTotal > 0) {
    lines.push(ticketKv('SUBTOTAL', `Gs. ${ticketFmtMonto(bruto)}`));
    lines.push(ticketKv('DESCUENTO', `Gs. -${ticketFmtMonto(descuentoTotal)}`));
  }
  if (aumPago > 0) lines.push(ticketKv('AUMENTO', `Gs. ${ticketFmtMonto(aumPago)}`));
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

  const spec: TicketSpec = { printerWidth: width, lines, cutAtEnd: true };
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

  // ─── ETIQUETA DELIVERY ──────────────────────────────────────────────────
  ipcMain.handle('print-etiqueta-delivery', async (_event, params: {
    deliveryId: number;
    cliente?: string;
    direccion?: string;
    telefono?: string;
    printerId?: number;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    const printer = await getPrinterByRol(dataSource, SectorImpresoraRol.TICKET_VENTA, { printerId: params.printerId });
    if (!printer) return { ok: false, printed: [], errors: [{ message: 'Sin impresora' }] };
    const width = printerWidthToChars(printer.width);
    const lines: TicketLine[] = [
      ticketText(`DELIVERY #${params.deliveryId}`, { align: 'C', bold: true, size: 'tall' }),
      ticketSeparador('-'),
      ticketKv('CLIENTE', (params.cliente || '—').toUpperCase()),
      ticketKv('TEL', params.telefono || '—'),
      ticketBlank(),
      ticketText('DIRECCIÓN:', { bold: true }),
      ticketText((params.direccion || '—').toUpperCase()),
    ];
    const res = await printTicketSpec(printer, { printerWidth: width, lines });
    return res.ok
      ? { ok: true, printed: [{ itemId: params.deliveryId, sectorId: null, printerId: printer.id, printerName: printer.name }], errors: [] }
      : { ok: false, printed: [], errors: [{ printerId: printer.id, message: res.error || 'Error' }] };
  });

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
