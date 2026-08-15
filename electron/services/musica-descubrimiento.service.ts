/**
 * Descubrimiento de musica nueva con IA.
 *
 * EL PROBLEMA QUE RESUELVE: el dueno no tiene tiempo de armar playlists — por
 * eso existe este modulo. Con solo re-mezclar las 4 playlists que ya tenia, el
 * local seguiria escuchando lo mismo de siempre. El repertorio tiene que
 * crecer solo.
 *
 * POR QUE CON IA Y NO CON SPOTIFY: la API de Spotify ya no recomienda nada
 * (`recommendations` y `related-artists` se apagaron en nov-2024) y su `search`
 * devuelve 10 resultados como maximo desde feb-2026. Es inutil para descubrir.
 *
 * La division de trabajo que si funciona:
 *
 *      EL LLM DESCUBRE  →  SPOTIFY RESUELVE
 *
 * El modelo conoce catalogo, generos, epocas y escenas: propone "artista —
 * tema". Spotify solo se usa para convertir ese texto en un track real, que es
 * justo para lo que su `search` sigue sirviendo.
 *
 * APRENDIZAJE: cada rechazo del dueno entra al prompt de la proxima ronda como
 * ejemplo negativo. El sistema no se "reentrena": se le da mejor contexto.
 */
import { DataSource } from 'typeorm';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { MusicaVeto } from '../../src/app/database/entities/musica/musica-veto.entity';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { MusicaFeedback } from '../../src/app/database/entities/musica/musica-feedback.entity';
import {
  EstadoTrack,
  normalizarEscenas,
  TipoFeedback,
  TipoVeto,
} from '../../src/app/database/entities/musica/musica-enums';
import { readIaConfig } from '../utils/ia-config.utils';
import { readAppSettings } from '../utils/app-settings.utils';
import { spotifyApi } from './spotify.service';
import { calcularDeficit, listarEstilos } from './musica-estilos.service';

/**
 * Defaults; se sobreescriben desde Configuracion (musica.avanzado).
 * Mas de ~40 candidatos por llamada degrada la calidad de las propuestas.
 */
const CANDIDATOS_POR_RONDA = 40;
/** Muestra del repertorio que se manda como "esto ya lo tengo". */
const MUESTRA_ARTISTAS = 60;
/** Rechazos que se mandan como ejemplos negativos. */
const MAX_RECHAZOS_EN_PROMPT = 40;
/** Descarta intros, skits y sets largos que no sirven de fondo. */
const DURACION_MIN_MS_DEFAULT = 60_000;
const DURACION_MAX_MS_DEFAULT = 600_000;

export interface CandidatoIa {
  artista: string;
  tema: string;
  genero?: string;
  motivo?: string;
  escenas?: string[];
}

export interface ResultadoDescubrimiento {
  propuestos: number;
  agregados: number;
  yaEstaban: number;
  noEncontrados: number;
  filtrados: number;
  detalleFiltrados: string[];
  agregadosDetalle: Array<{ artista: string; tema: string; motivo?: string }>;
}

/* ─────────────────────── Contexto del local ─────────────────────── */

/** Cuanto material falta de un estilo, sumado sobre todos los bloques. */
export interface FaltanteEstilo {
  estiloNombre: string;
  /** Descripcion del catalogo: lo que distingue este estilo de otro del mismo genero. */
  descripcion?: string;
  /** Horas que piden las cuotas y no existen en el repertorio. */
  faltanteHoras: number;
  tracksFaltantes: number;
  tracksDisponibles: number;
}

export interface ContextoMusical {
  /** @deprecated Texto libre del bloque; lo reemplazo el catalogo de estilos. */
  generosPreferidos: string[];
  /** Estilos del catalogo con voto positivo. */
  estilosQueGustan: string[];
  /** Estilos con voto negativo: no prohibidos, solo desaconsejados. */
  estilosQueGustanMenos: string[];
  /** Estilos apagados con un veto global: prohibidos, como los generos vetados. */
  estilosVetados: string[];
  /** Lo que las cuotas piden y el repertorio no tiene. Ordenado por urgencia. */
  faltantes: FaltanteEstilo[];
  generosVetados: string[];
  artistasVetados: string[];
  artistasEnPool: string[];
  rechazados: string[];
  gustados: string[];
  bloques: Array<{ nombre: string; energia: number; generos: string[]; notas?: string }>;
}

