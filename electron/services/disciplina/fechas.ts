/**
 * Utilidades de fecha puras sobre strings 'YYYY-MM-DD' (sin zona horaria: se usa UTC
 * solo como aritmética de calendario, nunca para "ahora").
 */
import { DisciplinaError } from './errores';

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

/** Normaliza 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm…' a 'YYYY-MM-DD'. */
export function normalizarFecha(fecha: string): string {
  const m = RE_FECHA.exec(String(fecha ?? ''));
  if (!m) throw new DisciplinaError('FECHA_INVALIDA', `FECHA INVÁLIDA: ${fecha}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function aUtc(fecha: string): Date {
  const [y, m, d] = normalizarFecha(fecha).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function deUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM' del día. */
export function mesDe(fecha: string): string {
  return normalizarFecha(fecha).slice(0, 7);
}

/** Primer día del mes calendario de la fecha. */
export function inicioMes(fecha: string): string {
  return `${mesDe(fecha)}-01`;
}

/**
 * Primer día de la semana que contiene la fecha.
 * @param inicioSemana día ISO en que arranca la semana: 1 = lunes (default) … 7 = domingo.
 */
export function inicioSemana(fecha: string, inicioSemanaIso = 1): string {
  if (!Number.isInteger(inicioSemanaIso) || inicioSemanaIso < 1 || inicioSemanaIso > 7) {
    throw new DisciplinaError('INICIO_SEMANA_INVALIDO', `INICIO DE SEMANA INVÁLIDO: ${inicioSemanaIso}`);
  }
  const d = aUtc(fecha);
  const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const retroceso = (iso - inicioSemanaIso + 7) % 7;
  d.setUTCDate(d.getUTCDate() - retroceso);
  return deUtc(d);
}

/** 'YYYY-MM' siguiente. */
export function mesSiguiente(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) throw new DisciplinaError('MES_INVALIDO', `MES INVÁLIDO: ${mes}`);
  let y = Number(m[1]);
  let mm = Number(m[2]) + 1;
  if (mm > 12) { mm = 1; y++; }
  return `${y}-${String(mm).padStart(2, '0')}`;
}
