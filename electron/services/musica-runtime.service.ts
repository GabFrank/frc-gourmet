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
import { leerEstadoSalon } from './musica-salon.service';
import { emitirEventoMusica } from '../utils/musica-events.utils';

const HEARTBEAT_MS = 120_000;
/** Cuanto dura el modo manual tras detectar un cambio hecho a mano. */
const MODO_MANUAL_MS = 30 * 60_000;
/**
 * El salon tiene que sostener la condicion este tiempo antes de cambiar de
 * variante. Sin histeresis la musica cambiaria de humor cada vez que entra o
 * sale una mesa, que es peor que no reaccionar.
 */
const HISTERESIS_MS = 10 * 60_000;
const OCUPACION_ALTA = 80;
const OCUPACION_BAJA = 30;

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
/**
 * El primer tick tras iniciar el proceso ADOPTA lo que ya esta pasando en vez
 * de mandar.
 *
 * Todo este estado vive en memoria y arranca vacio, asi que sin esta bandera un
 * reinicio se ve identico a un cambio de bloque: `bloqueId` en null hace que
 * `cambioDeBloque` de true, y `trackIdsEsperados` vacio hace que
 * `estaSonandoLoNuestro()` de false. Cualquiera de las dos alcanza para relanzar
 * la playlist, y como `reproducir()` no manda `offset`, Spotify vuelve al track
 * 1. Cada actualizacion o reinicio de la PC repetia los mismos temas del
 * arranque del bloque.
 */
let arrancando = true;
let modoManualHasta = 0;
let ultimoTrackLogueado = '';
/** Desde cuando se sostiene la condicion actual del salon. */
let condicionSalonDesde = 0;
let condicionSalon: VarianteEnergia | null = null;

export function getEstadoRuntime(): EstadoRuntime {
  return { ...estado };
}

/**
 * Borra la alerta en cuanto algo vuelve a funcionar.
 *
 * El heartbeat corre cada 2 minutos: sin esto, un fallo pasajero de Spotify
 * dejaba el cartel "no encuentra un reproductor activo" en pantalla todo ese
 * rato, aunque el encargado ya hubiera arreglado la causa y la musica estuviera
 * sonando. Lo llaman los comandos del player cuando salen bien.
 */
export function limpiarErrorRuntime(): void {
  estado.ultimoError = null;
}

/** Estado del salon para mostrarlo junto al del reproductor. */
export async function getEstadoSalon() {
  if (!dataSourceRef) return null;
  return await leerEstadoSalon(dataSourceRef);
}

export function iniciarRuntimeMusica(dataSource: DataSource, userDataPath: string): void {
  dataSourceRef = dataSource;
  userDataRef = userDataPath;
  // Vuelve a modo "adoptar" tambien si el runtime se reinicia en caliente.
  arrancando = true;
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

/**
 * Fuerza una variante distinta dentro del bloque actual (salon lleno/vacio).
 *
 * Entra en modo manual, igual que cuando alguien cambia la musica desde Spotify:
 * sin eso `reaccionarAlSalon()` volvia a imponer la variante que dicta la
 * ocupacion apenas se cumplia la histeresis, y la eleccion del encargado duraba
 * 10 minutos. El modo manual vence solo a la media hora, y un cambio de bloque
 * lo limpia antes.
 */
export async function cambiarVariante(variante: VarianteEnergia): Promise<void> {
  if (!dataSourceRef) throw new Error('EL MODULO DE MUSICA NO ESTA INICIADO.');
  estado.variante = variante;
  estado.modoManual = true;
  modoManualHasta = Date.now() + MODO_MANUAL_MS;
  await reproducirBloqueActual(true);
  emitirEventoMusica({ tipo: 'VARIANTE', detalle: 'Cambio manual', variante });
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
    // En el arranque no hay bloque anterior con el cual comparar: se adopta el
    // vigente en silencio. Tratarlo como cambio reiniciaria la playlist.
    const cambioDeBloque = !arrancando && (bloque?.id ?? null) !== estado.bloqueId;

    if (arrancando) {
      estado.bloqueId = bloque?.id ?? null;
      estado.bloqueNombre = bloque?.nombre ?? null;
      // Reconstruir que deberia estar sonando para reconocerlo. Van las tres
      // variantes: al reiniciar no sabemos en cual estabamos, y con solo la
      // NORMAL un tema de SUAVE o MOVIDO pareceria intervencion manual.
      if (bloque) await cargarEsperadosDeTodasLasVariantes(bloque.id);
      arrancando = false;
    }

    if (cambioDeBloque) {
      // Un bloque nuevo devuelve el control al sistema: si el encargado puso
      // algo a mano hace dos horas, no tiene por que seguir vigente ahora.
      estado.modoManual = false;
      estado.variante = VarianteEnergia.NORMAL;
      estado.bloqueId = bloque?.id ?? null;
      estado.bloqueNombre = bloque?.nombre ?? null;
      emitirEventoMusica({
        tipo: 'BLOQUE',
        detalle: bloque?.nombre ?? 'fuera de horario',
        bloqueId: estado.bloqueId,
        variante: estado.variante,
      });
    }

    if (!bloque) {
      // Fuera de horario: no se toca nada. Si el local sigue abierto por algo
      // excepcional, la musica que este sonando sigue.
      // El error se limpia igual: si no, el ultimo fallo del dia quedaba en
      // pantalla toda la noche, porque este `return` saltea el limpiado final.
      estado.ultimoError = null;
      return;
    }

    await registrarLoQueSuena();
    await reaccionarAlSalon(bloque);

    const debeArrancar = cambioDeBloque || !(await estaSonandoLoNuestro());
    if (debeArrancar && !estado.modoManual) {
      await reproducirBloqueActual(false);
    }

    estado.ultimoError = null;
  } catch (e) {
    estado.ultimoError = (e as Error).message;
    emitirEventoMusica({ tipo: 'ALERTA', detalle: estado.ultimoError });
  }
}

