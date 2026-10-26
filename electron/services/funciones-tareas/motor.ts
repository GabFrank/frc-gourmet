/**
 * Motor de Funciones y Tareas (FT): generación, vencimiento, avisos y eventos.
 * Ver docs/planes/PLAN-funciones-tareas.md §4, §10 (A3, A8, A9) y §11.
 *
 * Cada tick (solo en el proceso dueño de la base: standalone o server, nunca client):
 *  1. Generar: funcionarios vigentes × cargo vigente × turno vigente × plantillas aplicables,
 *     para hoy y ayer (un turno nocturno de ayer puede seguir abierto). INSERT idempotente:
 *     UNIQUE (plantilla, funcionario, fecha, evento_ref) — dos ticks dejan las mismas tareas.
 *     Solo se crean tareas que todavía no vencieron (si el server estuvo apagado, no aparecen
 *     de golpe tareas ya vencidas).
 *  2. Vencer: PENDIENTE o RECHAZADA con `vence` < ahora → VENCIDA.
 *  3. Ausente (sin marcación tras la tolerancia) con tarea crítica → aviso al encargado.
 *  4. Avisos según `ft_regla_aviso` (dedupe `ft_aviso_enviado`), escalamiento y nivel 3 →
 *     `ft_propuesta_falta` PENDIENTE (ver avisos.ts). Otros pasos: `registrarPasoTickFt`.
 * Eventos (caja/compra): `ftOnEvento`, llamado post-commit desde los hooks (eventos.ts).
 *
 * Interruptor global `ft_config.activo` (apagado por defecto). Para varias PC sobre el mismo
 * Postgres, lock en base: fila `ft_config.motor_lock` con dueño + expiración, tomada con un
 * UPDATE condicional (compare-and-swap sobre el valor leído).
 */
import * as os from 'os';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { Funcionario } from '../../../src/app/database/entities/rrhh/funcionario.entity';
import { HistoricoCargo } from '../../../src/app/database/entities/rrhh/historico-cargo.entity';
import { FuncionarioTurno } from '../../../src/app/database/entities/rrhh/funcionario-turno.entity';
import { Turno } from '../../../src/app/database/entities/rrhh/turno.entity';
import { Cargo } from '../../../src/app/database/entities/rrhh/cargo.entity';
import { DrGrupoMiembro } from '../../../src/app/database/entities/rrhh/disciplina/dr-grupo-miembro.entity';
import { FtConfig } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-config.entity';
import { FtPlantillaTarea } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-plantilla-tarea.entity';
import { FtTarea } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea.entity';
import { FtTareaItem } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea-item.entity';
import {
  FtAncla, FtEstadoTarea, FtEvento, FtEventoCaja, FtOrigenTarea, FtRecurrencia, FtTipoTarea,
} from '../../../src/app/database/entities/rrhh/funciones-tareas/ft.enums';
import {
  ahoraFt, bitDiaSemana, diaDe, enHora, esHoraValida, fechaLocal, minutosDe, paramTs, sumarDias, sumarMinutos, ultimoDiaMes,
} from './fechas';
import { FT_CLAVES, escribirConfigFt, intervaloMotorMin, motorFtActivo } from './config';
import { cargoVigenteDe, funcionarioVigente, turnoVigenteDe } from './vigencia';
import { pasoAusentesFt, pasoAvisosFt } from './avisos';
import { enTransaccionSiPostgres } from '../../utils/tx.utils';

// ───────────────────────── Reglas puras ─────────────────────────

/** Turno nocturno: la salida es igual o anterior a la entrada (cruza medianoche). */
export function esTurnoNocturno(t: Pick<Turno, 'horaEntrada' | 'horaSalida'>): boolean {
  return minutosDe(hhmm(t.horaSalida)!) <= minutosDe(hhmm(t.horaEntrada)!);
}

function hhmm(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 5);
  return esHoraValida(s) ? s : null;
}

function turnoValido(t: Turno | null): t is Turno {
  return !!t && !!hhmm(t.horaEntrada) && !!hhmm(t.horaSalida);
}

