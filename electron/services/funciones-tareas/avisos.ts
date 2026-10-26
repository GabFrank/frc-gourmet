/**
 * Funciones y Tareas (FT) — fase 2: avisos, ausentes con tareas críticas y escalamiento.
 * Ver docs/planes/PLAN-funciones-tareas.md §4, §10 (A1, A5, A6) y §11 (C2, C3).
 *
 * Dedupe atómico: cada aviso se INSERTA en `ft_aviso_enviado` (UNIQUE clave
 * `ft:<tarea>:<momento>:<nivel>`) ANTES de enviarlo. Si el INSERT choca, otro tick u otra PC
 * ya lo tomó y no se envía de nuevo. Un envío fallido queda FALLIDO y se reintenta (máx.
 * `MAX_INTENTOS`, solo dentro de la `GRACIA_MIN`).
 *
 * Canal de la regla:
 *  - APP: no sale de la app; queda ENVIADO (bandeja de avisos de escritorio/celular).
 *  - WHATSAPP / AMBOS: lo envía la app con su servicio de notificaciones, respetando
 *    NOTIF_GLOBAL_ACTIVO. Nivel 1 (persona/encargado) con `enviarDirecto` a su teléfono;
 *    nivel 2 (grupo ADM) con `dispatchEvento('RECORDATORIO_TAREA')` (los receptores del
 *    grupo ADM se suscriben a ese evento en Configuración › Notificaciones).
 *  - GERENTE: la app NO envía; queda PARA_GERENTE con canal GERENTE y el bot Gerente lo
 *    toma con `ft-avisos`.
 * Nivel 3: si el funcionario reincide (umbral de vencidas de esa plantilla en la ventana de
 * días de `ft_config`), crea una `ft_propuesta_falta` PENDIENTE (nunca `dr_falta`) y avisa al
 * encargado por el canal de la regla. Sin reincidencia, el nivel 3 no hace nada.
 *
 * Un aviso atrasado más de `GRACIA_MIN` (server apagado) ya no se manda.
 */
import { DataSource, EntityManager, In } from 'typeorm';
import { Funcionario } from '../../../src/app/database/entities/rrhh/funcionario.entity';
import { HistoricoCargo } from '../../../src/app/database/entities/rrhh/historico-cargo.entity';
import { FuncionarioTurno } from '../../../src/app/database/entities/rrhh/funcionario-turno.entity';
import { Asistencia } from '../../../src/app/database/entities/rrhh/asistencia.entity';
import { FtReglaAviso } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-regla-aviso.entity';
import { FtTarea } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea.entity';
import { FtAvisoEnviado } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-aviso-enviado.entity';
import { FtPropuestaFalta } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-propuesta-falta.entity';
import {
  FtCanalAviso, FtEstadoAviso, FtEstadoPropuesta, FtEstadoTarea, FtMomentoAviso, FtMomentoAvisoRegistro,
} from '../../../src/app/database/entities/rrhh/funciones-tareas/ft.enums';
import { CanalNotificacion, EstadoEnvioNotificacion } from '../../../src/app/database/entities/notificaciones/notificaciones-enums';
import { dispatchEvento, enviarDirecto, isGlobalActivo } from '../notificacion.service';
import { diaDe, enHora, paramTs, sumarDias, sumarMinutos } from './fechas';
import { FT_CLAVES, configFt, configFtEntero } from './config';
import { cargoVigenteDe, turnoVigenteDe } from './vigencia';

/** Evento del catálogo de notificaciones con el que sale el aviso al grupo ADM (ya sembrado). */
export const EVENTO_NOTIF_FT = 'RECORDATORIO_TAREA';
/** Destino simbólico del nivel 2. */
export const DESTINO_GRUPO_ADM = 'GRUPO_ADM';
export const GRACIA_MIN = 180;
export const MAX_INTENTOS = 3;
/** Días hacia atrás que mira el paso de avisos. */
const DIAS_ATRAS = 8;

