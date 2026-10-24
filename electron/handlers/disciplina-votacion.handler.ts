/**
 * Disciplina y Reconocimiento (DR) — votación anónima entre compañeros.
 * Ver docs/planes/PLAN-multas-premios-encuestas.md §12 (anonimato).
 *
 * Anonimato por diseño:
 *  - dr_participacion guarda SOLO que el funcionario votó en el período (para no votar dos veces).
 *  - dr_voto_agregado guarda la SUMA por (período, evaluado, pregunta), cifrada con AES-GCM
 *    mientras el período está ABIERTO (clave en un archivo de userData, fuera de la base).
 *  - Participación y agregados se escriben en UNA sola transacción (si falla algo, no queda
 *    «votó» sin voto contado). Ninguna fila de votos tiene votante y no se registra el
 *    contenido del voto en logs.
 *  - Los textos libres (dr_respuesta_texto) no tienen votante; se muestran mezclados.
 *  - Resultados: solo con el período cerrado y con un mínimo de votantes.
 */
import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, In } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { ConfiguracionRrhh } from '../../src/app/database/entities/rrhh/configuracion-rrhh.entity';
import { DrPeriodo } from '../../src/app/database/entities/rrhh/disciplina/dr-periodo.entity';
import { DrPeriodoEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-periodo-estado.enum';
import { DrEncuesta } from '../../src/app/database/entities/rrhh/disciplina/dr-encuesta.entity';
import { DrEncuestaPregunta } from '../../src/app/database/entities/rrhh/disciplina/dr-encuesta-pregunta.entity';
import { DrGrupoMiembro } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo-miembro.entity';
import { DrParticipacion } from '../../src/app/database/entities/rrhh/disciplina/dr-participacion.entity';
import { DrVotoAgregado } from '../../src/app/database/entities/rrhh/disciplina/dr-voto-agregado.entity';
import { DrRespuestaTexto } from '../../src/app/database/entities/rrhh/disciplina/dr-respuesta-texto.entity';
import { drNuevoUuid } from '../../src/app/database/entities/rrhh/disciplina/dr-uuid';
import { ensurePermission, getRequestUser } from '../utils/auth.utils';
import {
  acumular,
  assertEnvioValido,
  cifrarAgregado,
  descifrarAgregado,
  generarClaveVotos,
  mezclar,
  AgregadoVoto,
  DisciplinaError,
  MIN_VOTANTES_DEFAULT,
  PreguntaEncuesta,
  RespuestaEnvio,
} from '../services/disciplina';

const P = {
  APROBAR: 'RRHH_DR_APROBAR',
  RESULTADOS: 'RRHH_DR_RESULTADOS_VER',
  VOTAR: 'RRHH_DR_VOTAR',
};
const ARCHIVO_CLAVE = 'dr-votos.key';

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}
function aError(e: unknown): never {
  if (e instanceof DisciplinaError) fail((e as any).codigo, e.message);
  throw e;
}

let claveCache: Buffer | null = null;
/** Clave AES de 32 bytes en userData (se crea la primera vez, permisos 0600). */
export function claveVotos(): Buffer {
  if (claveCache) return claveCache;
  const dir = app.getPath('userData');
  const file = path.join(dir, ARCHIVO_CLAVE);
  if (fs.existsSync(file)) {
    claveCache = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    claveCache = generarClaveVotos();
    fs.writeFileSync(file, claveCache.toString('base64'), { mode: 0o600 });
  }
  return claveCache;
}
/** Solo para tests: olvida la clave cacheada. */
export function _resetClaveVotos() {
  claveCache = null;
}

const ctx = (periodoId: any, evaluadoId: any, preguntaId: any) => `${periodoId}|${evaluadoId}|${preguntaId}`;

async function minVotantes(ds: DataSource): Promise<number> {
  const c = await ds.getRepository(ConfiguracionRrhh).findOne({ where: { clave: 'DR_VOTACION_MIN_VOTANTES' } as any });
  const n = Number(c?.valor);
  return Number.isFinite(n) && n > 0 ? n : MIN_VOTANTES_DEFAULT;
}

async function funcionarioDe(ds: DataSource, user: Usuario): Promise<Funcionario> {
  const f = await ds.getRepository(Funcionario).findOne({ where: { usuario: { id: user.id } } as any });
  if (!f) fail('SIN_FUNCIONARIO', 'TU USUARIO NO ESTÁ VINCULADO A UN FUNCIONARIO');
  return f;
}

async function miembrosDeEncuesta(ds: DataSource, encuesta: DrEncuesta): Promise<DrGrupoMiembro[]> {
  const grupoId = (encuesta as any).grupo?.id;
  if (!grupoId) fail('CONFIGURACION', 'LA ENCUESTA NO TIENE GRUPO');
  return ds.getRepository(DrGrupoMiembro).find({
    where: { grupo: { id: grupoId }, activo: true } as any,
    relations: ['funcionario', 'funcionario.persona'],
  });
}

const esPostgres = (ds: DataSource) => ds.options.type === 'postgres';

export function registerDisciplinaVotacionHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  /** Abre un período de encuesta (y opcionalmente de premio). data: { encuestaId?, premioId?, desde, hasta } */
  ipcMain.handle('dr-abrir-periodo', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, P.APROBAR);
    if (!data?.encuestaId && !data?.premioId) fail('VALIDACION', 'FALTA ENCUESTA O PREMIO');
    if (!data?.desde || !data?.hasta || String(data.desde) > String(data.hasta)) fail('VALIDACION', 'RANGO DE FECHAS INVÁLIDO');
    const repo = dataSource.getRepository(DrPeriodo);
    return repo.save(repo.create({
      encuesta: data.encuestaId ? ({ id: data.encuestaId } as any) : null,
      premio: data.premioId ? ({ id: data.premioId } as any) : null,
      desde: data.desde,
      hasta: data.hasta,
      abreEn: new Date(),
      estado: DrPeriodoEstado.ABIERTO,
    } as any));
  });

  /** Encuestas abiertas donde el usuario de la sesión todavía no votó, con a quién evaluar. */
  ipcMain.handle('dr-mis-encuestas-pendientes', async () => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.VOTAR);
    const yo = await funcionarioDe(dataSource, user);
    const periodos = await dataSource.getRepository(DrPeriodo).find({
      where: { estado: DrPeriodoEstado.ABIERTO } as any,
      relations: ['encuesta', 'encuesta.grupo', 'encuesta.preguntas'],
    });
    const out: any[] = [];
    for (const p of periodos) {
      if (!p.encuesta) continue;
      const miembros = await miembrosDeEncuesta(dataSource, p.encuesta);
      if (!miembros.some((m) => m.funcionario.id === yo.id)) continue;
      const ya = await dataSource.getRepository(DrParticipacion).count({ where: { periodo: { id: p.id }, funcionario: { id: yo.id } } as any });
      if (ya) continue;
      out.push({
        periodoId: p.id,
        encuesta: { id: p.encuesta.id, titulo: p.encuesta.titulo },
        preguntas: ((p.encuesta as any).preguntas ?? []).filter((q: any) => q.activo).sort((a: any, b: any) => a.orden - b.orden),
        evaluados: miembros
          .filter((m) => m.funcionario.id !== yo.id)
          .map((m) => ({ id: m.funcionario.id, nombre: `${(m.funcionario as any).persona?.nombre ?? ''}`.trim() })),
      });
    }
    return out;
  });

  /**
   * Voto único por período. respuestas: [{ evaluadoId, preguntaId, valor }].
   * Exige usuario del request (PWA en modo servidor) o la sesión local; la identidad nunca viene del cliente.
   */
  ipcMain.handle('dr-votar', async (_e, periodoId: number, respuestas: RespuestaEnvio[]) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.VOTAR);
    const votante = getRequestUser() ?? user;
    const yo = await funcionarioDe(dataSource, votante);
    const periodo = await dataSource.getRepository(DrPeriodo).findOne({
      where: { id: periodoId } as any,
      relations: ['encuesta', 'encuesta.grupo', 'encuesta.preguntas'],
    });
    if (!periodo || !periodo.encuesta) fail('NO_ENCONTRADO', 'ENCUESTA NO ENCONTRADA');
    if (periodo.estado !== DrPeriodoEstado.ABIERTO) fail('PERIODO_CERRADO', 'LA ENCUESTA YA CERRÓ');
    const miembros = await miembrosDeEncuesta(dataSource, periodo.encuesta);
    const mio = miembros.find((m) => m.funcionario.id === yo.id);
    if (!mio) fail('NO_MIEMBRO', 'NO PARTICIPÁS DE ESTA ENCUESTA');
    const preguntasEnt: DrEncuestaPregunta[] = ((periodo.encuesta as any).preguntas ?? []).filter((q: any) => q.activo);
    const preguntas: PreguntaEncuesta[] = preguntasEnt.map((q: any) => ({
      id: q.id, tipo: q.tipo, escalaMin: q.escalaMin, escalaMax: q.escalaMax, obligatoria: q.obligatoria,
    }));
    try {
      assertEnvioValido(yo.id, miembros.map((m) => m.funcionario.id), preguntas, respuestas ?? []);
    } catch (e) {
      aError(e);
    }

    const peso = Number(mio.pesoVoto) || 1;
    const tipoDe = new Map(preguntas.map((q) => [String(q.id), q.tipo]));
    const clave = claveVotos();
    // Una sola transacción: participación + agregados. Si algo falla, no queda participación
    // registrada sin su voto (y la persona puede volver a votar).
    await dataSource.transaction(async (m) => {
      // 1) Participación (índice único periodo+funcionario: un segundo voto choca acá).
      try {
        await m.getRepository(DrParticipacion).insert({ id: drNuevoUuid(), periodo: { id: periodo.id }, funcionario: { id: yo.id } } as any);
      } catch {
        fail('YA_VOTO', 'YA VOTASTE EN ESTA ENCUESTA');
      }
      // 2) Agregados cifrados + textos, sin votante.
      for (const r of respuestas) {
        const tipo = tipoDe.get(String(r.preguntaId))!;
        if (r.valor === null || r.valor === undefined || (typeof r.valor === 'string' && !r.valor.trim())) continue;
        if (tipo === 'TEXTO') {
          await m.getRepository(DrRespuestaTexto).insert({
            id: drNuevoUuid(),
            periodo: { id: periodo.id }, evaluado: { id: r.evaluadoId }, pregunta: { id: r.preguntaId },
            texto: String(r.valor).trim().toUpperCase(),
          } as any);
          continue;
        }
        const repo = m.getRepository(DrVotoAgregado);
        const where = { periodo: { id: periodo.id }, evaluado: { id: r.evaluadoId }, pregunta: { id: r.preguntaId } } as any;
        const fila = await repo.findOne({ where, ...(esPostgres(dataSource) ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
        const c = ctx(periodo.id, r.evaluadoId, r.preguntaId);
        const previo = fila?.datosCifrados ? descifrarAgregado<AgregadoVoto>(fila.datosCifrados, clave, c) : null;
        const nuevo = acumular(previo, { tipo, valor: r.valor }, peso);
        if (fila) await repo.update({ id: fila.id } as any, { datosCifrados: cifrarAgregado(nuevo, clave, c) } as any);
        else await repo.insert({ id: drNuevoUuid(), ...where, datosCifrados: cifrarAgregado(nuevo, clave, c) });
      }
    });
    return { ok: true };
  });

  /** Cierra el período: descifra los agregados a columnas numéricas y borra el cifrado. */
  ipcMain.handle('dr-cerrar-periodo', async (_e, periodoId: number) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.APROBAR);
    const clave = claveVotos();
    return dataSource.transaction(async (m) => {
      const res = await m.getRepository(DrPeriodo).update(
        { id: periodoId, estado: DrPeriodoEstado.ABIERTO } as any,
        { estado: DrPeriodoEstado.CERRADO, cerradoPor: { id: user.id }, cerradoEn: new Date(), cierraEn: new Date() } as any,
      );
      if (!res.affected) fail('ESTADO_INVALIDO', 'EL PERÍODO NO ESTÁ ABIERTO');
      const filas = await m.getRepository(DrVotoAgregado).find({ where: { periodo: { id: periodoId } } as any, relations: ['evaluado', 'pregunta'] });
      for (const f of filas) {
        if (!f.datosCifrados) continue;
        const a = descifrarAgregado<AgregadoVoto>(f.datosCifrados, clave, ctx(periodoId, f.evaluado.id, f.pregunta.id));
        await m.getRepository(DrVotoAgregado).update({ id: f.id } as any, { ...a, datosCifrados: null } as any);
      }
      const votantes = await m.getRepository(DrParticipacion).count({ where: { periodo: { id: periodoId } } as any });
      return { ok: true, votantes };
    });
  });

  /** Resultados (solo período cerrado y con mínimo de votantes). Promedio ponderado por evaluado/pregunta. */
  ipcMain.handle('dr-get-resultados-encuesta', async (_e, periodoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, P.RESULTADOS);
    const periodo = await dataSource.getRepository(DrPeriodo).findOne({ where: { id: periodoId } as any });
    if (!periodo) fail('NO_ENCONTRADO', 'PERÍODO NO ENCONTRADO');
    if (periodo.estado === DrPeriodoEstado.ABIERTO) fail('PERIODO_ABIERTO', 'LOS RESULTADOS SE VEN CON EL PERÍODO CERRADO');
    const votantes = await dataSource.getRepository(DrParticipacion).count({ where: { periodo: { id: periodoId } } as any });
    const minimo = await minVotantes(dataSource);
    if (votantes < minimo) return { votantes, minimo, suficiente: false, filas: [], textos: [] };
    const filas = await dataSource.getRepository(DrVotoAgregado).find({
      where: { periodo: { id: periodoId } } as any,
      relations: ['evaluado', 'evaluado.persona', 'pregunta'],
    });
    const textos = await dataSource.getRepository(DrRespuestaTexto).find({
      where: { periodo: { id: periodoId } } as any,
      relations: ['evaluado', 'pregunta'],
    });
    return {
      votantes,
      minimo,
      suficiente: true,
      filas: filas.map((f: any) => ({
        evaluadoId: f.evaluado.id,
        evaluado: f.evaluado.persona?.nombre ?? '',
        preguntaId: f.pregunta.id,
        pregunta: f.pregunta.texto,
        tipo: f.pregunta.tipo,
        promedio: Number(f.sumaPesos) > 0 ? Number(f.sumaPonderada) / Number(f.sumaPesos) : null,
        cantidad: Number(f.cantidad) || 0,
        conteoSi: Number(f.conteoSi) || 0,
        conteoNo: Number(f.conteoNo) || 0,
      })),
      // Sin fechas ni ids de fila: no se puede reconstruir el orden de llegada.
      textos: mezclar(textos.map((t: any) => ({ evaluadoId: t.evaluado.id, preguntaId: t.pregunta.id, texto: t.texto }))),
    };
  });
}
