/**
 * Catalogo canonico de estilos: el vocabulario unico del modulo.
 *
 * POR QUE EXISTE: habia cuatro vocabularios que no se hablaban — generos de
 * ARTISTA de Spotify en los tracks, nombres inventados por el LLM en la grilla,
 * strings sueltos en los vetos, y los de la grilla otra vez en el
 * descubrimiento. Dos consecuencias verificadas contra la base real:
 *
 *   - `generosPreferidos` del bloque NO se leia en el planner, y aunque se
 *     leyera no habria matcheado: la grilla pedia `BOSSA N' ROSES` y
 *     `ELECTRÓNICA SUNSET`, con cero temas cada uno.
 *   - El veto por genero comparaba con `includes()`, asi que vetar `FUNK`
 *     mataba al funk americano por culpa de `FUNK BRASILEIRO`.
 *
 * La traduccion vive en `musica_estilo_alias`, con UNIQUE en el valor crudo
 * normalizado: un genero de Spotify no puede apuntar a dos estilos.
 */
import { DataSource, In, IsNull } from 'typeorm';
import { MusicaEstilo } from '../../src/app/database/entities/musica/musica-estilo.entity';
import { MusicaEstiloAlias } from '../../src/app/database/entities/musica/musica-estilo-alias.entity';
import { BloqueEstiloMezcla } from '../../src/app/database/entities/musica/bloque-estilo-mezcla.entity';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { MusicaVeto } from '../../src/app/database/entities/musica/musica-veto.entity';
import { EstadoTrack, TipoVeto } from '../../src/app/database/entities/musica/musica-enums';
import { spotifyApi } from './spotify.service';
import { generoPorIsrc } from './musicbrainz.service';

/** Duracion asumida cuando un track no la trae. Igual criterio que el planner. */
const DURACION_FALLBACK_MS = 210_000;

/**
 * Normaliza un genero crudo para poder compararlo.
 *
 * Sin esto `ELECTRÓNICA` (20 temas) y `ELECTRONIC` (12) quedan como estilos
 * distintos, que es exactamente el estado del que venimos. Saca acentos, pasa a
 * mayusculas, unifica separadores y colapsa espacios.
 */