/** Si la plantilla corresponde a ese día por recurrencia y vigencia (EVENTO nunca: las genera `ftOnEvento`). */
export function aplicaEnDia(p: FtPlantillaTarea, dia: string): boolean {
  const desde = diaDe(p.vigenciaDesde);
  const hasta = diaDe(p.vigenciaHasta);
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  switch (p.recurrencia) {
    case FtRecurrencia.DIARIA:
      return true;
    case FtRecurrencia.DIAS_SEMANA:
      return ((Number(p.diasSemana) || 0) & bitDiaSemana(dia)) !== 0;
    case FtRecurrencia.MENSUAL: {
      const dm = Number(p.diaMes) || 0;
      if (dm < 1) return false;
      const efectivo = Math.min(dm, ultimoDiaMes(dia)); // 31 en un mes de 30 = último día
      return Number(dia.slice(8, 10)) === efectivo;
    }
    case FtRecurrencia.UNICA:
      return diaDe(p.fechaUnica) === dia;
    default:
      return false;
  }
}

/**
 * Ventana [inicio, vence] de la plantilla para el día de entrada al turno.
 * Sin turno solo hay ventana con HORA_FIJA (§9). En un turno nocturno, una HORA_FIJA
 * anterior o igual a la salida (00:00–salida inclusive) cae en la madrugada siguiente (sigue siendo la tarea
 * de ese turno).
 */
export function ventanaDe(p: FtPlantillaTarea, dia: string, turno: Turno | null): { inicio: Date; vence: Date } | null {
  const offset = Number(p.offsetInicioMin) || 0;
  const dur = Math.max(1, Number(p.duracionMin) || 0);
  const t = turnoValido(turno) ? turno : null;
  const nocturno = !!t && esTurnoNocturno(t);
  let base: Date;
  switch (p.ancla) {
    case FtAncla.INICIO_TURNO:
      if (!t) return null;
      base = enHora(dia, hhmm(t.horaEntrada)!);
      break;
    case FtAncla.FIN_TURNO:
      if (!t) return null;
      base = enHora(dia, hhmm(t.horaSalida)!, nocturno ? 1 : 0);
      break;
    case FtAncla.HORA_FIJA: {
      const h = hhmm(p.horaFija);
      if (!h) return null;
      // Turno nocturno: una hora entre 00:00 y la salida es la madrugada del día siguiente.
      const madrugada = nocturno && minutosDe(h) <= minutosDe(hhmm(t!.horaSalida)!);
      base = enHora(dia, h, madrugada ? 1 : 0);
      break;
    }
    default:
      return null; // EVENTO: la ventana la arma ftOnEvento
  }
  const inicio = sumarMinutos(base, offset);
  return { inicio, vence: sumarMinutos(inicio, dur) };
}

/**
 * Plantillas que le tocan a un funcionario (sin mirar recurrencia): generales del cargo
 * vigente (con o sin turno), del área (grupo DR) y las específicas suyas. Una específica
 * con `reemplazaPlantilla` saca a esa general mientras esté vigente.
 */
export function plantillasDelFuncionario(
  plantillas: FtPlantillaTarea[],
  funcionarioId: number,
  cargo: Cargo | null,
  turno: Turno | null,
  grupos: Set<number>,
): FtPlantillaTarea[] {
  const especificas = plantillas.filter((p) => p.funcionario?.id === funcionarioId);
  const reemplazadas = new Set(especificas.map((e) => e.reemplazaPlantilla?.id).filter((x): x is number => !!x));
  const generales = plantillas.filter((p) => {
    if (p.funcionario) return false;
    if (reemplazadas.has(p.id)) return false;
    if (p.cargo) return !!cargo && p.cargo.id === cargo.id && (!p.turno || (!!turno && p.turno.id === turno.id));
    if (p.grupo) return grupos.has(p.grupo.id);
    return false;
  });
  return [...generales, ...especificas];
}

// ───────────────────────── Generación y vencimiento ─────────────────────────

function esDuplicado(e: any): boolean {
  const msg = String(e?.message ?? '') + String(e?.driverError?.message ?? '');
  return e?.code === '23505' || e?.driverError?.code === '23505' || /UNIQUE constraint failed/i.test(msg);
}

export interface ResultadoGeneracion { generadas: number; existentes: number; errores: number }

interface ContextoFuncionarios {
  funcionarios: Funcionario[];
  histPor: Map<number, HistoricoCargo[]>;
  turPor: Map<number, FuncionarioTurno[]>;
  gruposPor: Map<number, Set<number>>;
}

