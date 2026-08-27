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
  CONCEPTO_BENEFICIARIO_UNICO_ERROR,
  CONCEPTO_ES_INGRESO,
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
  /**
   * `DESCUENTO` no es una fuente de fondos: no mueve plata. Cubre deuda para que
   * la obligacion quede saldada, y por eso participa del reparto como una linea
   * mas, pero no genera movimiento fisico.
   */
  fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA' | 'DESCUENTO';
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

  // Sin esto, mandar la misma obligacion dos veces en `items` la procesa dos
  // veces: `montoCobrado` supera al monto de la cuota y el saldo del deudor queda
  // mal. El wizard nunca lo genera, pero `/api/rpc` acepta el payload crudo.
  const ids = new Set<string>();
  for (const i of items) {
    const k = `${i.origenTipo}|${i.origenId}`;
    if (ids.has(k)) {
      errores.push(`La obligación ${i.descripcion || `#${i.origenId}`} está repetida en la selección.`);
      break;
    }
    ids.add(k);
  }

  const monedas = new Set(items.map((i) => i.monedaId));
  if (monedas.size > 1) {
    errores.push('Todas las obligaciones del pago tienen que estar en la misma moneda.');
  }

  if (CONCEPTO_BENEFICIARIO_UNICO[concepto]) {
    const benes = new Set(items.map((i) => i.beneficiarioId ?? null));
    if (benes.size > 1) {
      errores.push(CONCEPTO_BENEFICIARIO_UNICO_ERROR[concepto]);
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
  // La moneda de la deuda sale de los items: `validarSeleccion` ya garantizo que
  // sea unica, asi que no hace falta pasarla por separado.
  const monedaDeudaId = items.length ? Number(items[0].monedaId) : null;
  let descuentos = 0;
  for (const l of lineas) {
    if (!(Number(l.monto) > 0)) errores.push('Cada forma de pago tiene que tener un monto mayor a 0.');
    if (!(Number(l.cotizacion) > 0)) errores.push('Falta la cotización de una de las formas de pago.');
    if (l.fuente === 'CAJA_MAYOR' && (!l.cajaMayorId || !l.formaPagoId)) {
      errores.push('Una forma de pago por Caja Mayor necesita la caja y la forma.');
    }
    if (l.fuente === 'CUENTA_BANCARIA' && !l.cuentaBancariaId) {
      errores.push('Una forma de pago bancaria necesita la cuenta.');
    }
    if (l.fuente === 'DESCUENTO') {
      descuentos++;
      // Un descuento en otra moneda no significa nada: lo que se perdona es deuda,
      // y la deuda esta denominada en una sola moneda.
      if (monedaDeudaId != null && Number(l.monedaId) !== monedaDeudaId) {
        errores.push('El descuento tiene que estar en la moneda de la deuda.');
      }
      if (Number(l.cotizacion) !== 1) {
        errores.push('El descuento no lleva cotización: va 1 a 1 contra la deuda.');
      }
      if (l.cajaMayorId || l.cuentaBancariaId || l.formaPagoId) {
        errores.push('El descuento no sale de ninguna caja ni cuenta.');
      }
    }
  }
  if (descuentos > 1) errores.push('Se admite un solo descuento por evento.');
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
  //
  // En el camino real `validarCobertura` corre justo antes con los mismos
  // decimales, asi que las dos sumas ya coinciden y este ajuste es 0. Se deja
  // porque el util es reutilizable y no puede asumir que alguien valido antes —
  // pero si el ajuste dejara la capacidad en negativo, el reparto quedaria mal y
  // conviene enterarse en vez de repartir cualquier cosa.
  if (totalCapacidad !== totalItems && capacidad.length) {
    const ultima = capacidad.length - 1;
    capacidad[ultima] += totalItems - totalCapacidad;
    if (capacidad[ultima] < 0) {
      throw new Error('El reparto del pago no cierra: las formas de pago no cubren la deuda.');
    }
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

/**
 * Devuelve un array NUEVO con las lineas de descuento al final y el resto en su
 * orden original. El descuento va ultimo para que el efectivo impute primero: la
 * obligacion que termina "perdonada" es la ultima de la seleccion, no una del
 * medio elegida por el azar del orden en que el usuario cargo las lineas.
 *
 * ⚠️ El handler tiene que REASIGNAR su variable con el resultado
 * (`lineas = ordenarLineasParaReparto(lineas)`) ANTES de llamar a `repartirFifo`,
 * y usar esa misma referencia en todo lo que despues indexe por `FilaReparto.lineaIdx`
 * (construccion del detalle, desglose por fuente). `lineaIdx` es una posicion
 * dentro del array que recibio `repartirFifo`: si se reparte sobre un array y se
 * indexa sobre otro, el desglose "cuanto pago / cuanto se le perdono" sale mal sin
 * lanzar ningun error. No se devuelve una tabla de traduccion de indices a
 * proposito: seria mas superficie para el mismo bug.
 */
export function ordenarLineasParaReparto(lineas: LineaDePago[]): LineaDePago[] {
  const pagos = lineas.filter((l) => l.fuente !== 'DESCUENTO');
  const descuentos = lineas.filter((l) => l.fuente === 'DESCUENTO');
  return [...pagos, ...descuentos];
}

/**
 * Total imputado a cada item, separando lo que entro como plata de lo que se
 * condono. Siempre devuelve una entrada por item (con ceros), nunca claves
 * ausentes: el adaptador lo usa para decidir cuanto registra como PAGO y cuanto
 * como AJUSTE_NEGATIVO en la cuenta corriente del cliente.
 */
export function imputadoPorItemPorFuente(
  filas: FilaReparto[],
  lineas: LineaDePago[],
  cantidadItems: number,
  decimalesDeuda: number,
): Array<{ total: number; descuento: number }> {
  const total = new Array(cantidadItems).fill(0);
  const descuento = new Array(cantidadItems).fill(0);
  for (const f of filas) {
    total[f.itemIdx] += f.montoImputado;
    if (lineas[f.lineaIdx]?.fuente === 'DESCUENTO') descuento[f.itemIdx] += f.montoImputado;
  }
  return total.map((v, i) => ({
    total: redondear(v, decimalesDeuda),
    descuento: redondear(descuento[i], decimalesDeuda),
  }));
}

/**
 * Total imputado a cada item, en la moneda de la deuda.
 *
 * Envuelve a `imputadoPorItemPorFuente` en vez de repetir la suma: dos
 * implementaciones paralelas de la misma aritmetica se desincronizan sin que
 * nadie se entere.
 */
export function imputadoPorItem(
  filas: FilaReparto[],
  cantidadItems: number,
  decimalesDeuda: number,
): number[] {
  return imputadoPorItemPorFuente(filas, [], cantidadItems, decimalesDeuda).map((x) => x.total);
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
  [PagoConcepto.COBRO_CLIENTE]: ['cuota de cliente', 'cuotas de cliente'],
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
  // Un evento de ingreso es un COBRO: llamarlo "pago" en el movimiento de caja
  // confunde a quien despues lee la planilla.
  const verbo = CONCEPTO_ES_INGRESO[concepto] ? 'COBRO' : 'PAGO';
  if (cantidad === 1 && descripcionUnica) {
    return `${verbo} DE ${descripcionUnica}`.toUpperCase();
  }
  const base = cantidad === 1
    ? `${verbo} DE 1 ${sing}`
    : `${verbo} CONSOLIDADO DE ${cantidad} ${plur}`;
  return (beneficiario ? `${base} — ${beneficiario}` : base).toUpperCase();
}