/**
 * Sube o baja la energia segun lo que pasa en el salon — el diferencial del
 * modulo, porque ningun proveedor de musica tiene el punto de venta.
 *
 * Solo cambia si la condicion se SOSTIENE (ver HISTERESIS_MS), y nunca en modo
 * manual: si el encargado eligio un clima a mano, el salon no se lo pisa.
 */
async function reaccionarAlSalon(bloque: BloqueProgramacion): Promise<void> {
  if (!dataSourceRef || estado.modoManual) return;

  const salon = await leerEstadoSalon(dataSourceRef);
  // Sin mesas cargadas no hay señal: el local puede ser solo mostrador.
  if (salon.mesasTotales === 0) return;

  let deseada: VarianteEnergia = VarianteEnergia.NORMAL;
  if (salon.ocupacionPct >= OCUPACION_ALTA && salon.ventasPorMinuto > 0) {
    // Lleno y vendiendo: subir el ritmo ayuda a rotar mesas.
    deseada = VarianteEnergia.MOVIDO;
  } else if (salon.ocupacionPct > 0 && salon.ocupacionPct <= OCUPACION_BAJA) {
    // Poca gente pero hay mesas ocupadas: bajar el tempo alarga la estadia.
    deseada = VarianteEnergia.SUAVE;
  }

  if (deseada !== condicionSalon) {
    condicionSalon = deseada;
    condicionSalonDesde = Date.now();
    return;
  }
  if (Date.now() - condicionSalonDesde < HISTERESIS_MS) return;
  if (deseada === estado.variante) return;

  estado.variante = deseada;
  await reproducirBloqueActual(true);
  emitirEventoMusica({
    tipo: 'VARIANTE',
    detalle: `Salón ${Math.round(salon.ocupacionPct)}% ocupado`,
    bloqueId: estado.bloqueId,
    variante: deseada,
  });
  console.log(
    `[musica] Salon ${Math.round(salon.ocupacionPct)}% ocupado, ` +
      `${salon.ventasUltimaHora} ventas/h → variante ${deseada} en "${bloque.nombre}".`,
  );
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
    emitirEventoMusica({ tipo: 'MODO', detalle: 'Modo manual: alguien cambió la música a mano' });
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

/**
 * Une los tracks de las tres variantes del bloque.
 *
 * Se usa solo al arrancar: no sabemos en que variante estabamos antes del
 * reinicio, y cargar solo la NORMAL haria pasar por "intervencion manual"
 * cualquier tema de SUAVE o MOVIDO que estuviera sonando.
 */
async function cargarEsperadosDeTodasLasVariantes(bloqueId: number): Promise<void> {
  const ids: string[] = [];
  for (const v of [VarianteEnergia.SUAVE, VarianteEnergia.NORMAL, VarianteEnergia.MOVIDO]) {
    const pb = await getPlanBloque(bloqueId, v);
    if (pb?.trackIds?.length) ids.push(...pb.trackIds);
  }
  await cargarEsperados([...new Set(ids)]);
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
  emitirEventoMusica({
    tipo: 'TRACK',
    detalle: `${actual.track} — ${actual.artista}`,
    bloqueId: estado.bloqueId,
    variante: estado.variante,
  });

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
