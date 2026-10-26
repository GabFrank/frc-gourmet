/**
 * Funciones y Tareas (FT) — fase 5: consultas de solo lectura para el bot Gerente y los reportes
 * (PLAN-funciones-tareas.md §5 «Lectura para el Gerente» y §11 C3/C4).
 *
 * Todas: `ensurePermission` con RRHH_FT_REPORTES o RRHH_FT_VER_TODO; rango ≤ 31 días validado.
 * Cumplimiento = (HECHA + VERIFICADA) / (asignadas − NO_APLICA). PENDIENTE, RECHAZADA y VENCIDA
 * no cuentan como cumplidas.
 */
import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { FtTarea } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea.entity';
import { FtEstadoTarea } from '../../src/app/database/entities/rrhh/funciones-tareas/ft.enums';
import { ensurePermission } from '../utils/auth.utils';
import { ahoraFt, esDiaValido, fechaLocal, fechaLocalHoy, sumarDias } from '../services/funciones-tareas/fechas';
import { FT_CLAVES, leerConfigFt, motorFtActivo, intervaloMotorMin } from '../services/funciones-tareas/config';
import { cargoVigente, turnoVigente, funcionarioVigente } from '../services/funciones-tareas/vigencia';

const PERMISOS_LECTURA = ['RRHH_FT_REPORTES', 'RRHH_FT_VER_TODO'];
const MAX_DIAS_RANGO = 31;

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

function dia(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = v instanceof Date ? fechaLocal(v) : String(v).slice(0, 10);
  if (!esDiaValido(s)) fail('VALIDACION', `${campo.toUpperCase()} INVÁLIDA (YYYY-MM-DD)`);
  return s;
}

/** desde/hasta (def. hoy); con `mes` (YYYY-MM) toma el mes entero. */
export function rangoLecturaFt(f: any, hoy: string = fechaLocalHoy()): { desde: string; hasta: string } {
  if (f?.mes) {
    const mes = String(f.mes);
    if (!/^\d{4}-\d{2}$/.test(mes) || !esDiaValido(`${mes}-01`)) fail('VALIDACION', 'MES INVÁLIDO (YYYY-MM)');
    const desde = `${mes}-01`;
    let hasta = desde;
    while (sumarDias(hasta, 1).slice(0, 7) === mes) hasta = sumarDias(hasta, 1);
    return { desde, hasta };
  }
  const desde = dia(f?.desde, 'desde') ?? hoy;
  const hasta = dia(f?.hasta, 'hasta') ?? desde;
  if (desde > hasta) fail('VALIDACION', 'EL RANGO TERMINA ANTES DE EMPEZAR');
  if (sumarDias(desde, MAX_DIAS_RANGO - 1) < hasta) fail('RANGO_EXCEDIDO', `EL RANGO MÁXIMO ES DE ${MAX_DIAS_RANGO} DÍAS`);
  return { desde, hasta };
}

function nombre(f: Funcionario | null | undefined): string {
  const p: any = f?.persona;
  return p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : '';
}

export interface ConteoFt { asignadas: number; hechas: number; verificadas: number; vencidas: number; sinVerificar: number; noAplica: number; rechazadas: number; pendientes: number; }
const conteoVacio = (): ConteoFt => ({ asignadas: 0, hechas: 0, verificadas: 0, vencidas: 0, sinVerificar: 0, noAplica: 0, rechazadas: 0, pendientes: 0 });

function sumar(c: ConteoFt, t: { estado: FtEstadoTarea }): void {
  c.asignadas++;
  switch (t.estado) {
    case FtEstadoTarea.HECHA: c.hechas++; c.sinVerificar++; break;
    case FtEstadoTarea.VERIFICADA: c.verificadas++; break;
    case FtEstadoTarea.VENCIDA: c.vencidas++; break;
    case FtEstadoTarea.NO_APLICA: c.noAplica++; break;
    case FtEstadoTarea.RECHAZADA: c.rechazadas++; break;
    default: c.pendientes++;
  }
}

/** % de cumplimiento (0–100, 1 decimal) o null si no hay tareas que cuenten. */
export function porcentajeFt(c: ConteoFt): number | null {
  const base = c.asignadas - c.noAplica;
  return base > 0 ? Math.round(((c.hechas + c.verificadas) * 1000) / base) / 10 : null;
}

/** Lunes (YYYY-MM-DD) de la semana de `d`. */
export function lunesDe(d: string): string {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(d, -((dow + 6) % 7));
}

