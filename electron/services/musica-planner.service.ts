/**
 * Generador del plan del dia: convierte la grilla de bloques + el repertorio
 * en playlists REALES de Spotify.
 *
 * Decision de diseno (ver docs/DISENO-OPERATIVO-MUSICA.md 3.3): el dia se
 * resuelve UNA vez. No hay un loop eligiendo tema por tema. Razones, por peso:
 *
 *  1. Si FRC Gourmet se cierra, se cuelga o se actualiza, la playlist sigue
 *     sonando. Con una cola gestionada en vivo, la musica moria con la app.
 *  2. ~6-10 llamadas a la API por dia en vez de miles (sin riesgo de 429).
 *  3. El dia entero queda auditable —y editable— antes de sonar.
 *
 * En F1 la seleccion es determinista (reglas). En F3 el planificador con LLM
 * elige el perfil de cada bloque y este servicio sigue siendo quien materializa.
 */
import { DataSource, In } from 'typeorm';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { MusicaVeto } from '../../src/app/database/entities/musica/musica-veto.entity';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { PlanProgramacion } from '../../src/app/database/entities/musica/plan-programacion.entity';
import { PlanBloque } from '../../src/app/database/entities/musica/plan-bloque.entity';
import {
  EstadoTrack,
  OrigenPlan,
  TipoVeto,
  VarianteEnergia,
} from '../../src/app/database/entities/musica/musica-enums';
import { spotifyApi } from './spotify.service';
import { readAppSettings } from '../utils/app-settings.utils';
import { planificarDia, aplicarAjustes } from './musica-agente.service';

/**
 * Valores por defecto. Todos son configurables desde la UI (globalmente en
 * app-settings, y el limite por artista ademas por bloque): el valor correcto
 * depende del estilo musical, no del sistema.
 */
const DEFAULTS = {
  /**
   * La playlist se genera 1,5x mas larga que su bloque. Si se terminara antes
   * de tiempo, Spotify arranca su autoplay de recomendaciones — exactamente lo
   * que este modulo existe para evitar.
   */
  factorDuracion: 1.5,
  /** Mata el "se trabo un artista y sono 3 horas". */
  maxPorArtistaDefault: 2,
  /** Dias que un track no se repite. */
  ventanaAntirepeticionDias: 3,
  /** Desplazamiento de BPM entre variantes. */
  deltaBpmVariante: 12,
};
/** Limite duro de la API al escribir items de playlist. */
const MAX_URIS_POR_REQUEST = 100;
/** Prefijo reconocible: el importador lo usa para no re-importar lo generado. */
const PREFIJO_PLAYLIST = 'FRC · ';

export interface ResultadoPlan {
  planId: number;
  fecha: string;
  bloques: number;
  playlists: number;
  advertencias: string[];
}

