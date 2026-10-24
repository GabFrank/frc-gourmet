/**
 * Votación anónima (puro). Ver PLAN §4 y §12.
 * No guarda votos individuales: cada envío se valida completo y se suma a agregados por
 * (evaluado, pregunta). Los agregados del período ABIERTO se guardan cifrados (AES-256-GCM).
 */
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'crypto';
import { DisciplinaError, Id } from './errores';

export type TipoPregunta = 'ESCALA' | 'SI_NO' | 'TEXTO';

export interface PreguntaEncuesta {
  id: Id;
  tipo: TipoPregunta;
  /** Solo ESCALA. Default 1. */
  escalaMin?: number | null;
  /** Solo ESCALA. */
  escalaMax?: number | null;
  obligatoria: boolean;
}

export type ValorRespuesta = number | boolean | string | null | undefined;

export interface RespuestaEnvio {
  evaluadoId: Id;
  preguntaId: Id;
  valor: ValorRespuesta;
}

export type CodigoErrorVoto =
  | 'SIN_VOTANTE'
  | 'AUTOVOTO'
  | 'EVALUADO_NO_ESPERADO'
  | 'ENVIO_INCOMPLETO'
  | 'PREGUNTA_INEXISTENTE'
  | 'RESPUESTA_DUPLICADA'
  | 'OBLIGATORIA_SIN_RESPUESTA'
  | 'FUERA_DE_RANGO'
  | 'TIPO_INVALIDO';

export interface ErrorVoto {
  codigo: CodigoErrorVoto;
  mensaje: string;
  evaluadoId?: Id;
  preguntaId?: Id;
}

export interface ResultadoValidacionVoto {
  valido: boolean;
  errores: ErrorVoto[];
}

export interface AgregadoVoto {
  sumaPonderada: number;
  sumaPesos: number;
  cantidad: number;
  conteoSi: number;
  conteoNo: number;
}

const k = (id: Id) => String(id);

function vacio(v: ValorRespuesta): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Valida un envío único de votación.
 * @param evaluadosEsperados miembros activos del grupo (si incluye al votante, se lo excluye).
 * Los mensajes NO incluyen valores de respuesta (no filtrar votos a logs).
 */
export function validarEnvio(
  votanteId: Id | null | undefined,
  evaluadosEsperados: ReadonlyArray<Id>,
  preguntas: ReadonlyArray<PreguntaEncuesta>,
  respuestas: ReadonlyArray<RespuestaEnvio>,
): ResultadoValidacionVoto {
  const errores: ErrorVoto[] = [];
  if (votanteId === null || votanteId === undefined || k(votanteId) === '') {
    return { valido: false, errores: [{ codigo: 'SIN_VOTANTE', mensaje: 'NO SE PUDO IDENTIFICAR AL VOTANTE' }] };
  }
  const votante = k(votanteId);
  const esperados = new Set(evaluadosEsperados.map(k).filter((e) => e !== votante));
  const preguntasPorId = new Map(preguntas.map((p) => [k(p.id), p]));
  const vistos = new Set<string>();
  const invalidas = new Set<string>(); // ya reportadas por valor inválido
  const respondidas = new Map<string, Set<string>>(); // evaluado -> preguntas con valor

  for (const r of respuestas) {
    const ev = k(r.evaluadoId);
    const pq = k(r.preguntaId);
    if (ev === votante) {
      if (!errores.some((e) => e.codigo === 'AUTOVOTO')) {
        errores.push({ codigo: 'AUTOVOTO', mensaje: 'NO PODÉS VOTARTE A VOS MISMO' });
      }
      continue;
    }
    if (!esperados.has(ev)) {
      if (errores.some((e) => e.codigo === 'EVALUADO_NO_ESPERADO' && k(e.evaluadoId!) === ev)) continue;
      errores.push({ codigo: 'EVALUADO_NO_ESPERADO', mensaje: 'EVALUADO FUERA DEL GRUPO', evaluadoId: r.evaluadoId });
      continue;
    }
    const p = preguntasPorId.get(pq);
    if (!p) {
      errores.push({ codigo: 'PREGUNTA_INEXISTENTE', mensaje: 'PREGUNTA INEXISTENTE', preguntaId: r.preguntaId });
      continue;
    }
    const clave = `${ev}|${pq}`;
    if (vistos.has(clave)) {
      errores.push({ codigo: 'RESPUESTA_DUPLICADA', mensaje: 'RESPUESTA DUPLICADA', evaluadoId: r.evaluadoId, preguntaId: r.preguntaId });
      continue;
    }
    vistos.add(clave);
    if (!respondidas.has(ev)) respondidas.set(ev, new Set());
    if (vacio(r.valor)) continue;
    const errTipo = validarValor(p, r.valor);
    if (errTipo) {
      errores.push({ ...errTipo, evaluadoId: r.evaluadoId, preguntaId: r.preguntaId });
      invalidas.add(clave);
      continue;
    }
    respondidas.get(ev)!.add(pq);
  }

  const faltantes = [...esperados].filter((e) => !respondidas.has(e));
  if (faltantes.length > 0) {
    errores.push({
      codigo: 'ENVIO_INCOMPLETO',
      mensaje: `ENVÍO INCOMPLETO: FALTAN ${faltantes.length} COMPAÑERO(S)`,
    });
  }
  for (const [ev, pqs] of respondidas) {
    for (const p of preguntas) {
      if (p.obligatoria && !pqs.has(k(p.id)) && !invalidas.has(`${ev}|${k(p.id)}`)) {
        errores.push({ codigo: 'OBLIGATORIA_SIN_RESPUESTA', mensaje: 'PREGUNTA OBLIGATORIA SIN RESPUESTA', evaluadoId: ev, preguntaId: p.id });
      }
    }
  }
  return { valido: errores.length === 0, errores };
}

