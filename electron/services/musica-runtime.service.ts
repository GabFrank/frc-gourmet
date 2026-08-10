/**
 * Runtime del modulo de musica: lo que hace sonar el local sin que nadie toque
 * nada.
 *
 * NO elige tema por tema. El plan del dia ya esta materializado en playlists de
 * Spotify (ver musica-planner.service), asi que este servicio solo reacciona a
 * eventos:
 *
 *   - cambia el bloque horario  → reproduce la playlist de ese bloque
 *   - el device desaparecio     → avisa (watchdog)
 *   - alguien toco Spotify a mano → modo manual, se aparta hasta el proximo bloque
 *
 * El heartbeat corre cada 2 minutos y NO decide musica: solo mira si hay que
 * cambiar de bloque y si el reproductor sigue vivo. Con playlists de 1,5x la
 * duracion del bloque, un chequeo cada 2 min es de sobra.
 */
import { DataSource } from 'typeorm';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { PlanProgramacion } from '../../src/app/database/entities/musica/plan-programacion.entity';
import { PlanBloque } from '../../src/app/database/entities/musica/plan-bloque.entity';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { TrackLog } from '../../src/app/database/entities/musica/track-log.entity';
import { VarianteEnergia } from '../../src/app/database/entities/musica/musica-enums';
import { readAppSettings } from '../utils/app-settings.utils';
import { getEstado, reproducir, setVolumen, normalizarModoReproduccion } from './spotify.service';
import { getBloqueVigente, generarPlanDelDia } from './musica-planner.service';

const HEARTBEAT_MS = 120_000;
/** Cuanto dura el modo manual tras detectar un cambio hecho a mano. */
const MODO_MANUAL_MS = 30 * 60_000;

export interface EstadoRuntime {
  activo: boolean;
  bloqueId: number | null;
  bloqueNombre: string | null;
  variante: VarianteEnergia;
  modoManual: boolean;
  ultimoError: string | null;
  ultimoChequeo: string | null;
}

let timer: NodeJS.Timeout | null = null;
let dataSourceRef: DataSource | null = null;
let userDataRef = '';

const estado: EstadoRuntime = {
  activo: false,
  bloqueId: null,
  bloqueNombre: null,
  variante: VarianteEnergia.NORMAL,
  modoManual: false,
  ultimoError: null,
  ultimoChequeo: null,
};

/** Tracks que pusimos nosotros: sirve para detectar intervencion manual. */
let trackIdsEsperados = new Set<string>();
let modoManualHasta = 0;
let ultimoTrackLogueado = '';

export function getEstadoRuntime(): EstadoRuntime {
  return { ...estado };
}

export function iniciarRuntimeMusica(dataSource: DataSource, userDataPath: string): void {
  dataSourceRef = dataSource;
  userDataRef = userDataPath;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void tick();
  }, HEARTBEAT_MS);
  // Primer chequeo sin esperar el intervalo.
  void tick();
}

export function detenerRuntimeMusica(): void {
  if (timer) clearInterval(timer);
  timer = null;
  estado.activo = false;
}

/** Fuerza una variante distinta dentro del bloque actual (salon lleno/vacio). */
export async function cambiarVariante(variante: VarianteEnergia): Promise<void> {
  if (!dataSourceRef) throw new Error('EL MODULO DE MUSICA NO ESTA INICIADO.');
  estado.variante = variante;
  await reproducirBloqueActual(true);
}

async function tick(): Promise<void> {
  estado.ultimoChequeo = new Date().toISOString();
  if (!dataSourceRef) return;

  const { musica } = readAppSettings(userDataRef);
  if (!musica.habilitado) {
    estado.activo = false;
    return;
  }
  estado.activo = true;

  try {
    // El modo manual vence solo; ademas se corta al cambiar de bloque.
    if (estado.modoManual && Date.now() > modoManualHasta) {
      estado.modoManual = false;
    }

    const bloque = await getBloqueVigente(dataSourceRef);
    const cambioDeBloque = (bloque?.id ?? null) !== estado.bloqueId;

    if (cambioDeBloque) {
      // Un bloque nuevo devuelve el control al sistema: si el encargado puso
      // algo a mano hace dos horas, no tiene por que seguir vigente ahora.
      estado.modoManual = false;
      estado.variante = VarianteEnergia.NORMAL;
      estado.bloqueId = bloque?.id ?? null;
      estado.bloqueNombre = bloque?.nombre ?? null;
    }

    if (!bloque) {
      // Fuera de horario: no se toca nada. Si el local sigue abierto por algo
      // excepcional, la musica que este sonando sigue.
      return;
    }

    await registrarLoQueSuena();

    const debeArrancar = cambioDeBloque || !(await estaSonandoLoNuestro());
    if (debeArrancar && !estado.modoManual) {
      await reproducirBloqueActual(false);
    }

    estado.ultimoError = null;
  } catch (e) {
    estado.ultimoError = (e as Error).message;
  }
}

