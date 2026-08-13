/**
 * Construccion del repertorio (pool) del local.
 *
 * Spotify apago `recommendations`, `related-artists` y `audio-features` para
 * apps nuevas (nov-2024), y en feb-2026 limito `search` a 10 resultados y
 * elimino los endpoints bulk de catalogo. Asi que el repertorio no se "pide":
 * se construye a partir de las semillas que carga el dueno y se cachea en
 * nuestra tabla `musica_tracks`.
 *
 * Fuentes soportadas:
 *   PLAYLIST   → items de una playlist (paginado de a 100)
 *   ARTISTA    → albumes del artista → sus tracks
 *   TRACK      → un tema suelto
 *   BIBLIOTECA → todas las playlists guardadas en la cuenta del local
 *
 * Ver docs/DISENO-OPERATIVO-MUSICA.md seccion 2.
 */
import { DataSource } from 'typeorm';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { MusicaSemilla } from '../../src/app/database/entities/musica/musica-semilla.entity';
import { EstadoTrack, TipoSemilla } from '../../src/app/database/entities/musica/musica-enums';
import { spotifyApi } from './spotify.service';

/** Spotify pagina de a 100 en playlists y de a 50 en albumes. */
const PAGE_PLAYLIST = 100;
const PAGE_ALBUMS = 50;
/**
 * Tope por semilla. Sin esto, una playlist editorial de 10.000 temas dispara
 * cientos de requests y llena el pool de material que el dueno nunca eligio.
 */
const MAX_TRACKS_POR_SEMILLA = 500;

export interface ResultadoImportacion {
  encontrados: number;
  nuevos: number;
  actualizados: number;
  omitidos: number;
}

/** `spotify:playlist:xyz` o una URL de share → 'xyz'. */
export function extraerIdSpotify(uriOUrl: string): { tipo: string; id: string } | null {
  const limpio = (uriOUrl || '').trim();
  if (!limpio) return null;

  const uri = limpio.match(/^spotify:(playlist|artist|track|album):([A-Za-z0-9]+)/);
  if (uri) return { tipo: uri[1], id: uri[2] };

  // https://open.spotify.com/playlist/37i9dQ...?si=xxx  (y variantes /intl-es/)
  const url = limpio.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|artist|track|album)\/([A-Za-z0-9]+)/,
  );
  if (url) return { tipo: url[1], id: url[2] };

  return null;
}

/**
 * Mapea un track crudo de la API al shape de nuestra entidad. Devuelve null si
 * el item no sirve (locales del usuario, podcasts, items nulos de playlists
 * donde el tema fue removido del catalogo).
 */
function mapearTrack(raw: any): Partial<MusicaTrack> | null {
  if (!raw || !raw.id || raw.is_local) return null;
  // Los episodios de podcast vienen en el mismo endpoint que los tracks.
  if (raw.type && raw.type !== 'track') return null;

  return {
    spotifyId: raw.id,
    isrc: raw.external_ids?.isrc ?? undefined,
    titulo: (raw.name || '').toUpperCase(),
    artista: (raw.artists || []).map((a: any) => a.name).join(', ').toUpperCase(),
    artistaId: raw.artists?.[0]?.id ?? undefined,
    album: raw.album?.name ? String(raw.album.name).toUpperCase() : undefined,
    imagenUrl: raw.album?.images?.[0]?.url ?? undefined,
    duracionMs: raw.duration_ms ?? 0,
    explicit: !!raw.explicit,
  };
}

/**
 * Inserta los tracks que faltan y completa datos de los que ya estaban.
 *
 * NUNCA pisa `estado`, `score`, `ultimaVez` ni el etiquetado: un track que el
 * dueno ya veto o que ya tiene features no se resetea porque vuelva a aparecer
 * en otra playlist.
 */
async function guardarTracks(
  dataSource: DataSource,
  crudos: any[],
  estadoInicial: EstadoTrack,
): Promise<ResultadoImportacion> {
  const repo = dataSource.getRepository(MusicaTrack);
  const res: ResultadoImportacion = { encontrados: crudos.length, nuevos: 0, actualizados: 0, omitidos: 0 };

  const mapeados = crudos.map(mapearTrack).filter((t): t is Partial<MusicaTrack> => t !== null);
  res.omitidos = crudos.length - mapeados.length;
  if (mapeados.length === 0) return res;

  // Deduplicar dentro del propio lote (una playlist puede repetir un tema).
  const porId = new Map<string, Partial<MusicaTrack>>();
  for (const t of mapeados) porId.set(t.spotifyId!, t);

  const ids = Array.from(porId.keys());
  const existentes = await repo
    .createQueryBuilder('t')
    .where('t.spotifyId IN (:...ids)', { ids })
    .getMany();
  const existentesPorId = new Map(existentes.map((e) => [e.spotifyId, e]));

  const aGuardar: MusicaTrack[] = [];
  for (const [id, datos] of porId) {
    const previo = existentesPorId.get(id);
    if (previo) {
      // Solo completar huecos; no tocar estado/score/etiquetado.
      previo.isrc = previo.isrc ?? datos.isrc;
      previo.imagenUrl = previo.imagenUrl ?? datos.imagenUrl;
      previo.album = previo.album ?? datos.album;
      if (!previo.duracionMs) previo.duracionMs = datos.duracionMs ?? 0;
      aGuardar.push(previo);
      res.actualizados++;
    } else {
      aGuardar.push(repo.create({ ...datos, estado: estadoInicial } as MusicaTrack));
      res.nuevos++;
    }
  }

  await repo.save(aGuardar, { chunk: 200 });
  return res;
}

