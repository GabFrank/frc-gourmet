/**
 * Resolución de precios programados por día/horario.
 *
 * Lógica PURA (sin dependencias de Electron/TypeORM) para poder testearla con
 * ts-node. La usan los handlers y, vía IPC, el PdV para elegir qué `PrecioVenta`
 * aplica en un momento dado.
 *
 * Regla: entre los precios candidatos (activos), si hay al menos uno
 * *programado* cuya ventana matchea la fecha/hora dada, gana el de mayor
 * `prioridad`. Si ningún programado matchea, se usa el precio *sin programación*
 * (fallback), prefiriendo el marcado `principal`.
 */

export interface PrecioVigenciaLike {
  id?: number;
  valor?: number;
  principal?: boolean;
  activo?: boolean;
  diasSemana?: string | null;
  horaInicio?: string | null;
  horaFin?: string | null;
  fechaInicio?: Date | string | null;
  fechaFin?: Date | string | null;
  prioridad?: number | null;
}

/** Convierte "YYYY-MM-DD" (o Date) a Date en zona local (evita corrimiento UTC). */
function toLocalDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).slice(0, 10);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

/** "HH:mm" → minutos desde medianoche, o null si inválido. */
function horaAMinutos(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Indica si el precio tiene alguna regla de programación definida. */
export function tieneProgramacion(p: PrecioVigenciaLike): boolean {
  return !!(p.diasSemana || p.horaInicio || p.horaFin || p.fechaInicio || p.fechaFin);
}

/**
 * ¿El precio está vigente en la fecha/hora dada?
 * Un precio sin ninguna regla está siempre vigente (es base/fallback).
 */
export function precioVigenteEn(p: PrecioVigenciaLike, fecha: Date): boolean {
  if (p.activo === false) return false;

  // Día de semana (1=Lun … 7=Dom). getDay(): 0=Dom … 6=Sáb.
  if (p.diasSemana && p.diasSemana.trim()) {
    const diaIso = ((fecha.getDay() + 6) % 7) + 1;
    const dias = p.diasSemana
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (dias.length && !dias.includes(diaIso)) return false;
  }

  // Rango de fechas (inclusivo en ambos extremos, comparando solo fecha).
  const hoy = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const desde = toLocalDate(p.fechaInicio);
  const hasta = toLocalDate(p.fechaFin);
  if (desde && hoy < desde) return false;
  if (hasta && hoy > hasta) return false;

  // Rango horario [inicio, fin). Soporta cruce de medianoche (inicio > fin).
  const ini = horaAMinutos(p.horaInicio);
  const fin = horaAMinutos(p.horaFin);
  if (ini != null || fin != null) {
    const cur = fecha.getHours() * 60 + fecha.getMinutes();
    const desdeMin = ini ?? 0;
    const hastaMin = fin ?? 24 * 60;
    if (desdeMin <= hastaMin) {
      if (cur < desdeMin || cur >= hastaMin) return false;
    } else {
      // Cruza medianoche: ej 22:00–02:00 → vigente si cur>=22:00 o cur<02:00.
      if (cur < desdeMin && cur >= hastaMin) return false;
    }
  }

  return true;
}

/**
 * Elige el precio vigente entre los candidatos para una fecha/hora dada.
 * @returns el precio elegido, o null si no hay candidato activo.
 */
export function resolverPrecioVigente<T extends PrecioVigenciaLike>(
  precios: T[],
  fecha: Date = new Date(),
): T | null {
  const activos = (precios || []).filter((p) => p && p.activo !== false);
  if (!activos.length) return null;

  // 1) Programados que matchean ahora → mayor prioridad gana.
  const programadosVigentes = activos.filter(
    (p) => tieneProgramacion(p) && precioVigenteEn(p, fecha),
  );
  if (programadosVigentes.length) {
    return programadosVigentes.reduce((mejor, actual) =>
      (actual.prioridad ?? 0) > (mejor.prioridad ?? 0) ? actual : mejor,
    );
  }

  // 2) Fallback: precios sin programación. Preferir el principal.
  const base = activos.filter((p) => !tieneProgramacion(p));
  if (base.length) {
    return base.find((p) => p.principal) ?? base[0];
  }

  // 3) Nada programado matchea y no hay base → usar principal o primero.
  return activos.find((p) => p.principal) ?? activos[0];
}
