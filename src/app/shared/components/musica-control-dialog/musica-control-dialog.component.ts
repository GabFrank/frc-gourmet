import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import {
  EstadoReproduccion,
  EstadoRuntime,
  MusicaService,
} from 'src/app/services/musica.service';

/**
 * Control rapido de la musica desde el header del PdV.
 *
 * Es el gemelo del control de la PWA: mismos comandos, misma logica de volumen.
 * Existe porque quien esta en la caja es el primero que escucha "cambia esa
 * musica", y hasta ahora tenia que abrir Configuracion → Musica, que es una
 * pestana entera.
 *
 * Duplica logica con `projects/mobile/.../musica.page.ts` a proposito: son dos
 * proyectos Angular separados que no comparten codigo, y extraer una libreria
 * comun por una pantalla es peor negocio que sostener las dos.
 */
@Component({
  selector: 'app-musica-control-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-control-dialog.component.html',
  styleUrls: ['./musica-control-dialog.component.scss'],
})
export class MusicaControlDialogComponent implements OnInit, OnDestroy {
  private readonly musicaService = inject(MusicaService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly zone = inject(NgZone);
  private readonly dialogRef = inject(MatDialogRef<MusicaControlDialogComponent>);
  private readonly dialog = inject(MatDialog);

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

  private pollHandle: any = null;
  private desuscribir: (() => void) | null = null;
  private destruido = false;
  /** Ver `musica.page.ts` de la PWA: el arrastre emite un valor por paso. */
  private readonly volumenPedido$ = new Subject<number>();
  /** Spotify tarda ~1,5-2 s en reflejar el volumen; hasta entonces no se pisa. */
  private ultimoCambioVolumen = 0;
  private static readonly GRACIA_VOLUMEN_MS = 3000;

  async ngOnInit(): Promise<void> {
    this.volumenPedido$.pipe(debounceTime(300)).subscribe((v) => {
      void this.enviarVolumen(v);
    });
    // El diálogo está abierto y a la vista: acá sí conviene un poll corto, a
    // diferencia del header, que se entera por eventos.
    this.desuscribir = this.musicaService.onEvento(() =>
      this.zone.run(() => void this.refrescar(true)),
    );
    await this.refrescar();
    this.zone.runOutsideAngular(() => {
      this.pollHandle = setInterval(() => this.zone.run(() => void this.refrescar(true)), 5000);
    });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.volumenPedido$.complete();
    this.desuscribir?.();
  }

  async refrescar(silencioso = false): Promise<void> {
    if (!silencioso) this.cargando = true;
    try {
      const [estado, runtime] = await Promise.all([
        this.musicaService.getEstado(),
        this.musicaService.getRuntimeEstado(),
      ]);
      if (this.destruido) return;
      this.estado = estado;
      this.runtime = runtime;
      this.aplicarEstado();
    } catch (e: any) {
      if (!silencioso) this.mostrarError(e);
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
    this.progresoTexto = `${this.formatearMs(e.progresoMs)} / ${this.formatearMs(e.duracionMs)}`;
    const recienTocado =
      Date.now() - this.ultimoCambioVolumen < MusicaControlDialogComponent.GRACIA_VOLUMEN_MS;
    if (e.volumen !== null && !recienTocado) this.volumen = e.volumen;

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

  private formatearMs(ms: number): string {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ─────────── Controles ───────────

  async play(): Promise<void> {
    await this.accion(() => this.musicaService.play());
  }

  async pausar(): Promise<void> {
    await this.accion(() => this.musicaService.pausar());
  }

  async siguiente(): Promise<void> {
    await this.accion(() => this.musicaService.siguiente());
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

  async cambiarVariante(v: string): Promise<void> {
    this.variante = v;
    await this.accion(() => this.musicaService.setVariante(v), `AHORA: ${v}`);
  }

  /** "No va": saltea y saca el tema del repertorio para siempre. */
  async noVa(): Promise<void> {
    const spotifyId = await this.resolverSpotifyIdActual();
    if (!spotifyId) {
      this.snackBar.open('NO SE PUDO IDENTIFICAR EL TEMA ACTUAL', 'OK', { duration: 3000 });
      return;
    }
    try {
      const r: any = await this.musicaService.rechazar(
        spotifyId,
        false,
        this.runtime?.bloqueId ?? undefined,
      );
      await this.musicaService.siguiente();
      this.snackBar.open('SACADO DEL REPERTORIO', 'OK', { duration: 2500 });
      setTimeout(() => void this.refrescar(true), 800);
      // Al tercer rechazo del mismo artista se PREGUNTA, no se veta solo: sacar
      // un artista entero por tres clicks de alguien apurado es dificil de
      // deshacer si nadie mira.
      if (r?.sugerirVetarArtista) this.preguntarVetoArtista(spotifyId, r);
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  /**
   * `spotifyIdRechazado` viene por parametro y NO se vuelve a resolver: para
   * cuando el usuario contesta, la musica ya salto al tema siguiente y
   * re-resolver vetaria al artista equivocado.
   */
  private preguntarVetoArtista(
    spotifyIdRechazado: string,
    r: {
      artistaId?: string;
      artistaNombre?: string;
      rechazosDelArtista: number;
    },
  ): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: '¿Sacamos a este artista?',
        message:
          `Sacaste ${r.rechazosDelArtista} temas de ${r.artistaNombre} en el último mes.\n\n` +
          `¿Querés que no suene más? Se van todos sus temas del repertorio.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.rechazar(
          spotifyIdRechazado,
          true,
          this.runtime?.bloqueId ?? undefined,
        );
        this.snackBar.open(`${r.artistaNombre} NO VUELVE A SONAR`, 'OK', { duration: 4000 });
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  async meGusta(): Promise<void> {
    const spotifyId = await this.resolverSpotifyIdActual();
    if (!spotifyId) return;
    try {
      await this.musicaService.meGusta(spotifyId, this.runtime?.bloqueId ?? undefined);
      this.snackBar.open('ANOTADO: MAS DE ESTO', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  /**
   * El estado del player devuelve titulo y artista, no el id. Se resuelve
   * contra el repertorio, que es la fuente de verdad del modulo.
   */
  private async resolverSpotifyIdActual(): Promise<string | null> {
    if (!this.estado?.track) return null;
    try {
      const r: any = await this.musicaService.listarTracks({
        texto: this.estado.track,
        pageSize: 5,
      });
      const items = r?.items || [];
      const match = items.find(
        (t: any) => (t.titulo || '').toUpperCase() === (this.estado?.track || '').toUpperCase(),
      );
      return match?.spotifyId || items[0]?.spotifyId || null;
    } catch {
      return null;
    }
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  private async accion(fn: () => Promise<unknown>, mensaje?: string): Promise<void> {
    try {
      await fn();
      if (mensaje) this.snackBar.open(mensaje, 'OK', { duration: 2000 });
      // Spotify tarda un instante en reflejar el cambio.
      setTimeout(() => void this.refrescar(true), 700);
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 7000 });
  }
}
