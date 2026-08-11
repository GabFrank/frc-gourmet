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
  GENERO = 'GENERO',
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