/** Funcionarios activos con sus históricos de cargo, turnos y grupos DR (para resolver alcances). */
async function cargarFuncionariosFt(ds: DataSource): Promise<ContextoFuncionarios> {
  const funcionarios = await ds.getRepository(Funcionario).find({ where: { activo: true } as any, relations: ['cargo', 'usuario'] });
  const ctx: ContextoFuncionarios = { funcionarios, histPor: new Map(), turPor: new Map(), gruposPor: new Map() };
  if (!funcionarios.length) return ctx;
  const ids = funcionarios.map((f) => f.id);
  const historicos = await ds.getRepository(HistoricoCargo).find({
    where: { funcionario: { id: In(ids) } } as any, relations: ['cargo', 'funcionario'],
  });
  const asignaciones = await ds.getRepository(FuncionarioTurno).find({
    where: { funcionario: { id: In(ids) } } as any, relations: ['turno', 'funcionario'],
  });
  const miembros = await ds.getRepository(DrGrupoMiembro).find({
    where: { activo: true } as any, relations: ['grupo', 'funcionario'],
  });
  const porFunc = <T extends { funcionario: Funcionario }>(xs: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of xs) {
      const k = x.funcionario?.id;
      if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(x);
    }
    return m;
  };
  ctx.histPor = porFunc(historicos);
  ctx.turPor = porFunc(asignaciones);
  for (const mi of miembros) {
    if (!mi.funcionario || !mi.grupo || (mi.grupo as any).activo === false) continue;
    (ctx.gruposPor.get(mi.funcionario.id) ?? ctx.gruposPor.set(mi.funcionario.id, new Set()).get(mi.funcionario.id)!).add(mi.grupo.id);
  }
  return ctx;
}

/**
 * INSERT idempotente de una tarea (con sus ítems de checklist).
 * Devuelve 'NUEVA' o 'EXISTE' (UNIQUE: ya la generó otro tick / otra PC / el mismo evento).
 *
 * Postgres: una transacción (tarea + ítems juntos). SQLite: sin transacción propia (ver
 * `enTransaccionSiPostgres`: en SQLite una transacción intercalada comparte la física con, p. ej.,
 * `createVenta`, y su ROLLBACK desharía escrituras ajenas). Ahí se chequea antes si ya existe, el
 * INSERT suelto que choca con el UNIQUE solo falla esa sentencia, y si fallan los ítems se borra
 * la tarea recién creada (compensación) para que el próximo tick la vuelva a generar entera.
 */
async function insertarTareaFt(
  ds: DataSource, p: FtPlantillaTarea, funcionarioId: number, dia: string,
  v: { inicio: Date; vence: Date }, origen: FtOrigenTarea, eventoRef: string,
): Promise<'NUEVA' | 'EXISTE'> {
  const pg = ds.options.type === 'postgres';
  if (!pg) {
    const ya = await ds.getRepository(FtTarea).createQueryBuilder('t')
      .where('t.plantilla_id = :p AND t.funcionario_id = :f AND t.fecha = :d AND t.evento_ref = :e', { p: p.id, f: funcionarioId, d: dia, e: eventoRef })
      .getCount();
    if (ya) return 'EXISTE';
  }
  let creadaId: number | null = null;
  try {
    await enTransaccionSiPostgres(ds, async (m) => {
      const tarea = await m.getRepository(FtTarea).save(m.getRepository(FtTarea).create({
        plantilla: { id: p.id } as any,
        funcionario: { id: funcionarioId } as any,
        fecha: dia,
        inicio: v.inicio,
        vence: v.vence,
        estado: FtEstadoTarea.PENDIENTE,
        titulo: p.titulo,
        critica: !!p.critica,
        peso: Number(p.peso) || 0,
        origen,
        eventoRef,
      } as any) as unknown as FtTarea);
      creadaId = tarea.id;
      if (p.tipo === FtTipoTarea.CHECKLIST) {
        const items = [...(p.items ?? [])].sort((a, b) => (a.orden - b.orden) || (a.id - b.id));
        for (const it of items) {
          await m.getRepository(FtTareaItem).save(m.getRepository(FtTareaItem).create({
            tarea: { id: tarea.id } as any, item: { id: it.id } as any, texto: it.texto, hecho: false,
          } as any));
        }
      }
    });
    return 'NUEVA';
  } catch (e) {
    if (!pg && creadaId) {
      // SQLite: deshacer a mano lo que quedó a medias (no hubo transacción).
      await ds.getRepository(FtTareaItem).delete({ tarea: { id: creadaId } } as any).catch(() => undefined);
      await ds.getRepository(FtTarea).delete({ id: creadaId } as any).catch(() => undefined);
    }
    if (esDuplicado(e)) return 'EXISTE';
    throw e;
  }
}

