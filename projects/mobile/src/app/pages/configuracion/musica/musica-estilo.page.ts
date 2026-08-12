import { Component, OnInit, inject } from '@angular/core';
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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MusicaService, MusicaSemilla, ResumenPool } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

/**
 * "Mi estilo" en la PWA — espejo de `musica-estilo.component` del desktop.
 * De dónde sale la música del local: semillas (playlists/artistas de
 * referencia) + descubrimiento con IA + brief → programación.
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
    MatDialogModule,
  ],
  templateUrl: './musica-estilo.page.html',
  styleUrls: ['./musica-estilo.page.scss'],
})
export class MusicaEstiloPage implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  cargando = false;
  importando = false;
  descubriendo = false;
  enriqueciendo = false;
  interpretando = false;

  propuesta: any = null;
  propuestaResumen = '';
  propuestaDescripcion: string[] = [];
  preservarManuales = true;
  hayBloques = false;

  semillas: MusicaSemilla[] = [];
  nuevaUrl = '';

  resumen: ResumenPool | null = null;
  porcentajeAprobados = 0;

  brief = '';
  autoAprobar = true;
  cantidadDescubrir = 40;

  ultimoResultado: { titulo: string; detalle: string[]; agregados: string[] } | null = null;

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const [semillas, resumen, config, bloques] = await Promise.all([
        this.musica.listarSemillas(),
        this.musica.getResumenPool(),
        this.musica.getConfig(),
        this.musica.listarBloques(),
      ]);
      this.semillas = semillas;
      this.hayBloques = bloques.length > 0;
      this.aplicarResumen(resumen);
      this.brief = config.brief || '';
      this.autoAprobar = config.autoAprobarDescubrimientos !== false;
      this.cantidadDescubrir = config.avanzado?.candidatosPorRonda || 40;
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  private aplicarResumen(resumen: ResumenPool): void {
    this.resumen = resumen;
    this.porcentajeAprobados = resumen.total ? (resumen.aprobados / resumen.total) * 100 : 0;
  }

  private async refrescarResumen(): Promise<void> {
    this.aplicarResumen(await this.musica.getResumenPool());
  }

  // ─────────── Semillas ───────────

  async agregarSemilla(): Promise<void> {
    const url = (this.nuevaUrl || '').trim();
    if (!url) return;
    this.cargando = true;
    try {
      const semilla = await this.musica.crearSemilla(url);
      this.nuevaUrl = '';
      this.semillas = await this.musica.listarSemillas();
      this.snack.open(`Agregada: ${semilla.nombre}`, 'OK', { duration: 3000 });
      await this.importarSemilla(semilla.id, true);
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  async agregarBiblioteca(): Promise<void> {
    try {
      const semilla = await this.musica.crearSemillaBiblioteca();
      this.semillas = await this.musica.listarSemillas();
      await this.importarSemilla(semilla.id, true);
    } catch (e: any) {
      this.error(e);
    }
  }

  async importarSemilla(id: number, silencioso = false): Promise<void> {
    this.importando = true;
    try {
      const r = await this.musica.importarSemilla(id);
      this.semillas = await this.musica.listarSemillas();
      await this.refrescarResumen();
      if (!silencioso || r.nuevos > 0) {
        this.snack.open(`${r.nuevos} temas nuevos importados`, 'OK', { duration: 4000 });
      }
    } catch (e: any) {
      this.error(e);
    } finally {
      this.importando = false;
    }
  }

  async importarTodas(): Promise<void> {
    this.importando = true;
    try {
      const r = await this.musica.importarTodas();
      this.semillas = await this.musica.listarSemillas();
      await this.refrescarResumen();
      let msg = `${r.nuevos} temas nuevos de ${r.semillas} fuentes`;
      if (r.errores.length) msg += ` — ${r.errores.length} con error`;
      this.snack.open(msg, 'OK', { duration: 6000 });
      if (r.errores.length) {
        this.ultimoResultado = {
          titulo: 'Fuentes que fallaron',
          detalle: r.errores.map((e) => `${e.semilla}: ${e.error}`),
          agregados: [],
        };
      }
    } catch (e: any) {
      this.error(e);
    } finally {
      this.importando = false;
    }
  }

  async eliminarSemilla(semilla: MusicaSemilla): Promise<void> {
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Quitar fuente',
          message: `¿Quitar "${semilla.nombre}"? Los temas que ya aportó quedan en el repertorio.`,
          confirmText: 'Quitar',
          danger: true,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    try {
      await this.musica.eliminarSemilla(semilla.id);
      this.semillas = await this.musica.listarSemillas();
      this.snack.open('Fuente quitada', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.error(e);
    }
  }

  // ─────────── Brief y descubrimiento ───────────

  async guardarBrief(): Promise<void> {
    try {
      await this.musica.setConfig({
        brief: this.brief,
        autoAprobarDescubrimientos: this.autoAprobar,
      });
      this.snack.open('Guardado', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.error(e);
    }
  }

  async generarProgramacion(): Promise<void> {
    this.interpretando = true;
    this.propuesta = null;
    try {
      const r = await this.musica.interpretarBrief(this.brief);
      this.propuesta = r.propuesta;
      this.propuestaResumen = r.propuesta?.resumen || '';
      this.propuestaDescripcion = r.descripcion || [];
    } catch (e: any) {
      this.error(e);
    } finally {
      this.interpretando = false;
    }
  }

  async aplicarProgramacion(): Promise<void> {
    if (!this.propuesta) return;
    this.interpretando = true;
    try {
      const r = await this.musica.aplicarConfig(this.propuesta, this.brief, this.preservarManuales);
      let msg = `${r.bloques} bloques y ${r.vetos} vetos aplicados`;
      if (r.preservados) msg += ` · ${r.preservados} bloques tuyos respetados`;
      this.snack.open(msg, 'OK', { duration: 6000 });
      this.propuesta = null;
      this.propuestaDescripcion = [];
      this.hayBloques = true;
    } catch (e: any) {
      this.error(e);
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
      const r = await this.musica.descubrir(this.cantidadDescubrir);
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
      this.snack.open(`${r.agregados} temas nuevos en el repertorio`, 'OK', { duration: 5000 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.descubriendo = false;
    }
  }

  async enriquecer(): Promise<void> {
    this.enriqueciendo = true;
    this.ultimoResultado = null;
    try {
      const features = await this.musica.enriquecer(300);
      const etiquetas = await this.musica.etiquetar(300);
      await this.refrescarResumen();
      this.ultimoResultado = {
        titulo:
          `${features.conFeatures} temas con BPM/energía · ${etiquetas.etiquetados} etiquetados` +
          (features.sinDatos ? ` · ${features.sinDatos} sin datos en ReccoBeats` : ''),
        detalle: [...features.errores, ...etiquetas.errores],
        agregados: [],
      };
      this.snack.open('Repertorio enriquecido', 'OK', { duration: 4000 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.enriqueciendo = false;
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 9000 });
  }
}
