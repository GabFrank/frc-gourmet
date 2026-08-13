import { Injectable } from '@angular/core';

/**
 * Modulo de Musica ambiental — puente al handler `musica.handler.ts`.
 *
 * Usa el passthrough generico `window.api.callIpc` (mismo patron que
 * DocumentoService): en modo cliente el preload re-rutea a `/api/rpc`, asi que
 * la PWA y el desktop consumen exactamente los mismos handlers.
 *
 * Spotify es catalogo + reproductor; el control lo ejerce el backend, no el
 * renderer (el access token nunca baja al frontend).
 */
export interface MusicaAvanzado {
  maxPorArtistaDefault: number;
  ventanaAntirepeticionDias: number;
  factorDuracion: number;
  deltaBpmVariante: number;
  duracionMinSeg: number;
  duracionMaxSeg: number;
  candidatosPorRonda: number;
  permitirExplicit: boolean;
}

export interface MusicaConfig {
  spotifyClientId: string;
  redirectPort: number;
  redirectUri: string;
  deviceId: string | null;
  deviceNombre: string | null;
  habilitado: boolean;
  autoAprobarDescubrimientos: boolean;
  brief: string;
  avanzado?: MusicaAvanzado;
  conectado: boolean;
}

export interface MusicaSemilla {
  id: number;
  tipo: string;
  spotifyUri: string;
  nombre: string;
  imagenUrl?: string;
  tracksImportados: number;
  ultimaImportacion?: string;
}

export interface MusicaTrack {
  id: number;
  spotifyId: string;
  titulo: string;
  artista: string;
  album?: string;
  imagenUrl?: string;
  duracionMs: number;
  explicit: boolean;
  bpm?: number;
  energia?: number;
  valencia?: number;
  genero?: string;
  estado: string;
  score: number;
  vecesSonado: number;
  /** Estilo resuelto (manual › agente › género). Es el que usa el planner. */
  estilo?: { id: number; nombre: string } | null;
  /** Presente solo si alguien lo corrigió a mano. */
  estiloManual?: { id: number; nombre: string } | null;
}

export interface ResumenPool {
  total: number;
  aprobados: number;
  sugeridos: number;
  vetados: number;
  etiquetados: number;
  sinFeatures: number;
}

export interface ResultadoDescubrimiento {
  propuestos: number;
  agregados: number;
  yaEstaban: number;
  noEncontrados: number;
  filtrados: number;
  detalleFiltrados: string[];
  agregadosDetalle: Array<{ artista: string; tema: string; motivo?: string }>;
}

export interface BloqueProgramacion {
  id: number;
  diaSemana: number;
  nombre: string;
  horaDesde: string;
  horaHasta: string;
  energia: number;
  volumen: number;
  generosPreferidos?: string[];
  generosEvitar?: string[];
  bpmMin?: number;
  bpmMax?: number;
  valenciaMin?: number;
  maxPorArtista?: number | null;
  evitarArtistaConsecutivo: boolean;
  factorDuracion?: number | null;
  /** Ánimos que no pueden sonar acá (`ANIMOS`). Exclusión dura. */
  animosEvitar?: string[];
  /** Momento del día del bloque (`ESCENAS`). Preferencia, no filtro. */
  escenaPreferida?: string | null;
  notas?: string;
  orden: number;
}

export interface ResultadoPlan {
  planId: number;
  fecha: string;
  bloques: number;
  playlists: number;
  advertencias: string[];
}

export interface DispositivoSpotify {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  volumen: number | null;
}

export interface EstiloConDatos {
  id: number;
  nombre: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
  /** Géneros crudos de Spotify que caen en este estilo. */
  alias: string[];
  /** Lo mismo con id, para poder quitarlos o reasignarlos desde la UI. */
  aliasDetalle: Array<{ id: number; valor: string }>;
  tracks: number;
  duracionMs: number;
}

/**
 * Un tema donde el agente y el género discrepan.
 *
 * No es un error: es donde el género no alcanza para expresar una distinción
 * que al local sí le importa (bossa covers vs bossa clásica son ambos
 * `BOSSA NOVA`). Manda el agente; esta lista existe para poder revisarlo.
 */
export interface DesacuerdoEstilo {
  trackId: number;
  titulo: string;
  artista: string;
  genero: string | null;
  estiloAgente: string;
  estiloGenero: string;
  resuelto: string;
  hayManual: boolean;
}

export interface MezclaItem {
  estiloId: number;
  estiloNombre: string;
  porcentaje: number;
}

export interface DeficitEstilo {
  estiloId: number;
  estiloNombre: string;
  porcentaje: number;
  necesarioMs: number;
  disponibleMs: number;
  tracksDisponibles: number;
  faltanteMs: number;
  tracksFaltantes: number;
}

export interface DeficitBloque {
  bloqueId: number;
  bloqueNombre: string;
  diaSemana: number;
  objetivoMs: number;
  estilos: DeficitEstilo[];
  faltanteTotalMs: number;
}