const RELACIONES_PLANTILLA = ['cargo', 'turno', 'funcionario', 'grupo', 'reemplazaPlantilla', 'items'];

export async function generarTareasFt(ds: DataSource, ahora: Date = ahoraFt()): Promise<ResultadoGeneracion> {
  const hoy = fechaLocal(ahora);
  const dias = [sumarDias(hoy, -1), hoy];
  const res: ResultadoGeneracion = { generadas: 0, existentes: 0, errores: 0 };

  const plantillas = (await ds.getRepository(FtPlantillaTarea).find({
    where: { activo: true } as any,
    relations: RELACIONES_PLANTILLA,
  })).filter((p) => p.recurrencia !== FtRecurrencia.EVENTO);
  if (!plantillas.length) return res;

  const { funcionarios, histPor, turPor, gruposPor } = await cargarFuncionariosFt(ds);
  if (!funcionarios.length) return res;

  // Lo que ya existe para esos días (sin evento): no se intenta insertar de nuevo.
  const existentes = await ds.getRepository(FtTarea).createQueryBuilder('t')
    .leftJoin('t.plantilla', 'p').addSelect('p.id')
    .leftJoin('t.funcionario', 'f').addSelect('f.id')
    .where('t.fecha IN (:...dias)', { dias })
    .andWhere('t.evento_ref = :vacio', { vacio: '' })
    .getMany();
  const clave = (p: number, f: number, d: string) => `${p}|${f}|${d}`;
  const ya = new Set(existentes.filter((t) => t.plantilla).map((t) => clave(t.plantilla!.id, t.funcionario.id, diaDe(t.fecha)!)));

  for (const dia of dias) {
    for (const f of funcionarios) {
      if (!funcionarioVigente(f, dia)) continue;
      const cargo = cargoVigenteDe(f, histPor.get(f.id) ?? [], dia);
      const turno = turnoVigenteDe(turPor.get(f.id) ?? [], dia);
      const candidatas = plantillasDelFuncionario(plantillas, f.id, cargo, turno, gruposPor.get(f.id) ?? new Set());
      for (const p of candidatas) {
        if (!aplicaEnDia(p, dia)) continue;
        const k = clave(p.id, f.id, dia);
        if (ya.has(k)) { res.existentes++; continue; }
        const v = ventanaDe(p, dia, turno);
        if (!v || v.vence.getTime() <= ahora.getTime()) continue;
        try {
          const r = await insertarTareaFt(ds, p, f.id, dia, v, FtOrigenTarea.MOTOR, '');
          ya.add(k);
          if (r === 'NUEVA') res.generadas++; else res.existentes++; // EXISTE: la generó otra PC
        } catch (e) {
          res.errores++;
          console.warn(`[ft-motor] no se pudo generar plantilla=${p.id} funcionario=${f.id} fecha=${dia}:`, (e as any)?.message ?? e);
        }
      }
    }
  }
  return res;
}

/**
 * PENDIENTE o RECHAZADA (hay que rehacerla) con `vence` < ahora → VENCIDA. Devuelve cuántas
 * vencieron.
 */
export async function vencerTareasFt(ds: DataSource, ahora: Date = ahoraFt()): Promise<number> {
  const r = await ds.createQueryBuilder()
    .update(FtTarea)
    .set({ estado: FtEstadoTarea.VENCIDA } as any)
    .where('estado IN (:...abiertas)', { abiertas: [FtEstadoTarea.PENDIENTE, FtEstadoTarea.RECHAZADA] })
    .andWhere('vence < :ahora', { ahora: paramTs(ds, ahora) })
    .execute();
  return r.affected ?? 0;
}

// ───────────────────────── Lock en base ─────────────────────────

