/**
 * Enriquecimiento del repertorio: BPM, energia, valencia y danceability por
 * track, mas el etiquetado semantico con LLM.
 *
 * POR QUE HACE FALTA: Spotify apago `audio-features` en nov-2024. Sin estos
 * datos los perfiles por bloque no muerden — el filtro deja pasar todo lo que
 * no tiene el dato, y las tres variantes de energia salen practicamente
 * iguales. Esto es lo que hace que el almuerzo suene distinto de la noche.
 *
 * Dos fuentes, cada una una sola vez por track (se cachea para siempre):
 *
 *   ReccoBeats  → BPM, energia, valencia, danceability  (reemplazo estandar
 *                 del endpoint muerto de Spotify)
 *   LLM en lote → escenas, ambiente, familiaridad, apto familiar, idioma
 *
 * NOTA SOBRE RECCOBEATS: su documentacion publica no especifica el esquema de
 * respuesta ni la base URL, y hay dos formas de consulta (batch por ids y
 * per-track). Por eso este servicio es deliberadamente defensivo: normaliza
 * nombres de campo alternativos, cae a modo per-track si el batch falla, y la
 * base URL es configurable para poder corregirla sin recompilar.
 */
import { DataSource, IsNull } from 'typeorm';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { EstadoTrack } from '../../src/app/database/entities/musica/musica-enums';
import { readIaConfig } from '../utils/ia-config.utils';
import { readAppSettings } from '../utils/app-settings.utils';

const RECCOBEATS_BASE_DEFAULT = 'https://api.reccobeats.com/v1';
/** Ids por request al pedir el mapeo spotify → reccobeats. */
const LOTE_IDS = 40;
/** Tracks por llamada al LLM. Mas que esto degrada el etiquetado. */
const LOTE_ETIQUETADO = 50;

export interface ResultadoEnriquecimiento {
  procesados: number;
  conFeatures: number;
  sinDatos: number;
  errores: string[];
}

export interface ResultadoEtiquetado {
  procesados: number;
  etiquetados: number;
  errores: string[];
}

/* ─────────────────────── ReccoBeats ─────────────────────── */

function baseUrl(userDataPath: string): string {
  const { musica } = readAppSettings(userDataPath);
  return (musica.avanzado?.reccobeatsUrl || RECCOBEATS_BASE_DEFAULT).replace(/\/$/, '');
}

interface Features {
  bpm?: number;
  energia?: number;
  valencia?: number;
  danceability?: number;
}

/**
 * Normaliza la respuesta sin asumir un unico esquema: ReccoBeats no publica
 * los nombres de campo, y distintas versiones usan `tempo`/`bpm` y
 * `valence`/`valencia`. Si un campo no viene, queda undefined y el track
 * simplemente no gana ese dato.
 */
function normalizarFeatures(raw: any): Features {
  if (!raw || typeof raw !== 'object') return {};
  const num = (v: any): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    bpm: num(raw.tempo ?? raw.bpm ?? raw.Tempo),
    energia: num(raw.energy ?? raw.energia ?? raw.Energy),
    valencia: num(raw.valence ?? raw.valencia ?? raw.Valence),
    danceability: num(raw.danceability ?? raw.Danceability),
  };
}

function tieneAlgo(f: Features): boolean {
  return f.bpm != null || f.energia != null || f.valencia != null || f.danceability != null;
}