/**
 * Reune todo lo que el local ya dijo sobre su musica.
 *
 * ESTA EXPORTADA A PROPOSITO: la pantalla "Mi estilo" la usa para mostrar el
 * criterio ANTES de descubrir. Si el panel se armara con otra consulta, en dos
 * cambios diria una cosa y el prompt haria otra.
 */
export async function construirContexto(
  dataSource: DataSource,
  bloque?: BloqueProgramacion | null,
  factorDuracion = 1.5,
): Promise<ContextoMusical> {
  const vetoRepo = dataSource.getRepository(MusicaVeto);
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
  const feedbackRepo = dataSource.getRepository(MusicaFeedback);

  const vetos = await vetoRepo.find({ where: { activo: true }, relations: ['estilo'] });
  const bloques = bloque
    ? [bloque]
    : await bloqueRepo.find({ where: { activo: true }, order: { diaSemana: 'ASC' } });

  // Artistas mas presentes en el pool: el modelo necesita saber que ya hay
  // para proponer OTRA cosa, no mas de lo mismo.
  const artistas = await trackRepo
    .createQueryBuilder('t')
    .select('t.artista', 'artista')
    .addSelect('COUNT(*)', 'cantidad')
    .where('t.estado != :vetado', { vetado: EstadoTrack.VETADO })
    .groupBy('t.artista')
    .orderBy('cantidad', 'DESC')
    .limit(MUESTRA_ARTISTAS)
    .getRawMany();

  const rechazados = await trackRepo.find({
    where: { estado: EstadoTrack.VETADO },
    take: MAX_RECHAZOS_EN_PROMPT,
    order: { updatedAt: 'DESC' },
  });

  const gustados = await feedbackRepo.find({
    where: { tipo: TipoFeedback.MAS_DE_ESTO },
    take: 20,
    order: { fecha: 'DESC' },
  });

  // Texto libre de la grilla. Se conserva porque los bloques viejos todavia lo
  // tienen cargado, pero el criterio real ahora es el catalogo de estilos.
  const generosPreferidos = new Set<string>();
  for (const b of bloques) for (const g of b.generosPreferidos || []) generosPreferidos.add(g);

  // ─────────── El catalogo de estilos ───────────
  //
  // ESTO ES LO QUE FALTABA. El descubridor leia `generosPreferidos` — el texto
  // libre que el catalogo vino a reemplazar en F4 — y nunca veia ni las cuotas
  // por bloque, ni los estilos apagados, ni el voto del dueno. Por eso el
  // repertorio crecia donde el modelo tenia mas material de entrenamiento
  // (indie anglo) en vez de donde las cuotas lo pedian: medido en produccion,
  // PAGODE tenia 6 temas contra una cuota del 40%.
  const catalogo = await listarEstilos(dataSource);
  const estilosQueGustan = catalogo.filter((e) => e.preferencia > 0 && !e.vetado).map((e) => e.nombre);
  const estilosQueGustanMenos = catalogo
    .filter((e) => e.preferencia < 0 && !e.vetado)
    .map((e) => e.nombre);
  const estilosVetadosNombres = catalogo.filter((e) => e.vetado).map((e) => e.nombre);

  // Deficit: cuanta musica piden las cuotas y no existe. Es el dato que
  // convierte "proponeme musica linda" en "faltan 2 horas de pagode".
  const descripcionPorEstilo = new Map(catalogo.map((e) => [e.nombre, e.descripcion || undefined]));
  const disponiblePorEstilo = new Map(catalogo.map((e) => [e.nombre, e.tracks]));
  const acumulado = new Map<string, { faltanteMs: number; tracksFaltantes: number }>();
  for (const d of await calcularDeficit(dataSource, factorDuracion, bloque?.id)) {
    for (const e of d.estilos) {
      if (e.faltanteMs <= 0) continue;
      const prev = acumulado.get(e.estiloNombre) || { faltanteMs: 0, tracksFaltantes: 0 };
      // Se toma el MAXIMO y no la suma: la misma musica sirve para el almuerzo
      // del lunes y el del martes. Sumar los 31 bloques diria que faltan 60
      // horas de pagode cuando alcanza con cubrir el bloque mas exigente.
      acumulado.set(e.estiloNombre, {
        faltanteMs: Math.max(prev.faltanteMs, e.faltanteMs),
        tracksFaltantes: Math.max(prev.tracksFaltantes, e.tracksFaltantes),
      });
    }
  }
  const faltantes: FaltanteEstilo[] = Array.from(acumulado.entries())
    // Un estilo apagado no necesita material: pedirlo seria gastar la ronda en
    // musica que nunca va a sonar.
    .filter(([nombre]) => !estilosVetadosNombres.includes(nombre))
    .map(([estiloNombre, v]) => ({
      estiloNombre,
      descripcion: descripcionPorEstilo.get(estiloNombre),
      faltanteHoras: Math.round((v.faltanteMs / 3600000) * 10) / 10,
      tracksFaltantes: v.tracksFaltantes,
      tracksDisponibles: disponiblePorEstilo.get(estiloNombre) ?? 0,
    }))
    .sort((a, b) => b.faltanteHoras - a.faltanteHoras);

  return {
    generosPreferidos: Array.from(generosPreferidos),
    estilosQueGustan,
    estilosQueGustanMenos,
    estilosVetados: estilosVetadosNombres,
    faltantes,
    generosVetados: vetos.filter((v) => v.tipo === TipoVeto.GENERO).map((v) => v.valor),
    artistasVetados: vetos
      .filter((v) => v.tipo === TipoVeto.ARTISTA)
      .map((v) => v.etiqueta || v.valor),
    artistasEnPool: artistas.map((a) => a.artista),
    rechazados: rechazados.map((t) => `${t.artista} — ${t.titulo}`),
    gustados: gustados.map((f) => `${f.titulo || ''}`).filter(Boolean),
    bloques: bloques.map((b) => ({
      nombre: b.nombre,
      energia: b.energia,
      generos: b.generosPreferidos || [],
      notas: b.notas,
    })),
  };
}