/** 'HH:MM' → minutos desde medianoche. */
function aMinutos(hhmm: string): number {
  const [h, m] = (hhmm || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/**
 * Minutos del FIN de un bloque. '00:00' como hora de cierre significa medianoche
 * del dia siguiente, no las cero horas del mismo dia.
 *
 * Sin esto, un bloque 17:00-00:00 daba duracion negativa (la playlist de la
 * noche se generaba de 30 minutos en vez de 7 horas) y nunca resultaba vigente
 * (de 17:00 a medianoche no sonaba nada) — justo el turno principal del local.
 */
function aMinutosFin(hhmm: string): number {
  const min = aMinutos(hhmm);
  return min === 0 ? 24 * 60 : min;
}

function duracionBloqueMs(bloque: BloqueProgramacion): number {
  const desde = aMinutos(bloque.horaDesde);
  const hasta = aMinutosFin(bloque.horaHasta);
  const minutos = Math.max(30, hasta - desde);
  return minutos * 60 * 1000;
}

/**
 * Desplaza el perfil del bloque segun la variante. Las tres playlists de un
 * bloque comparten identidad pero no intensidad: es lo que permite reaccionar
 * al salon cambiando de playlist en vez de re-planificar.
 */
function perfilDeVariante(
  bloque: BloqueProgramacion,
  variante: VarianteEnergia,
  deltaBpm: number,
): { bpmMin: number; bpmMax: number; valenciaMin: number } {
  const base = { bpmMin: bloque.bpmMin ?? 60, bpmMax: bloque.bpmMax ?? 200 };
  const delta =
    variante === VarianteEnergia.SUAVE ? -deltaBpm : variante === VarianteEnergia.MOVIDO ? deltaBpm : 0;
  return {
    bpmMin: Math.max(40, base.bpmMin + delta),
    bpmMax: Math.min(220, base.bpmMax + delta),
    valenciaMin: bloque.valenciaMin ?? 0,
  };
}

interface Vetos {
  artistas: Set<string>;
  generos: Set<string>;
  tracks: Set<string>;
  idiomas: Set<string>;
}

/** Vetos globales + los del bloque. */
async function cargarVetos(dataSource: DataSource, bloqueId: number): Promise<Vetos> {
  const repo = dataSource.getRepository(MusicaVeto);
  const todos = await repo.find({ where: { activo: true } });
  const aplican = todos.filter((v) => v.bloqueId == null || v.bloqueId === bloqueId);

  const vetos: Vetos = {
    artistas: new Set(),
    generos: new Set(),
    tracks: new Set(),
    idiomas: new Set(),
  };
  for (const v of aplican) {
    if (v.tipo === TipoVeto.ARTISTA) vetos.artistas.add(v.valor);
    else if (v.tipo === TipoVeto.GENERO) vetos.generos.add(v.valor);
    else if (v.tipo === TipoVeto.TRACK) vetos.tracks.add(v.valor);
    else if (v.tipo === TipoVeto.IDIOMA) vetos.idiomas.add(v.valor);
  }
  return vetos;
}

function pasaVetos(track: MusicaTrack, vetos: Vetos): boolean {
  if (vetos.tracks.has(track.spotifyId)) return false;
  if (track.artistaId && vetos.artistas.has(track.artistaId)) return false;
  if (vetos.artistas.has(track.artista)) return false;
  if (track.idioma && vetos.idiomas.has(track.idioma)) return false;

  // Comparacion de generos en UNA sola direccion: el genero del tema tiene que
  // contener al veto completo. La inclusion bidireccional generaba falsos
  // positivos graves — un veto de "FUNK BRASILEIRO" descartaba el funk
  // americano (soul/groove), que no tiene nada que ver, porque
  // "FUNK BRASILEIRO".includes("FUNK") es verdadero.
  const genero = (track.genero || '').toUpperCase();
  if (genero) {
    for (const g of vetos.generos) {
      if (genero.includes(g)) return false;
    }
  }
  return true;
}

/**
 * Selecciona los tracks de una variante.
 *
 * Regla de oro: si el filtro estricto no junta material suficiente, se relaja
 * (primero el BPM, despues la valencia) en vez de devolver una playlist corta.
 * Una playlist que se agota deja entrar el autoplay de Spotify, que es peor que
 * un tema levemente fuera de perfil.
 */
function seleccionarTracks(
  candidatos: MusicaTrack[],
  bloque: BloqueProgramacion,
  variante: VarianteEnergia,
  duracionObjetivoMs: number,
  opciones: { maxPorArtista: number | null; evitarConsecutivo: boolean; deltaBpm: number },
): { elegidos: MusicaTrack[]; relajado: boolean } {
  const perfil = perfilDeVariante(bloque, variante, opciones.deltaBpm);

  const enPerfil = (t: MusicaTrack, estricto: boolean): boolean => {
    if (!estricto) return true;
    if (t.bpm != null && (t.bpm < perfil.bpmMin || t.bpm > perfil.bpmMax)) return false;
    if (perfil.valenciaMin && t.valencia != null && t.valencia < perfil.valenciaMin) return false;
    return true;
  };

  const armar = (estricto: boolean): MusicaTrack[] => {
    const porArtista = new Map<string, number>();
    const elegidos: MusicaTrack[] = [];
    let duracion = 0;
    let ultimoArtista = '';

    // Score primero, y desempate aleatorio para que dos dias con el mismo pool
    // no produzcan exactamente la misma playlist.
    const orden = candidatos
      .filter((t) => enPerfil(t, estricto))
      .map((t) => ({ t, peso: (t.score || 0) + Math.random() }))
      .sort((a, b) => b.peso - a.peso)
      .map((x) => x.t);

    for (const t of orden) {
      if (duracion >= duracionObjetivoMs) break;
      const artista = t.artistaId || t.artista;
      // maxPorArtista null = sin limite (util en bloques de covers, donde
      // varios temas del mismo interprete son lo esperado).
      if (opciones.maxPorArtista != null && (porArtista.get(artista) || 0) >= opciones.maxPorArtista) {
        continue;
      }
      if (opciones.evitarConsecutivo && artista === ultimoArtista) continue;

      elegidos.push(t);
      porArtista.set(artista, (porArtista.get(artista) || 0) + 1);
      ultimoArtista = artista;
      duracion += t.duracionMs || 210_000;
    }
    return elegidos;
  };

  const estrictos = armar(true);
  const duracionEstricta = estrictos.reduce((acc, t) => acc + (t.duracionMs || 210_000), 0);
  if (duracionEstricta >= duracionObjetivoMs * 0.8) {
    return { elegidos: estrictos, relajado: false };
  }
  return { elegidos: armar(false), relajado: true };
}

/** Crea la playlist en la cuenta del local si el PlanBloque aun no tiene una. */
async function asegurarPlaylist(
  userDataPath: string,
  nombre: string,
  playlistIdPrevio?: string,
): Promise<{ id: string; uri: string }> {
  if (playlistIdPrevio) {
    // Verificar que siga existiendo: el dueno pudo borrarla a mano.
    try {
      const pl = await spotifyApi(userDataPath, 'GET', `/playlists/${playlistIdPrevio}`);
      if (pl?.id) return { id: pl.id, uri: pl.uri || `spotify:playlist:${pl.id}` };
    } catch {
      // Cayo en 404: se recrea abajo.
    }
  }

  const me = await spotifyApi(userDataPath, 'GET', '/me');
  const creada = await spotifyApi(userDataPath, 'POST', `/users/${me.id}/playlists`, {
    name: nombre,
    // Privada: es la musica del local, no una publicacion.
    public: false,
    description: 'Generada automaticamente por FRC Gourmet. Se sobreescribe cada dia.',
  });
  return { id: creada.id, uri: creada.uri || `spotify:playlist:${creada.id}` };
}

/**
 * Reemplaza el contenido de la playlist. La API acepta 100 uris por request:
 * el primer lote va con PUT (reemplaza) y el resto con POST (agrega).
 */
async function escribirItems(
  userDataPath: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  const primero = uris.slice(0, MAX_URIS_POR_REQUEST);
  await spotifyApi(userDataPath, 'PUT', `/playlists/${playlistId}/items`, { uris: primero });

  for (let i = MAX_URIS_POR_REQUEST; i < uris.length; i += MAX_URIS_POR_REQUEST) {
    const lote = uris.slice(i, i + MAX_URIS_POR_REQUEST);
    await spotifyApi(userDataPath, 'POST', `/playlists/${playlistId}/items`, { uris: lote });
  }
}

/**
 * Genera (o regenera) el plan de una fecha y materializa sus playlists.
 *
 * `fecha` en formato YYYY-MM-DD, hora local del local.
 */
export async function generarPlanDelDia(
  dataSource: DataSource,
  userDataPath: string,
  fecha: string,
  opts?: { instruccion?: string; usuarioId?: number },
): Promise<ResultadoPlan> {
  const advertencias: string[] = [];
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const avanzado = { ...DEFAULTS, ...(readAppSettings(userDataPath).musica.avanzado || {}) };

  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
  const bloques = await bloqueRepo.find({
    where: [
      { activo: true, diaSemana },
      { activo: true, diaSemana: -1 },
    ],
    order: { horaDesde: 'ASC' },
  });
  if (bloques.length === 0) {
    throw new Error(
      'NO HAY BLOQUES PROGRAMADOS PARA ESE DIA. APLICA UN PRESET O CREA LA GRILLA EN CONFIGURACION.',
    );
  }

  // El agente ajusta el perfil del dia (energia/BPM por bloque) mirando ventas
  // reales, feriado y las notas del dueno. Si la IA no esta configurada o
  // falla, devuelve null y se usa la grilla tal cual: la musica no depende de
  // la IA, la IA la mejora.
  const planIa = await planificarDia(dataSource, userDataPath, fecha, opts?.instruccion);
  const bloquesEfectivos = aplicarAjustes(bloques, planIa);

  const trackRepo = dataSource.getRepository(MusicaTrack);
  const aprobados = await trackRepo.find({ where: { estado: EstadoTrack.APROBADO } });
  if (aprobados.length === 0) {
    throw new Error(
      'EL REPERTORIO ESTA VACIO. CARGA PLAYLISTS O ARTISTAS EN "MI ESTILO" E IMPORTALOS.',
    );
  }

  // Anti-repeticion: lo que sono en los ultimos dias queda afuera, salvo que
  // el pool sea tan chico que no alcance para llenar el dia.
  const corte = new Date();
  corte.setDate(corte.getDate() - avanzado.ventanaAntirepeticionDias);
  const frescos = aprobados.filter((t) => !t.ultimaVez || new Date(t.ultimaVez) < corte);
  const base = frescos.length >= 40 ? frescos : aprobados;
  if (base === aprobados && frescos.length < 40) {
    advertencias.push(
      `El repertorio es chico (${aprobados.length} temas aprobados): se ignoro la ventana anti-repeticion para poder llenar el dia.`,
    );
  }

  // Plan del dia (uno por fecha).
  const planRepo = dataSource.getRepository(PlanProgramacion);
  let plan = await planRepo.findOne({ where: { fecha } });
  if (!plan) {
    plan = planRepo.create({ fecha, origen: OrigenPlan.REGLAS, activo: true });
  }
  plan.origen = planIa ? OrigenPlan.IA : OrigenPlan.REGLAS;
  plan.instruccion = opts?.instruccion;
  plan.justificacion = planIa?.justificacion
    ? planIa.justificacion
    : `Plan generado por reglas a partir de la grilla del dia (${bloques.length} bloques) ` +
      `sobre ${base.length} temas aprobados.` +
      (opts?.instruccion ? ` Pedido: "${opts.instruccion}".` : '');
  await planRepo.save(plan);

  // Reusar las playlists del plan anterior del mismo bloque/variante: son fijas
  // y se sobreescriben, para no llenar la cuenta de playlists nuevas cada dia.
  const planBloqueRepo = dataSource.getRepository(PlanBloque);
  const previos = await planBloqueRepo.find({
    where: { bloque: { id: In(bloques.map((b) => b.id)) } },
    relations: ['bloque'],
  });
  const playlistPrevia = new Map<string, string>();
  for (const p of previos) {
    if (p.spotifyPlaylistId) playlistPrevia.set(`${p.bloque.id}:${p.variante}`, p.spotifyPlaylistId);
  }

  let playlists = 0;
  for (const bloque of bloquesEfectivos) {
    const vetos = await cargarVetos(dataSource, bloque.id);
    const candidatos = base.filter((t) => pasaVetos(t, vetos));
    if (candidatos.length === 0) {
      advertencias.push(`"${bloque.nombre}": ningun tema pasa los vetos de ese bloque.`);
      continue;
    }

    const objetivoMs = duracionBloqueMs(bloque) * (bloque.factorDuracion ?? avanzado.factorDuracion);

    for (const variante of [VarianteEnergia.SUAVE, VarianteEnergia.NORMAL, VarianteEnergia.MOVIDO]) {
      const { elegidos, relajado } = seleccionarTracks(candidatos, bloque, variante, objetivoMs, {
        // `undefined` en el bloque = heredar el global; `null` = sin limite.
        maxPorArtista:
          bloque.maxPorArtista === undefined
            ? avanzado.maxPorArtistaDefault
            : bloque.maxPorArtista,
        evitarConsecutivo: bloque.evitarArtistaConsecutivo !== false,
        deltaBpm: avanzado.deltaBpmVariante,
      });
      if (elegidos.length === 0) {
        advertencias.push(`"${bloque.nombre}" (${variante}): sin temas disponibles.`);
        continue;
      }
      if (relajado) {
        advertencias.push(
          `"${bloque.nombre}" (${variante}): se relajo el filtro de BPM/valencia por falta de material.`,
        );
      }

      const nombre = `${PREFIJO_PLAYLIST}${bloque.nombre} · ${variante}`;
      const clave = `${bloque.id}:${variante}`;
      const { id: playlistId, uri } = await asegurarPlaylist(
        userDataPath,
        nombre,
        playlistPrevia.get(clave),
      );
      await escribirItems(
        userDataPath,
        playlistId,
        elegidos.map((t) => `spotify:track:${t.spotifyId}`),
      );

      let planBloque = await planBloqueRepo.findOne({
        where: { plan: { id: plan.id }, bloque: { id: bloque.id }, variante },
      });
      if (!planBloque) {
        planBloque = planBloqueRepo.create({ plan, bloque, variante });
      }
      planBloque.spotifyPlaylistId = playlistId;
      planBloque.spotifyUri = uri;
      planBloque.trackIds = elegidos.map((t) => t.spotifyId);
      planBloque.cantidadTracks = elegidos.length;
      planBloque.duracionMs = elegidos.reduce((acc, t) => acc + (t.duracionMs || 0), 0);
      planBloque.materializadoAt = new Date();
      await planBloqueRepo.save(planBloque);
      playlists++;
    }
  }

  return { planId: plan.id, fecha, bloques: bloques.length, playlists, advertencias };
}

/** Bloque vigente segun la hora local, o null fuera de horario de apertura. */
export async function getBloqueVigente(
  dataSource: DataSource,
  ahora = new Date(),
): Promise<BloqueProgramacion | null> {
  const repo = dataSource.getRepository(BloqueProgramacion);
  const diaSemana = ahora.getDay();
  const bloques = await repo.find({
    where: [
      { activo: true, diaSemana },
      { activo: true, diaSemana: -1 },
    ],
    order: { horaDesde: 'ASC' },
  });

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  return (
    bloques.find(
      (b) => minutosAhora >= aMinutos(b.horaDesde) && minutosAhora < aMinutosFin(b.horaHasta),
    ) ?? null
  );
}
