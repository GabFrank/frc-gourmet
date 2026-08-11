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