export function construirPrompt(ctx: ContextoMusical, cantidad: number, brief?: string): string {
  const lineas: string[] = [];

  lineas.push(
    'Sos el curador musical de un restaurante. Tu tarea es proponer musica NUEVA para su ambiente,',
    'que encaje con su identidad pero que NO sea lo que ya tiene sonando.',
    '',
  );

  if (brief) {
    lineas.push('SOBRE EL LOCAL (escrito por el dueno):', brief, '');
  }

  // Lo que falta va PRIMERO y con numeros: es la unica seccion que le dice al
  // modelo donde poner el esfuerzo. Sin esto proponia lo que mas abunda en su
  // entrenamiento y las cuotas del planner se quedaban sin material.
  if (ctx.faltantes.length) {
    lineas.push(
      'LO QUE MAS FALTA (esto es lo que el local NECESITA, priorizalo sobre todo lo demas):',
    );
    for (const f of ctx.faltantes.slice(0, 8)) {
      lineas.push(
        `- ${f.estiloNombre}: faltan ~${f.faltanteHoras} h (${f.tracksFaltantes} temas). ` +
          `Hoy tiene ${f.tracksDisponibles}.` +
          (f.descripcion ? ` Es: ${f.descripcion}` : ''),
      );
    }
    lineas.push(
      'Reparti las propuestas en proporcion a lo que falta: el estilo que encabeza la lista',
      'tiene que ser el mas representado en tu respuesta.',
      '',
    );
  }

  if (ctx.bloques.length) {
    lineas.push('MOMENTOS DEL DIA A CUBRIR:');
    for (const b of ctx.bloques) {
      lineas.push(
        `- ${b.nombre} (energia ${b.energia}/5)${b.generos.length ? `: ${b.generos.join(', ')}` : ''}` +
          (b.notas ? ` — ${b.notas}` : ''),
      );
    }
    lineas.push('');
  }

  if (ctx.estilosQueGustan.length) {
    lineas.push(`LO QUE MAS LE GUSTA: ${ctx.estilosQueGustan.join(', ')}`, '');
  }
  if (ctx.estilosQueGustanMenos.length) {
    lineas.push(
      `LE GUSTA MENOS (no esta prohibido, pero proponé poco): ${ctx.estilosQueGustanMenos.join(', ')}`,
      '',
    );
  }
  if (ctx.generosPreferidos.length) {
    lineas.push(`TAMBIEN NOMBRO: ${ctx.generosPreferidos.join(', ')}`, '');
  }

  lineas.push(
    'PROHIBIDO (no propongas nada de esto, es motivo de rechazo inmediato):',
    `- Generos: ${ctx.generosVetados.join(', ') || '—'}`,
    // Un estilo apagado es tan prohibido como un genero vetado, y hasta ahora
    // no llegaba al prompt: el dueno lo apagaba y la IA lo seguia proponiendo.
    `- Estilos que el local apago: ${ctx.estilosVetados.join(', ') || '—'}`,
    `- Artistas: ${ctx.artistasVetados.join(', ') || '—'}`,
    '- Canciones con contenido explicito, vulgar o de doble sentido (es un local familiar).',
    '- Canciones tristes, melancolicas o de despecho: el ambiente tiene que ser alegre.',
    '',
  );

  if (ctx.artistasEnPool.length) {
    lineas.push(
      'ARTISTAS QUE YA TIENE (proponer OTROS; a lo sumo un tema distinto de estos si es muy afin):',
      ctx.artistasEnPool.join(', '),
      '',
    );
  }

  if (ctx.rechazados.length) {
    lineas.push(
      'YA RECHAZO ESTO (aprende del patron y evita cosas parecidas):',
      ctx.rechazados.join(' | '),
      '',
    );
  }

  if (ctx.gustados.length) {
    lineas.push('LE GUSTO ESPECIALMENTE (mas en esta linea):', ctx.gustados.join(' | '), '');
  }

  lineas.push(
    `Proponé ${cantidad} canciones. Reglas:`,
    '- Variedad real: no mas de 1 tema por artista en toda la lista.',
    '- Canciones que existan en Spotify, con el nombre exacto del artista y del tema.',
    '- Mezclá conocidas con hallazgos menos obvios, pero siempre agradables de fondo.',
    '- Priorizá la escena/momento del dia que mas material necesite.',
    // Sin esto el modelo se va a lo que mas abunda en su entrenamiento (indie
    // anglo) e ignora los estilos regionales que el dueno nombro, que suelen
    // ser justamente la identidad del local.
    '- EQUILIBRIO: la lista tiene que reflejar TODOS los estilos que pidio el local, repartidos',
    '  entre los momentos que les corresponden. Ningun idioma ni pais puede pasar del 50% de la',
    '  lista. Una lista entera en ingles es incorrecta si el local pidio generos regionales; una',
    '  lista entera de un solo pais tambien lo es si el local ademas pidio hits mundiales o rock.',
    '- Si la descripcion nombra ARTISTAS concretos (por ejemplo bandas locales), incluí temas de',
    '  esos artistas o de otros muy afines a ellos: son la identidad del local.',
    // El veto se evalua sobre el genero que declara el modelo, asi que una
    // etiqueta imprecisa lo esquiva: en la prueba entraron temas de rap
    // declarados como "MPB moderna" o "pop alternativo".
    '- El campo "genero" tiene que ser el genero REAL Y PRINCIPAL del artista, no una etiqueta',
    '  suavizada. Si el artista es de rap, hip hop o trap, el genero es "rap" aunque el tema',
    '  puntual suene melodico. Declarar un genero equivocado para esquivar un veto es una',
    '  respuesta INCORRECTA: si el artista pertenece a un genero vetado, NO lo propongas.',
    '',
    'Devolvé SOLO JSON con esta forma:',
    '{"candidatos":[{"artista":"","tema":"","genero":"","escenas":["almuerzo"],"motivo":"por que encaja, breve"}]}',
  );

  return lineas.join('\n');
}