/** Trae todos los items de una playlist, paginando. */
async function traerTracksDePlaylist(userDataPath: string, playlistId: string): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;

  while (out.length < MAX_TRACKS_POR_SEMILLA) {
    // feb-2026: el endpoint pasó de /tracks a /items.
    const page = await spotifyApi(
      userDataPath,
      'GET',
      `/playlists/${playlistId}/items?limit=${PAGE_PLAYLIST}&offset=${offset}`,
    );
    const items = page?.items || [];
    // Spotify devuelve la playlist con metadata pero SIN `items` cuando la
    // cuenta conectada no es duena ni colaboradora. Sin este aviso, la
    // importacion diria "0 temas" y parecerian una playlist vacia.
    if (offset === 0 && items.length === 0 && page && !Array.isArray(page.items)) {
      throw new Error(
        'ESA PLAYLIST NO ES DE LA CUENTA CONECTADA: SPOTIFY NO DEVUELVE SU CONTENIDO. ' +
          'COPIA LOS TEMAS A UNA PLAYLIST PROPIA O HACELA COLABORATIVA.',
      );
    }
    if (items.length === 0) break;

    for (const it of items) {
      const track = it?.track ?? it?.item ?? it;
      if (track) out.push(track);
    }
    if (items.length < PAGE_PLAYLIST) break;
    offset += PAGE_PLAYLIST;
  }

  return out.slice(0, MAX_TRACKS_POR_SEMILLA);
}

/** Trae los tracks de un artista recorriendo sus albumes y singles. */
async function traerTracksDeArtista(userDataPath: string, artistaId: string): Promise<any[]> {
  const albums = await spotifyApi(
    userDataPath,
    'GET',
    `/artists/${artistaId}/albums?include_groups=album,single&limit=${PAGE_ALBUMS}`,
  );
  const out: any[] = [];

  for (const album of albums?.items || []) {
    if (out.length >= MAX_TRACKS_POR_SEMILLA) break;
    const tracks = await spotifyApi(userDataPath, 'GET', `/albums/${album.id}/tracks?limit=50`);
    for (const t of tracks?.items || []) {
      // Los tracks de /albums/{id}/tracks vienen sin datos del album:
      // se los agregamos para no perder carátula ni nombre.
      out.push({ ...t, album: { name: album.name, images: album.images } });
    }
  }

  return out.slice(0, MAX_TRACKS_POR_SEMILLA);
}

/** Playlists guardadas en la biblioteca de la cuenta del local. */
async function traerTracksDeBiblioteca(userDataPath: string): Promise<any[]> {
  const playlists = await spotifyApi(userDataPath, 'GET', '/me/playlists?limit=50');
  const out: any[] = [];

  for (const pl of playlists?.items || []) {
    if (out.length >= MAX_TRACKS_POR_SEMILLA) break;
    // Las playlists que genera el propio modulo no se reimportan: serian un
    // bucle (el pool alimenta la playlist y la playlist volveria al pool).
    if ((pl.name || '').startsWith('FRC · ')) continue;
    const tracks = await traerTracksDePlaylist(userDataPath, pl.id);
    out.push(...tracks);
  }

  return out;
}

/**
 * Importa una semilla al pool. Lo que carga el dueno entra APROBADO (lo eligio
 * el); lo que venga de expansiones automaticas entra SUGERIDO y espera su
 * revision.
 */
export async function importarSemilla(
  dataSource: DataSource,
  userDataPath: string,
  semilla: MusicaSemilla,
): Promise<ResultadoImportacion> {
  const ref = extraerIdSpotify(semilla.spotifyUri);

  let crudos: any[] = [];
  switch (semilla.tipo) {
    case TipoSemilla.PLAYLIST:
      if (!ref) throw new Error('LA URL O URI DE LA PLAYLIST NO ES VALIDA.');
      crudos = await traerTracksDePlaylist(userDataPath, ref.id);
      break;
    case TipoSemilla.ARTISTA:
      if (!ref) throw new Error('LA URL O URI DEL ARTISTA NO ES VALIDA.');
      crudos = await traerTracksDeArtista(userDataPath, ref.id);
      break;
    case TipoSemilla.TRACK: {
      if (!ref) throw new Error('LA URL O URI DEL TEMA NO ES VALIDA.');
      const t = await spotifyApi(userDataPath, 'GET', `/tracks/${ref.id}`);
      crudos = t ? [t] : [];
      break;
    }
    case TipoSemilla.BIBLIOTECA:
      crudos = await traerTracksDeBiblioteca(userDataPath);
      break;
  }

  const resultado = await guardarTracks(dataSource, crudos, EstadoTrack.APROBADO);

  const semillaRepo = dataSource.getRepository(MusicaSemilla);
  semilla.tracksImportados = resultado.nuevos + resultado.actualizados;
  semilla.ultimaImportacion = new Date();
  await semillaRepo.save(semilla);

  return resultado;
}

/** Resumen del pool para la pantalla "Mi estilo". */
export async function getResumenPool(dataSource: DataSource): Promise<{
  total: number;
  aprobados: number;
  sugeridos: number;
  vetados: number;
  etiquetados: number;
  sinFeatures: number;
}> {
  const repo = dataSource.getRepository(MusicaTrack);
  const [total, aprobados, sugeridos, vetados, etiquetados, sinFeatures] = await Promise.all([
    repo.count(),
    repo.count({ where: { estado: EstadoTrack.APROBADO } }),
    repo.count({ where: { estado: EstadoTrack.SUGERIDO } }),
    repo.count({ where: { estado: EstadoTrack.VETADO } }),
    repo.count({ where: { etiquetado: true } }),
    repo
      .createQueryBuilder('t')
      .where('t.bpm IS NULL')
      .getCount(),
  ]);
  return { total, aprobados, sugeridos, vetados, etiquetados, sinFeatures };
}
