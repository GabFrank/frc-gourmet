/** Enums del modulo de Musica ambiental. Ver docs/DISENO-OPERATIVO-MUSICA.md */

export enum TipoSemilla {
  PLAYLIST = 'PLAYLIST',
  ARTISTA = 'ARTISTA',
  TRACK = 'TRACK',
  /** Playlists guardadas en la biblioteca de la cuenta del local. */
  BIBLIOTECA = 'BIBLIOTECA',
}

export enum TipoVeto {
  ARTISTA = 'ARTISTA',
  /**
   * @deprecated Texto libre comparado con `includes()`, que vetaba de mas:
   * `FUNK` mataba al funk americano por culpa de `FUNK BRASILEIRO`. Se conserva
   * para no romper los vetos ya cargados; los nuevos usan `ESTILO`.
   */
  GENERO = 'GENERO',
  /** Veto contra el catalogo canonico: sin ambiguedad de strings. */
  ESTILO = 'ESTILO',
  TRACK = 'TRACK',
  IDIOMA = 'IDIOMA',
}

export enum EstadoTrack {
  /** Puede sonar. */
  APROBADO = 'APROBADO',
  /** Vino de una expansion automatica: espera aprobacion del dueno. */
  SUGERIDO = 'SUGERIDO',
  /** Vetado explicitamente: nunca suena. */
  VETADO = 'VETADO',
}

/**
 * Cada bloque se materializa en tres playlists de Spotify. El runtime cambia
 * entre ellas por evento (salon lleno / vacio sostenido), sin elegir tema por
 * tema.
 */
export enum VarianteEnergia {
  SUAVE = 'SUAVE',
  NORMAL = 'NORMAL',
  MOVIDO = 'MOVIDO',
}

export enum TipoFeedback {
  NO_VA = 'NO_VA',
  MAS_DE_ESTO = 'MAS_DE_ESTO',
}

export enum OrigenPlan {
  /** Generado por el planificador con LLM (F3). */
  IA = 'IA',
  /** Armado por reglas deterministas (F1, y fallback cuando la IA falla). */
  REGLAS = 'REGLAS',
  /** Editado a mano por el usuario. */
  MANUAL = 'MANUAL',
}

/* ─────────────────── Vocabulario semantico (LLM) ───────────────────
 *
 * El etiquetador describe cada tema con dos ejes que ninguna API de audio
 * entrega: como se SIENTE y CUANDO va. Son las columnas que hacen cumplir
 * reglas del brief como "nada triste", que ni el BPM ni la valencia alcanzan a
 * expresar.
 *
 * El vocabulario es CERRADO y se valida al escribir, no en el prompt. Confiar
 * en el prompt ya fallo en produccion: el modelo devolvio `energico` 51 veces y
 * `energetico` 16 para el mismo concepto, y un filtro por `energico` perdia
 * esos 16 temas en silencio. Un enum en la base es la unica frontera que el
 * modelo no puede cruzar.
 */

/** Como se siente el tema. */
export enum AnimoTrack {
  RELAJADO = 'RELAJADO',
  ALEGRE = 'ALEGRE',
  ENERGICO = 'ENERGICO',
  MELANCOLICO = 'MELANCOLICO',
}

export const ANIMOS: AnimoTrack[] = [
  AnimoTrack.RELAJADO,
  AnimoTrack.ALEGRE,
  AnimoTrack.ENERGICO,
  AnimoTrack.MELANCOLICO,
];

/** Momento del dia donde el tema encaja. */
export enum EscenaTrack {
  APERTURA = 'APERTURA',
  ALMUERZO = 'ALMUERZO',
  SOBREMESA = 'SOBREMESA',
  TARDE = 'TARDE',
  SUNSET = 'SUNSET',
  CENA = 'CENA',
  NOCHE = 'NOCHE',
}

export const ESCENAS: EscenaTrack[] = [
  EscenaTrack.APERTURA,
  EscenaTrack.ALMUERZO,
  EscenaTrack.SOBREMESA,
  EscenaTrack.TARDE,
  EscenaTrack.SUNSET,
  EscenaTrack.CENA,
  EscenaTrack.NOCHE,
];

/**
 * Variantes que el modelo devolvio alguna vez para un valor del vocabulario.
 * Se agrega aca en vez de endurecer el prompt: el prompt es una sugerencia, el
 * mapa es una garantia.
 */
const SINONIMOS_ANIMO: Record<string, AnimoTrack> = {
  ENERGETICO: AnimoTrack.ENERGICO,
  ENERGETICA: AnimoTrack.ENERGICO,
  ENERGICA: AnimoTrack.ENERGICO,
  TRANQUILO: AnimoTrack.RELAJADO,
  CALMO: AnimoTrack.RELAJADO,
  RELAJADA: AnimoTrack.RELAJADO,
  ALEGRA: AnimoTrack.ALEGRE,
  FELIZ: AnimoTrack.ALEGRE,
  TRISTE: AnimoTrack.MELANCOLICO,
  MELANCOLICA: AnimoTrack.MELANCOLICO,
  NOSTALGICO: AnimoTrack.MELANCOLICO,
};

const SINONIMOS_ESCENA: Record<string, EscenaTrack> = {
  MANANA: EscenaTrack.APERTURA,
  MEDIODIA: EscenaTrack.ALMUERZO,
  ATARDECER: EscenaTrack.SUNSET,
  'SUNSET CHILL': EscenaTrack.SUNSET,
  MADRUGADA: EscenaTrack.NOCHE,
};

/** Mayusculas sin acentos: el modelo escribe "melancólico" y "energético". */
function canonizar(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve el animo canonico, o `null` si no se reconoce (no inventa). */
export function normalizarAnimo(raw?: string | null): AnimoTrack | null {
  const v = canonizar(raw || '');
  if (!v) return null;
  if ((ANIMOS as string[]).includes(v)) return v as AnimoTrack;
  return SINONIMOS_ANIMO[v] ?? null;
}

/** Escenas canonicas, sin repetidos y sin valores inventados. */
export function normalizarEscenas(raw?: unknown): EscenaTrack[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const salida: EscenaTrack[] = [];
  for (const item of raw) {
    const v = canonizar(String(item ?? ''));
    if (!v) continue;
    const escena = (ESCENAS as string[]).includes(v)
      ? (v as EscenaTrack)
      : SINONIMOS_ESCENA[v] ?? null;
    if (escena && !salida.includes(escena)) salida.push(escena);
  }
  return salida.length ? salida : undefined;
}