const DUENIO_PROCESO = `${os.hostname()}#${process.pid}#${randomUUID().slice(0, 8)}`;
const LOCK_TTL_MS = 10 * 60_000;

interface LockFt { duenio: string; expira: number }

function leerLock(valor: string | null | undefined): LockFt | null {
  if (!valor) return null;
  try {
    const o = JSON.parse(valor);
    return o && typeof o.duenio === 'string' && typeof o.expira === 'number' ? o : null;
  } catch {
    return null;
  }
}

/**
 * Toma el lock del motor si está libre, vencido o ya es nuestro. Compare-and-swap: el UPDATE
 * solo afecta la fila si el valor sigue siendo el que se leyó; si otra PC lo cambió en el medio,
 * afecta 0 filas y no se toma.
 */
export async function tomarLockFt(ds: DataSource, duenio = DUENIO_PROCESO, ahora: Date = ahoraFt(), ttlMs = LOCK_TTL_MS): Promise<boolean> {
  const repo = ds.getRepository(FtConfig);
  let fila = await repo.findOne({ where: { clave: FT_CLAVES.MOTOR_LOCK } as any });
  if (!fila) {
    try { await repo.insert({ clave: FT_CLAVES.MOTOR_LOCK, valor: null } as any); } catch { /* la creó otra PC */ }
    fila = await repo.findOne({ where: { clave: FT_CLAVES.MOTOR_LOCK } as any });
    if (!fila) return false;
  }
  const actual = fila.valor ?? null;
  const lock = leerLock(actual);
  if (lock && lock.duenio !== duenio && lock.expira > ahora.getTime()) return false;
  const qb = ds.createQueryBuilder()
    .update(FtConfig)
    .set({ valor: JSON.stringify({ duenio, expira: ahora.getTime() + ttlMs }) } as any)
    .where('clave = :c', { c: FT_CLAVES.MOTOR_LOCK });
  if (actual === null) qb.andWhere('valor IS NULL');
  else qb.andWhere('valor = :v', { v: actual });
  const r = await qb.execute();
  return (r.affected ?? 0) === 1;
}

export async function liberarLockFt(ds: DataSource, duenio = DUENIO_PROCESO): Promise<void> {
  const fila = await ds.getRepository(FtConfig).findOne({ where: { clave: FT_CLAVES.MOTOR_LOCK } as any });
  if (!fila?.valor || leerLock(fila.valor)?.duenio !== duenio) return;
  await ds.createQueryBuilder().update(FtConfig).set({ valor: null } as any)
    .where('clave = :c', { c: FT_CLAVES.MOTOR_LOCK }).andWhere('valor = :v', { v: fila.valor }).execute();
}

// ───────────────────────── Tick y puntos de extensión ─────────────────────────

export interface ContextoTickFt { ahora: Date; hoy: string }
/** Paso extra del tick (después de avisos). Corre con el lock tomado. */
export type PasoTickFt = (ds: DataSource, ctx: ContextoTickFt) => Promise<void>;
const pasosExtra: { nombre: string; paso: PasoTickFt }[] = [];

export function registrarPasoTickFt(nombre: string, paso: PasoTickFt): void {
  if (!pasosExtra.some((p) => p.nombre === nombre)) pasosExtra.push({ nombre, paso });
}

export interface ExtraEventoFt {
  /** Eventos de caja: PDV o MAYOR (filtra plantillas con `evento_caja`). */
  tipoCaja?: FtEventoCaja | null;
  /** Quién disparó el evento: si su funcionario es candidato, la tarea es solo suya. */
  usuarioId?: number | null;
  ahora?: Date;
}

export interface ResultadoEventoFt { generadas: number; existentes: number; omitido?: 'APAGADO' | 'SIN_PLANTILLAS' }

/** Día de turno de un funcionario a una hora: un turno nocturno de ayer sigue abierto hasta la salida. */
function diaDeTurno(turnoAyer: Turno | null, ahora: Date): string {
  const hoy = fechaLocal(ahora);
  if (turnoValido(turnoAyer) && esTurnoNocturno(turnoAyer) && ahora.getTime() < enHora(hoy, hhmm(turnoAyer.horaSalida)!).getTime()) {
    return sumarDias(hoy, -1);
  }
  return hoy;
}

