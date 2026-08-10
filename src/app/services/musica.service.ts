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
export interface MusicaConfig {
  spotifyClientId: string;
  redirectPort: number;
  redirectUri: string;
  deviceId: string | null;
  deviceNombre: string | null;
  habilitado: boolean;
  conectado: boolean;
}

export interface DispositivoSpotify {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  volumen: number | null;
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
  }): Promise<{ success: boolean }> {
    return this.api.callIpc('musica-set-config', data);
  }

  conectar(): Promise<{ success: boolean; nombreUsuario: string }> {
    return this.api.callIpc('musica-conectar');
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
}