/* ─────────────────────── Llamada al modelo ─────────────────────── */

async function pedirCandidatosAlModelo(
  userDataPath: string,
  prompt: string,
): Promise<CandidatoIa[]> {
  const ia = await readIaConfig(userDataPath);
  if (!ia.openaiApiKey) {
    throw new Error(
      'FALTA LA API KEY DE IA. CARGALA EN CONFIGURACION → CONFIGURAR IA PARA USAR EL DESCUBRIMIENTO.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ia.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: ia.modelo || 'gpt-4o',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Dame la lista de canciones en JSON.' },
        ],
        response_format: { type: 'json_object' },
        // Algo de temperatura a proposito: con 0 propone siempre lo mismo y el
        // repertorio dejaria de crecer despues de un par de rondas.
        temperature: 0.8,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 401) throw new Error('LA API KEY DE IA NO ES VALIDA.');
      if (res.status === 429) {
        throw new Error('SIN CREDITOS O LIMITE DE IA ALCANZADO. REVISA TU CUENTA DE OPENAI.');
      }
      throw new Error(`ERROR DE IA (${res.status}): ${txt.slice(0, 200)}`);
    }

    const payload: any = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LA IA NO DEVOLVIO RESPUESTA.');

    const parsed = JSON.parse(content);
    const candidatos = parsed?.candidatos ?? parsed?.canciones ?? [];
    if (!Array.isArray(candidatos)) throw new Error('LA IA DEVOLVIO UN FORMATO INESPERADO.');
    return candidatos.filter((c: any) => c?.artista && c?.tema);
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────── Resolucion en Spotify ─────────────────────── */

