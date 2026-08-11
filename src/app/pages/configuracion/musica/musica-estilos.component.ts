import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { EstiloConDatos, MusicaService } from 'src/app/services/musica.service';

interface EstiloVista extends EstiloConDatos {
  horasTexto: string;
  aliasTexto: string;
}

/**
 * Catalogo de estilos: el vocabulario del local.
 *
 * Existe porque el modulo tenia cuatro vocabularios que no se hablaban entre si
 * — los generos de artista de Spotify, los nombres que inventaba el LLM en la
 * grilla, los strings de los vetos y los del descubrimiento. Configurar
 * "almuerzo: bossa" no tenia ningun efecto porque ese nombre no existia en
 * ningun tema.
 *
 * Esta pantalla es tambien la que evita que la taxonomia se pudra: muestra los
 * generos crudos que quedaron sin mapear, que es lo que en seis meses volveria a
 * dejar 59 valores sueltos si nadie los mira.
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
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-estilos.component.html',
  styleUrls: ['./musica-estilos.component.scss'],
})
export class MusicaEstilosComponent implements OnInit {
  cargando = false;
  trabajando = false;

  estilos: EstiloVista[] = [];
  sinClasificar: Array<{ genero: string; cantidad: number }> = [];
  hayCatalogo = false;

  /** Alta rápida de estilo. */
  nuevoNombre = '';

  /** Resultado de la última clasificación, para mostrarlo sin adivinar. */
  ultimoResultado: string[] = [];

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
      const [estilos, sueltos] = await Promise.all([
        this.musicaService.listarEstilos(),
        this.musicaService.generosSinClasificar(),
      ]);
      this.estilos = estilos.map((e) => ({
        ...e,
        horasTexto: `${(e.duracionMs / 3600000).toFixed(1)} h`,
        aliasTexto: e.alias.join(', ') || '—',
      }));
      this.hayCatalogo = this.estilos.length > 0;
      this.sinClasificar = sueltos;
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  /** Crea el catálogo inicial agrupando los géneros que ya están en el pool. */
  async sembrar(): Promise<void> {
    this.trabajando = true;
    try {
      const r = await this.musicaService.sembrarEstilos();
      this.ultimoResultado = [
        `${r.estilosCreados} estilos creados, ${r.aliasCreados} géneros mapeados`,
        `${r.clasificados} temas clasificados, ${r.sinEstilo} sin estilo`,
      ];
      await this.cargar();
      this.snackBar.open('CATÁLOGO SEMBRADO', 'OK', { duration: 3500 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * Cascada completa. MusicBrainz va a 1 request por segundo por su límite de
   * cortesía, así que se avisa antes: con cientos de temas son varios minutos.
   */
  async clasificar(conMusicBrainz: boolean): Promise<void> {
    this.trabajando = true;
    this.ultimoResultado = [];
    try {
      const r = await this.musicaService.clasificarTodo({ conMusicBrainz });
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
      this.snackBar.open('CLASIFICACIÓN TERMINADA', 'OK', { duration: 3500 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.trabajando = false;
    }
  }

  async crearEstilo(): Promise<void> {
    const nombre = (this.nuevoNombre || '').trim();
    if (!nombre) return;
    try {
      await this.musicaService.guardarEstilo({ nombre, orden: this.estilos.length });
      this.nuevoNombre = '';
      await this.cargar();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  /**
   * Borrar avisa qué se lleva puesto: los temas quedan sin estilo y las cuotas
   * que lo usaban desaparecen de los bloques.
   */
  eliminarEstilo(e: EstiloVista): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar estilo',
        message:
          `¿Eliminar "${e.nombre}"?\n\n` +
          `${e.tracks} temas quedan sin estilo y se borran las cuotas que lo usen en los bloques.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        const r = await this.musicaService.eliminarEstilo(e.id);
        await this.cargar();
        this.snackBar.open(
          `ELIMINADO. ${r.tracksLiberados} TEMAS LIBERADOS, ${r.mezclasBorradas} CUOTAS BORRADAS`,
          'OK',
          { duration: 4500 },
        );
      } catch (err: any) {
        this.mostrarError(err);
      }
    });
  }

  /** Mapea un género crudo suelto a un estilo del catálogo. */
  async asignar(genero: string, estiloId: number): Promise<void> {
    if (!estiloId) return;
    this.trabajando = true;
    try {
      await this.musicaService.asignarAlias(genero, estiloId);
      // Asignar sin reclasificar no cambia nada: los temas siguen sin estilo.
      await this.musicaService.clasificarTodo({ conMusicBrainz: false });
      await this.cargar();
      this.snackBar.open('GÉNERO ASIGNADO', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.trabajando = false;
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 8000 });
  }
}
