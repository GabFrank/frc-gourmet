/**
 * Aritmetica del pago consolidado de obligaciones (Caja Mayor).
 *
 * TS puro, sin TypeORM ni Angular: lo consumen el handler de Electron y el
 * componente por igual, y se puede testear sin base de datos.
 *
 * El problema que resuelve: un evento de pago salda N obligaciones cobrando con
 * M lineas de pago, posiblemente en monedas distintas de la moneda de la deuda.
 * Hay que decidir que porcion de cada linea cubre a que obligacion, sin que se
 * pierda ni aparezca un guarani por redondeo.
 *
 * Ver `docs/planes/PLAN-PAGO-CONSOLIDADO-CAJA-MAYOR.md`.
 */

import {
  PagoConcepto,
  PagoOrigenTipo,
  CONCEPTO_BENEFICIARIO_UNICO,
  CONCEPTO_PERMITE_PARCIAL,
  CONCEPTO_SELECCION_UNICA,
} from '../../database/entities/financiero/pago-consolidado-enums';

// ───────────────────────── monedas y redondeo ─────────────────────────

/** El guarani no tiene decimales; el resto asume 2 salvo que la moneda diga otra cosa. */
export function decimalesDeMoneda(moneda: { decimales?: number | null } | null | undefined): number {
  const d = moneda?.decimales;
  return d === null || d === undefined ? 2 : Number(d);
}

export function redondear(valor: number, decimales: number): number {
  const f = Math.pow(10, decimales);
  // Redondeo sobre el entero escalado: evita que 1.005 caiga para abajo por el
  // error binario de coma flotante.
  return Math.round((valor + Number.EPSILON) * f) / f;
}

/**
 * Cuanta diferencia se tolera entre lo que se debe y lo que se paga antes de
 * rechazar el evento. Media unidad minima: 0.005 con 2 decimales, 0.5 en
 * guaranies (donde no se puede pagar una fraccion).
 */
export function toleranciaDe(decimales: number): number {
  return decimales > 0 ? 0.5 / Math.pow(10, decimales) : 0.5;
}

/** Convierte el monto de una linea a la moneda de la deuda. */
export function convertirLinea(montoOrigen: number, cotizacion: number, decimalesDeuda: number): number {
  return redondear(Number(montoOrigen) * Number(cotizacion), decimalesDeuda);
}

// ───────────────────────── tipos ─────────────────────────

export interface ItemAPagar {
  origenTipo: PagoOrigenTipo;
  origenId: number;
  /** Monto a aplicar a esta obligacion, en la moneda de la deuda. */
  monto: number;
  /** Saldo disponible, en la moneda de la deuda. */
  saldoPendiente: number;
  monedaId: number;
  beneficiarioId?: number | null;
  descripcion?: string;
  bloqueado?: boolean;
  bloqueoMotivo?: string;
}

export interface LineaDePago {
  fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
  monedaId: number;
  formaPagoId?: number | null;
  cajaMayorId?: number | null;
  cuentaBancariaId?: number | null;
  /** Monto en la moneda de la linea. */
  monto: number;
  /** Tasa moneda de la linea -> moneda de la deuda. 1 si son la misma. */
  cotizacion: number;
}

/** Una fila del reparto: (obligacion x linea). Es la fila de PagoConsolidadoDetalle. */
export interface FilaReparto {
  itemIdx: number;
  lineaIdx: number;
  /** Porcion de la linea imputada a este item, en la moneda de la LINEA. */
  montoOrigen: number;
  /** Esa misma porcion en la moneda de la DEUDA. Es lo que reduce la obligacion. */
  montoImputado: number;
}

// ───────────────────────── validacion de la seleccion ─────────────────────────

/**
 * Reglas de negocio de la seleccion, ANTES de tocar plata. Devuelve la lista de
 * errores (vacia = todo bien) para poder mostrarlos todos juntos en la UI.
 */
