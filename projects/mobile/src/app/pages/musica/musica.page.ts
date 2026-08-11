import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getApiBase } from '../../core/data/api-http';

interface EstadoReproduccion {
  reproduciendo: boolean;
  track: string | null;
  artista: string | null;
  imagenUrl: string | null;
  progresoMs: number;
  duracionMs: number;
  volumen: number | null;
  dispositivoNombre: string | null;
}

interface EstadoRuntime {
  activo: boolean;
  bloqueId: number | null;
  bloqueNombre: string | null;
  variante: string;
  modoManual: boolean;
  ultimoError: string | null;
}

/**
 * Control de la musica del local desde el celular.
 *
 * Es el control PRINCIPAL del modulo, no un espejo del desktop: el PC del PdV
 * esta ocupado cobrando y con clientes adelante, y ademas el encargado escucha
 * como suena caminando por el salon, no parado en la caja.
 *
 * La PWA no reproduce audio, solo controla (el player es la app de Spotify del
 * PC), asi que funciona igual en iPhone que en Android: las restricciones de
 * audio en background de iOS no aplican.
 */
@Component({
  selector: 'app-musica-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './musica.page.html',
  styleUrls: ['./musica.page.scss'],
})
export class MusicaPage implements OnInit, OnDestroy {
  private readonly snack = inject(MatSnackBar);
  private readonly location = inject(Location);
  private readonly zone = inject(NgZone);

  cargando = false;
  estado: EstadoReproduccion | null = null;
  runtime: EstadoRuntime | null = null;

  titulo = '—';
  artista = '';
  progresoPorcentaje = 0;
  progresoTexto = '0:00 / 0:00';
  volumen = 50;
  variante = 'NORMAL';
  chipEstado = 'SIN DATOS';
  chipClase = 'chip-off';

  private timer: any = null;
  private eventSource?: EventSource;
  private reconexion: any = null;
  /** true = los cambios llegan empujados; false = se depende del poll. */
  enVivo = false;

  private get api(): any {
    return (window as any).api;
  }

