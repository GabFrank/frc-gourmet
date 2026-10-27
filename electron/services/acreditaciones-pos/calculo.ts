/**
 * Cálculo puro de una acreditación POS (issue #320, docs/planes/PLAN-acreditaciones-pos.md).
 * Sin base de datos ni zona horaria: trabaja con fechas 'YYYY-MM-DD' (día local del negocio)
 * y montos en la unidad de la moneda de la cuenta.
 *
 * Regla verificada con el extracto Bancard crédito (91/91 boletas, 26/9–26/10/2026):
 *  comisión 3 % (redondeada a la unidad y truncada a decenas) + IVA 10 % de la comisión
 *  + retención renta 1 % del bruto + retención IVA 10 % del IVA de la venta (bruto/11)
 *  → neto; acredita 2 días hábiles después del día de proceso.
 */

export type MedioPos = 'QR' | 'DEBITO' | 'CREDITO';
export type TipoDias = 'HABILES' | 'CORRIDOS';
/** PROCESO: el plazo corre desde el día de proceso (la transacción si es hábil, si no el siguiente hábil). */
export type BasePlazo = 'PROCESO' | 'TRANSACCION';
/** NETO: el banco acredita el neto. BRUTO_COMISION_APARTE: acredita el bruto y debita los descuentos aparte. */
export type ModoAcreditacion = 'NETO' | 'BRUTO_COMISION_APARTE';

export interface ReglaAcreditacion {
  plazoDias: number;
  tipoDias: TipoDias;
  base: BasePlazo;
  /** Con días corridos: si la fecha resultante no es hábil, se corre al siguiente hábil. */
  correrAHabil: boolean;
  porcentajeComision: number;
  /** Unidad a la que se trunca la comisión (10 = decenas). 0 o 1 = sin truncar. */
  redondeoComision: number;
  porcentajeIvaComision: number;
  porcentajeRetRenta: number;
  /** Porcentaje que se retiene del IVA contenido en la venta (bruto / divisorIvaVenta). */
  porcentajeRetIva: number;
  divisorIvaVenta: number;
  modo: ModoAcreditacion;
}