export function normalizarGenero(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento que deja NFD
    .toUpperCase()
    .replace(/[/_]+/g, ' ')
    .replace(/[^A-Z0-9 &'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Agrupacion inicial, construida a partir de los generos REALES del repertorio
 * (no de una lista generica de generos musicales).
 *
 * Es una propuesta, no un dogma: el dueno la edita en la pantalla de estilos.
 * Lo unico que no se negocia es que un genero crudo aparezca una sola vez, y
 * eso lo garantiza el UNIQUE de la tabla; aca se valida antes para dar un error
 * util en vez de una violacion de constraint.
 *
 * Los casos ambiguos se resolvieron asi (a mano, y son discutibles):
 *   INDIE FOLK  → INDIE      (mas indie que folk en la practica)
 *   FOLK ROCK   → ROCK
 *   LATIN POP   → LATINO     (para poder vetar lo latino sin tocar el pop)
 *   SYNTHPOP    → ELECTRONICA
 *   DANCE ROCK  → ROCK
 *   DISCO FUNK  → SOUL / FUNK / JAZZ
 */
export const SIEMBRA_ESTILOS: Array<{ nombre: string; descripcion: string; generos: string[] }> = [
  {
    nombre: 'BOSSA / MPB',
    descripcion: 'Brasilero tranquilo: bossa nova y musica popular brasilera.',
    generos: ['BOSSA NOVA', 'MPB', 'POP BRASILEÑO'],
  },
  {
    nombre: 'PAGODE',
    descripcion: 'Pagode y samba de roda.',
    generos: ['PAGODE'],
  },
  {
    nombre: 'SERTANEJO',
    descripcion: 'Sertanejo brasilero.',
    generos: ['SERTANEJO'],
  },
  {
    nombre: 'BRASIL FESTIVO',
    descripcion: 'Axe y forro: lo mas fiestero de Brasil.',
    generos: ['AXÉ', 'FORRÓ'],
  },
  {
    nombre: 'ELECTRONICA CHILL',
    descripcion: 'Electronica de fondo, sunset y ambiente.',
    generos: [
      'CHILLWAVE',
      'TRIP HOP',
      'DEEP HOUSE',
      'MÚSICA DE AMBIENTE',
      'ELECTRÓNICA/NEO-SOUL',
    ],
  },
  {
    nombre: 'ELECTRONICA',
    descripcion: 'Electronica y dance con pulso.',
    generos: [
      'ELECTRÓNICA',
      'ELECTRONIC',
      'HOUSE',
      'ELECTROPOP',
      'FUTURE BASS',
      'DANCE/ELECTRÓNICA',
      'POP ELECTRÓNICO',
      'ELECTRO SWING',
      'DANCE',
      'DANCE POP',
      'DISCO',
      'SYNTHPOP',
    ],
  },
  {
    nombre: 'INDIE',
    descripcion: 'Indie pop, rock y folk de perfil bajo.',
    generos: [
      'INDIE POP',
      'INDIE ROCK',
      'INDIE',
      'INDIE FOLK',
      'ALTERNATIVE/INDIE',
      'ALTERNATIVO',
      'POP ALTERNATIVO',
      'DREAM POP',
      'PSYCHEDELIC POP',
    ],
  },
  {
    nombre: 'ROCK',
    descripcion: 'Rock en todas sus variantes.',
    generos: [
      'ROCK',
      'ROCK ALTERNATIVO',
      'ALTERNATIVE ROCK',
      'BLUES ROCK',
      'FOLK ROCK',
      'POP ROCK',
      'POST-ROCK',
      'ROCK PSICODÉLICO',
      'DANCE ROCK',
    ],
  },
  {
    nombre: 'POP',
    descripcion: 'Pop y hits reconocibles.',
    generos: ['POP', 'HITS DEL MOMENTO', 'FOLK POP'],
  },
  {
    nombre: 'FOLK / ACUSTICO',
    descripcion: 'Folk y acustico.',
    generos: ['FOLK', 'ACOUSTIC'],
  },
  {
    nombre: 'SOUL / FUNK / JAZZ',
    descripcion: 'Soul, funk, jazz y sus cruces.',
    generos: ['SOUL', 'R&B', 'FUNK', 'JAZZ', 'JAZZ FUNK', 'FUSION', 'DISCO FUNK'],
  },
  {
    nombre: 'REGGAE',
    descripcion: 'Reggae.',
    generos: ['REGGAE'],
  },
  {
    nombre: 'LATINO',
    descripcion: 'Latino no brasilero: cumbia, bolero, pop latino.',
    generos: ['LATIN POP', 'ELECTRO CUMBIA', 'BOLERO'],
  },
  {
    nombre: 'WORLD',
    descripcion: 'Musica del mundo sin encasillar.',
    generos: ['WORLD MUSIC'],
  },
];

/* ─────────────────────── Catalogo ─────────────────────── */

export interface EstiloConDatos {
  id: number;
  nombre: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
  /** `1` me gusta mas · `-1` me gusta menos · `0` sin opinion. Solo descubrimiento. */
  preferencia: number;
  /** true = hay un veto global activo: sus temas no entran a ninguna playlist. */
  vetado: boolean;
  /** Generos crudos que caen en este estilo. */
  alias: string[];
  /** Lo mismo con id, para poder quitarlos o reasignarlos desde la UI. */
  aliasDetalle: Array<{ id: number; valor: string }>;
  /** Temas APROBADOS clasificados aca. */
  tracks: number;
  /** Duracion total de esos temas. Es lo que se compara contra las cuotas. */
  duracionMs: number;
}

export async function listarEstilos(dataSource: DataSource): Promise<EstiloConDatos[]> {
  const estilos = await dataSource.getRepository(MusicaEstilo).find({ order: { orden: 'ASC', nombre: 'ASC' } });
  const alias = await dataSource.getRepository(MusicaEstiloAlias).find({ relations: ['estilo'] });
  const vetados = await estilosVetados(dataSource);

  // Agregado en JS y no con GROUP BY: son decenas de estilos y cientos de
  // tracks, y asi el codigo queda igual en SQLite y en Postgres.
  const filas = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .select('t.estilo_id', 'estiloId')
    .addSelect('COUNT(*)', 'cantidad')
    .addSelect('SUM(COALESCE(t.duracionMs, 0))', 'duracion')
    .where('t.estado = :estado', { estado: EstadoTrack.APROBADO })
    .andWhere('t.estilo_id IS NOT NULL')
    .groupBy('t.estilo_id')
    .getRawMany();

  const porEstilo = new Map<number, { cantidad: number; duracion: number }>();
  for (const f of filas) {
    porEstilo.set(Number(f.estiloId), {
      cantidad: Number(f.cantidad) || 0,
      duracion: Number(f.duracion) || 0,
    });
  }

  return estilos.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    descripcion: e.descripcion,
    orden: e.orden,
    activo: e.activo,
    preferencia: e.preferencia ?? 0,
    vetado: vetados.has(e.id),
    alias: alias.filter((a) => a.estilo?.id === e.id).map((a) => a.valor).sort(),
    aliasDetalle: alias
      .filter((a) => a.estilo?.id === e.id)
      .map((a) => ({ id: a.id, valor: a.valor }))
      .sort((x, y) => x.valor.localeCompare(y.valor)),
    tracks: porEstilo.get(e.id)?.cantidad || 0,
    duracionMs: porEstilo.get(e.id)?.duracion || 0,
  }));
}

export async function guardarEstilo(
  dataSource: DataSource,
  datos: { id?: number; nombre: string; descripcion?: string; orden?: number; activo?: boolean },
): Promise<MusicaEstilo> {
  const repo = dataSource.getRepository(MusicaEstilo);
  const nombre = (datos.nombre || '').trim().toUpperCase();
  if (!nombre) throw new Error('EL NOMBRE DEL ESTILO ES OBLIGATORIO.');

  const chocando = await repo.findOne({ where: { nombre } });
  if (chocando && chocando.id !== datos.id) {
    throw new Error(`YA EXISTE UN ESTILO LLAMADO "${nombre}".`);
  }

  const estilo = datos.id ? await repo.findOne({ where: { id: datos.id } }) : repo.create();
  if (!estilo) throw new Error('ESTILO NO ENCONTRADO.');
  estilo.nombre = nombre;
  // `null` y no `undefined`: TypeORM omite del UPDATE las props en `undefined`,
  // asi que vaciar la descripcion desde la UI no borraba nada y el texto viejo
  // seguia yendo al prompt del etiquetador. Ver la regla del proyecto sobre
  // nulear columnas.
  estilo.descripcion = datos.descripcion?.trim() || null;
  if (datos.orden != null) estilo.orden = datos.orden;
  if (datos.activo != null) estilo.activo = datos.activo;
  return await repo.save(estilo);
}

/* ─────────────────────── Voto y veto por estilo ─────────────────────── */

/**
 * Voto del dueno: `1` mas de esto, `-1` menos de esto, `0` sin opinion.
 *
 * SOLO afecta al descubrimiento. Bajar el pulgar no saca al estilo de las
 * playlists — para eso esta `vetarEstilo`, que es una decision mas fuerte y se
 * toma aparte a proposito: "me gusta menos" y "no quiero que suene" son cosas
 * distintas y confundirlas hace que el dueno no confie en ninguno de los dos.
 */
