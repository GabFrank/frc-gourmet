import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';
import { MusicaEstiloComponent } from './musica-estilo.component';
import { MusicaRepertorioComponent } from './musica-repertorio.component';
import { MusicaProgramacionComponent } from './musica-programacion.component';
import { MusicaEstilosComponent } from './musica-estilos.component';
import {
  DispositivoSpotify,
  EstadoReproduccion,
  MusicaConfig,
  MusicaService,
} from 'src/app/services/musica.service';

/**
 * Musica ambiental — F0: conexion con Spotify y control manual.
 *
 * Todavia no hay programacion por franja ni agente: esta pantalla existe para
 * validar de punta a punta que la app controla la musica del local.
 * Ver docs/PLAN-MUSICA-SPOTIFY.md.
 */
@Component({
  selector: 'app-musica',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatListModule,
    MatDividerModule,
    MatTabsModule,
    HasPermissionDirective,
    MusicaEstiloComponent,
    MusicaRepertorioComponent,
    MusicaProgramacionComponent,
    MusicaEstilosComponent,
  ],
  templateUrl: './musica.component.html',
  styleUrls: ['./musica.component.scss'],
})
export class MusicaComponent implements OnInit, OnDestroy {
  loading = false;
  conectando = false;
  buscandoDispositivos = false;

  // Config
  spotifyClientId = '';
  redirectPort = 8888;
  redirectUri = '';
  habilitado = false;
  conectado = false;
  deviceIdSeleccionado: string | null = null;
  deviceNombreSeleccionado: string | null = null;

  dispositivos: DispositivoSpotify[] = [];

  // Estado de reproduccion (precomputado para el template)
  estado: EstadoReproduccion | null = null;
  tituloActual = '—';
  artistaActual = '';
  progresoTexto = '0:00 / 0:00';
  progresoPorcentaje = 0;
  volumen = 50;
  estadoMensaje = 'SIN CONEXION';

  /** Se incrementa cuando el pool cambia, para que Repertorio recargue. */
  refrescarRepertorio = 0;