function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "(Remastered 2011)", "- Live", "feat. X" ensucian la comparacion.
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(feat|ft|with)\.?\s.*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte "artista — tema" en un track real. Acepta el match solo si artista
 * y titulo coinciden razonablemente: sin esto, Spotify devuelve cualquier cosa
 * para nombres que no existen y el pool se llena de basura.
 */
async function resolverEnSpotify(
  userDataPath: string,
  candidato: CandidatoIa,
): Promise<any | null> {
  const q = `track:${candidato.tema} artist:${candidato.artista}`;
  const res = await spotifyApi(
    userDataPath,
    'GET',
    `/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
  );
  const items: any[] = res?.tracks?.items || [];
  if (items.length === 0) return null;

  const artistaBuscado = normalizar(candidato.artista);
  const temaBuscado = normalizar(candidato.tema);

  for (const item of items) {
    const artistas = (item.artists || []).map((a: any) => normalizar(a.name));
    const titulo = normalizar(item.name);
    const artistaOk = artistas.some(
      (a: string) => a === artistaBuscado || a.includes(artistaBuscado) || artistaBuscado.includes(a),
    );
    const temaOk = titulo === temaBuscado || titulo.includes(temaBuscado) || temaBuscado.includes(titulo);
    if (artistaOk && temaOk) return item;
  }
  return null;
}

/**
 * Generos REALES del artista segun Spotify, cacheados por id.
 *
 * El veto no puede depender del genero que declara el modelo: aun pidiendole
 * explicitamente el genero principal, disfraza los vetados para colarlos
 * ("J Balvin: latin pop" cuando es reggaeton, "Marcelo D2: MPB" cuando es rap).
 * Spotify publica los generos del artista y eso es dato duro, no opinion.
 */
const cacheGenerosArtista = new Map<string, string[]>();

/** Rechazos del mismo artista que disparan la sugerencia de vetarlo entero. */
const RECHAZOS_PARA_SUGERIR_VETO = 3;
/** Ventana del conteo: un "no va" de hace medio ano no deberia pesar hoy. */
const DIAS_VENTANA_RECHAZOS = 30;

async function generosDelArtista(userDataPath: string, artistaId?: string): Promise<string[]> {
  if (!artistaId) return [];
  const cacheado = cacheGenerosArtista.get(artistaId);
  if (cacheado) return cacheado;
  try {
    const artista = await spotifyApi(userDataPath, 'GET', `/artists/${artistaId}`);
    const generos: string[] = (artista?.genres || []).map((g: string) => g.toUpperCase());
    cacheGenerosArtista.set(artistaId, generos);
    return generos;
  } catch {
    // Si Spotify no responde no se bloquea el tema: el resto de los filtros sigue.
    return [];
  }
}

/* ─────────────────────── Flujo principal ─────────────────────── */

export async function descubrirMusica(
  dataSource: DataSource,
  userDataPath: string,
  opts?: { cantidad?: number; bloqueId?: number; brief?: string; usuarioId?: number },
): Promise<ResultadoDescubrimiento> {
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const vetoRepo = dataSource.getRepository(MusicaVeto);
  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);

  const bloque = opts?.bloqueId
    ? await bloqueRepo.findOne({ where: { id: opts.bloqueId } })
    : null;

  const ctx = await construirContexto(
    dataSource,
    bloque,
    readAppSettings(userDataPath).musica.avanzado?.factorDuracion || 1.5,
  );
  const cantidad =
    opts?.cantidad ||
    readAppSettings(userDataPath).musica.avanzado?.candidatosPorRonda ||
    CANDIDATOS_POR_RONDA;
  const prompt = construirPrompt(ctx, cantidad, opts?.brief);
  const candidatos = await pedirCandidatosAlModelo(userDataPath, prompt);

  const { musica } = readAppSettings(userDataPath);
  const autoAprobar = musica.autoAprobarDescubrimientos !== false;
  const av = musica.avanzado;
  const durMin = av?.duracionMinSeg ? av.duracionMinSeg * 1000 : DURACION_MIN_MS_DEFAULT;
  const durMax = av?.duracionMaxSeg ? av.duracionMaxSeg * 1000 : DURACION_MAX_MS_DEFAULT;
  const permitirExplicit = av?.permitirExplicit === true;

  const vetos = await vetoRepo.find({ where: { activo: true } });
  const artistasVetados = new Set(
    vetos.filter((v) => v.tipo === TipoVeto.ARTISTA).map((v) => (v.etiqueta || v.valor).toUpperCase()),
  );
  const generosVetados = vetos.filter((v) => v.tipo === TipoVeto.GENERO).map((v) => v.valor);

  const resultado: ResultadoDescubrimiento = {
    propuestos: candidatos.length,
    agregados: 0,
    yaEstaban: 0,
    noEncontrados: 0,
    filtrados: 0,
    detalleFiltrados: [],
    agregadosDetalle: [],
  };

  for (const c of candidatos) {
    // Filtro barato ANTES de gastar un request de Spotify.
    if (artistasVetados.has((c.artista || '').toUpperCase())) {
      resultado.filtrados++;
      resultado.detalleFiltrados.push(`${c.artista} — ${c.tema}: artista vetado`);
      continue;
    }
    // Una sola direccion (ver pasaVetos en musica-planner): con inclusion
    // bidireccional, vetar "FUNK BRASILEIRO" descartaba tambien el funk
    // americano, que es soul/groove y no tiene relacion.
    const generoCand = (c.genero || '').toUpperCase();
    if (generoCand && generosVetados.some((g) => generoCand.includes(g))) {
      resultado.filtrados++;
      resultado.detalleFiltrados.push(`${c.artista} — ${c.tema}: genero vetado (${c.genero})`);
      continue;
    }

    let item: any = null;
    try {
      item = await resolverEnSpotify(userDataPath, c);
    } catch {
      // Un fallo puntual de la API no debe abortar la ronda entera.
      item = null;
    }
    if (!item) {
      resultado.noEncontrados++;
      continue;
    }

    // Veto sobre los generos REALES del artista, no sobre lo que declaro la IA.
    const generosReales = await generosDelArtista(userDataPath, item.artists?.[0]?.id);
    const vetadoReal = generosReales.find((real) =>
      generosVetados.some((veto) => real.includes(veto) || veto.includes(real)),
    );
    if (vetadoReal) {
      resultado.filtrados++;
      resultado.detalleFiltrados.push(
        `${c.artista} — ${c.tema}: el artista es de un género vetado según Spotify (${vetadoReal.toLowerCase()})`,
      );
      continue;
    }

    const yaExiste = await trackRepo.findOne({ where: { spotifyId: item.id } });
    if (yaExiste) {
      resultado.yaEstaban++;
      continue;
    }
    if (item.explicit && !permitirExplicit) {
      resultado.filtrados++;
      resultado.detalleFiltrados.push(`${c.artista} — ${c.tema}: marcado explicit`);
      continue;
    }
    const dur = item.duration_ms || 0;
    if (dur < durMin || dur > durMax) {
      resultado.filtrados++;
      resultado.detalleFiltrados.push(`${c.artista} — ${c.tema}: duracion fuera de rango`);
      continue;
    }

    const track = trackRepo.create({
      spotifyId: item.id,
      isrc: item.external_ids?.isrc ?? undefined,
      titulo: (item.name || '').toUpperCase(),
      artista: (item.artists || []).map((a: any) => a.name).join(', ').toUpperCase(),
      artistaId: item.artists?.[0]?.id ?? undefined,
      album: item.album?.name ? String(item.album.name).toUpperCase() : undefined,
      imagenUrl: item.album?.images?.[0]?.url ?? undefined,
      duracionMs: dur,
      explicit: !!item.explicit,
      // Se guarda el genero de Spotify si existe: es mas confiable que la
      // etiqueta del modelo, y es lo que despues filtra el generador.
      genero: generosReales[0] || (c.genero ? c.genero.toUpperCase() : undefined),
      // Mismo vocabulario cerrado que el etiquetado: si entra texto libre aca,
      // el filtro por escena del bloque no lo encuentra nunca.
      escenas: normalizarEscenas(c.escenas),
      // El descubrimiento entra aprobado por defecto: el dueno pidio no tener
      // que curar a mano. Se corrige por sustraccion (boton "no va").
      estado: autoAprobar ? EstadoTrack.APROBADO : EstadoTrack.SUGERIDO,
    } as MusicaTrack);
    await trackRepo.save(track);

    resultado.agregados++;
    resultado.agregadosDetalle.push({ artista: track.artista, tema: track.titulo, motivo: c.motivo });
  }

  return resultado;
}

/**
 * Rechazo del dueno: saca el tema del repertorio y lo convierte en ejemplo
 * negativo para las proximas rondas de descubrimiento.
 *
 * `tambienArtista` corta de raiz cuando el problema es el artista entero.
 */
export async function rechazarTrack(
  dataSource: DataSource,
  spotifyId: string,
  opts?: { tambienArtista?: boolean; bloqueId?: number },
): Promise<{
  success: boolean;
  artistaVetado: boolean;
  /** Cuantas veces se rechazo a este artista en la ventana. */
  rechazosDelArtista: number;
  /** true = mostrar "¿sacamos a X del todo?". La decision la toma el usuario. */
  sugerirVetarArtista: boolean;
  artistaId?: string;
  artistaNombre?: string;
}> {
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const vetoRepo = dataSource.getRepository(MusicaVeto);
  const feedbackRepo = dataSource.getRepository(MusicaFeedback);

  const track = await trackRepo.findOne({ where: { spotifyId } });
  if (!track) throw new Error('EL TEMA NO ESTA EN EL REPERTORIO.');

  track.estado = EstadoTrack.VETADO;
  track.score = (track.score || 0) - 1;
  await trackRepo.save(track);

  await feedbackRepo.save(
    feedbackRepo.create({
      spotifyId,
      artistaId: track.artistaId,
      titulo: track.titulo,
      tipo: TipoFeedback.NO_VA,
      bloqueId: opts?.bloqueId,
      fecha: new Date(),
    }),
  );

  // Conteo de rechazos del artista. Estaba documentado desde F1 ("tres 'No va'
  // al mismo artista generan un veto") pero NUNCA se implemento: el feedback se
  // guardaba y nadie lo leia. Ahora se cuenta, y al llegar al umbral se DEVUELVE
  // la sugerencia en vez de vetar solo: sacar un artista entero del repertorio
  // por tres clicks de un cajero apurado es dificil de deshacer si nadie mira.
  let rechazosDelArtista = 0;
  let sugerirVetarArtista = false;
  if (track.artistaId) {
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_VENTANA_RECHAZOS);
    rechazosDelArtista = await feedbackRepo
      .createQueryBuilder('f')
      .where('f.artistaId = :id', { id: track.artistaId })
      .andWhere('f.tipo = :tipo', { tipo: TipoFeedback.NO_VA })
      .andWhere('f.fecha >= :desde', { desde })
      .getCount();
    sugerirVetarArtista =
      !opts?.tambienArtista && rechazosDelArtista >= RECHAZOS_PARA_SUGERIR_VETO;
  }

  let artistaVetado = false;
  if (opts?.tambienArtista && track.artistaId) {
    const ya = await vetoRepo.findOne({
      where: { tipo: TipoVeto.ARTISTA, valor: track.artistaId, activo: true },
    });
    if (!ya) {
      await vetoRepo.save(
        vetoRepo.create({
          tipo: TipoVeto.ARTISTA,
          valor: track.artistaId,
          etiqueta: track.artista,
          bloqueId: null,
          motivo: 'RECHAZADO POR EL USUARIO',
          activo: true,
        }),
      );
    }
    // Los otros temas del artista tambien salen del repertorio.
    await trackRepo
      .createQueryBuilder()
      .update(MusicaTrack)
      .set({ estado: EstadoTrack.VETADO })
      .where('artistaId = :id', { id: track.artistaId })
      .execute();
    artistaVetado = true;
  }

  return {
    success: true,
    artistaVetado,
    rechazosDelArtista,
    sugerirVetarArtista,
    artistaId: track.artistaId,
    artistaNombre: track.artista,
  };
}