const idOpc = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function registerFuncionesTareasLecturaHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  async function tareasDe(desde: string, hasta: string, funcionarioId?: number | null): Promise<FtTarea[]> {
    const qb = dataSource.getRepository(FtTarea).createQueryBuilder('t')
      .leftJoinAndSelect('t.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'pe')
      .leftJoinAndSelect('t.plantilla', 'p')
      .where('t.fecha >= :desde AND t.fecha <= :hasta', { desde, hasta })
      .orderBy('t.fecha', 'ASC').addOrderBy('t.vence', 'ASC').addOrderBy('t.id', 'ASC');
    if (funcionarioId) qb.andWhere('f.id = :fid', { fid: funcionarioId });
    return qb.getMany();
  }

  /**
   * Cumplimiento agrupado. filtros: { desde, hasta | mes, agrupar?: 'persona' (def.) | 'cargo' | 'turno', funcionarioId? }.
   * Cargo y turno: los vigentes del funcionario el día de cada tarea. Orden: peor cumplimiento primero.
   */
  ipcMain.handle('ft-cumplimiento', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA);
    const { desde, hasta } = rangoLecturaFt(filtros);
    const agrupar = filtros?.agrupar ?? 'persona';
    if (!['persona', 'cargo', 'turno'].includes(agrupar)) fail('VALIDACION', 'AGRUPAR INVÁLIDO (persona | cargo | turno)');
    const tareas = await tareasDe(desde, hasta, idOpc(filtros?.funcionarioId));
    const cache = new Map<string, { id: number | null; nombre: string }>();
    const grupos = new Map<string, { id: number | null; nombre: string; c: ConteoFt }>();
    const total = conteoVacio();
    for (const t of tareas) {
      let g: { id: number | null; nombre: string };
      if (agrupar === 'persona') {
        g = { id: t.funcionario.id, nombre: nombre(t.funcionario) };
      } else {
        const k = `${t.funcionario.id}|${t.fecha}`;
        let v = cache.get(k);
        if (!v) {
          const x: any = agrupar === 'cargo' ? await cargoVigente(dataSource, t.funcionario.id, t.fecha) : await turnoVigente(dataSource, t.funcionario.id, t.fecha);
          v = x ? { id: x.id, nombre: x.nombre } : { id: null, nombre: agrupar === 'cargo' ? 'SIN CARGO' : 'SIN TURNO' };
          cache.set(k, v);
        }
        g = v;
      }
      const key = String(g.id ?? 'null');
      if (!grupos.has(key)) grupos.set(key, { ...g, c: conteoVacio() });
      sumar(grupos.get(key)!.c, t);
      sumar(total, t);
    }
    return {
      desde, hasta, agrupar,
      total: { ...total, cumplimiento: porcentajeFt(total) },
      filas: [...grupos.values()]
        .map((g) => ({ id: g.id, nombre: g.nombre, ...g.c, cumplimiento: porcentajeFt(g.c) }))
        .sort((a, b) => (a.cumplimiento ?? 101) - (b.cumplimiento ?? 101) || a.nombre.localeCompare(b.nombre)),
    };
  });

  /**
   * Vencidas: las VENCIDA y las PENDIENTE/RECHAZADA cuyo vencimiento ya pasó (el motor todavía
   * no las procesó). filtros: { desde, hasta (≤ 31 días), funcionarioId?, soloCriticas? }.
   * `atrasoMin`: minutos entre el vencimiento y ahora.
   */
  ipcMain.handle('ft-vencidas', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA);
    const { desde, hasta } = rangoLecturaFt(filtros);
    const ahora = ahoraFt();
    const abiertas = [FtEstadoTarea.PENDIENTE, FtEstadoTarea.RECHAZADA];
    return (await tareasDe(desde, hasta, idOpc(filtros?.funcionarioId)))
      .filter((t) => t.estado === FtEstadoTarea.VENCIDA || (abiertas.includes(t.estado) && new Date(t.vence) < ahora))
      .filter((t) => !filtros?.soloCriticas || t.critica)
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        fecha: t.fecha,
        vence: t.vence,
        estado: t.estado,
        critica: t.critica,
        nivelEscalado: t.nivelEscalado,
        plantillaId: t.plantilla?.id ?? null,
        responsable: { id: t.funcionario.id, nombre: nombre(t.funcionario) },
        atrasoMin: Math.max(0, Math.round((ahora.getTime() - new Date(t.vence).getTime()) / 60000)),
      }));
  });

  /**
   * Histórico por semana (lunes) o mes. filtros: { desde, hasta | mes, por?: 'semana' (def.) | 'mes', funcionarioId? }.
   * Por período y persona: conteos y %. `reincidencias`: misma plantilla vencida 2 o más veces en el rango.
   */
  ipcMain.handle('ft-historico', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA);
    const { desde, hasta } = rangoLecturaFt(filtros);
    const por = filtros?.por ?? 'semana';
    if (!['semana', 'mes'].includes(por)) fail('VALIDACION', 'POR INVÁLIDO (semana | mes)');
    const tareas = await tareasDe(desde, hasta, idOpc(filtros?.funcionarioId));
    const periodos = new Map<string, Map<number, { nombre: string; c: ConteoFt }>>();
    const rein = new Map<string, { funcionarioId: number; nombre: string; plantillaId: number; titulo: string; veces: number }>();
    for (const t of tareas) {
      const per = por === 'mes' ? t.fecha.slice(0, 7) : lunesDe(t.fecha);
      if (!periodos.has(per)) periodos.set(per, new Map());
      const m = periodos.get(per)!;
      if (!m.has(t.funcionario.id)) m.set(t.funcionario.id, { nombre: nombre(t.funcionario), c: conteoVacio() });
      sumar(m.get(t.funcionario.id)!.c, t);
      if (t.estado === FtEstadoTarea.VENCIDA && t.plantilla) {
        const k = `${t.funcionario.id}|${t.plantilla.id}`;
        const v = rein.get(k) ?? { funcionarioId: t.funcionario.id, nombre: nombre(t.funcionario), plantillaId: t.plantilla.id, titulo: t.titulo, veces: 0 };
        v.veces++;
        rein.set(k, v);
      }
    }
    return {
      desde, hasta, por,
      periodos: [...periodos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, m]) => ({
        periodo,
        personas: [...m.entries()].map(([id, x]) => ({ id, nombre: x.nombre, ...x.c, cumplimiento: porcentajeFt(x.c) })),
      })),
      reincidencias: [...rein.values()].filter((v) => v.veces >= 2).sort((a, b) => b.veces - a.veces),
    };
  });

  /** Quiénes tienen turno hoy (o `fecha`), con cargo, turno y sus tareas del día por estado. */
  ipcMain.handle('ft-de-turno-hoy', async (_e, fechaArg?: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA);
    const fecha = dia(fechaArg, 'fecha') ?? fechaLocalHoy();
    const funcs = await dataSource.getRepository(Funcionario).find({ where: { activo: true } as any, relations: ['persona'] });
    const tareas = await tareasDe(fecha, fecha);
    const out: any[] = [];
    for (const f of funcs) {
      if (!funcionarioVigente(f, fecha)) continue;
      const turno = await turnoVigente(dataSource, f.id, fecha);
      if (!turno) continue;
      const cargo = await cargoVigente(dataSource, f.id, fecha);
      const c = conteoVacio();
      tareas.filter((t) => t.funcionario.id === f.id).forEach((t) => sumar(c, t));
      out.push({
        funcionario: { id: f.id, nombre: nombre(f) },
        cargo: cargo ? { id: cargo.id, nombre: cargo.nombre } : null,
        turno: { id: turno.id, nombre: turno.nombre, horaEntrada: turno.horaEntrada, horaSalida: turno.horaSalida },
        tareas: { ...c, cumplimiento: porcentajeFt(c) },
      });
    }
    out.sort((a, b) => String(a.turno.horaEntrada).localeCompare(String(b.turno.horaEntrada)) || a.funcionario.nombre.localeCompare(b.funcionario.nombre));
    return { fecha, personas: out };
  });

  /** Estado del motor: activo, intervalo y último tick (si la app está generando tareas y avisos). */
  ipcMain.handle('ft-estado-motor', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA);
    const crudo = await leerConfigFt(dataSource, FT_CLAVES.ULTIMO_TICK);
    let ultimoTick: any = null;
    try { ultimoTick = crudo ? JSON.parse(crudo) : null; } catch { ultimoTick = { en: crudo }; }
    const intervaloMin = await intervaloMotorMin(dataSource);
    const ms = ultimoTick?.en ? Date.parse(ultimoTick.en) : NaN;
    const minutosDesdeUltimoTick = Number.isFinite(ms) ? Math.round((ahoraFt().getTime() - ms) / 60000) : null;
    return {
      activo: await motorFtActivo(dataSource),
      intervaloMin,
      ultimoTick,
      minutosDesdeUltimoTick,
      /** Más de 3 intervalos sin tick: servidor apagado o motor trabado. */
      atrasado: minutosDesdeUltimoTick == null || minutosDesdeUltimoTick > intervaloMin * 3,
    };
  });
}
