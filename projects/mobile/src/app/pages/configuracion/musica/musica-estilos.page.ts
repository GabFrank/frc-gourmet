import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { EstiloConDatos, MusicaService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

interface EstiloVista extends EstiloConDatos {
  horasTexto: string;
  aliasTexto: string;
}

/**
 * Catálogo de estilos (mobile) — espejo de musica-estilos.component. El
 * vocabulario canónico del local: la programación, el descubrimiento y los
 * vetos hablan contra este catálogo. Muestra también los géneros crudos sin
 * mapear para que la taxonomía no se pudra.
 */
@Component({
  selector: 'app-musica-estilos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './musica-estilos.page.html',
  styleUrls: ['./musica-estilos.page.scss'],
})
export class MusicaEstilosPage implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  cargando = false;
  trabajando = false;

  estilos: EstiloVista[] = [];
  sinClasificar: Array<{ genero: string; cantidad: number }> = [];
  hayCatalogo = false;

  nuevoNombre = '';
  ultimoResultado: string[] = [];

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const [estilos, sueltos] = await Promise.all([
        this.musica.listarEstilos(),
        this.musica.generosSinClasificar(),
      ]);
      this.estilos = estilos.map((e) => ({
        ...e,
        horasTexto: `${(e.duracionMs / 3600000).toFixed(1)} h`,
        aliasTexto: e.alias.join(', ') || '—',
      }));
      this.hayCatalogo = this.estilos.length > 0;
      this.sinClasificar = sueltos;
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  async sembrar(): Promise<void> {
    this.trabajando = true;
    try {
      const r = await this.musica.sembrarEstilos();
      this.ultimoResultado = [
        `${r.estilosCreados} estilos creados, ${r.aliasCreados} géneros mapeados`,
        `${r.clasificados} temas clasificados, ${r.sinEstilo} sin estilo`,
      ];
      await this.cargar();
      this.snack.open('Catálogo sembrado', 'OK', { duration: 3500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.trabajando = false;
    }
  }

  async clasificar(conMusicBrainz: boolean): Promise<void> {
    this.trabajando = true;
    this.ultimoResultado = [];
    try {
      const r = await this.musica.clasificarTodo({ conMusicBrainz });
      const lineas = [
        `Spotify: ${r.backfill.tracksActualizados} temas con género nuevo ` +
          `(${r.backfill.artistasConGenero} artistas con dato, ${r.backfill.artistasSinGenero} sin dato)`,
      ];
      if (r.musicbrainz) {
        lineas.push(
          `MusicBrainz: ${r.musicbrainz.conGenero} de ${r.musicbrainz.consultados} ` +
            `(${r.musicbrainz.porGenerosCurados} curados, ${r.musicbrainz.porTags} por tags)`,
        );
      }
      lineas.push(
        `Clasificados: ${r.reclasificacion.clasificados} · heredados: ${r.herencia.heredados} · sin estilo: ${r.sinEstilo}`,
      );
      if (r.backfill.errores.length) lineas.push(...r.backfill.errores.slice(0, 3));
      if (r.musicbrainz?.errores.length) lineas.push(...r.musicbrainz.errores.slice(0, 3));
      this.ultimoResultado = lineas;
      await this.cargar();
      this.snack.open('Clasificación terminada', 'OK', { duration: 3500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.trabajando = false;
    }
  }

  async crearEstilo(): Promise<void> {
    const nombre = (this.nuevoNombre || '').trim();
    if (!nombre) return;
    try {
      await this.musica.guardarEstilo({ nombre, orden: this.estilos.length });
      this.nuevoNombre = '';
      await this.cargar();
    } catch (e: any) {
      this.error(e);
    }
  }

  async eliminarEstilo(e: EstiloVista): Promise<void> {
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar estilo',
          message: `¿Eliminar "${e.nombre}"? ${e.tracks} temas quedan sin estilo y se borran las cuotas que lo usen en los bloques.`,
          confirmText: 'Eliminar',
          danger: true,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    try {
      const r = await this.musica.eliminarEstilo(e.id);
      await this.cargar();
      this.snack.open(
        `Eliminado. ${r.tracksLiberados} temas liberados, ${r.mezclasBorradas} cuotas borradas`,
        'OK',
        { duration: 4500 },
      );
    } catch (err: any) {
      this.error(err);
    }
  }

  async asignar(genero: string, estiloId: number): Promise<void> {
    if (!estiloId) return;
    this.trabajando = true;
    try {
      await this.musica.asignarAlias(genero, estiloId);
      await this.musica.clasificarTodo({ conMusicBrainz: false });
      await this.cargar();
      this.snack.open('Género asignado', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.trabajando = false;
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 8000 });
  }
}
