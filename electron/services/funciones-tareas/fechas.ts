/**
 * Fechas del módulo Funciones y Tareas (FT), siempre en hora LOCAL.
 *
 * Nunca `toISOString()` para obtener el día: en Paraguay (UTC-3) a las 21:00 ya es
 * «mañana» en UTC (lección #249, mismo criterio que `musica-planner.service.ts`).
 * `fechaDisciplina.fechaIso` de DR no sirve acá por ese motivo (§10 A8).
 */
import { DataSource } from 'typeorm';
import { fechaParamSql } from '../../utils/date.utils';

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

let relojFijo: Date | null = null;

/** Hora actual del módulo. Los tests la fijan con `fijarRelojFt` (motor y handlers usan la misma). */
export function ahoraFt(): Date {
  return relojFijo ? new Date(relojFijo.getTime()) : new Date();
}

/** Solo para tests: fija (o con null, libera) la hora del módulo. */
export function fijarRelojFt(d: Date | null): void {
  relojFijo = d ? new Date(d.getTime()) : null;
}

/** 'YYYY-MM-DD' local de un Date. */
export function fechaLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Hoy en hora local, 'YYYY-MM-DD'. */
export function fechaLocalHoy(): string {
  return fechaLocal(ahoraFt());
}

export function esDiaValido(s: unknown): s is string {
  if (typeof s !== 'string' || !RE_DIA.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
}

export function esHoraValida(s: unknown): s is string {
  return typeof s === 'string' && RE_HORA.test(s);
}

/**
 * Normaliza un valor de columna `date` a 'YYYY-MM-DD'. TypeORM devuelve string; si llega
 * un Date (driver o cliente), se toma su día LOCAL.
 */
export function diaDe(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return fechaLocal(v);
  const s = String(v).slice(0, 10);
  return RE_DIA.test(s) ? s : null;
}

/** Suma días a 'YYYY-MM-DD' (aritmética de calendario local). */
export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  return fechaLocal(new Date(y, m - 1, d + n));
}

/** Date local del día + 'HH:mm' (+ días extra, para turnos que cruzan medianoche). */
export function enHora(dia: string, hhmm: string, diasExtra = 0): Date {
  const [y, m, d] = dia.split('-').map(Number);
  const [hh, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d + diasExtra, hh, mi, 0, 0);
}

export function sumarMinutos(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

/** Minutos desde 00:00 de 'HH:mm'. */
export function minutosDe(hhmm: string): number {
  const [hh, mi] = hhmm.split(':').map(Number);
  return hh * 60 + mi;
}

/** Bit del día de la semana (lunes=1, martes=2 … domingo=64), como `ft_plantilla_tarea.dias_semana`. */
export function bitDiaSemana(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return dow === 0 ? 64 : 1 << (dow - 1);
}

/** Último día del mes de 'YYYY-MM-DD'. */
export function ultimoDiaMes(dia: string): number {
  const [y, m] = dia.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Parámetro para comparar contra una columna datetime/timestamp en SQL.
 * SQLite: `fechaParamSql` (TEXT UTC con espacio, como lo guarda TypeORM).
 * Postgres: el Date tal cual. La columna es `timestamp` SIN zona y node-pg escribe y lee
 * los Date en hora local; un ISO con `Z` se compararía corrido por el huso (en UTC-3, 3 h).
 */
export function paramTs(ds: DataSource, d: Date): Date | string {
  return ds.options.type === 'postgres' ? d : fechaParamSql(ds, d);
}