export async function setPreferenciaEstilo(
  dataSource: DataSource,
  estiloId: number,
  valor: number,
): Promise<MusicaEstilo> {
  const repo = dataSource.getRepository(MusicaEstilo);
  const estilo = await repo.findOne({ where: { id: estiloId } });
  if (!estilo) throw new Error('ESTILO NO ENCONTRADO.');

  // Se acota en vez de rechazar: el valor viene de tres botones de la UI, y un
  // numero fuera de rango es un bug nuestro, no un dato del usuario.
  const normalizado = valor > 0 ? 1 : valor < 0 ? -1 : 0;
  estilo.preferencia = normalizado;
  return await repo.save(estilo);
}

/** Ids de estilos con un veto GLOBAL activo (`bloqueId` null). */
export async function estilosVetados(dataSource: DataSource): Promise<Set<number>> {
  const vetos = await dataSource
    .getRepository(MusicaVeto)
    .find({ where: { tipo: TipoVeto.ESTILO, activo: true, bloqueId: IsNull() }, relations: ['estilo'] });
  return new Set(vetos.map((v) => v.estilo?.id).filter((id): id is number => !!id));
}

/**
 * Apaga o vuelve a encender un estilo entero.
 *
 * No necesita columna propia: se expresa con una fila en `musica_vetos` de tipo
 * `ESTILO`, que es el mecanismo que el planner ya respeta por id
 * (`pasaVetos`). Desvetar es `activo = false` sobre esa misma fila, asi que la
 * accion es reversible en cualquier momento y sin perder nada — los temas no
 * se tocan, solo dejan de ser elegibles.
 *
 * La fila se REUSA en vez de crear una nueva cada vez: si no, prender y apagar
 * un estilo diez veces dejaria diez filas y la pantalla de vetos seria ilegible.
 */
export async function vetarEstilo(
  dataSource: DataSource,
  estiloId: number,
  vetar: boolean,
): Promise<{ success: boolean; vetado: boolean; tracksAfectados: number }> {
  const estiloRepo = dataSource.getRepository(MusicaEstilo);
  const estilo = await estiloRepo.findOne({ where: { id: estiloId } });
  if (!estilo) throw new Error('ESTILO NO ENCONTRADO.');

  const vetoRepo = dataSource.getRepository(MusicaVeto);
  const existente = await vetoRepo.findOne({
    where: { tipo: TipoVeto.ESTILO, estilo: { id: estiloId }, bloqueId: IsNull() },
    relations: ['estilo'],
  });

  if (existente) {
    existente.activo = vetar;
    existente.etiqueta = estilo.nombre;
    await vetoRepo.save(existente);
  } else if (vetar) {
    await vetoRepo.save(
      vetoRepo.create({
        tipo: TipoVeto.ESTILO,
        // `valor` es NOT NULL y para los vetos por estilo el discriminador real
        // es la FK: se guarda el id como texto solo para que la fila sea legible.
        valor: String(estiloId),
        estilo,
        etiqueta: estilo.nombre,
        bloqueId: null,
        motivo: 'ESTILO RECHAZADO POR EL USUARIO',
        activo: true,
      }),
    );
  }

  const tracksAfectados = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .where('t.estilo_id = :id', { id: estiloId })
    .andWhere('t.estado = :estado', { estado: EstadoTrack.APROBADO })
    .getCount();

  return { success: true, vetado: vetar, tracksAfectados };
}

/**
 * Borrar un estilo deja huerfanos a sus temas y saca su cuota de los bloques.
 * Se avisa cuanto se lleva puesto en vez de hacerlo en silencio.
 */
export async function eliminarEstilo(
  dataSource: DataSource,
  id: number,
): Promise<{ success: boolean; tracksLiberados: number; mezclasBorradas: number }> {
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const tracksLiberados = await trackRepo
    .createQueryBuilder()
    .where('estilo_id = :id', { id })
    .getCount();
  const mezclasBorradas = await dataSource
    .getRepository(BloqueEstiloMezcla)
    .createQueryBuilder()
    .where('estilo_id = :id', { id })
    .getCount();

  // Las FK de alias y mezcla estan en CASCADE; los tracks se limpian a mano
  // porque su columna se agrego sin constraint (SQLite no permite anadirla a
  // una tabla existente sin recrearla).
  await trackRepo
    .createQueryBuilder()
    .update()
    .set({ estilo: null })
    .where('estilo_id = :id', { id })
    .execute();
  await dataSource.getRepository(MusicaEstilo).delete({ id });

  return { success: true, tracksLiberados, mezclasBorradas };
}

/* ─────────────────────── Alias ─────────────────────── */

/**
 * Ata un genero crudo a un estilo. Si ya estaba atado a otro, lo mueve: es lo
 * que el usuario espera al reasignar, y el UNIQUE no permitiria duplicarlo.
 */
export async function asignarAlias(
  dataSource: DataSource,
  valorCrudo: string,
  estiloId: number,
): Promise<MusicaEstiloAlias> {
  const valor = normalizarGenero(valorCrudo);
  if (!valor) throw new Error('EL GENERO NO PUEDE ESTAR VACIO.');

  const estilo = await dataSource.getRepository(MusicaEstilo).findOne({ where: { id: estiloId } });
  if (!estilo) throw new Error('ESTILO NO ENCONTRADO.');

  const repo = dataSource.getRepository(MusicaEstiloAlias);
  const existente = await repo.findOne({ where: { valor }, relations: ['estilo'] });
  if (existente) {
    existente.estilo = estilo;
    return await repo.save(existente);
  }
  return await repo.save(repo.create({ valor, estilo }));
}

export async function quitarAlias(dataSource: DataSource, id: number): Promise<{ success: boolean }> {
  await dataSource.getRepository(MusicaEstiloAlias).delete({ id });
  return { success: true };
}

/**
 * Generos crudos del repertorio que todavia no estan en ninguna tabla de alias.
 *
 * Es la pantalla que evita que la taxonomia se pudra: si nadie ve lo que quedo
 * sin clasificar, en seis meses hay 59 valores sueltos otra vez.
 */