function enTurno(turno: Turno | null, dia: string, ahora: Date): boolean {
  if (!turnoValido(turno)) return false;
  const ini = enHora(dia, hhmm(turno.horaEntrada)!);
  const fin = enHora(dia, hhmm(turno.horaSalida)!, esTurnoNocturno(turno) ? 1 : 0);
  return ahora.getTime() >= ini.getTime() && ahora.getTime() <= fin.getTime();
}

/**
 * Punto de entrada de eventos de negocio (caja abierta/cerrada, compra recibida), §4 y §10 A7.
 * Genera las tareas de las plantillas con recurrencia EVENTO de ese evento, con
 * `evento_ref` = '<PDV|MAYOR|COMPRA>:<ref>' (UNIQUE → llamar dos veces con el mismo evento no
 * duplica). Responsables: los funcionarios del alcance de la plantilla; si quien disparó el
 * evento es uno de ellos, solo él; si no, los que están en su turno ahora; si nadie, todos.
 * Ventana: desde ahora + desfase, durante `duracion_min`. Respeta el interruptor global.
 * Lo llaman los hooks post-commit (`dispararEventoFt`), nunca dentro de la transacción de caja.
 */
export async function ftOnEvento(ds: DataSource, tipo: FtEvento, ref: string | number, extra: ExtraEventoFt = {}): Promise<ResultadoEventoFt> {
  const res: ResultadoEventoFt = { generadas: 0, existentes: 0 };
  if (!(await motorFtActivo(ds))) return { ...res, omitido: 'APAGADO' };
  const ahora = extra.ahora ?? ahoraFt();
  const hoy = fechaLocal(ahora);
  const plantillas = (await ds.getRepository(FtPlantillaTarea).find({
    where: { activo: true, recurrencia: FtRecurrencia.EVENTO, evento: tipo } as any,
    relations: RELACIONES_PLANTILLA,
  })).filter((p) => {
    if (p.eventoCaja && p.eventoCaja !== extra.tipoCaja) return false;
    const desde = diaDe(p.vigenciaDesde);
    const hasta = diaDe(p.vigenciaHasta);
    return !(desde && hoy < desde) && !(hasta && hoy > hasta);
  });
  if (!plantillas.length) return { ...res, omitido: 'SIN_PLANTILLAS' };

  const prefijo = extra.tipoCaja ?? (tipo === FtEvento.COMPRA_RECIBIDA ? 'COMPRA' : tipo);
  const eventoRef = `${prefijo}:${ref}`.slice(0, 60);
  const { funcionarios, histPor, turPor, gruposPor } = await cargarFuncionariosFt(ds);

  for (const p of plantillas) {
    const candidatos: { f: Funcionario; dia: string; turno: Turno | null }[] = [];
    for (const f of funcionarios) {
      const turnos = turPor.get(f.id) ?? [];
      const dia = diaDeTurno(turnoVigenteDe(turnos, sumarDias(hoy, -1)), ahora);
      if (!funcionarioVigente(f, dia)) continue;
      const turno = turnoVigenteDe(turnos, dia);
      const cargo = cargoVigenteDe(f, histPor.get(f.id) ?? [], dia);
      if (plantillasDelFuncionario(plantillas, f.id, cargo, turno, gruposPor.get(f.id) ?? new Set()).some((x) => x.id === p.id)) {
        candidatos.push({ f, dia, turno });
      }
    }
    const actor = extra.usuarioId ? candidatos.filter((c) => (c.f.usuario as any)?.id === extra.usuarioId) : [];
    const deTurno = candidatos.filter((c) => enTurno(c.turno, c.dia, ahora));
    const elegidos = actor.length ? actor : deTurno.length ? deTurno : candidatos;
    const inicio = sumarMinutos(ahora, Number(p.offsetInicioMin) || 0);
    const v = { inicio, vence: sumarMinutos(inicio, Math.max(1, Number(p.duracionMin) || 0)) };
    for (const c of elegidos) {
      const r = await insertarTareaFt(ds, p, c.f.id, c.dia, v, FtOrigenTarea.EVENTO, eventoRef);
      if (r === 'NUEVA') res.generadas++; else res.existentes++;
    }
  }
  return res;
}

