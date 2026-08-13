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
  enriqueciendo = false;
  interpretando = false;

  /** Propuesta de grilla devuelta por la IA, pendiente de aplicar. */
  propuesta: any = null;
  propuestaResumen = '';
  propuestaDescripcion: string[] = [];
  preservarManuales = true;
  /** Sin grilla, el descubrimiento pierde los géneros por bloque. */
  hayBloques = false;

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
      const [semillas, resumen, config, bloques] = await Promise.all([
        this.musicaService.listarSemillas(),
        this.musicaService.getResumenPool(),
        this.musicaService.getConfig(),
        this.musicaService.listarBloques(),
      ]);
      this.semillas = semillas;
      this.hayBloques = bloques.length > 0;
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

  /**
   * Genera la programación semanal a partir del brief. NO la aplica: primero se
   * muestra para revisar. La IA propone, el dueño dispone.
   */
  async generarProgramacion(): Promise<void> {
    this.interpretando = true;
    this.propuesta = null;
    try {
      const r = await this.musicaService.interpretarBrief(this.brief);
      this.propuesta = r.propuesta;
      this.propuestaResumen = r.propuesta?.resumen || '';
      this.propuestaDescripcion = r.descripcion || [];
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.interpretando = false;
    }
  }

  async aplicarProgramacion(): Promise<void> {
    if (!this.propuesta) return;
    this.interpretando = true;
    try {
      const r = await this.musicaService.aplicarConfig(
        this.propuesta,
        this.brief,
        this.preservarManuales,
      );
      let msg = `${r.bloques} bloques y ${r.vetos} vetos aplicados`;
      if (r.preservados) msg += ` · ${r.preservados} bloques tuyos respetados`;
      this.snackBar.open(msg, 'OK', { duration: 6000 });
      this.propuesta = null;
      this.propuestaDescripcion = [];
      this.hayBloques = true;
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.interpretando = false;
    }
  }

  descartarPropuesta(): void {
    this.propuesta = null;
    this.propuestaDescripcion = [];
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

  /**
   * Completa BPM/energía/valencia y el etiquetado semántico. Se corren juntos
   * porque son dos mitades de lo mismo: sin ambos, los perfiles por bloque no
   * distinguen el almuerzo de la noche.
   */
  async enriquecer(): Promise<void> {
    this.enriqueciendo = true;
    this.ultimoResultado = null;
    try {
      const features = await this.musicaService.enriquecer(300);
      const etiquetas = await this.musicaService.etiquetar(300);
      await this.refrescarResumen();
      this.ultimoResultado = {
        titulo:
          `${features.conFeatures} temas con BPM/energía · ${etiquetas.etiquetados} etiquetados` +
          (features.sinDatos ? ` · ${features.sinDatos} sin datos en ReccoBeats` : ''),
        detalle: [...features.errores, ...etiquetas.errores],
        agregados: [],
      };
      this.snackBar.open('Repertorio enriquecido', 'OK', { duration: 4000 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.enriqueciendo = false;
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR DESCONOCIDO').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 9000 });
  }
}
