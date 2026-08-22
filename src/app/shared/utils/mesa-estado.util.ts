/**
 * Color y tooltip de una mesa en el plano del PdV.
 *
 * **La regla:** el COLOR responde una sola pregunta — *¿la mesa tiene cuenta
 * propia?* — y el BADGE carga la otra dimensión: *¿hay comandas sentadas acá?*
 * Son dos señales ortogonales.
 *
 * Colapsarlas en un solo bit destruye la distinción que necesita el cajero:
 * "no hay nada que cobrarle a la mesa" (verde/amarillo) vs "hay cuenta de mesa
 * Y ADEMÁS comandas" (naranja + badge). Fue considerado y descartado.
 *
 *   verde            vacía
 *   amarillo + badge sin cuenta de mesa, N comandas sentadas
 *   naranja          cuenta de mesa
 *   naranja + badge  cuenta de mesa + comandas → 2 cuentas o más
 *   azul             reservada (pisa a las demás)
 *
 * Vive fuera del componente para que el test la importe en vez de replicarla —
 * mismo padrón que `forma-pago-efectivo.util.ts` y
 * `operacion-financiera-validacion.util.ts`. Una copia en el test se queda vieja
 * en silencio el día que alguien cambia la matriz de decisión acá.
 */

export interface MesaEstadoEntrada {
  /** Cuenta PROPIA de la mesa (venta ABIERTA con `comanda_id IS NULL`). */
  venta?: unknown;
  /** Comandas OCUPADO sentadas en esta mesa. */
  comandas?: unknown[] | null;
  reservado?: boolean;
}

export interface MesaEstadoVisual {
  clase: 'table-active' | 'table-solo-comandas' | 'table-inactive' | 'table-reserved';
  tooltip: string;
}

export function derivarEstadoVisualMesa(mesa: MesaEstadoEntrada | null | undefined): MesaEstadoVisual {
  if (!mesa) return { clase: 'table-active', tooltip: 'Mesa libre' };

  const tieneCuenta = !!mesa.venta;
  const comandas = mesa.comandas?.length || 0;

  const clase: MesaEstadoVisual['clase'] = mesa.reservado
    ? 'table-reserved'
    : tieneCuenta
    ? 'table-inactive'
    : comandas > 0
    ? 'table-solo-comandas'
    : 'table-active';

  const plural = comandas === 1 ? 'comanda' : 'comandas';
  const sentada = comandas === 1 ? 'sentada' : 'sentadas';
  const tooltip = mesa.reservado
    ? 'Mesa reservada'
    : tieneCuenta && comandas > 0
    ? `Cuenta de mesa + ${comandas} ${plural} — hay ${comandas + 1} cuentas`
    : tieneCuenta
    ? 'Cuenta de mesa abierta'
    : comandas > 0
    ? `Sin cuenta de mesa · ${comandas} ${plural} ${sentada} acá`
    : 'Mesa libre';

  return { clase, tooltip };
}

/** Estado para la card de detalle de la mesa seleccionada. */
export function derivarEstadoDetalleMesa(
  mesa: MesaEstadoEntrada | null | undefined,
): { clase: string; texto: string } {
  if (!mesa) return { clase: '', texto: '' };
  const comandas = mesa.comandas?.length || 0;
  if (mesa.reservado) return { clase: 'status-reserved', texto: 'Reservada' };
  if (mesa.venta) {
    return { clase: 'status-occupied', texto: comandas > 0 ? 'Con cuenta + comandas' : 'Con cuenta' };
  }
  if (comandas > 0) return { clase: 'status-solo-comandas', texto: 'Sin cuenta de mesa' };
  return { clase: 'status-available', texto: 'Libre' };
}