function validarValor(p: PreguntaEncuesta, valor: ValorRespuesta): Omit<ErrorVoto, 'evaluadoId' | 'preguntaId'> | null {
  switch (p.tipo) {
    case 'ESCALA': {
      if (typeof valor !== 'number' || !Number.isInteger(valor)) {
        return { codigo: 'TIPO_INVALIDO', mensaje: 'LA ESCALA ESPERA UN NÚMERO ENTERO' };
      }
      const min = p.escalaMin ?? 1;
      const max = p.escalaMax ?? Number.POSITIVE_INFINITY;
      if (valor < min || valor > max) return { codigo: 'FUERA_DE_RANGO', mensaje: `VALOR FUERA DE RANGO (${min}-${p.escalaMax ?? '∞'})` };
      return null;
    }
    case 'SI_NO':
      return typeof valor === 'boolean' ? null : { codigo: 'TIPO_INVALIDO', mensaje: 'SE ESPERA SÍ O NO' };
    case 'TEXTO':
      return typeof valor === 'string' ? null : { codigo: 'TIPO_INVALIDO', mensaje: 'SE ESPERA TEXTO' };
    default:
      return { codigo: 'TIPO_INVALIDO', mensaje: 'TIPO DE PREGUNTA DESCONOCIDO' };
  }
}

/** Lanza DisciplinaError con el primer error si el envío no es válido. */
export function assertEnvioValido(
  votanteId: Id | null | undefined,
  evaluadosEsperados: ReadonlyArray<Id>,
  preguntas: ReadonlyArray<PreguntaEncuesta>,
  respuestas: ReadonlyArray<RespuestaEnvio>,
): void {
  const r = validarEnvio(votanteId, evaluadosEsperados, preguntas, respuestas);
  if (!r.valido) throw new DisciplinaError(r.errores[0].codigo, r.errores[0].mensaje);
}

export function agregadoVacio(): AgregadoVoto {
  return { sumaPonderada: 0, sumaPesos: 0, cantidad: 0, conteoSi: 0, conteoNo: 0 };
}

/**
 * Suma una respuesta (ESCALA o SI_NO) al agregado, con el peso del votante.
 * SI_NO se normaliza Sí = 1 / No = 0. Respuesta vacía → agregado sin cambios.
 * TEXTO no se agrega (va a dr_respuesta_texto).
 */
export function acumular(
  agregadoPrevio: AgregadoVoto | null | undefined,
  respuesta: { tipo: TipoPregunta; valor: ValorRespuesta },
  peso: number,
): AgregadoVoto {
  const a: AgregadoVoto = { ...(agregadoPrevio ?? agregadoVacio()) };
  if (vacio(respuesta.valor)) return a;
  const w = Number(peso);
  if (!Number.isFinite(w) || w <= 0) throw new DisciplinaError('PESO_INVALIDO', 'PESO DE VOTO INVÁLIDO');
  let x: number;
  if (respuesta.tipo === 'ESCALA') {
    x = Number(respuesta.valor);
    if (!Number.isFinite(x)) throw new DisciplinaError('TIPO_INVALIDO', 'LA ESCALA ESPERA UN NÚMERO');
  } else if (respuesta.tipo === 'SI_NO') {
    if (typeof respuesta.valor !== 'boolean') throw new DisciplinaError('TIPO_INVALIDO', 'SE ESPERA SÍ O NO');
    x = respuesta.valor ? 1 : 0;
    if (respuesta.valor) a.conteoSi++; else a.conteoNo++;
  } else {
    throw new DisciplinaError('TIPO_INVALIDO', 'LAS RESPUESTAS DE TEXTO NO SE AGREGAN');
  }
  a.sumaPonderada += x * w;
  a.sumaPesos += w;
  a.cantidad++;
  return a;
}

// ---------------------------------------------------------------------------
// Cifrado AES-256-GCM de agregados (período ABIERTO). Formato: base64(iv):base64(tag):base64(data)
// `contexto` (opcional) se usa como AAD para atar el cifrado a su fila (p. ej. "periodo|evaluado|pregunta"):
// así no se pueden intercambiar valores cifrados entre filas.
// ---------------------------------------------------------------------------

function validarClave(clave: Buffer): void {
  if (!Buffer.isBuffer(clave) || clave.length !== 32) {
    throw new DisciplinaError('CLAVE_INVALIDA', 'LA CLAVE DE CIFRADO DEBE TENER 32 BYTES');
  }
}

export function generarClaveVotos(): Buffer {
  return randomBytes(32);
}

export function cifrarAgregado(obj: unknown, clave: Buffer, contexto?: string): string {
  validarClave(clave);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave, iv);
  if (contexto !== undefined) cipher.setAAD(Buffer.from(contexto, 'utf8'));
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function descifrarAgregado<T = AgregadoVoto>(texto: string, clave: Buffer, contexto?: string): T {
  validarClave(clave);
  const partes = String(texto ?? '').split(':');
  if (partes.length !== 3) throw new DisciplinaError('CIFRADO_INVALIDO', 'FORMATO DE AGREGADO CIFRADO INVÁLIDO');
  try {
    const [iv, tag, data] = partes.map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', clave, iv);
    if (contexto !== undefined) decipher.setAAD(Buffer.from(contexto, 'utf8'));
    decipher.setAuthTag(tag);
    const plano = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plano) as T;
  } catch {
    throw new DisciplinaError('CIFRADO_INVALIDO', 'NO SE PUDO DESCIFRAR EL AGREGADO');
  }
}

/** Fisher-Yates con crypto.randomInt. Devuelve una copia mezclada. */
export function mezclar<T>(arr: ReadonlyArray<T>): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
