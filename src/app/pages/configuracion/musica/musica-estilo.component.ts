import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MusicaSemilla, MusicaService, ResumenPool } from 'src/app/services/musica.service';

/**
 * "Mi estilo": de donde sale la musica del local.
 *
 * Dos entradas, en orden de importancia:
 *  1. Semillas — playlists/artistas de referencia que carga el dueno. El
 *     sistema no le pide parametros (BPM, energia): le pide EJEMPLOS.
 *  2. Descubrimiento con IA — el motivo por el que existe el modulo. El dueno
 *     no tiene tiempo de armar playlists, asi que el repertorio crece solo.
 */
@Component({
  selector: 'app-musica-estilo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './musica-estilo.component.html',
  styleUrls: ['./musica-estilo.component.scss'],
})
export class MusicaEstiloComponent implements OnInit {
  /** Avisa al contenedor que el repertorio cambio (para refrescar otras tabs). */
  @Output() poolCambio = new EventEmitter<void>();

  cargando = false;
  importando = false;
  descubriendo = false;

  semillas: MusicaSemilla[] = [];
  nuevaUrl = '';

  resumen: ResumenPool | null = null;
  porcentajeAprobados = 0;

  brief = '';
  autoAprobar = true;
  cantidadDescubrir = 40;

  // Resultado de la ultima ronda de descubrimiento.
  ultimoResultado: { titulo: string; detalle: string[]; agregados: string[] } | null = null;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const [semillas, resumen, config] = await Promise.all([
        this.musicaService.listarSemillas(),
        this.musicaService.getResumenPool(),
        this.musicaService.getConfig(),
      ]);
      this.semillas = semillas;
      this.aplicarResumen(resumen);
      this.brief = config.brief || '';
      this.autoAprobar = config.autoAprobarDescubrimientos !== false;
      this.cantidadDescubrir = config.avanzado?.candidatosPorRonda || 40;
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  private aplicarResumen(resumen: ResumenPool): void {
    this.resumen = resumen;
    this.porcentajeAprobados = resumen.total ? (resumen.aprobados / resumen.total) * 100 : 0;
  }

  private async refrescarResumen(): Promise<void> {
    this.aplicarResumen(await this.musicaService.getResumenPool());
    this.poolCambio.emit();
  }

  // ─────────── Semillas ───────────

  async agregarSemilla(): Promise<void> {
    const url = (this.nuevaUrl || '').trim();
    if (!url) return;
    this.cargando = true;
    try {
      const semilla = await this.musicaService.crearSemilla(url);
      this.nuevaUrl = '';
      this.semillas = await this.musicaService.listarSemillas();
      this.snackBar.open(`AGREGADA: ${semilla.nombre}`, 'OK', { duration: 3000 });
      // Importar en el acto: cargar una semilla y no traer su musica seria
      // dejar el trabajo a medias.
      await this.importarSemilla(semilla.id, true);
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  async agregarBiblioteca(): Promise<void> {
    try {
      const semilla = await this.musicaService.crearSemillaBiblioteca();
      this.semillas = await this.musicaService.listarSemillas();
      await this.importarSemilla(semilla.id, true);
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async importarSemilla(id: number, silencioso = false): Promise<void> {
    this.importando = true;
    try {
      const r = await this.musicaService.importarSemilla(id);
      this.semillas = await this.musicaService.listarSemillas();
      await this.refrescarResumen();
      if (!silencioso || r.nuevos > 0) {
        this.snackBar.open(`${r.nuevos} temas nuevos importados`, 'OK', { duration: 4000 });
      }
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.importando = false;
    }
  }

  async importarTodas(): Promise<void> {
    this.importando = true;
    try {
      const r = await this.musicaService.importarTodas();
      this.semillas = await this.musicaService.listarSemillas();
      await this.refrescarResumen();
      let msg = `${r.nuevos} temas nuevos de ${r.semillas} fuentes`;
      if (r.errores.length) msg += ` — ${r.errores.length} con error`;
      this.snackBar.open(msg, 'OK', { duration: 6000 });
      if (r.errores.length) {
        this.ultimoResultado = {
          titulo: 'Fuentes que fallaron',
          detalle: r.errores.map((e) => `${e.semilla}: ${e.error}`),
          agregados: [],
        };
      }
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.importando = false;
    }
  }

  eliminarSemilla(semilla: MusicaSemilla): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Quitar fuente',
        message: `¿Quitar "${semilla.nombre}"?\nLos temas que ya aportó quedan en el repertorio.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.eliminarSemilla(semilla.id);
        this.semillas = await this.musicaService.listarSemillas();
        this.snackBar.open('FUENTE QUITADA', 'OK', { duration: 2500 });
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  // ─────────── Brief y descubrimiento ───────────

  async guardarBrief(): Promise<void> {
    try {
      await this.musicaService.setConfig({
        brief: this.brief,
        autoAprobarDescubrimientos: this.autoAprobar,
      });
      this.snackBar.open('GUARDADO', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async descubrir(): Promise<void> {
    this.descubriendo = true;
    this.ultimoResultado = null;
    try {
      const r = await this.musicaService.descubrir(this.cantidadDescubrir);
      await this.refrescarResumen();
      this.ultimoResultado = {
        titulo:
          `${r.agregados} temas nuevos de ${r.propuestos} propuestos ` +
          `(${r.yaEstaban} ya estaban · ${r.noEncontrados} no encontrados · ${r.filtrados} filtrados)`,
        detalle: r.detalleFiltrados,
        agregados: r.agregadosDetalle.map(
          (a) => `${a.artista} — ${a.tema}${a.motivo ? ` · ${a.motivo}` : ''}`,
        ),
      };
      this.snackBar.open(`${r.agregados} temas nuevos en el repertorio`, 'OK', { duration: 5000 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.descubriendo = false;
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR DESCONOCIDO').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 9000 });
  }
}
