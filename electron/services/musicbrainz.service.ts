/**
 * MusicBrainz como fuente de genero POR TEMA.
 *
 * POR QUE, si ya consultamos Spotify: Spotify solo publica generos a nivel
 * ARTISTA. Por eso `MPB` cubre desde Gal Costa hasta Marcelo D2, y por eso un
 * tercio del repertorio quedo sin clasificar (los artistas sin suficiente data
 * en Spotify devuelven `genres: []`). MusicBrainz da generos de la GRABACION.
 *
 * El match es por ISRC, que es identificador universal de grabacion: no hay
 * ambiguedad de nombres ni de homonimos. En este repertorio la cobertura de ISRC
 * es del 100%, asi que la fuente aplica a todo el pool.
 *
 * Se descarto Chosic y Every Noise At Once: ninguno tiene API publica. Every
 * Noise ademas quedo congelado cuando su autor dejo Spotify a fines de 2023.
 * Consumirlos seria scraping — fragil, contra sus terminos, y una deuda de
 * mantenimiento en un sistema que corre solo en el local.
 */

const MB_BASE = 'https://musicbrainz.org/ws/2';

/**
 * MusicBrainz EXIGE un User-Agent identificable con forma de contacto, y
 * bloquea a quien no lo manda. No es opcional.
 */
const USER_AGENT = 'FRC-Gourmet/1.0 (https://github.com/GabFrank; musica ambiental)';

/**
 * Limite de cortesia: 1 request por segundo. Pasarse hace que MusicBrainz
 * devuelva 503 y termine bloqueando la IP.
 */
const INTERVALO_MS = 1100;

let ultimaLlamada = 0;

async function esperarTurno(): Promise<void> {
  const desde = Date.now() - ultimaLlamada;
  if (desde < INTERVALO_MS) {
    await new Promise((r) => setTimeout(r, INTERVALO_MS - desde));
  }
  ultimaLlamada = Date.now();
}

export interface GeneroMusicBrainz {
  /** El genero elegido, en MAYUSCULAS para entrar igual que los de Spotify. */
  genero: string;
  /** `genres` (curado por editores) o `tags` (folksonomia). */
  fuente: 'genres' | 'tags';
}

/**
 * Busca el genero de una grabacion por su ISRC.
 *
 * Prefiere `genres`, que son curados por editores de MusicBrainz, y solo cae a
 * `tags`, que son libres y mas ruidosos, cuando no hay generos. En ambos casos
 * gana el de mayor `count`: es el consenso, no el primero que alguien escribio.
 */
export async function generoPorIsrc(isrc: string): Promise<GeneroMusicBrainz | null> {
  if (!isrc) return null;
  await esperarTurno();

  const url = `${MB_BASE}/isrc/${encodeURIComponent(isrc)}?fmt=json&inc=genres+tags`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });

  // 404 = ese ISRC no esta en MusicBrainz. Es lo normal para catalogo nuevo o
  // regional, no un error que deba cortar el lote.
  if (res.status === 404) return null;
  if (res.status === 503) throw new Error('MUSICBRAINZ PIDIO BAJAR EL RITMO (503). REINTENTA MAS TARDE.');
  if (!res.ok) throw new Error(`MUSICBRAINZ RESPONDIO ${res.status}.`);

  const data: any = await res.json().catch(() => null);
  const grabaciones: any[] = data?.recordings || [];
  if (!grabaciones.length) return null;

  const mejorDe = (lista: any[]): string | null => {
    const validos = (lista || []).filter((g) => g?.name);
    if (!validos.length) return null;
    validos.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    return String(validos[0].name).toUpperCase();
  };

  // Una misma grabacion puede figurar varias veces (distintos lanzamientos);
  // se recorren todas hasta encontrar la primera con datos.
  for (const g of grabaciones) {
    const porGeneros = mejorDe(g.genres);
    if (porGeneros) return { genero: porGeneros, fuente: 'genres' };
  }
  for (const g of grabaciones) {
    const porTags = mejorDe(g.tags);
    if (porTags) return { genero: porTags, fuente: 'tags' };
  }
  return null;
}