export async function generosSinClasificar(
  dataSource: DataSource,
): Promise<Array<{ genero: string; cantidad: number }>> {
  const filas = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .select('t.genero', 'genero')
    .addSelect('COUNT(*)', 'cantidad')
    .where('t.genero IS NOT NULL')
    .andWhere("t.genero <> ''")
    .groupBy('t.genero')
    .getRawMany();

  const alias = new Set(
    (await dataSource.getRepository(MusicaEstiloAlias).find()).map((a) => a.valor),
  );

  const sueltos = new Map<string, number>();
  for (const f of filas) {
    const norm = normalizarGenero(f.genero);
    if (!norm || alias.has(norm)) continue;
    sueltos.set(norm, (sueltos.get(norm) || 0) + (Number(f.cantidad) || 0));
  }
  return Array.from(sueltos.entries())
    .map(([genero, cantidad]) => ({ genero, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

/**
 * Todos los generos crudos presentes en el repertorio, con su conteo.
 *
 * Distinto de `generosSinClasificar`, que devuelve solo los que NINGUN alias
 * mapea: eso sirve para curar la taxonomia, pero como filtro de la pantalla de
 * repertorio esconderia justo los generos que ya estan bien clasificados, que
 * son los que el dueno quiere mirar.
 *
 * El valor va CRUDO, sin `normalizarGenero`: es lo que esta guardado en la
 * columna y es contra eso que el filtro compara por igualdad.
 */
export async function generosDelPool(
  dataSource: DataSource,
): Promise<Array<{ genero: string; cantidad: number }>> {
  const filas = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .select('t.genero', 'genero')
    .addSelect('COUNT(*)', 'cantidad')
    .where('t.genero IS NOT NULL')
    .andWhere("t.genero <> ''")
    .groupBy('t.genero')
    .getRawMany();

  return filas
    .map((f) => ({ genero: String(f.genero), cantidad: Number(f.cantidad) || 0 }))
    .sort((a, b) => b.cantidad - a.cantidad || a.genero.localeCompare(b.genero));
}

/* ─────────────────────── Siembra y reclasificacion ─────────────────────── */

/**
 * Crea el catalogo inicial. Idempotente: no duplica estilos ni alias, asi que
 * se puede correr de nuevo despues de importar musica nueva.
 */
export async function sembrarCatalogo(
  dataSource: DataSource,
): Promise<{ estilosCreados: number; aliasCreados: number }> {
  const estiloRepo = dataSource.getRepository(MusicaEstilo);
  const aliasRepo = dataSource.getRepository(MusicaEstiloAlias);
  let estilosCreados = 0;
  let aliasCreados = 0;

  const yaMapeados = new Set((await aliasRepo.find()).map((a) => a.valor));

  for (let i = 0; i < SIEMBRA_ESTILOS.length; i++) {
    const def = SIEMBRA_ESTILOS[i];
    const nombre = def.nombre.toUpperCase();
    let estilo = await estiloRepo.findOne({ where: { nombre } });
    if (!estilo) {
      estilo = await estiloRepo.save(
        estiloRepo.create({ nombre, descripcion: def.descripcion, orden: i, activo: true }),
      );
      estilosCreados++;
    }
    for (const crudo of def.generos) {
      const valor = normalizarGenero(crudo);
      if (!valor || yaMapeados.has(valor)) continue;
      await aliasRepo.save(aliasRepo.create({ valor, estilo }));
      yaMapeados.add(valor);
      aliasCreados++;
    }
  }

  return { estilosCreados, aliasCreados };
}

export async function resolverEstiloId(
  dataSource: DataSource,
  genero?: string | null,
): Promise<number | null> {
  const valor = normalizarGenero(genero || '');
  if (!valor) return null;
  const alias = await dataSource
    .getRepository(MusicaEstiloAlias)
    .findOne({ where: { valor }, relations: ['estilo'] });
  return alias?.estilo?.id ?? null;
}

/* ─────────────────── Resolucion de estilo por precedencia ───────────────────
 *
 * Tres fuentes opinan y cada una escribe SOLO su columna. `estilo` es el valor
 * resuelto y lo unico que consulta el planner.
 *
 * El orden no es arbitrario:
 *
 *   manual  — el dueno ya miro ese tema. Ninguna corrida automatica lo discute.
 *   agente  — es el unico que ENTIENDE el tema. Sabe que Nouvelle Vague es un
 *             proyecto de covers aunque su genero declarado sea `BOSSA NOVA`,
 *             y esa distincion no existe en ninguna taxonomia de generos.
 *   genero  — barato, estable y reproducible, pero solo sabe de generos.
 *
 * Antes habia una sola columna: la ultima capa en correr pisaba a las demas, y
 * como el genero corre despues del etiquetado, el veredicto del agente se
 * perdia en la corrida siguiente sin dejar rastro.
 */

/** Relaciones que hay que cargar para poder resolver sin lecturas extra. */
export const RELACIONES_ESTILO = ['estilo', 'estiloManual', 'estiloAgente', 'estiloGenero'];

/** Precedencia pura, sin efectos. Unico lugar donde vive la regla. */
export function resolverEstilo(track: MusicaTrack): MusicaEstilo | null {
  return track.estiloManual ?? track.estiloAgente ?? track.estiloGenero ?? null;
}

/**
 * Recalcula `estilo` y avisa si cambio, para guardar solo lo que cambia.
 *
 * Toda escritura de cualquiera de las tres columnas tiene que pasar por aca: si
 * cada capa recalculara por su cuenta, en unos meses `estilo` no coincidiria
 * con ninguna de sus fuentes y nadie sabria por que.
 */
export function aplicarResolucion(track: MusicaTrack): boolean {
  const resuelto = resolverEstilo(track);
  if ((resuelto?.id ?? null) === (track.estilo?.id ?? null)) return false;
  track.estilo = resuelto;
  return true;
}

/**
 * Recorre el repertorio y asigna el estilo QUE SE DEDUCE DEL GENERO via alias.
 *
 * Escribe `estiloGenero` y nada mas. Si el dueno o el agente opinaron distinto,
 * su opinion sigue mandando: esto ya no pisa a nadie.
 */
export async function reclasificarPool(
  dataSource: DataSource,
): Promise<{ procesados: number; clasificados: number; sinEstilo: number; respetados: number }> {
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const aliasRepo = dataSource.getRepository(MusicaEstiloAlias);

  const mapa = new Map<string, MusicaEstilo>();
  for (const a of await aliasRepo.find({ relations: ['estilo'] })) {
    if (a.estilo) mapa.set(a.valor, a.estilo);
  }

  // Con `relations` para poder comparar contra lo actual y guardar solo lo que
  // cambia; sin ellas las relaciones vienen undefined y se reescribe todo.
  const tracks = await trackRepo.find({ relations: RELACIONES_ESTILO });
  const resultado = { procesados: tracks.length, clasificados: 0, sinEstilo: 0, respetados: 0 };
  const aGuardar: MusicaTrack[] = [];

  for (const t of tracks) {
    const porGenero = mapa.get(normalizarGenero(t.genero || '')) || null;
    if (!porGenero) resultado.sinEstilo++;
    else resultado.clasificados++;

    // `respetados` = casos donde una fuente de mas peso decide el valor final.
    // Es la cuenta que le importa al usuario: cuanto de lo suyo NO se toco.
    if (t.estiloManual || t.estiloAgente) resultado.respetados++;

    let cambio = false;
    if ((porGenero?.id ?? null) !== (t.estiloGenero?.id ?? null)) {
      t.estiloGenero = porGenero;
      cambio = true;
    }
    if (aplicarResolucion(t) || cambio) aGuardar.push(t);
  }

  if (aGuardar.length) await trackRepo.save(aGuardar, { chunk: 100 });
  return resultado;
}

/**
 * Temas donde el agente y el genero NO coinciden.
 *
 * No es una lista de errores: es donde el genero no alcanza para expresar una
 * distincion que al local si le importa —"bossa covers" y "bossa clasica" son
 * ambos `BOSSA NOVA`— y por eso es la cola de curacion natural. Se arma sola.
 */
export async function desacuerdosDeEstilo(dataSource: DataSource): Promise<
  Array<{
    trackId: number;
    titulo: string;
    artista: string;
    genero: string | null;
    estiloAgente: string;
    estiloGenero: string;
    resuelto: string;
    hayManual: boolean;
  }>
> {
  const tracks = await dataSource.getRepository(MusicaTrack).find({
    where: { estado: EstadoTrack.APROBADO },
    relations: RELACIONES_ESTILO,
  });
  return tracks
    .filter((t) => t.estiloAgente && t.estiloGenero && t.estiloAgente.id !== t.estiloGenero.id)
    .map((t) => ({
      trackId: t.id,
      titulo: t.titulo,
      artista: t.artista,
      genero: t.genero ?? null,
      estiloAgente: t.estiloAgente!.nombre,
      estiloGenero: t.estiloGenero!.nombre,
      resuelto: resolverEstilo(t)?.nombre ?? '',
      hayManual: !!t.estiloManual,
    }));
}

/* ─────────────────────── Mezcla por bloque ─────────────────────── */

export interface MezclaItem {
  estiloId: number;
  estiloNombre: string;
  porcentaje: number;
}

export async function getMezcla(dataSource: DataSource, bloqueId: number): Promise<MezclaItem[]> {
  const filas = await dataSource
    .getRepository(BloqueEstiloMezcla)
    .find({ where: { bloque: { id: bloqueId } }, relations: ['estilo'] });
  return filas
    .filter((f) => !!f.estilo)
    .map((f) => ({
      estiloId: f.estilo.id,
      estiloNombre: f.estilo.nombre,
      porcentaje: f.porcentaje,
    }))
    .sort((a, b) => b.porcentaje - a.porcentaje);
}

/**
 * Reemplaza la mezcla completa del bloque.
 *
 * Los porcentajes NO tienen que sumar 100: lo que falte se completa con el
 * resto del repertorio que pase los filtros. Sumar menos es una forma valida de
 * decir "quiero bossa y pagode, el resto me da igual". Pasar de 100 si es un
 * error, porque no habria como repartir.
 */
export async function guardarMezcla(
  dataSource: DataSource,
  bloqueId: number,
  items: Array<{ estiloId: number; porcentaje: number }>,
): Promise<{ success: boolean }> {
  const limpios = (items || [])
    .map((i) => ({ estiloId: Number(i.estiloId), porcentaje: Math.round(Number(i.porcentaje) || 0) }))
    .filter((i) => i.estiloId && i.porcentaje > 0);

  const total = limpios.reduce((acc, i) => acc + i.porcentaje, 0);
  if (total > 100) {
    throw new Error(`LOS PORCENTAJES SUMAN ${total}%. NO PUEDEN PASAR DE 100%.`);
  }
  const repetidos = limpios.length !== new Set(limpios.map((i) => i.estiloId)).size;
  if (repetidos) throw new Error('HAY UN ESTILO REPETIDO EN LA MEZCLA.');

  const bloque = await dataSource
    .getRepository(BloqueProgramacion)
    .findOne({ where: { id: bloqueId } });
  if (!bloque) throw new Error('BLOQUE NO ENCONTRADO.');

  const repo = dataSource.getRepository(BloqueEstiloMezcla);
  await repo.delete({ bloque: { id: bloqueId } });
  if (!limpios.length) return { success: true };

  const estilos = await dataSource
    .getRepository(MusicaEstilo)
    .find({ where: { id: In(limpios.map((i) => i.estiloId)) } });
  const porId = new Map(estilos.map((e) => [e.id, e]));

  const filas = limpios
    .filter((i) => porId.has(i.estiloId))
    .map((i) => repo.create({ bloque, estilo: porId.get(i.estiloId)!, porcentaje: i.porcentaje }));
  await repo.save(filas);
  return { success: true };
}

/* ─────────────────────── Deficit ─────────────────────── */

export interface DeficitEstilo {
  estiloId: number;
  estiloNombre: string;
  porcentaje: number;
  /** Cuanta musica de este estilo pide la cuota. */
  necesarioMs: number;
  /** Cuanta hay aprobada en el repertorio. */
  disponibleMs: number;
  tracksDisponibles: number;
  /** > 0 = falta musica. Es el numero que dispara el descubrimiento. */
  faltanteMs: number;
  /** Estimacion de cuantos temas hay que sumar, a 3:30 promedio. */
  tracksFaltantes: number;
}

export interface DeficitBloque {
  bloqueId: number;
  bloqueNombre: string;
  diaSemana: number;
  /** Duracion objetivo de la playlist (bloque x factor). */
  objetivoMs: number;
  estilos: DeficitEstilo[];
  faltanteTotalMs: number;
}

function minutosDe(hhmm: string): number {
  const [h, m] = (hhmm || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/**
 * Duracion del bloque en ms. `'00:00'` como fin significa medianoche del dia
 * siguiente, no las cero horas del mismo dia: sin esto un bloque 17:00-00:00
 * mide -17 horas.
 */
function duracionBloqueMs(bloque: BloqueProgramacion): number {
  const desde = minutosDe(bloque.horaDesde);
  const hastaCrudo = minutosDe(bloque.horaHasta);
  const hasta = hastaCrudo === 0 ? 24 * 60 : hastaCrudo;
  return Math.max(0, hasta - desde) * 60_000;
}

/**
 * Cuanta musica falta para que las cuotas de cada bloque se puedan cumplir.
 *
 * Es el numero que hace honesta a toda la funcion: con 7 temas de bossa (0,4 h)
 * no se puede llenar un almuerzo de 4,5 h aunque el planner respete la cuota, y
 * sin este calculo el sistema repetiria los mismos 7 temas sin decir nada.
 */
export async function calcularDeficit(
  dataSource: DataSource,
  factorDuracionGlobal: number,
  bloqueId?: number,
): Promise<DeficitBloque[]> {
  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
  const bloques = bloqueId
    ? await bloqueRepo.find({ where: { id: bloqueId } })
    : await bloqueRepo.find({ where: { activo: true } });
  if (!bloques.length) return [];

  const disponible = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .select('t.estilo_id', 'estiloId')
    .addSelect('COUNT(*)', 'cantidad')
    .addSelect('SUM(COALESCE(t.duracionMs, 0))', 'duracion')
    .where('t.estado = :estado', { estado: EstadoTrack.APROBADO })
    .andWhere('t.estilo_id IS NOT NULL')
    .groupBy('t.estilo_id')
    .getRawMany();

  const porEstilo = new Map<number, { cantidad: number; duracion: number }>();
  for (const f of disponible) {
    porEstilo.set(Number(f.estiloId), {
      cantidad: Number(f.cantidad) || 0,
      duracion: Number(f.duracion) || 0,
    });
  }

  const salida: DeficitBloque[] = [];
  for (const bloque of bloques) {
    const mezcla = await getMezcla(dataSource, bloque.id);
    const objetivoMs = duracionBloqueMs(bloque) * (bloque.factorDuracion || factorDuracionGlobal);

    const estilos: DeficitEstilo[] = mezcla.map((m) => {
      const necesarioMs = Math.round((objetivoMs * m.porcentaje) / 100);
      const disp = porEstilo.get(m.estiloId) || { cantidad: 0, duracion: 0 };
      const faltanteMs = Math.max(0, necesarioMs - disp.duracion);
      return {
        estiloId: m.estiloId,
        estiloNombre: m.estiloNombre,
        porcentaje: m.porcentaje,
        necesarioMs,
        disponibleMs: disp.duracion,
        tracksDisponibles: disp.cantidad,
        faltanteMs,
        tracksFaltantes: Math.ceil(faltanteMs / DURACION_FALLBACK_MS),
      };
    });

    salida.push({
      bloqueId: bloque.id,
      bloqueNombre: bloque.nombre,
      diaSemana: bloque.diaSemana,
      objetivoMs,
      estilos,
      faltanteTotalMs: estilos.reduce((acc, e) => acc + e.faltanteMs, 0),
    });
  }
  return salida;
}

/* ─────────────────────── Fallbacks de clasificacion ─────────────────────── */

/** Ids por request en `GET /artists`. Es el tope que acepta Spotify. */
const LOTE_ARTISTAS = 50;

export interface ResultadoBackfillGeneros {
  tracksSinGenero: number;
  artistasConsultados: number;
  artistasConGenero: number;
  artistasSinGenero: number;
  tracksActualizados: number;
  errores: string[];
}

/**
 * Trae el genero del ARTISTA desde Spotify para los temas que no lo tienen.
 *
 * POR QUE HACE FALTA: el importador de playlists y biblioteca guarda el
 * `artistaId` pero nunca llama a `/artists/{id}`, asi que todo lo que entro por
 * ahi quedo sin genero y por lo tanto sin estilo — 142 de 427 temas, un tercio
 * del repertorio fuera de cualquier cuota.
 *
 * OJO CON LA EXPECTATIVA: el genero que declara el sello al publicar se queda en
 * la distribuidora y NO llega a la API publica; los endpoints de track no tienen
 * campo de genero. Lo unico disponible es `genres` del artista, que es
 * clasificacion propia de Spotify y viene **vacia** para artistas con poca data,
 * tipicamente los regionales. Por eso esto es el primer fallback, no el unico.
 *
 * De los generos que devuelve Spotify se elige el primero que YA resuelve contra
 * el catalogo; asi un artista con ['samba', 'pagode'] cae en PAGODE si es el que
 * el local tiene mapeado, en vez de quedar colgado del orden de Spotify.
 */
export async function completarGenerosDesdeSpotify(
  dataSource: DataSource,
  userDataPath: string,
): Promise<ResultadoBackfillGeneros> {
  const trackRepo = dataSource.getRepository(MusicaTrack);
  const pendientes = await trackRepo
    .createQueryBuilder('t')
    .where("(t.genero IS NULL OR t.genero = '')")
    .andWhere("t.artistaId IS NOT NULL AND t.artistaId <> ''")
    .getMany();

  const resultado: ResultadoBackfillGeneros = {
    tracksSinGenero: pendientes.length,
    artistasConsultados: 0,
    artistasConGenero: 0,
    artistasSinGenero: 0,
    tracksActualizados: 0,
    errores: [],
  };
  if (!pendientes.length) return resultado;

  const alias = new Set(
    (await dataSource.getRepository(MusicaEstiloAlias).find()).map((a) => a.valor),
  );

  const ids = Array.from(new Set(pendientes.map((t) => t.artistaId!).filter(Boolean)));
  const generoPorArtista = new Map<string, string>();

  const registrar = (artista: any) => {
    if (!artista?.id) return;
    resultado.artistasConsultados++;
    const generos: string[] = (artista.genres || []).map((g: string) => g.toUpperCase());
    if (!generos.length) {
      resultado.artistasSinGenero++;
      return;
    }
    // El primero que YA resuelve contra el catalogo, y solo si ninguno resuelve
    // se cae al orden que devolvio Spotify.
    const preferido = generos.find((g) => alias.has(normalizarGenero(g))) || generos[0];
    generoPorArtista.set(artista.id, preferido);
    resultado.artistasConGenero++;
  };

  for (let i = 0; i < ids.length; i += LOTE_ARTISTAS) {
    const lote = ids.slice(i, i + LOTE_ARTISTAS);
    let porLote = false;
    try {
      const data = await spotifyApi(userDataPath, 'GET', `/artists?ids=${lote.join(',')}`);
      if (Array.isArray(data?.artists)) {
        for (const a of data.artists) registrar(a);
        porLote = true;
      }
    } catch {
      // `GET /artists?ids=` devuelve 403 para esta app (verificado contra la API
      // real: los tres lotes fallaron con Forbidden, con credenciales validas).
      // El endpoint individual si responde, asi que se cae a uno por uno: son
      // mas requests pero corre una sola vez por artista.
      porLote = false;
    }
    if (porLote) continue;

    for (const id of lote) {
      try {
        registrar(await spotifyApi(userDataPath, 'GET', `/artists/${id}`));
      } catch (e) {
        resultado.errores.push(`Artista ${id}: ${(e as Error).message}`);
      }
    }
  }

  const aGuardar: MusicaTrack[] = [];
  for (const t of pendientes) {
    const genero = generoPorArtista.get(t.artistaId || '');
    if (!genero) continue;
    t.genero = genero;
    aGuardar.push(t);
  }
  if (aGuardar.length) await trackRepo.save(aGuardar, { chunk: 100 });
  resultado.tracksActualizados = aGuardar.length;

  return resultado;
}

export interface ResultadoMusicBrainz {
  consultados: number;
  conGenero: number;
  sinDatos: number;
  porGenerosCurados: number;
  porTags: number;
  errores: string[];
}

/**
 * Completa generos consultando MusicBrainz por ISRC.
 *
 * Es MAS PRECISO que Spotify porque devuelve el genero de la GRABACION y no del
 * artista: Spotify pone `MPB` tanto a Gal Costa como a Marcelo D2. Se corre
 * despues del backfill de Spotify, sobre lo que ese no pudo resolver.
 *
 * Va a 1 request por segundo por el limite de cortesia de MusicBrainz, asi que
 * 150 temas tardan ~3 minutos. Corre una sola vez por tema.
 */
export async function completarGenerosDesdeMusicBrainz(
  dataSource: DataSource,
  limite = 200,
): Promise<ResultadoMusicBrainz> {
  const repo = dataSource.getRepository(MusicaTrack);
  const pendientes = await repo
    .createQueryBuilder('t')
    .where("(t.genero IS NULL OR t.genero = '')")
    .andWhere("t.isrc IS NOT NULL AND t.isrc <> ''")
    .take(limite)
    .getMany();

  const resultado: ResultadoMusicBrainz = {
    consultados: pendientes.length,
    conGenero: 0,
    sinDatos: 0,
    porGenerosCurados: 0,
    porTags: 0,
    errores: [],
  };
  if (!pendientes.length) return resultado;

  const aGuardar: MusicaTrack[] = [];
  for (const t of pendientes) {
    try {
      const r = await generoPorIsrc(t.isrc!);
      if (!r) {
        resultado.sinDatos++;
        continue;
      }
      t.genero = r.genero;
      aGuardar.push(t);
      resultado.conGenero++;
      if (r.fuente === 'genres') resultado.porGenerosCurados++;
      else resultado.porTags++;
    } catch (e) {
      resultado.errores.push(`${t.titulo}: ${(e as Error).message}`);
      // Un 503 significa que hay que parar: seguir solo empeora el bloqueo.
      if ((e as Error).message.includes('503')) break;
    }
  }
  if (aGuardar.length) await repo.save(aGuardar, { chunk: 100 });
  return resultado;
}

/**
 * Segundo fallback, gratis y determinista: si otro tema del MISMO artista ya
 * tiene estilo, se hereda.
 *
 * Es seguro porque el estilo se deriva del genero del artista, asi que dos temas
 * del mismo artista llegarian igual al mismo estilo. Cubre el caso en que
 * Spotify devolvio genero para unos temas del artista y no para otros.
 */
export async function heredarEstiloPorArtista(
  dataSource: DataSource,
): Promise<{ candidatos: number; heredados: number }> {
  const repo = dataSource.getRepository(MusicaTrack);
  // `relations` es obligatorio: sin ellas las relaciones vienen undefined en
  // TODOS los temas y el mapa de artistas queda vacio, asi que no hereda nada.
  const todos = await repo.find({ relations: RELACIONES_ESTILO });

  // Se toma el estilo RESUELTO del artista como fuente, pero se escribe en
  // `estiloGenero`: es una deduccion determinista, del mismo rango que el
  // alias, y no debe competir con el veredicto del agente sobre ESTE tema.
  const estiloDeArtista = new Map<string, MusicaEstilo>();
  for (const t of todos) {
    const resuelto = resolverEstilo(t);
    if (t.artistaId && resuelto && !estiloDeArtista.has(t.artistaId)) {
      estiloDeArtista.set(t.artistaId, resuelto);
    }
  }

  const aGuardar: MusicaTrack[] = [];
  let candidatos = 0;
  for (const t of todos) {
    if (resolverEstilo(t) || !t.artistaId) continue;
    candidatos++;
    const estilo = estiloDeArtista.get(t.artistaId);
    if (!estilo) continue;
    t.estiloGenero = estilo;
    aplicarResolucion(t);
    aGuardar.push(t);
  }
  if (aGuardar.length) await repo.save(aGuardar, { chunk: 100 });
  return { candidatos, heredados: aGuardar.length };
}

/**
 * Cascada completa de clasificacion, en orden de precision y costo:
 *
 *   1. Spotify `/artists/{id}`  — genero de ARTISTA. Rapido, pero grueso.
 *   2. MusicBrainz por ISRC     — genero de GRABACION. Preciso, 1 req/seg.
 *   3. Reclasificar por alias   — traduce los generos crudos al catalogo.
 *   4. Herencia por artista     — gratis y determinista.
 *
 * El quinto escalon —que el LLM elija del catalogo cerrado— vive en el
 * etiquetado, porque ahi ya se manda el lote al modelo y hacerlo aparte seria un
 * viaje de mas.
 *
 * `conMusicBrainz` en false permite la corrida rapida: MusicBrainz agrega
 * minutos y no siempre hace falta.
 */
export async function clasificarTodo(
  dataSource: DataSource,
  userDataPath: string,
  opts?: { conMusicBrainz?: boolean; limiteMusicBrainz?: number },
): Promise<{
  backfill: ResultadoBackfillGeneros;
  musicbrainz: ResultadoMusicBrainz | null;
  reclasificacion: { procesados: number; clasificados: number; sinEstilo: number; respetados: number };
  herencia: { candidatos: number; heredados: number };
  sinEstilo: number;
}> {
  const backfill = await completarGenerosDesdeSpotify(dataSource, userDataPath);
  const musicbrainz =
    opts?.conMusicBrainz === false
      ? null
      : await completarGenerosDesdeMusicBrainz(dataSource, opts?.limiteMusicBrainz ?? 200);
  const reclasificacion = await reclasificarPool(dataSource);
  const herencia = await heredarEstiloPorArtista(dataSource);
  const sinEstilo = await contarSinEstilo(dataSource);
  return { backfill, musicbrainz, reclasificacion, herencia, sinEstilo };
}

/** Temas aprobados sin estilo asignado: candidatos a curacion manual. */
export async function contarSinEstilo(dataSource: DataSource): Promise<number> {
  return await dataSource
    .getRepository(MusicaTrack)
    .count({ where: { estado: EstadoTrack.APROBADO, estilo: IsNull() } });
}

/**
 * Fija el estilo de un track a mano: gana sobre el agente y sobre el genero.
 *
 * Con `estiloId = null` se BORRA la correccion manual y el tema vuelve a lo que
 * digan las capas automaticas — no queda sin estilo. Es lo que espera quien se
 * arrepiente de una correccion.
 */
export async function fijarEstiloTrack(
  dataSource: DataSource,
  trackId: number,
  estiloId: number | null,
): Promise<MusicaTrack> {
  const repo = dataSource.getRepository(MusicaTrack);
  const track = await repo.findOne({ where: { id: trackId }, relations: RELACIONES_ESTILO });
  if (!track) throw new Error('TEMA NO ENCONTRADO.');
  if (estiloId) {
    const estilo = await dataSource.getRepository(MusicaEstilo).findOne({ where: { id: estiloId } });
    if (!estilo) throw new Error('ESTILO NO ENCONTRADO.');
    track.estiloManual = estilo;
  } else {
    track.estiloManual = null;
  }
  // `estiloFijado` quedo deprecada pero se sigue escribiendo: si alguien vuelve
  // a la version anterior, la curacion manual se respeta igual.
  track.estiloFijado = !!estiloId;
  aplicarResolucion(track);
  return await repo.save(track);
}

/** Estilos activos con al menos un tema: lo que el planner puede usar de verdad. */
export async function estilosUtilizables(dataSource: DataSource): Promise<MusicaEstilo[]> {
  const usados = await dataSource
    .getRepository(MusicaTrack)
    .createQueryBuilder('t')
    .select('DISTINCT t.estilo_id', 'estiloId')
    .where('t.estado = :estado', { estado: EstadoTrack.APROBADO })
    .andWhere('t.estilo_id IS NOT NULL')
    .getRawMany();
  const ids = usados.map((u) => Number(u.estiloId)).filter(Boolean);
  if (!ids.length) return [];
  return await dataSource
    .getRepository(MusicaEstilo)
    .find({ where: { id: In(ids), activo: true }, order: { orden: 'ASC' } });
}

// `Not` se importa para futuros filtros de exclusion; se referencia aca para
// que el linter no la marque como no usada.