  private pollHandle: any = null;
  private destruido = false;
  /**
   * El arrastre del slider emite un valor por paso: sin agrupar son decenas de
   * PUT a Spotify que ademas llegan desordenados, y gana el ultimo en aterrizar
   * en vez del ultimo que pidio el usuario.
   */
  private readonly volumenPedido$ = new Subject<number>();
  /**
   * Spotify tarda ~1,5-2 s en reflejar el volumen en `/me/player`. Durante ese
   * rato hay que ignorar lo que devuelve, o el poll pisa el valor recien
   * elegido con el anterior y el slider salta solo.
   */
  private ultimoCambioVolumen = 0;
  private static readonly GRACIA_VOLUMEN_MS = 3000;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private zone: NgZone,
  ) {}

  async ngOnInit(): Promise<void> {
    this.volumenPedido$.pipe(debounceTime(300)).subscribe((v) => {
      void this.enviarVolumen(v);
    });
    await this.cargarConfig();
    if (this.conectado) {
      await this.refrescarEstado();
      this.iniciarPoll();
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.detenerPoll();
    this.volumenPedido$.complete();
    // Si se cierra la pestana con el OAuth a medias, el listener loopback
    // seguiria ocupando el puerto hasta que venza su timeout de 3 minutos.
    if (this.conectando) {
      void this.musicaService.cancelarConexion().catch(() => undefined);
    }
  }

  /**
   * Poll de estado cada 5 s. Corre fuera de NgZone para no disparar change
   * detection en cada tick; el resultado se re-entra a la zona.
   */
  private iniciarPoll(): void {
    this.detenerPoll();
    this.zone.runOutsideAngular(() => {
      this.pollHandle = setInterval(() => {
        this.zone.run(() => void this.refrescarEstado(true));
      }, 5000);
    });
  }

  private detenerPoll(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  onPoolCambio(): void {
    this.refrescarRepertorio++;
  }

  async cargarConfig(): Promise<void> {
    this.loading = true;
    try {
      const cfg: MusicaConfig = await this.musicaService.getConfig();
      this.spotifyClientId = cfg.spotifyClientId;
      this.redirectPort = cfg.redirectPort;
      this.redirectUri = cfg.redirectUri;
      this.habilitado = cfg.habilitado;
      this.conectado = cfg.conectado;
      this.deviceIdSeleccionado = cfg.deviceId;
      this.deviceNombreSeleccionado = cfg.deviceNombre;
      this.estadoMensaje = cfg.conectado ? 'CONECTADO' : 'SIN CONEXION';
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.loading = false;
    }
  }

  async guardarConfig(): Promise<void> {
    this.loading = true;
    try {
      await this.musicaService.setConfig({
        spotifyClientId: this.spotifyClientId,
        redirectPort: this.redirectPort,
        habilitado: this.habilitado,
      });
      await this.cargarConfig();
      this.snackBar.open('CONFIGURACION GUARDADA', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.loading = false;
    }
  }

  async conectar(): Promise<void> {
    this.conectando = true;
    this.estadoMensaje = 'ESPERANDO AUTORIZACION EN EL NAVEGADOR…';
    try {
      const res = await this.musicaService.conectar();
      if (this.destruido) return;
      this.snackBar.open(`SPOTIFY CONECTADO: ${res.nombreUsuario}`, 'OK', { duration: 4000 });
      await this.cargarConfig();
      await this.buscarDispositivos();
      this.iniciarPoll();
    } catch (e: any) {
      // Si la pestana ya se cerro, el rechazo es el que provocamos nosotros al
      // cancelar: no hay a quien mostrarle el error.
      if (this.destruido) return;
      this.mostrarError(e);
      this.estadoMensaje = 'SIN CONEXION';
    } finally {
      this.conectando = false;
    }
  }

  async desconectar(): Promise<void> {
    try {
      await this.musicaService.desconectar();
      this.detenerPoll();
      this.dispositivos = [];
      this.estado = null;
      this.tituloActual = '—';
      this.artistaActual = '';
      await this.cargarConfig();
      this.snackBar.open('SPOTIFY DESCONECTADO', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async abrirSpotify(): Promise<void> {
    try {
      await this.musicaService.abrirSpotify();
      this.snackBar.open('ABRIENDO SPOTIFY EN ESTA PC…', 'OK', { duration: 3000 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async buscarDispositivos(): Promise<void> {
    this.buscandoDispositivos = true;
    try {
      this.dispositivos = await this.musicaService.listarDispositivos();
      if (this.dispositivos.length === 0) {
        this.snackBar.open(
          'NO SE ENCONTRARON DISPOSITIVOS. ABRI LA APP DE SPOTIFY EN ESTA PC.',
          'OK',
          { duration: 5000 },
        );
      }
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.buscandoDispositivos = false;
    }
  }

  async seleccionarDispositivo(d: DispositivoSpotify): Promise<void> {
    try {
      await this.musicaService.seleccionarDispositivo(d.id, d.nombre);
      this.deviceIdSeleccionado = d.id;
      this.deviceNombreSeleccionado = d.nombre;
      this.snackBar.open(`SALIDA DE AUDIO: ${d.nombre}`, 'OK', { duration: 3000 });
      await this.refrescarEstado();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async refrescarEstado(silencioso = false): Promise<void> {
    try {
      const estado = await this.musicaService.getEstado();
      this.estado = estado;
      if (!estado) {
        this.tituloActual = 'NADA SONANDO';
        this.artistaActual = '';
        this.progresoTexto = '0:00 / 0:00';
        this.progresoPorcentaje = 0;
        this.estadoMensaje = 'CONECTADO — SIN REPRODUCTOR ACTIVO';
        return;
      }
      this.tituloActual = estado.track || '—';
      this.artistaActual = estado.artista || '';
      this.progresoTexto = `${this.formatearMs(estado.progresoMs)} / ${this.formatearMs(estado.duracionMs)}`;
      this.progresoPorcentaje =
        estado.duracionMs > 0 ? (estado.progresoMs / estado.duracionMs) * 100 : 0;
      const recienTocado =
        Date.now() - this.ultimoCambioVolumen < MusicaComponent.GRACIA_VOLUMEN_MS;
      if (estado.volumen !== null && !recienTocado) this.volumen = estado.volumen;
      this.estadoMensaje = estado.reproduciendo
        ? `SONANDO EN ${estado.dispositivoNombre || 'DISPOSITIVO'}`
        : 'EN PAUSA';
    } catch (e: any) {
      if (!silencioso) this.mostrarError(e);
    }
  }

  async play(): Promise<void> {
    await this.ejecutarControl(() => this.musicaService.play());
  }

  async pausar(): Promise<void> {
    await this.ejecutarControl(() => this.musicaService.pausar());
  }

  async siguiente(): Promise<void> {
    await this.ejecutarControl(() => this.musicaService.siguiente());
  }

  async anterior(): Promise<void> {
    await this.ejecutarControl(() => this.musicaService.anterior());
  }

  /** Cada paso del arrastre. Agrupa y no refresca: eso lo hace `enviarVolumen`. */
  cambiarVolumen(): void {
    this.ultimoCambioVolumen = Date.now();
    this.volumenPedido$.next(this.volumen);
  }

  private async enviarVolumen(v: number): Promise<void> {
    try {
      await this.musicaService.setVolumen(v);
      this.ultimoCambioVolumen = Date.now();
    } catch (e: any) {
      if (!this.destruido) this.mostrarError(e);
    }
  }

  private async ejecutarControl(accion: () => Promise<unknown>): Promise<void> {
    try {
      await accion();
      // Spotify tarda un instante en reflejar el cambio de estado.
      setTimeout(() => void this.refrescarEstado(true), 700);
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  private formatearMs(ms: number): string {
    const totalSeg = Math.floor((ms || 0) / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return `${min}:${seg.toString().padStart(2, '0')}`;
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR DESCONOCIDO').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 8000 });
  }
}