export function validarSeleccion(
  concepto: PagoConcepto,
  items: ItemAPagar[],
  decimalesDeuda: number,
): string[] {
  const errores: string[] = [];
  if (!items.length) {
    errores.push('Seleccioná al menos una obligación para pagar.');
    return errores;
  }

  const bloqueado = items.find((i) => i.bloqueado);
  if (bloqueado) {
    errores.push(bloqueado.bloqueoMotivo || 'Hay una obligación que no se puede pagar.');
  }

  if (CONCEPTO_SELECCION_UNICA[concepto] && items.length > 1) {
    errores.push('La liquidación de sueldo se paga de a una por vez.');
  }

  const monedas = new Set(items.map((i) => i.monedaId));
  if (monedas.size > 1) {
    errores.push('Todas las obligaciones del pago tienen que estar en la misma moneda.');
  }

  if (CONCEPTO_BENEFICIARIO_UNICO[concepto]) {
    const benes = new Set(items.map((i) => i.beneficiarioId ?? null));
    if (benes.size > 1) {
      errores.push('Un pago de compras cubre a un solo proveedor.');
    }
  }

  const tol = toleranciaDe(decimalesDeuda);
  const permiteParcial = CONCEPTO_PERMITE_PARCIAL[concepto];
  for (const i of items) {
    if (!(Number(i.monto) > 0)) {
      errores.push(`El monto a pagar de ${i.descripcion || `#${i.origenId}`} tiene que ser mayor a 0.`);
      continue;
    }
    if (Number(i.monto) > Number(i.saldoPendiente) + tol) {
      errores.push(`${i.descripcion || `#${i.origenId}`}: el monto supera el saldo pendiente.`);
    }
    if (!permiteParcial && Math.abs(Number(i.monto) - Number(i.saldoPendiente)) > tol) {
      errores.push(`${i.descripcion || `#${i.origenId}`} se paga entera o no se paga.`);
    }
  }

  return errores;
}

/**
 * Verifica que las lineas de pago cubran exactamente la deuda seleccionada.
 * La diferencia se admite sólo dentro de la tolerancia de la moneda.
 */
export function validarCobertura(
  items: ItemAPagar[],
  lineas: LineaDePago[],
  decimalesDeuda: number,
): string[] {
  const errores: string[] = [];
  if (!lineas.length) {
    errores.push('Agregá al menos una forma de pago.');
    return errores;
  }
  for (const l of lineas) {
    if (!(Number(l.monto) > 0)) errores.push('Cada forma de pago tiene que tener un monto mayor a 0.');
    if (!(Number(l.cotizacion) > 0)) errores.push('Falta la cotización de una de las formas de pago.');
    if (l.fuente === 'CAJA_MAYOR' && (!l.cajaMayorId || !l.formaPagoId)) {
      errores.push('Una forma de pago por Caja Mayor necesita la caja y la forma.');
    }
    if (l.fuente === 'CUENTA_BANCARIA' && !l.cuentaBancariaId) {
      errores.push('Una forma de pago bancaria necesita la cuenta.');
    }
  }
  if (errores.length) return errores;

  const totalDeuda = sumar(items.map((i) => Number(i.monto)), decimalesDeuda);
  const totalPago = sumar(
    lineas.map((l) => convertirLinea(Number(l.monto), Number(l.cotizacion), decimalesDeuda)),
    decimalesDeuda,
  );
  if (Math.abs(totalPago - totalDeuda) > toleranciaDe(decimalesDeuda)) {
    errores.push(`Las formas de pago suman ${totalPago} y la deuda es ${totalDeuda}.`);
  }
  return errores;
}

function sumar(valores: number[], decimales: number): number {
  return redondear(valores.reduce((s, v) => s + v, 0), decimales);
}

// ───────────────────────── reparto FIFO ─────────────────────────

/**
 * Reparte las lineas de pago entre las obligaciones, en orden, partiendo lineas
 * cuando hace falta.
 *
 * Dos invariantes que se cumplen por construccion, no por tolerancia:
 *
 *   1. Σ montoImputado de las filas de un item  ==  item.monto  (exacto)
 *   2. Σ montoOrigen de las filas de una linea  ==  linea.monto (exacto)
 *
 * El residuo de redondeo entre "lo que suman las lineas convertidas" y "lo que
 * suman las obligaciones" se absorbe ANTES de repartir, ajustando la capacidad
 * de la ultima linea. Asi ninguna obligacion queda PARCIAL por un centavo ni se
 * paga de mas, y la plata que sale de la caja sigue siendo exactamente la que el
 * usuario escribio en cada linea.
 *
 * Trabaja en unidades minimas enteras (guaranies, centavos) para no arrastrar
 * error de coma flotante.
 */
export function repartirFifo(
  items: ItemAPagar[],
  lineas: LineaDePago[],
  decimalesDeuda: number,
  decimalesPorMoneda: (monedaId: number) => number,
): FilaReparto[] {
  const fd = Math.pow(10, decimalesDeuda);
  const aEnteroDeuda = (v: number) => Math.round(redondear(v, decimalesDeuda) * fd);

  const restanteItem = items.map((i) => aEnteroDeuda(Number(i.monto)));
  const totalItems = restanteItem.reduce((s, v) => s + v, 0);

  // Capacidad de cada linea, en unidades minimas de la moneda de la DEUDA.
  const capacidad = lineas.map((l) =>
    aEnteroDeuda(convertirLinea(Number(l.monto), Number(l.cotizacion), decimalesDeuda)),
  );
  const totalCapacidad = capacidad.reduce((s, v) => s + v, 0);

  // El residuo (dentro de tolerancia, ya validado) se absorbe en la ultima linea:
  // el objetivo del reparto es exactamente la deuda, no un rango.
  if (totalCapacidad !== totalItems && capacidad.length) {
    capacidad[capacidad.length - 1] += totalItems - totalCapacidad;
  }

  const filas: FilaReparto[] = [];
  const restanteLinea = [...capacidad];
  // Cuanto monto ORIGEN lleva asignado cada linea, para forzar el cierre exacto.
  const origenAsignado = lineas.map(() => 0);
  const ultimaFilaDeLinea = new Map<number, number>();

  let li = 0;
  for (let ii = 0; ii < items.length; ii++) {
    while (restanteItem[ii] > 0) {
      while (li < lineas.length && restanteLinea[li] <= 0) li++;
      if (li >= lineas.length) break; // no deberia pasar: la cobertura ya se valido

      const imputadoEnt = Math.min(restanteItem[ii], restanteLinea[li]);
      restanteItem[ii] -= imputadoEnt;
      restanteLinea[li] -= imputadoEnt;

      const linea = lineas[li];
      const decLinea = decimalesPorMoneda(linea.monedaId);
      const fl = Math.pow(10, decLinea);
      const montoImputado = imputadoEnt / fd;
      // La porcion de la linea, en SU moneda. Se cierra exacto abajo.
      const montoOrigenEnt = Math.round(redondear(montoImputado / Number(linea.cotizacion), decLinea) * fl);

      origenAsignado[li] += montoOrigenEnt;
      filas.push({
        itemIdx: ii,
        lineaIdx: li,
        montoOrigen: montoOrigenEnt / fl,
        montoImputado,
      });
      ultimaFilaDeLinea.set(li, filas.length - 1);
    }
  }

  // Invariante 2: la suma de montoOrigen de cada linea es EXACTAMENTE su monto.
  // El ajuste va a la ultima fila de esa linea.
  for (let l = 0; l < lineas.length; l++) {
    const idx = ultimaFilaDeLinea.get(l);
    if (idx === undefined) continue;
    const decLinea = decimalesPorMoneda(lineas[l].monedaId);
    const fl = Math.pow(10, decLinea);
    const objetivo = Math.round(redondear(Number(lineas[l].monto), decLinea) * fl);
    const diff = objetivo - origenAsignado[l];
    if (diff !== 0) {
      filas[idx].montoOrigen = redondear(filas[idx].montoOrigen + diff / fl, decLinea);
    }
  }

  return filas;
}

/** Total imputado a cada item, en la moneda de la deuda. Lo que recibe el adaptador. */
export function imputadoPorItem(
  filas: FilaReparto[],
  cantidadItems: number,
  decimalesDeuda: number,
): number[] {
  const acum = new Array(cantidadItems).fill(0);
  for (const f of filas) acum[f.itemIdx] += f.montoImputado;
  return acum.map((v) => redondear(v, decimalesDeuda));
}

/** Total que sale por cada linea fisica, en la moneda de la linea. */
export function origenPorLinea(
  filas: FilaReparto[],
  cantidadLineas: number,
  decimalesPorLinea: (lineaIdx: number) => number,
): number[] {
  const acum = new Array(cantidadLineas).fill(0);
  for (const f of filas) acum[f.lineaIdx] += f.montoOrigen;
  return acum.map((v, i) => redondear(v, decimalesPorLinea(i)));
}

// ───────────────────────── etiqueta del evento ─────────────────────────

const PLURAL: Record<PagoConcepto, [string, string]> = {
  [PagoConcepto.COMPRA]: ['cuota de compra', 'cuotas de compra'],
  [PagoConcepto.GASTO]: ['gasto', 'gastos'],
  [PagoConcepto.VALE]: ['vale', 'vales'],
  [PagoConcepto.LIQUIDACION_SUELDO]: ['liquidación de sueldo', 'liquidaciones de sueldo'],
};

/**
 * Etiqueta del movimiento consolidado. Con N > 1 no puede nombrar a las N
 * obligaciones — para eso esta el dialogo de detalle.
 */
export function descripcionEvento(
  concepto: PagoConcepto,
  cantidad: number,
  beneficiario?: string | null,
  descripcionUnica?: string | null,
): string {
  const [sing, plur] = PLURAL[concepto];
  if (cantidad === 1 && descripcionUnica) {
    return `PAGO DE ${descripcionUnica}`.toUpperCase();
  }
  const base = cantidad === 1
    ? `PAGO DE 1 ${sing}`
    : `PAGO CONSOLIDADO DE ${cantidad} ${plur}`;
  return (beneficiario ? `${base} — ${beneficiario}` : base).toUpperCase();
}
