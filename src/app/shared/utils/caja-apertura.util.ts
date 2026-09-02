/**
 * Decisión de la apertura de caja: ¿hay otra caja abierta, y qué se le avisa al
 * cajero antes de abrir una segunda?
 *
 * Varias cajas abiertas a la vez son **legítimas por diseño** (dos cajeros, dos
 * cajones): `get-cajas-abiertas` las devuelve todas y el PdV ofrece unirse a una.
 * El invariante que sí se sostiene es **una caja abierta por terminal**, y lo
 * valida el backend (`create-caja`).
 *
 * Lo que no existía era el aviso. En producción la PC de delivery —que siempre se
 * une a la caja de la principal— abrió una segunda sin que nada se lo advirtiera,
 * y el día quedó partido en dos cajas. Esta función es lo que faltaba.
 *
 * Vive acá y no adentro del diálogo porque es lógica de negocio: así se puede
 * testear sin Angular (`npm run test:caja-apertura`). Mismo criterio que
 * `forma-pago-efectivo.util.ts` y `mesa-estado.util.ts`.
 */

/** Lo que la función necesita de una `Caja`. Deliberadamente laxo: los llamadores
 *  le pasan la entidad hidratada por TypeORM, que trae bastante más. */
export interface CajaAbiertaLike {
  id?: number | null;
  fechaApertura?: string | Date | null;
  dispositivo?: { id?: number | null; nombre?: string | null } | null;
  createdBy?: { nickname?: string | null; persona?: { nombre?: string | null } | null } | null;
}

export interface AvisoCajaAbierta {
  /** Hay al menos una caja abierta en una terminal distinta a la actual. */
  hayOtrasAbiertas: boolean;
  /** Ids de dispositivo que ya tienen una caja abierta: no se pueden volver a elegir. */
  terminalesOcupadas: number[];
  /** Texto del banner. Vacío cuando no hay nada que avisar. */
  mensaje: string;
  /** Una línea por caja abierta, para el detalle del banner. */
  detalle: string[];
}

/** "TERMINAL CAJA 1", o un fallback que igual identifique la caja. */
export function nombreTerminal(caja: CajaAbiertaLike): string {
  const nombre = caja?.dispositivo?.nombre?.trim();
  if (nombre) return nombre.toUpperCase();
  const id = caja?.dispositivo?.id;
  return id != null ? `TERMINAL #${id}` : 'TERMINAL SIN IDENTIFICAR';
}

/** Quién la abrió. El nickname es el fallback cuando la persona no vino cargada. */
export function nombreAbridor(caja: CajaAbiertaLike): string {
  const persona = caja?.createdBy?.persona?.nombre?.trim();
  if (persona) return persona.toUpperCase();
  const nick = caja?.createdBy?.nickname?.trim();
  return nick ? nick.toUpperCase() : 'USUARIO DESCONOCIDO';
}

/**
 * "hace 2 h 15 min". Redondea hacia abajo y no pretende precisión: es para que el
 * cajero entienda de un vistazo si la caja se abrió recién o hace medio turno.
 *
 * Devuelve `''` si no hay fecha o si es futura — un "hace -3 min" es peor que nada.
 */
export function tiempoDesde(fecha: string | Date | null | undefined, ahora: Date = new Date()): string {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const ms = ahora.getTime() - d.getTime();
  if (ms < 0) return '';
  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
}

/**
 * Arma el aviso para el diálogo de apertura.
 *
 * `dispositivoActualId` se excluye del aviso a propósito: si esta misma terminal
 * ya tiene una caja abierta, el backend va a rechazar la apertura con un error
 * específico. El banner es para el otro caso —la caja está en OTRA terminal—, que
 * es el que hoy pasa desapercibido.
 */
export function analizarCajasAbiertas(
  cajas: CajaAbiertaLike[] | null | undefined,
  dispositivoActualId: number | null | undefined = null,
  ahora: Date = new Date(),
): AvisoCajaAbierta {
  const abiertas = (cajas || []).filter((c) => !!c);

  const terminalesOcupadas = Array.from(
    new Set(
      abiertas
        .map((c) => c?.dispositivo?.id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );

  const ajenas = abiertas.filter(
    (c) => dispositivoActualId == null || c?.dispositivo?.id !== dispositivoActualId,
  );

  if (ajenas.length === 0) {
    return { hayOtrasAbiertas: false, terminalesOcupadas, mensaje: '', detalle: [] };
  }

  const detalle = ajenas.map((c) => {
    const desde = tiempoDesde(c?.fechaApertura, ahora);
    const cuando = desde ? `, ${desde}` : '';
    const ref = c?.id != null ? `Caja #${c.id}` : 'Caja';
    return `${ref} en ${nombreTerminal(c)} · abierta por ${nombreAbridor(c)}${cuando}`;
  });

  const mensaje = ajenas.length === 1
    ? 'Ya hay una caja abierta en otra terminal. Abrir una segunda parte el día en dos cajas: sólo hacelo si de verdad es otro cajón.'
    : `Ya hay ${ajenas.length} cajas abiertas en otras terminales. Abrir una más parte el día todavía más: sólo hacelo si de verdad es otro cajón.`;

  return { hayOtrasAbiertas: true, terminalesOcupadas, mensaje, detalle };
}
