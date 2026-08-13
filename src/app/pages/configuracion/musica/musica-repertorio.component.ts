import { Component, Input, OnInit, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { EstiloConDatos, MusicaService, MusicaTrack } from 'src/app/services/musica.service';

interface FilaTrack extends MusicaTrack {
  duracionTexto: string;
  bpmTexto: string;
  estadoClase: string;
  estiloTexto: string;
  /** Corregido a mano: se marca para distinguirlo de lo que decidió el sistema. */
  estiloManualMarcado: boolean;
}

/**
 * Repertorio del local: lo que puede sonar.
 *
 * La accion principal es SACAR, no agregar: el dueno corrige por sustraccion.
 * Cada "no va" ademas alimenta el prompt de descubrimiento, asi que la lista
 * mejora sola con el uso.
 */
@Component({
  selector: 'app-musica-repertorio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatPaginatorModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-repertorio.component.html',
  styleUrls: ['./musica-repertorio.component.scss'],
})
export class MusicaRepertorioComponent implements OnInit, OnChanges {
  /** Cambia cuando el pool se modifica desde otra pestaña. */
  @Input() refrescar = 0;

  cargando = false;
  filas: FilaTrack[] = [];
  total = 0;
  page = 0;
  pageSize = 25;

  filtroTexto = '';
  filtroEstado = 'APROBADO';

  columnas = ['tema', 'genero', 'estilo', 'datos', 'estado', 'acciones'];

  /** Para el submenú "Cambiar estilo". */
  estilos: EstiloConDatos[] = [];

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    // Sin catálogo la acción de corregir estilo no tiene destinos: no es un
    // error, simplemente el menú queda sin esa opción.
    this.musicaService
      .listarEstilos()
      .then((e) => (this.estilos = e))
      .catch(() => (this.estilos = []));
    await this.buscar();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['refrescar'] && !changes['refrescar'].firstChange) {
      await this.buscar();
    }
  }

  /** Filtro explícito con botón: sin live filtering. */
  async buscar(): Promise<void> {
    this.cargando = true;
    try {
      const r = await this.musicaService.listarTracks({
        estado: this.filtroEstado || undefined,
        texto: this.filtroTexto || undefined,
        page: this.page,
        pageSize: this.pageSize,
      });
      this.total = r.total;
      this.filas = r.items.map((t) => this.aFila(t));
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  private aFila(t: MusicaTrack): FilaTrack {
    const seg = Math.floor((t.duracionMs || 0) / 1000);
    const min = Math.floor(seg / 60);
    return {
      ...t,
      duracionTexto: `${min}:${(seg % 60).toString().padStart(2, '0')}`,
      bpmTexto: t.bpm ? `${Math.round(t.bpm)} BPM` : '—',
      estadoClase:
        t.estado === 'APROBADO' ? 'estado-ok' : t.estado === 'VETADO' ? 'estado-veto' : 'estado-pend',
      estiloTexto: t.estilo?.nombre || 'sin estilo',
      estiloManualMarcado: !!t.estiloManual,
    };
  }

  /**
   * Corrección manual del estilo. Gana sobre el agente y sobre el género, así
   * que ninguna reclasificación posterior la pisa.
   */
  async cambiarEstilo(fila: FilaTrack, estiloId: number | null): Promise<void> {
    try {
      await this.musicaService.fijarEstiloTrack(fila.id, estiloId);
      this.snackBar.open(
        estiloId ? 'ESTILO CORREGIDO' : 'CORRECCIÓN QUITADA: VUELVE A LA AUTOMÁTICA',
        'OK',
        { duration: 3000 },
      );
      await this.buscar();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async cambiarPagina(e: PageEvent): Promise<void> {
    this.page = e.pageIndex;
    this.pageSize = e.pageSize;
    await this.buscar();
  }

  async limpiarFiltros(): Promise<void> {
    this.filtroTexto = '';
    this.filtroEstado = 'APROBADO';
    this.page = 0;
    await this.buscar();
  }

  /** "No va": saca el tema y lo convierte en ejemplo negativo para la IA. */
  async noVa(fila: FilaTrack): Promise<void> {
    try {
      await this.musicaService.rechazar(fila.spotifyId, false);
      this.snackBar.open(`FUERA: ${fila.titulo}`, 'OK', { duration: 2500 });
      await this.buscar();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  /** Corta de raíz cuando el problema es el artista entero. */
  vetarArtista(fila: FilaTrack): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Vetar artista',
        message:
          `¿Sacar del repertorio TODOS los temas de ${fila.artista}?\n` +
          'Tampoco se va a proponer más en las búsquedas.',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.rechazar(fila.spotifyId, true);
        this.snackBar.open(`ARTISTA VETADO: ${fila.artista}`, 'OK', { duration: 3000 });
        await this.buscar();
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  async meGusta(fila: FilaTrack): Promise<void> {
    try {
      await this.musicaService.meGusta(fila.spotifyId);
      this.snackBar.open('ANOTADO: MÁS DE ESTO', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  async aprobar(fila: FilaTrack): Promise<void> {
    try {
      await this.musicaService.cambiarEstadoTrack(fila.id, 'APROBADO');
      await this.buscar();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR DESCONOCIDO').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 8000 });
  }
}