// ───────────────────────── Envío inyectable (tests) ─────────────────────────

export interface EnviadorFt {
  globalActivo: () => Promise<boolean>;
  enviarDirecto: typeof enviarDirecto;
  dispatchEvento: typeof dispatchEvento;
}
let enviadorFijo: Partial<EnviadorFt> | null = null;

/** Solo para tests: reemplaza (o con null, restaura) las funciones de envío. */
export function fijarEnviadorFt(e: Partial<EnviadorFt> | null): void {
  enviadorFijo = e;
}

function enviador(): EnviadorFt {
  return {
    globalActivo: enviadorFijo?.globalActivo ?? isGlobalActivo,
    enviarDirecto: enviadorFijo?.enviarDirecto ?? enviarDirecto,
    dispatchEvento: enviadorFijo?.dispatchEvento ?? dispatchEvento,
  };
}

// ───────────────────────── Utilidades ─────────────────────────

export function claveAvisoFt(tareaId: number, momento: string, nivel: number): string {
  return `ft:${tareaId}:${momento}:${nivel}`;
}

export function esDuplicadoFt(e: any): boolean {
  const msg = String(e?.message ?? '') + String(e?.driverError?.message ?? '');
  return e?.code === '23505' || e?.driverError?.code === '23505' || /UNIQUE constraint failed/i.test(msg);
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function nombreDe(f: Funcionario | null | undefined): string {
  const p: any = f?.persona;
  return (p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : `FUNCIONARIO ${f?.id ?? ''}`).toUpperCase();
}

function trozos<T>(xs: T[], n = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function clavesExistentes(ds: DataSource, tareaIds: number[]): Promise<Set<string>> {
  const s = new Set<string>();
  for (const ids of trozos(tareaIds)) {
    const filas = await ds.getRepository(FtAvisoEnviado).createQueryBuilder('a')
      .select('a.clave', 'clave').where('a.tarea_id IN (:...ids)', { ids }).getRawMany();
    for (const f of filas) s.add(f.clave);
  }
  return s;
}

/**
 * Teléfonos del encargado de una tarea: funcionarios activos cuyo cargo vigente es el cargo
 * verificador de la plantilla (menos el responsable); si no hay, `ft_config.encargado_destino`.
 */
class Encargados {
  private funcs: { f: Funcionario; cargoId: number | null }[] | null = null;
  private porDefecto: string | null = null;
  constructor(private ds: DataSource, private hoy: string) {}

  async de(t: FtTarea): Promise<string[]> {
    const cargoId = t.plantilla?.verificadorCargo?.id ?? null;
    let tels: string[] = [];
    if (cargoId) {
      if (!this.funcs) await this.cargar();
      tels = this.funcs!
        .filter((x) => x.cargoId === cargoId && x.f.id !== t.funcionario.id)
        .map((x) => String((x.f.persona as any)?.telefono ?? '').trim())
        .filter(Boolean);
    }
    if (!tels.length) {
      if (this.porDefecto === null) this.porDefecto = (await configFt(this.ds, FT_CLAVES.ENCARGADO_DESTINO)).trim();
      if (this.porDefecto) tels = [this.porDefecto];
    }
    return [...new Set(tels)];
  }

  private async cargar(): Promise<void> {
    const fs = await this.ds.getRepository(Funcionario).find({ where: { activo: true } as any, relations: ['cargo', 'persona'] });
    const hs = fs.length
      ? await this.ds.getRepository(HistoricoCargo).find({
        where: { funcionario: { id: In(fs.map((f) => f.id)) } } as any, relations: ['cargo', 'funcionario'],
      })
      : [];
    this.funcs = fs.map((f) => ({ f, cargoId: cargoVigenteDe(f, hs.filter((h) => h.funcionario?.id === f.id), this.hoy)?.id ?? null }));
  }
}

// ───────────────────────── Registro + envío ─────────────────────────

export interface AvisoNuevoFt {
  clave: string;
  tareaId: number | null;
  momento: FtMomentoAvisoRegistro;
  nivel: number;
  canal: FtCanalAviso;
  /** Teléfonos (nivel 1/3) o `DESTINO_GRUPO_ADM` (nivel 2). */
  destinos: string[] | typeof DESTINO_GRUPO_ADM;
  asunto: string;
  mensaje: string;
}

export type ResultadoAvisoFt = 'DUPLICADO' | FtEstadoAviso;

/**
 * Inserta el aviso (dedupe) y lo despacha según el canal. `antesDeEnviar` corre en la misma
 * transacción que el INSERT (nivel 3: crear la propuesta), así aviso y propuesta van juntos.
 */
export async function registrarAvisoFt(
  ds: DataSource, a: AvisoNuevoFt, ahora: Date,
  antesDeEnviar?: (m: EntityManager) => Promise<void>,
): Promise<ResultadoAvisoFt> {
  const destino = a.destinos === DESTINO_GRUPO_ADM ? DESTINO_GRUPO_ADM : a.destinos.join(',');
  const fila = {
    clave: a.clave,
    tarea: a.tareaId ? ({ id: a.tareaId } as any) : null,
    momento: a.momento,
    nivel: a.nivel,
    canal: a.canal,
    estado: FtEstadoAviso.PENDIENTE,
    destino: destino || null,
    mensaje: a.mensaje,
    intentos: 0,
    // Hora del módulo (no la del motor de base): la gracia del reintento y el rango de
    // ft-avisos se miden con el mismo reloj que el resto del motor.
    createdAt: ahora,
  } as any;
  let id: number;
  try {
    // Sin trabajo extra, un INSERT suelto (no se abre transacción: en SQLite dos transacciones
    // intercaladas del mismo proceso comparten la física, ver withAperturaCajaLock).
    id = antesDeEnviar
      ? await ds.transaction(async (m) => {
        const r = await m.getRepository(FtAvisoEnviado).insert(fila);
        await antesDeEnviar(m);
        return Number(r.identifiers[0]?.id);
      })
      : Number((await ds.getRepository(FtAvisoEnviado).insert(fila)).identifiers[0]?.id);
  } catch (e) {
    if (esDuplicadoFt(e)) return 'DUPLICADO';
    throw e;
  }
  const repo = ds.getRepository(FtAvisoEnviado);
  if (a.canal === FtCanalAviso.GERENTE) {
    await repo.update({ id } as any, { estado: FtEstadoAviso.PARA_GERENTE } as any);
    return FtEstadoAviso.PARA_GERENTE;
  }
  if (a.canal === FtCanalAviso.APP) {
    await repo.update({ id } as any, { estado: FtEstadoAviso.ENVIADO, enviadoEn: ahora } as any);
    return FtEstadoAviso.ENVIADO;
  }
  return enviarWhatsappFt(ds, id, ahora, a.asunto);
}

/** Envía por WhatsApp un aviso ya registrado (WHATSAPP/AMBOS) y deja el resultado en la fila. */
export async function enviarWhatsappFt(ds: DataSource, avisoId: number, ahora: Date, asunto?: string): Promise<FtEstadoAviso> {
  const repo = ds.getRepository(FtAvisoEnviado);
  const av = await repo.findOne({ where: { id: avisoId } as any });
  if (!av) return FtEstadoAviso.FALLIDO;
  const env = enviador();
  const intentos = (Number(av.intentos) || 0) + 1;
  const texto = av.mensaje || '';
  const titulo = asunto || 'TAREAS';
  let ok = false;
  let error: string | null = null;
  try {
    if (!(await env.globalActivo())) {
      error = 'NOTIF_GLOBAL_ACTIVO APAGADO';
    } else if (av.destino === DESTINO_GRUPO_ADM) {
      const rs = await env.dispatchEvento(EVENTO_NOTIF_FT, { asunto: titulo, texto, dedupeKey: av.clave });
      ok = rs.some((r) => r.estado === EstadoEnvioNotificacion.ENVIADO || r.error === 'DUPLICADO');
      if (!ok) error = rs.length ? (rs.find((r) => r.error)?.error ?? 'NO SE PUDO ENVIAR') : `SIN RECEPTORES ACTIVOS PARA ${EVENTO_NOTIF_FT}`;
    } else {
      const tels = String(av.destino ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!tels.length) error = 'SIN TELÉFONO DE DESTINO';
      for (const tel of tels) {
        const r = await env.enviarDirecto({
          canal: CanalNotificacion.WHATSAPP, destino: tel, eventoCodigo: EVENTO_NOTIF_FT,
          asunto: titulo, texto, claveDedupe: `${av.clave}:${tel}`,
        });
        if (r.estado === EstadoEnvioNotificacion.ENVIADO || r.error === 'DUPLICADO') ok = true;
        else error = r.error ?? 'NO SE PUDO ENVIAR';
      }
      if (ok) error = null;
    }
  } catch (e: any) {
    ok = false;
    error = String(e?.message ?? e).slice(0, 500);
  }
  const estado = ok ? FtEstadoAviso.ENVIADO : FtEstadoAviso.FALLIDO;
  await repo.update({ id: av.id } as any, { estado, intentos, error, enviadoEn: ok ? ahora : null } as any);
  return estado;
}

/** Reintenta los FALLIDOS por WhatsApp recientes (dentro de la gracia) con menos de MAX_INTENTOS. */
export async function reintentarAvisosFt(ds: DataSource, ahora: Date): Promise<number> {
  const filas = await ds.getRepository(FtAvisoEnviado).createQueryBuilder('a')
    .where('a.estado = :e', { e: FtEstadoAviso.FALLIDO })
    .andWhere('a.canal IN (:...c)', { c: [FtCanalAviso.WHATSAPP, FtCanalAviso.AMBOS] })
    .andWhere('a.intentos < :max', { max: MAX_INTENTOS })
    .andWhere('a.created_at >= :desde', { desde: paramTs(ds, sumarMinutos(ahora, -GRACIA_MIN)) })
    .getMany();
  let n = 0;
  for (const f of filas) {
    if ((await enviarWhatsappFt(ds, f.id, ahora)) === FtEstadoAviso.ENVIADO) n++;
  }
  return n;
}

// ───────────────────────── Paso: avisos por regla ─────────────────────────

function momentoDe(r: FtReglaAviso, t: FtTarea): Date {
  const min = Number(r.minutos) || 0;
  switch (r.momento) {
    case FtMomentoAviso.ANTES_INICIO: return sumarMinutos(new Date(t.inicio), -min);
    case FtMomentoAviso.ANTES_VENCER: return sumarMinutos(new Date(t.vence), -min);
    case FtMomentoAviso.AL_VENCER: return new Date(t.vence);
    default: return sumarMinutos(new Date(t.vence), min); // ESCALAMIENTO
  }
}

/** Si la regla toca ahora para esa tarea (estado + momento dentro de la gracia). */
export function correspondeAvisoFt(r: FtReglaAviso, t: FtTarea, ahora: Date): boolean {
  const antes = r.momento === FtMomentoAviso.ANTES_INICIO || r.momento === FtMomentoAviso.ANTES_VENCER;
  if (antes) {
    if (t.estado !== FtEstadoTarea.PENDIENTE || ahora.getTime() >= new Date(t.vence).getTime()) return false;
  } else if (t.estado !== FtEstadoTarea.VENCIDA) {
    return false;
  }
  const due = momentoDe(r, t).getTime();
  return ahora.getTime() >= due && ahora.getTime() - due <= GRACIA_MIN * 60_000;
}

function mensajeDe(r: FtReglaAviso, t: FtTarea): string {
  const quien = nombreDe(t.funcionario);
  const tit = `«${t.titulo}»`;
  switch (r.momento) {
    case FtMomentoAviso.ANTES_INICIO: return `RECORDATORIO: ${tit} EMPIEZA A LAS ${hhmm(new Date(t.inicio))} (${quien}).`;
    case FtMomentoAviso.ANTES_VENCER: return `RECORDATORIO: ${tit} VENCE A LAS ${hhmm(new Date(t.vence))} Y SIGUE PENDIENTE (${quien}).`;
    case FtMomentoAviso.AL_VENCER: return `VENCIÓ ${tit} SIN HACER: ${quien} (VENCÍA ${hhmm(new Date(t.vence))}).`;
    default: return `ESCALAMIENTO: ${tit} DE ${quien} SIGUE VENCIDA DESDE LAS ${hhmm(new Date(t.vence))}.`;
  }
}

export interface ResultadoAvisosFt {
  registrados: number; enviados: number; fallidos: number; paraGerente: number; propuestas: number; reintentados: number;
}

export async function pasoAvisosFt(ds: DataSource, ctx: { ahora: Date; hoy: string }): Promise<ResultadoAvisosFt> {
  const { ahora, hoy } = ctx;
  const res: ResultadoAvisosFt = { registrados: 0, enviados: 0, fallidos: 0, paraGerente: 0, propuestas: 0, reintentados: 0 };
  res.reintentados = await reintentarAvisosFt(ds, ahora);

  const reglas = await ds.getRepository(FtReglaAviso).createQueryBuilder('r')
    .innerJoinAndSelect('r.plantilla', 'p')
    .where('r.activo = :a', { a: true }).andWhere('p.activo = :a', { a: true })
    .getMany();
  if (!reglas.length) return res;
  const porPlantilla = new Map<number, FtReglaAviso[]>();
  for (const r of reglas) (porPlantilla.get(r.plantilla.id) ?? porPlantilla.set(r.plantilla.id, []).get(r.plantilla.id)!).push(r);

  const tareas = await ds.getRepository(FtTarea).createQueryBuilder('t')
    .innerJoinAndSelect('t.plantilla', 'p')
    .leftJoinAndSelect('p.verificadorCargo', 'vc')
    .leftJoinAndSelect('p.tipoFalta', 'tf')
    .innerJoinAndSelect('t.funcionario', 'f')
    .leftJoinAndSelect('f.persona', 'pe')
    .where('p.id IN (:...pids)', { pids: [...porPlantilla.keys()] })
    .andWhere('t.estado IN (:...es)', { es: [FtEstadoTarea.PENDIENTE, FtEstadoTarea.VENCIDA] })
    .andWhere('t.fecha >= :desde', { desde: sumarDias(hoy, -DIAS_ATRAS) })
    .getMany();
  if (!tareas.length) return res;
  const ya = await clavesExistentes(ds, tareas.map((t) => t.id));
  const encargados = new Encargados(ds, hoy);
  let umbral: number | null = null;
  let ventana = 30;

  const contar = (r: ResultadoAvisoFt) => {
    if (r === 'DUPLICADO') return;
    res.registrados++;
    if (r === FtEstadoAviso.ENVIADO) res.enviados++;
    else if (r === FtEstadoAviso.FALLIDO) res.fallidos++;
    else if (r === FtEstadoAviso.PARA_GERENTE) res.paraGerente++;
  };

  for (const t of tareas) {
    for (const r of porPlantilla.get(t.plantilla!.id) ?? []) {
      const nivel = Number(r.nivel) || 1;
      const clave = claveAvisoFt(t.id, r.momento, nivel);
      if (ya.has(clave) || !correspondeAvisoFt(r, t, ahora)) continue;
      const base = {
        clave, tareaId: t.id, momento: r.momento as unknown as FtMomentoAvisoRegistro, nivel,
        canal: r.canal, asunto: `TAREAS: ${t.titulo}`,
      };
      try {
        if (nivel === 2) {
          const destinos = r.destino?.trim() ? [r.destino.trim()] : DESTINO_GRUPO_ADM;
          contar(await registrarAvisoFt(ds, { ...base, destinos, mensaje: mensajeDe(r, t) }, ahora));
        } else if (nivel === 3) {
          if (umbral === null) {
            umbral = await configFtEntero(ds, FT_CLAVES.UMBRAL_REINCIDENCIA, 1, 100);
            ventana = await configFtEntero(ds, FT_CLAVES.VENTANA_REINCIDENCIA_DIAS, 1, 365);
          }
          const hasta = diaDe(t.fecha)!;
          const desde = sumarDias(hasta, -(ventana - 1));
          const vencidas = await ds.getRepository(FtTarea).createQueryBuilder('x')
            .where('x.funcionario_id = :f', { f: t.funcionario.id })
            .andWhere('x.plantilla_id = :p', { p: t.plantilla!.id })
            .andWhere('x.estado = :v', { v: FtEstadoTarea.VENCIDA })
            .andWhere('x.fecha >= :desde AND x.fecha <= :hasta', { desde, hasta })
            .getCount();
          if (vencidas < umbral) continue;
          const abierta = await ds.getRepository(FtPropuestaFalta).createQueryBuilder('pf')
            .innerJoin('pf.tarea', 'xt')
            .where('pf.funcionario_id = :f', { f: t.funcionario.id })
            .andWhere('xt.plantilla_id = :p', { p: t.plantilla!.id })
            .andWhere('pf.estado = :e', { e: FtEstadoPropuesta.PENDIENTE })
            .getCount();
          if (abierta) continue; // ya hay una propuesta pendiente por esta reincidencia
          const motivo = `REINCIDENCIA: ${vencidas} VENCIDAS DE «${t.titulo}» EN ${ventana} DÍAS (ÚLTIMA ${hasta}).`;
          const destinos = r.destino?.trim() ? [r.destino.trim()] : await encargados.de(t);
          const rr = await registrarAvisoFt(ds, {
            ...base, destinos,
            mensaje: `PROPUESTA DE FALTA PARA ${nombreDe(t.funcionario)}: ${motivo} REVISALA EN RRHH › TAREAS.`,
          }, ahora, async (m) => {
            await m.getRepository(FtPropuestaFalta).insert({
              tarea: { id: t.id } as any,
              funcionario: { id: t.funcionario.id } as any,
              tipoFalta: t.plantilla?.tipoFalta ? ({ id: t.plantilla.tipoFalta.id } as any) : null,
              motivo,
              estado: FtEstadoPropuesta.PENDIENTE,
              createdAt: ahora,
            } as any);
          });
          if (rr !== 'DUPLICADO') res.propuestas++;
          contar(rr);
        } else {
          const antes = r.momento === FtMomentoAviso.ANTES_INICIO || r.momento === FtMomentoAviso.ANTES_VENCER;
          let destinos: string[];
          if (r.destino?.trim()) destinos = [r.destino.trim()];
          else if (antes) {
            const tel = String((t.funcionario.persona as any)?.telefono ?? '').trim();
            destinos = tel ? [tel] : [];
          } else destinos = await encargados.de(t);
          contar(await registrarAvisoFt(ds, { ...base, destinos, mensaje: mensajeDe(r, t) }, ahora));
        }
        ya.add(clave);
      } catch (e: any) {
        console.warn(`[ft-avisos] tarea=${t.id} regla=${r.id}:`, e?.message ?? e);
      }
    }
  }
  return res;
}

// ───────────────────────── Paso: ausentes con tarea crítica ─────────────────────────

const PRESENTE = ['PRESENTE', 'TARDANZA', 'MEDIA_FALTA'];

/**
 * Tarea crítica PENDIENTE cuyo responsable no marcó entrada pasada la tolerancia de su turno
 * → aviso al encargado para que la reasigne (no se reasigna sola). Sin turno no hay «tarde».
 * Canal: `ft_config.canal_ausente` (def. APP).
 */
export async function pasoAusentesFt(ds: DataSource, ctx: { ahora: Date; hoy: string }): Promise<number> {
  const { ahora, hoy } = ctx;
  const tareas = await ds.getRepository(FtTarea).createQueryBuilder('t')
    .leftJoinAndSelect('t.plantilla', 'p')
    .leftJoinAndSelect('p.verificadorCargo', 'vc')
    .innerJoinAndSelect('t.funcionario', 'f')
    .leftJoinAndSelect('f.persona', 'pe')
    .where('t.critica = :c', { c: true })
    .andWhere('t.estado = :e', { e: FtEstadoTarea.PENDIENTE })
    .andWhere('t.fecha IN (:...dias)', { dias: [sumarDias(hoy, -1), hoy] })
    .andWhere('t.vence > :ahora', { ahora: paramTs(ds, ahora) })
    .getMany();
  if (!tareas.length) return 0;
  const ya = await clavesExistentes(ds, tareas.map((t) => t.id));
  const pendientes = tareas.filter((t) => !ya.has(claveAvisoFt(t.id, FtMomentoAvisoRegistro.AUSENTE, 1)));
  if (!pendientes.length) return 0;
  const fids = [...new Set(pendientes.map((t) => t.funcionario.id))];
  const asign = await ds.getRepository(FuncionarioTurno).find({
    where: { funcionario: { id: In(fids) } } as any, relations: ['turno', 'funcionario'],
  });
  const canalCfg = (await configFt(ds, FT_CLAVES.CANAL_AUSENTE)) as FtCanalAviso;
  const canal = Object.values(FtCanalAviso).includes(canalCfg) ? canalCfg : FtCanalAviso.APP;
  const encargados = new Encargados(ds, hoy);
  let n = 0;
  for (const t of pendientes) {
    const dia = diaDe(t.fecha)!;
    const turno = turnoVigenteDe(asign.filter((a) => a.funcionario?.id === t.funcionario.id), dia);
    const entrada = String(turno?.horaEntrada ?? '').slice(0, 5);
    if (!turno || !/^\d{2}:\d{2}$/.test(entrada)) continue;
    const limite = sumarMinutos(enHora(dia, entrada), Number(turno.toleranciaTardanzaMinutos) || 0);
    if (ahora.getTime() <= limite.getTime()) continue;
    const marcas = await ds.getRepository(Asistencia).createQueryBuilder('a')
      .where('a.funcionario_id = :f', { f: t.funcionario.id })
      .andWhere('a.fecha = :d', { d: dia })
      .andWhere('(a.hora_entrada IS NOT NULL OR a.estado IN (:...pr))', { pr: PRESENTE })
      .getCount();
    if (marcas) continue;
    try {
      const r = await registrarAvisoFt(ds, {
        clave: claveAvisoFt(t.id, FtMomentoAvisoRegistro.AUSENTE, 1),
        tareaId: t.id,
        momento: FtMomentoAvisoRegistro.AUSENTE,
        nivel: 1,
        canal,
        destinos: await encargados.de(t),
        asunto: `TAREAS: ${t.titulo}`,
        mensaje: `${nombreDe(t.funcionario)} NO MARCÓ ENTRADA (TURNO ${entrada}) Y TIENE LA TAREA CRÍTICA «${t.titulo}» `
          + `(${hhmm(new Date(t.inicio))}–${hhmm(new Date(t.vence))}). HAY QUE REASIGNARLA.`,
      }, ahora);
      if (r !== 'DUPLICADO') n++;
    } catch (e: any) {
      console.warn(`[ft-avisos] ausente tarea=${t.id}:`, e?.message ?? e);
    }
  }
  return n;
}