  async ngOnInit(): Promise<void> {
    await this.refrescar();
    void this.conectarSse();
    // Poll de respaldo, mucho mas lento que antes (60 s en vez de 10): con SSE
    // los cambios llegan empujados, y este intervalo solo cubre el hueco si el
    // stream se cae o un proxy lo bloquea. En un celular, refrescar seguido es
    // bateria tirada.
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => this.zone.run(() => void this.refrescar(true)), 60000);
    });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.reconexion) clearTimeout(this.reconexion);
    this.eventSource?.close();
  }

  /**
   * Stream de eventos del servidor. El token es efimero (60 s, un solo uso):
   * `EventSource` no puede mandar headers y poner el JWT de sesion en la query
   * lo dejaria en logs, historial y proxies.
   */
  private async conectarSse(): Promise<void> {
    try {
      const t = await this.api.callIpc('stream-token', 'musica');
      if (!t?.token) return;

      // Misma base que el resto del tráfico: si la PWA detectó la LAN directa,
      // el stream también va por ahí en vez de dar la vuelta por el túnel.
      const base = getApiBase();
      this.eventSource = new EventSource(
        `${base}/api/musica/stream?token=${encodeURIComponent(t.token)}`,
      );

      this.eventSource.onopen = () => this.zone.run(() => { this.enVivo = true; });
      this.eventSource.onmessage = () =>
        // El stream avisa que algo cambio; el detalle se pide por RPC.
        this.zone.run(() => void this.refrescar(true));
      this.eventSource.onerror = () => {
        this.zone.run(() => { this.enVivo = false; });
        // El token ya se consumio: hay que pedir uno nuevo para reconectar.
        this.eventSource?.close();
        this.eventSource = undefined;
        this.reconexion = setTimeout(() => void this.conectarSse(), 20000);
      };
    } catch {
      this.enVivo = false;
    }
  }

  volver(): void {
    this.location.back();
  }

  async refrescar(silencioso = false): Promise<void> {
    if (!silencioso) this.cargando = true;
    try {
      const [estado, runtime] = await Promise.all([
        this.api.callIpc('musica-estado'),
        this.api.callIpc('musica-runtime-estado'),
      ]);
      this.estado = estado;
      this.runtime = runtime;
      this.aplicarEstado();
    } catch (e: any) {
      if (!silencioso) this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  private aplicarEstado(): void {
    const e = this.estado;
    if (!e) {
      this.titulo = 'NADA SONANDO';
      this.artista = '';
      this.progresoPorcentaje = 0;
      this.progresoTexto = '0:00 / 0:00';
      this.chipEstado = 'SPOTIFY SIN REPRODUCIR';
      this.chipClase = 'chip-warn';
      return;
    }

    this.titulo = e.track || '—';
    this.artista = e.artista || '';
    this.progresoPorcentaje = e.duracionMs ? (e.progresoMs / e.duracionMs) * 100 : 0;
    this.progresoTexto = `${this.fmt(e.progresoMs)} / ${this.fmt(e.duracionMs)}`;
    if (e.volumen !== null) this.volumen = e.volumen;

    if (this.runtime) {
      this.variante = this.runtime.variante || 'NORMAL';
      if (this.runtime.ultimoError) {
        this.chipEstado = 'REVISAR';
        this.chipClase = 'chip-error';
      } else if (this.runtime.modoManual) {
        this.chipEstado = 'MODO MANUAL';
        this.chipClase = 'chip-warn';
      } else if (e.reproduciendo) {
        this.chipEstado = this.runtime.bloqueNombre || 'SONANDO';
        this.chipClase = 'chip-ok';
      } else {
        this.chipEstado = 'EN PAUSA';
        this.chipClase = 'chip-warn';
      }
    }
  }

  private fmt(ms: number): string {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ─────────── Controles ───────────

  async play(): Promise<void> {
    await this.accion(() => this.api.callIpc('musica-play'));
  }

  async pausar(): Promise<void> {
    await this.accion(() => this.api.callIpc('musica-pausar'));
  }

  async siguiente(): Promise<void> {
    await this.accion(() => this.api.callIpc('musica-siguiente'));
  }

  async cambiarVolumen(): Promise<void> {
    await this.accion(() => this.api.callIpc('musica-volumen', this.volumen));
  }

  async cambiarVariante(v: string): Promise<void> {
    this.variante = v;
    await this.accion(() => this.api.callIpc('musica-variante', v), `Ahora: ${v.toLowerCase()}`);
  }

  /** "No va": saltea y saca el tema del repertorio para siempre. */
  async noVa(): Promise<void> {
    const spotifyId = await this.resolverSpotifyIdActual();
    if (!spotifyId) {
      this.snack.open('No pude identificar el tema actual', 'OK', { duration: 3000 });
      return;
    }
    try {
      await this.api.callIpc('musica-rechazar', {
        spotifyId,
        bloqueId: this.runtime?.bloqueId ?? undefined,
      });
      await this.api.callIpc('musica-siguiente');
      this.snack.open('Sacado del repertorio', 'OK', { duration: 2500 });
      setTimeout(() => void this.refrescar(true), 800);
    } catch (e: any) {
      this.error(e);
    }
  }

  async meGusta(): Promise<void> {
    const spotifyId = await this.resolverSpotifyIdActual();
    if (!spotifyId) return;
    try {
      await this.api.callIpc('musica-me-gusta', {
        spotifyId,
        bloqueId: this.runtime?.bloqueId ?? undefined,
      });
      this.snack.open('Anotado: más de esto', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.error(e);
    }
  }

  /**
   * El estado del player devuelve titulo y artista, no el id. Se resuelve
   * contra el repertorio, que es la fuente de verdad del modulo.
   */
  private async resolverSpotifyIdActual(): Promise<string | null> {
    if (!this.estado?.track) return null;
    try {
      const r = await this.api.callIpc('musica-tracks-listar', {
        texto: this.estado.track,
        pageSize: 5,
      });
      const items = r?.items || [];
      const match = items.find(
        (t: any) =>
          (t.titulo || '').toUpperCase() === (this.estado?.track || '').toUpperCase(),
      );
      return match?.spotifyId || items[0]?.spotifyId || null;
    } catch {
      return null;
    }
  }

  async regenerar(): Promise<void> {
    this.cargando = true;
    try {
      const r = await this.api.callIpc('musica-generar-plan', {});
      this.snack.open(`Plan regenerado: ${r.playlists} playlists`, 'OK', { duration: 4000 });
      await this.refrescar(true);
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  private async accion(fn: () => Promise<unknown>, mensaje?: string): Promise<void> {
    try {
      await fn();
      if (mensaje) this.snack.open(mensaje, 'OK', { duration: 2000 });
      // Spotify tarda un instante en reflejar el cambio.
      setTimeout(() => void this.refrescar(true), 700);
    } catch (e: any) {
      this.error(e);
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 7000 });
  }
}