export interface ResultadoTickFt {
  ejecutado: boolean;
  omitido?: 'APAGADO' | 'LOCK' | 'EN_CURSO';
  generadas: number;
  existentes: number;
  vencidas: number;
  /** Avisos nuevos registrados (cualquier canal) y ausentes con tarea crítica avisados. */
  avisos: number;
  ausentes: number;
  propuestas: number;
  errores: number;
  en: string;
}

let tickEnCurso = false;

export async function ejecutarTickFt(ds: DataSource, opts: { ahora?: Date; duenio?: string } = {}): Promise<ResultadoTickFt> {
  const ahora = opts.ahora ?? ahoraFt();
  const base: ResultadoTickFt = {
    ejecutado: false, generadas: 0, existentes: 0, vencidas: 0, avisos: 0, ausentes: 0, propuestas: 0, errores: 0, en: ahora.toISOString(),
  };
  if (tickEnCurso) return { ...base, omitido: 'EN_CURSO' };
  tickEnCurso = true;
  try {
    if (!(await motorFtActivo(ds))) return { ...base, omitido: 'APAGADO' };
    const duenio = opts.duenio ?? DUENIO_PROCESO;
    if (!(await tomarLockFt(ds, duenio, ahora))) return { ...base, omitido: 'LOCK' };
    try {
      const g = await generarTareasFt(ds, ahora);
      const vencidas = await vencerTareasFt(ds, ahora);
      let errores = g.errores;
      const ctx: ContextoTickFt = { ahora, hoy: fechaLocal(ahora) };
      // Fase 2: ausentes con críticas y avisos por regla (incluye escalamiento y nivel 3).
      // Cada paso aislado: si uno falla, el tick sigue.
      let ausentes = 0;
      let avisos = 0;
      let propuestas = 0;
      try { ausentes = await pasoAusentesFt(ds, ctx); } catch (e) { errores++; console.warn('[ft-motor] ausentes:', (e as any)?.message ?? e); }
      try {
        const a = await pasoAvisosFt(ds, ctx);
        avisos = a.registrados;
        propuestas = a.propuestas;
      } catch (e) { errores++; console.warn('[ft-motor] avisos:', (e as any)?.message ?? e); }
      for (const p of pasosExtra) {
        try { await p.paso(ds, ctx); } catch (e) { errores++; console.warn(`[ft-motor] paso ${p.nombre}:`, (e as any)?.message ?? e); }
      }
      const r: ResultadoTickFt = {
        ejecutado: true, generadas: g.generadas, existentes: g.existentes, vencidas, avisos, ausentes, propuestas, errores, en: ahora.toISOString(),
      };
      await escribirConfigFt(ds, FT_CLAVES.ULTIMO_TICK, JSON.stringify(r));
      return r;
    } finally {
      await liberarLockFt(ds, duenio).catch(() => { /* expira solo */ });
    }
  } finally {
    tickEnCurso = false;
  }
}

// ───────────────────────── Programación (patrón startRetryComandaWorker) ─────────────────────────

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

/**
 * Arranca el motor: una ejecución al poco de arrancar y después cada `ft_config.intervalo_min`
 * (def. 5; se relee en cada vuelta). Solo en el proceso dueño de la base (main.ts: mode !== 'client').
 * Con el interruptor apagado cada vuelta es una lectura de `ft_config` y nada más.
 */
export function startMotorFuncionesTareas(ds: DataSource, demoraInicialMs = 20_000): void {
  if (corriendo) return; // ya iniciado
  corriendo = true;
  const programar = (ms: number) => {
    if (!corriendo) return;
    timer = setTimeout(async () => {
      try {
        const r = await ejecutarTickFt(ds);
        if (r.ejecutado && (r.generadas || r.vencidas || r.avisos || r.ausentes || r.errores)) {
          console.log(`[ft-motor] generadas=${r.generadas} vencidas=${r.vencidas} avisos=${r.avisos} ausentes=${r.ausentes} errores=${r.errores}`);
        }
      } catch (e: any) {
        console.warn('[ft-motor] excepción en el tick:', e?.message || e);
      }
      let min = 5;
      try { min = await intervaloMotorMin(ds); } catch { /* default */ }
      programar(min * 60_000);
    }, ms);
    timer.unref?.();
  };
  programar(demoraInicialMs);
}

export function stopMotorFuncionesTareas(): void {
  corriendo = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
