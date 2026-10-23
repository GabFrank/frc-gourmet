/**
 * Error del motor de Disciplina y Reconocimiento (DR).
 * `codigo` es estable (MAYÚSCULAS) para que los handlers lo traduzcan a mensajes.
 */
export class DisciplinaError extends Error {
  constructor(public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'DisciplinaError';
  }
}

export type Id = number | string;