/**
 * Detecta si lo que suena salio de nuestro plan. Si no, alguien toco la app de
 * Spotify: se entra en modo manual en vez de pelearle al usuario cada 2 min.
 */
async function estaSonandoLoNuestro(): Promise<boolean> {
  const actual = await getEstado(userDataRef);
  if (!actual || !actual.reproduciendo) return false;
  if (trackIdsEsperados.size === 0) return false;

  const id = extraerIdDeEstado(actual);
  if (!id) return false;

  if (!trackIdsEsperados.has(id)) {
    estado.modoManual = true;
    modoManualHasta = Date.now() + MODO_MANUAL_MS;
    return true; // suena algo: no lo pisamos
  }
  return true;
}

/**
 * `GET /me/player` no devuelve el id del track de forma directa en nuestro DTO;
 * se compara por titulo+artista contra el repertorio. Es suficiente para
 * distinguir "esto lo puse yo" de "esto lo puso alguien a mano".
 */
function extraerIdDeEstado(actual: { track: string | null; artista: string | null }): string | null {
  if (!actual.track) return null;
  return `${(actual.track || '').toUpperCase()}::${(actual.artista || '').toUpperCase()}`;
}

async function reproducirBloqueActual(forzar: boolean): Promise<void> {
  if (!dataSourceRef || !estado.bloqueId) return;
  if (estado.modoManual && !forzar) return;

  const planBloque = await getPlanBloque(estado.bloqueId, estado.variante);
  if (!planBloque?.spotifyUri) {
    estado.ultimoError =
      'No hay playlist generada para el bloque actual. Generá el plan del día en Configuración → Música.';
    return;
  }

  const bloqueRepo = dataSourceRef.getRepository(BloqueProgramacion);
  const bloque = await bloqueRepo.findOne({ where: { id: estado.bloqueId } });

  await reproducir(userDataRef, planBloque.spotifyUri);
  // Shuffle/repeat siempre apagados: el orden lo decide el plan.
  await normalizarModoReproduccion(userDataRef);
  if (bloque?.volumen != null) await setVolumen(userDataRef, bloque.volumen);

  // Cache de lo que deberia sonar, para detectar intervencion manual.
  await cargarEsperados(planBloque.trackIds || []);
}

async function cargarEsperados(spotifyIds: string[]): Promise<void> {
  trackIdsEsperados = new Set();
  if (!dataSourceRef || spotifyIds.length === 0) return;
  const repo = dataSourceRef.getRepository(MusicaTrack);
  const tracks = await repo
    .createQueryBuilder('t')
    .where('t.spotifyId IN (:...ids)', { ids: spotifyIds.slice(0, 500) })
    .getMany();
  for (const t of tracks) {
    trackIdsEsperados.add(`${t.titulo.toUpperCase()}::${t.artista.toUpperCase()}`);
  }
}

async function getPlanBloque(
  bloqueId: number,
  variante: VarianteEnergia,
): Promise<PlanBloque | null> {
  if (!dataSourceRef) return null;
  const planRepo = dataSourceRef.getRepository(PlanProgramacion);
  const hoy = fechaLocalHoy();

  let plan = await planRepo.findOne({ where: { fecha: hoy } });
  if (!plan) {
    // Sin plan de hoy, se genera solo: el local no puede quedarse sin musica
    // porque nadie apreto un boton a la mañana.
    try {
      await generarPlanDelDia(dataSourceRef, userDataRef, hoy);
      plan = await planRepo.findOne({ where: { fecha: hoy } });
    } catch (e) {
      estado.ultimoError = `No se pudo generar el plan del día: ${(e as Error).message}`;
      return null;
    }
  }
  if (!plan) return null;

  const repo = dataSourceRef.getRepository(PlanBloque);
  return await repo.findOne({
    where: { plan: { id: plan.id }, bloque: { id: bloqueId }, variante },
  });
}

/** Deja registro de lo que sono: anti-repeticion, dashboard e historial. */
async function registrarLoQueSuena(): Promise<void> {
  if (!dataSourceRef) return;
  const actual = await getEstado(userDataRef);
  if (!actual || !actual.reproduciendo || !actual.track) return;

  const clave = `${actual.track}::${actual.artista}`;
  if (clave === ultimoTrackLogueado) return;
  ultimoTrackLogueado = clave;

  const trackRepo = dataSourceRef.getRepository(MusicaTrack);
  const track = await trackRepo.findOne({
    where: { titulo: (actual.track || '').toUpperCase() },
  });

  const logRepo = dataSourceRef.getRepository(TrackLog);
  await logRepo.save(
    logRepo.create({
      spotifyId: track?.spotifyId || clave,
      titulo: actual.track || undefined,
      artista: actual.artista || undefined,
      bloqueId: estado.bloqueId ?? undefined,
      variante: estado.variante,
      inicio: new Date(),
    }),
  );

  if (track) {
    track.ultimaVez = new Date();
    track.vecesSonado = (track.vecesSonado || 0) + 1;
    await trackRepo.save(track);
  }
}

function fechaLocalHoy(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