async function fetchJson(url: string, timeoutMs = 20000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mapea spotifyId → id interno de ReccoBeats. El endpoint acepta ids repetidos
 * como `?ids=a&ids=b`, y admite tanto ids de Spotify como propios.
 */
async function mapearIds(
  userDataPath: string,
  spotifyIds: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const query = spotifyIds.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
  const data = await fetchJson(`${baseUrl(userDataPath)}/track?${query}`);
  const items: any[] = data?.content ?? data?.tracks ?? data?.data ?? (Array.isArray(data) ? data : []);

  for (const item of items) {
    const propio = item?.id ?? item?.trackId;
    // El id de Spotify puede venir plano o dentro de href/externalUrls.
    const spotify =
      item?.spotifyId ??
      item?.externalIds?.spotify ??
      (typeof item?.href === 'string' ? item.href.split('/').pop() : undefined);
    if (propio && spotify) mapa.set(String(spotify), String(propio));
  }
  return mapa;
}

async function featuresDe(userDataPath: string, idInterno: string): Promise<Features> {
  const data = await fetchJson(`${baseUrl(userDataPath)}/track/${idInterno}/audio-features`);
  // La respuesta puede venir plana o envuelta.
  return normalizarFeatures(data?.content?.[0] ?? data?.audioFeatures ?? data);
}

/**
 * Completa features de los tracks que no las tienen. Idempotente: procesa solo
 * los que les falta, asi que se puede correr muchas veces sin costo extra.
 */
export async function enriquecerFeatures(
  dataSource: DataSource,
  userDataPath: string,
  limite = 200,
): Promise<ResultadoEnriquecimiento> {
  const repo = dataSource.getRepository(MusicaTrack);
  const pendientes = await repo.find({
    where: { bpm: IsNull(), estado: EstadoTrack.APROBADO },
    take: limite,
  });

  const resultado: ResultadoEnriquecimiento = {
    procesados: pendientes.length,
    conFeatures: 0,
    sinDatos: 0,
    errores: [],
  };
  if (pendientes.length === 0) return resultado;

  for (let i = 0; i < pendientes.length; i += LOTE_IDS) {
    const lote = pendientes.slice(i, i + LOTE_IDS);
    let mapa = new Map<string, string>();
    try {
      mapa = await mapearIds(
        userDataPath,
        lote.map((t) => t.spotifyId),
      );
    } catch (e) {
      resultado.errores.push(`Lote ${i / LOTE_IDS + 1}: ${(e as Error).message}`);
    }

    const aGuardar: MusicaTrack[] = [];
    for (const track of lote) {
      // Sin mapeo se intenta igual con el spotifyId: el endpoint acepta ambos.
      const idConsulta = mapa.get(track.spotifyId) || track.spotifyId;
      const f = await featuresDe(userDataPath, idConsulta);

      if (!tieneAlgo(f)) {
        resultado.sinDatos++;
        continue;
      }
      if (f.bpm != null) track.bpm = f.bpm;
      if (f.energia != null) track.energia = f.energia;
      if (f.valencia != null) track.valencia = f.valencia;
      if (f.danceability != null) track.danceability = f.danceability;
      aGuardar.push(track);
      resultado.conFeatures++;
    }
    if (aGuardar.length) await repo.save(aGuardar, { chunk: 100 });
  }

  if (resultado.conFeatures === 0 && resultado.procesados > 0) {
    resultado.errores.push(
      'ReccoBeats no devolvió datos para ningún tema. Verificá la URL del servicio en las opciones avanzadas.',
    );
  }
  return resultado;
}

/* ─────────────────────── Etiquetado con LLM ─────────────────────── */

/**
 * Etiqueta en lote lo que ninguna API de audio puede decir: si un tema encaja
 * en el almuerzo, si es apto para un ambiente familiar, si es conocido o de
 * fondo. Una sola vez por track.
 */
export async function etiquetarTracks(
  dataSource: DataSource,
  userDataPath: string,
  limite = 200,
): Promise<ResultadoEtiquetado> {
  const repo = dataSource.getRepository(MusicaTrack);
  const pendientes = await repo.find({
    where: { etiquetado: false, estado: EstadoTrack.APROBADO },
    take: limite,
  });

  const resultado: ResultadoEtiquetado = {
    procesados: pendientes.length,
    etiquetados: 0,
    errores: [],
  };
  if (pendientes.length === 0) return resultado;

  const ia = await readIaConfig(userDataPath);
  if (!ia.openaiApiKey) {
    throw new Error('FALTA LA API KEY DE IA. CARGALA EN CONFIGURACION → CONFIGURAR IA.');
  }

  for (let i = 0; i < pendientes.length; i += LOTE_ETIQUETADO) {
    const lote = pendientes.slice(i, i + LOTE_ETIQUETADO);
    const listado = lote
      .map((t, idx) => `${idx + 1}. ${t.artista} — ${t.titulo}${t.genero ? ` (${t.genero})` : ''}`)
      .join('\n');

    const prompt = [
      'Sos el curador musical de un restaurante familiar. Etiquetá cada canción de la lista.',
      '',
      'Para cada una devolvé:',
      '- escenas: en qué momentos del día encaja. Valores posibles: "apertura", "almuerzo",',
      '  "sobremesa", "tarde", "cena", "noche", "sunset".',
      '- ambiente: "relajado" | "alegre" | "energico" | "melancolico".',
      '- familiaridad: "conocida" si es un hit reconocible, "descubrimiento" si no.',
      '- aptoFamiliar: false si tiene contenido sexual, vulgar o de doble sentido, aunque no',
      '  esté marcada como explícita. true en caso contrario.',
      '- idioma: código ISO de 2 letras ("es", "pt", "en", "instrumental" si no tiene letra).',
      '',
      'CANCIONES:',
      listado,
      '',
      'Devolvé SOLO JSON: {"tracks":[{"n":1,"escenas":[],"ambiente":"","familiaridad":"","aptoFamiliar":true,"idioma":""}]}',
    ].join('\n');

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ia.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: ia.modelo || 'gpt-4o',
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' },
          // Clasificación, no creatividad: acá sí conviene 0.
          temperature: 0,
        }),
      });
      if (!res.ok) {
        resultado.errores.push(`Lote ${i / LOTE_ETIQUETADO + 1}: HTTP ${res.status}`);
        continue;
      }
      const payload: any = await res.json();
      const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
      const filas: any[] = parsed?.tracks || [];

      const aGuardar: MusicaTrack[] = [];
      for (const fila of filas) {
        const idx = Number(fila?.n) - 1;
        const track = lote[idx];
        if (!track) continue;
        track.escenas = Array.isArray(fila.escenas) ? fila.escenas : undefined;
        track.ambiente = fila.ambiente || undefined;
        track.familiaridad = fila.familiaridad || undefined;
        track.aptoFamiliar = fila.aptoFamiliar !== false;
        track.idioma = fila.idioma || undefined;
        track.etiquetado = true;
        // El etiquetado es tambien un filtro de contenido: lo que el modelo
        // marca como no apto sale del repertorio sin pasar por el dueno.
        if (fila.aptoFamiliar === false) track.estado = EstadoTrack.VETADO;
        aGuardar.push(track);
        resultado.etiquetados++;
      }
      if (aGuardar.length) await repo.save(aGuardar, { chunk: 100 });
    } catch (e) {
      resultado.errores.push(`Lote ${i / LOTE_ETIQUETADO + 1}: ${(e as Error).message}`);
    }
  }

  return resultado;
}