export interface ResultadoAcreditacion {
  montoOriginal: number;
  montoComision: number;
  montoIvaComision: number;
  montoRetRenta: number;
  montoRetIva: number;
  /** Total descontado (comisión + IVA + retenciones). */
  descuentoTotal: number;
  montoNeto: number;
  /** Lo que se espera ver entrar en la cuenta (neto, o bruto si la comisión va aparte). */
  montoEsperado: number;
  fechaProceso: string;
  fechaEsperada: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function aDate(iso: string): Date {
  if (!ISO.test(iso)) throw new Error(`FECHA_INVALIDA: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function sumarDias(iso: string, n: number): string {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}

export function esHabil(iso: string, feriados: ReadonlySet<string>): boolean {
  const dow = aDate(iso).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados.has(iso);
}

export function siguienteHabil(iso: string, feriados: ReadonlySet<string>): string {
  let f = iso;
  for (let i = 0; i < 60 && !esHabil(f, feriados); i++) f = sumarDias(f, 1);
  return f;
}

export function fechasAcreditacion(
  regla: Pick<ReglaAcreditacion, 'plazoDias' | 'tipoDias' | 'base' | 'correrAHabil'>,
  fechaTransaccion: string,
  feriados: ReadonlySet<string>,
): { fechaProceso: string; fechaEsperada: string } {
  const plazo = Math.max(0, Math.floor(Number(regla.plazoDias) || 0));
  aDate(fechaTransaccion);
  const fechaProceso = regla.base === 'PROCESO' ? siguienteHabil(fechaTransaccion, feriados) : fechaTransaccion;
  let f = fechaProceso;
  if (regla.tipoDias === 'HABILES') {
    for (let k = 0; k < plazo; ) {
      f = sumarDias(f, 1);
      if (esHabil(f, feriados)) k++;
    }
  } else {
    f = sumarDias(f, plazo);
    if (regla.correrAHabil) f = siguienteHabil(f, feriados);
  }
  return { fechaProceso, fechaEsperada: f };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * `decimales`: decimales de la moneda (0 en guaraníes). Los montos intermedios se redondean a esa precisión.
 */
export function calcularAcreditacion(
  regla: ReglaAcreditacion,
  montoOriginal: number,
  fechaTransaccion: string,
  feriados: ReadonlySet<string> = new Set(),
  decimales = 0,
): ResultadoAcreditacion {
  const bruto = Number(montoOriginal);
  if (!Number.isFinite(bruto) || bruto < 0) throw new Error('MONTO_INVALIDO');
  const p = Math.pow(10, Math.max(0, Math.min(4, decimales)));
  const red = (x: number) => Math.round(x * p) / p;

  let comision = red((bruto * Number(regla.porcentajeComision || 0)) / 100);
  const unidad = Number(regla.redondeoComision || 0);
  if (unidad > 1) comision = Math.floor(comision / unidad) * unidad;
  const ivaComision = red((comision * Number(regla.porcentajeIvaComision || 0)) / 100);
  const retRenta = red((bruto * Number(regla.porcentajeRetRenta || 0)) / 100);
  const divisor = Number(regla.divisorIvaVenta || 0);
  const retIva = divisor > 0 ? red(((bruto / divisor) * Number(regla.porcentajeRetIva || 0)) / 100) : 0;
  const descuento = r2(comision + ivaComision + retRenta + retIva);
  const neto = r2(bruto - descuento);
  const { fechaProceso, fechaEsperada } = fechasAcreditacion(regla, fechaTransaccion, feriados);
  return {
    montoOriginal: bruto,
    montoComision: comision,
    montoIvaComision: ivaComision,
    montoRetRenta: retRenta,
    montoRetIva: retIva,
    descuentoTotal: descuento,
    montoNeto: neto,
    montoEsperado: regla.modo === 'BRUTO_COMISION_APARTE' ? bruto : neto,
    fechaProceso,
    fechaEsperada,
  };
}

/** Día local 'YYYY-MM-DD' de un Date (hora del proceso, que corre en la zona del negocio). */
export function diaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Valores observados en extractos reales, como datos iniciales editables (nada se usa sin cargarlos).
 * `verificada: false` = sin extracto que la confirme: se cargan inactivas.
 */
export const REGLAS_OBSERVADAS: Record<string, { medio: MedioPos; verificada: boolean; regla: ReglaAcreditacion }[]> = {
  BANCARD: [
    {
      medio: 'CREDITO', verificada: true,
      regla: { plazoDias: 2, tipoDias: 'HABILES', base: 'PROCESO', correrAHabil: true, porcentajeComision: 3, redondeoComision: 10,
        porcentajeIvaComision: 10, porcentajeRetRenta: 1, porcentajeRetIva: 10, divisorIvaVenta: 11, modo: 'NETO' },
    },
    {
      medio: 'DEBITO', verificada: false,
      regla: { plazoDias: 0, tipoDias: 'HABILES', base: 'PROCESO', correrAHabil: true, porcentajeComision: 3.7, redondeoComision: 0,
        porcentajeIvaComision: 0, porcentajeRetRenta: 0, porcentajeRetIva: 0, divisorIvaVenta: 11, modo: 'BRUTO_COMISION_APARTE' },
    },
  ],
  UPAY: [
    {
      medio: 'QR', verificada: false,
      regla: { plazoDias: 1, tipoDias: 'CORRIDOS', base: 'TRANSACCION', correrAHabil: true, porcentajeComision: 1.87, redondeoComision: 0,
        porcentajeIvaComision: 0, porcentajeRetRenta: 0, porcentajeRetIva: 0, divisorIvaVenta: 11, modo: 'NETO' },
    },
    {
      medio: 'DEBITO', verificada: false,
      regla: { plazoDias: 1, tipoDias: 'CORRIDOS', base: 'TRANSACCION', correrAHabil: true, porcentajeComision: 1.87, redondeoComision: 0,
        porcentajeIvaComision: 0, porcentajeRetRenta: 0, porcentajeRetIva: 0, divisorIvaVenta: 11, modo: 'NETO' },
    },
    {
      medio: 'CREDITO', verificada: false,
      regla: { plazoDias: 2, tipoDias: 'CORRIDOS', base: 'TRANSACCION', correrAHabil: true, porcentajeComision: 3.78, redondeoComision: 0,
        porcentajeIvaComision: 0, porcentajeRetRenta: 0, porcentajeRetIva: 0, divisorIvaVenta: 11, modo: 'NETO' },
    },
  ],
};