export interface EstadoRuntime {
  activo: boolean;
  bloqueId: number | null;
  bloqueNombre: string | null;
  variante: string;
  modoManual: boolean;
  ultimoError: string | null;
  ultimoChequeo?: string | null;
  salon?: {
    mesasTotales: number;
    mesasOcupadas: number;
    ocupacionPct: number;
    ventasPorMinuto: number;
    ventasUltimaHora: number;
  } | null;
}

export interface EstadoReproduccion {
  reproduciendo: boolean;
  track: string | null;
  artista: string | null;
  album: string | null;
  imagenUrl: string | null;
  progresoMs: number;
  duracionMs: number;
  volumen: number | null;
  dispositivoNombre: string | null;
  dispositivoId: string | null;
}

@Injectable({ providedIn: 'root' })
export class MusicaService {
  private get api(): any {
    return (window as any).api;
  }

  getConfig(): Promise<MusicaConfig> {
    return this.api.callIpc('musica-get-config');
  }

  setConfig(data: {
    spotifyClientId?: string;
    redirectPort?: number;
    habilitado?: boolean;
    autoAprobarDescubrimientos?: boolean;
    brief?: string;
    avanzado?: Partial<MusicaAvanzado>;
  }): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-set-config', data);
  }

  conectar(): Promise<{ success: boolean; nombreUsuario: string }> {
    return this.api.callIpc('musica-conectar');
  }

  /** Aborta un OAuth a medias y libera el puerto loopback en el acto. */
  cancelarConexion(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-cancelar-conexion');
  }

  desconectar(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-desconectar');
  }

  abrirSpotify(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-abrir-spotify');
  }

  listarDispositivos(): Promise<DispositivoSpotify[]> {
    return this.api.callIpc('musica-listar-dispositivos');
  }

  seleccionarDispositivo(deviceId: string, deviceNombre: string): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-seleccionar-dispositivo', { deviceId, deviceNombre });
  }

  getEstado(): Promise<EstadoReproduccion | null> {
    return this.api.callIpc('musica-estado');
  }

  play(contextUri?: string): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-play', contextUri);
  }

  pausar(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-pausar');
  }

  siguiente(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-siguiente');
  }

  anterior(): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-anterior');
  }

  setVolumen(porcentaje: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-volumen', porcentaje);
  }

  getRuntimeEstado(): Promise<EstadoRuntime> {
    return this.api.callIpc('musica-runtime-estado');
  }

  /** Fuerza el clima del bloque actual. Entra en modo manual por 30 minutos. */
  setVariante(variante: string): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-variante', variante);
  }

  /** Para esconder el control cuando no hay Spotify configurado ni conectado. */
  disponible(): Promise<{ configurado: boolean; conectado: boolean; habilitado: boolean }> {
    return this.api.callIpc('musica-disponible');
  }

  /**
   * Eventos empujados desde el main (`musica-events`): bloque, variante, alerta.
   * Devuelve la función para desuscribir.
   */
  onEvento(handler: (payload: any) => void): () => void {
    return this.api.onMusicaEvent
      ? this.api.onMusicaEvent(handler)
      : () => undefined;
  }

  // ─────────── Semillas y repertorio ───────────

  listarSemillas(): Promise<MusicaSemilla[]> {
    return this.api.callIpc('musica-semillas-listar');
  }

  crearSemilla(url: string, bloqueIds?: number[]): Promise<MusicaSemilla> {
    return this.api.callIpc('musica-semilla-crear', { url, bloqueIds });
  }

  crearSemillaBiblioteca(): Promise<MusicaSemilla> {
    return this.api.callIpc('musica-semilla-biblioteca');
  }

  eliminarSemilla(id: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-semilla-eliminar', id);
  }

  importarSemilla(id: number): Promise<{ nuevos: number; actualizados: number }> {
    return this.api.callIpc('musica-semilla-importar', id);
  }

  importarTodas(): Promise<{
    semillas: number;
    nuevos: number;
    actualizados: number;
    errores: Array<{ semilla: string; error: string }>;
  }> {
    return this.api.callIpc('musica-importar-todas');
  }

  getResumenPool(): Promise<ResumenPool> {
    return this.api.callIpc('musica-pool-resumen');
  }

  listarTracks(filtros?: {
    estado?: string;
    texto?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: MusicaTrack[]; total: number }> {
    return this.api.callIpc('musica-tracks-listar', filtros);
  }

  cambiarEstadoTrack(id: number, estado: string): Promise<MusicaTrack> {
    return this.api.callIpc('musica-track-estado', { id, estado });
  }

  // ─────────── Catálogo de estilos (F4) ───────────

  listarEstilos(): Promise<EstiloConDatos[]> {
    return this.api.callIpc('musica-estilos-listar');
  }

  guardarEstilo(datos: {
    id?: number;
    nombre: string;
    descripcion?: string;
    orden?: number;
    activo?: boolean;
  }): Promise<any> {
    return this.api.callIpc('musica-estilo-guardar', datos);
  }

  eliminarEstilo(id: number): Promise<{
    success: boolean;
    tracksLiberados: number;
    mezclasBorradas: number;
  }> {
    return this.api.callIpc('musica-estilo-eliminar', id);
  }

  asignarAlias(genero: string, estiloId: number): Promise<any> {
    return this.api.callIpc('musica-estilo-alias-asignar', { genero, estiloId });
  }

  quitarAlias(id: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-estilo-alias-quitar', id);
  }

  /**
   * Corrección manual del estilo de un tema. Gana sobre el agente y sobre el
   * género. Con `estiloId = null` se borra la corrección y vuelve a mandar la
   * clasificación automática.
   */
  fijarEstiloTrack(trackId: number, estiloId: number | null): Promise<any> {
    return this.api.callIpc('musica-track-estilo', { trackId, estiloId });
  }

  /** Temas donde el agente y el género no coinciden: la cola de curación. */
  desacuerdosDeEstilo(): Promise<DesacuerdoEstilo[]> {
    return this.api.callIpc('musica-estilos-desacuerdos');
  }

  sembrarEstilos(): Promise<any> {
    return this.api.callIpc('musica-estilos-sembrar');
  }

  /** Cascada completa: Spotify → MusicBrainz → alias → herencia. */
  clasificarTodo(opts?: { conMusicBrainz?: boolean; limiteMusicBrainz?: number }): Promise<any> {
    return this.api.callIpc('musica-estilos-clasificar-todo', opts);
  }

  generosSinClasificar(): Promise<Array<{ genero: string; cantidad: number }>> {
    return this.api.callIpc('musica-generos-sin-clasificar');
  }

  getMezcla(bloqueId: number): Promise<MezclaItem[]> {
    return this.api.callIpc('musica-mezcla-get', bloqueId);
  }

  guardarMezcla(
    bloqueId: number,
    items: Array<{ estiloId: number; porcentaje: number }>,
  ): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-mezcla-guardar', { bloqueId, items });
  }

  getDeficit(bloqueId?: number): Promise<DeficitBloque[]> {
    return this.api.callIpc('musica-deficit', bloqueId);
  }

  // ─────────── Brief → programación ───────────

  interpretarBrief(brief: string): Promise<{ propuesta: any; descripcion: string[] }> {
    return this.api.callIpc('musica-interpretar-brief', brief);
  }

  aplicarConfig(
    propuesta: any,
    brief: string,
    preservarManuales: boolean,
  ): Promise<{ bloques: number; vetos: number; preservados: number }> {
    return this.api.callIpc('musica-aplicar-config', { propuesta, brief, preservarManuales });
  }

  // ─────────── Enriquecimiento del repertorio ───────────

  enriquecer(limite?: number): Promise<{
    procesados: number;
    conFeatures: number;
    sinDatos: number;
    errores: string[];
  }> {
    return this.api.callIpc('musica-enriquecer', limite);
  }

  etiquetar(limite?: number): Promise<{
    procesados: number;
    etiquetados: number;
    errores: string[];
  }> {
    return this.api.callIpc('musica-etiquetar', limite);
  }

  // ─────────── Descubrimiento con IA ───────────

  descubrir(cantidad?: number, bloqueId?: number): Promise<ResultadoDescubrimiento> {
    return this.api.callIpc('musica-descubrir', { cantidad, bloqueId });
  }

  rechazar(
    spotifyId: string,
    tambienArtista?: boolean,
    bloqueId?: number,
  ): Promise<{ success: boolean; artistaVetado: boolean }> {
    return this.api.callIpc('musica-rechazar', { spotifyId, tambienArtista, bloqueId });
  }

  meGusta(spotifyId: string, bloqueId?: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-me-gusta', { spotifyId, bloqueId });
  }

  // ─────────── Programación ───────────

  listarBloques(): Promise<BloqueProgramacion[]> {
    return this.api.callIpc('musica-bloques-listar');
  }

  guardarBloque(bloque: Partial<BloqueProgramacion>): Promise<BloqueProgramacion> {
    return this.api.callIpc('musica-bloque-guardar', bloque);
  }

  eliminarBloque(id: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-bloque-eliminar', id);
  }

  listarPresets(): Promise<
    Array<{ codigo: string; nombre: string; descripcion: string; cantidadBloques: number }>
  > {
    return this.api.callIpc('musica-presets-listar');
  }

  aplicarPreset(codigo: string, reemplazar: boolean): Promise<{ bloques: number; vetos: number }> {
    return this.api.callIpc('musica-aplicar-preset', { codigo, reemplazar });
  }

  generarPlan(fecha?: string, instruccion?: string): Promise<ResultadoPlan> {
    return this.api.callIpc('musica-generar-plan', { fecha, instruccion });
  }

  getPlanDelDia(fecha?: string): Promise<any> {
    return this.api.callIpc('musica-plan-del-dia', fecha);
  }

  // ─────────── Vetos ───────────

  listarVetos(): Promise<any[]> {
    return this.api.callIpc('musica-vetos-listar');
  }

  crearVeto(tipo: string, valor: string, etiqueta?: string, bloqueId?: number | null): Promise<any> {
    return this.api.callIpc('musica-veto-crear', { tipo, valor, etiqueta, bloqueId });
  }

  eliminarVeto(id: number): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-veto-eliminar', id);
  }
}
