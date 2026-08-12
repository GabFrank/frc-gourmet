import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MusicaService, MusicaTrack, PermissionService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

interface FilaTrack extends MusicaTrack {
  duracionTexto: string;
  bpmTexto: string;
  estadoTexto: string;
  estadoClase: string;
}

/**
 * Repertorio del local en la PWA — espejo de `musica-repertorio.component`.
 * Cards en vez de tabla (mobile). La acción principal es SACAR: cada "no va"
 * alimenta el descubrimiento. Gateado por permiso: votar/vetar requiere
 * MUSICA_CONTROLAR; aprobar requiere MUSICA_CONFIGURAR.
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
    MatPaginatorModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './musica-repertorio.page.html',
  styleUrls: ['./musica-repertorio.page.scss'],
})
export class MusicaRepertorioPage implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly perm = inject(PermissionService);

  cargando = false;
  filas: FilaTrack[] = [];
  total = 0;
  page = 0;
  pageSize = 25;

  filtroTexto = '';
  filtroEstado = 'APROBADO';

  canControlar = false;
  canConfigurar = false;

  async ngOnInit(): Promise<void> {
    this.perm.codigos$.subscribe(() => {
      this.canControlar = this.perm.has('MUSICA_CONTROLAR');
      this.canConfigurar = this.perm.has('MUSICA_CONFIGURAR');
    });
    await this.buscar();
  }

  /** Filtro explícito con botón: sin live filtering. */
  async buscar(): Promise<void> {
    this.cargando = true;
    try {
      const r = await this.musica.listarTracks({
        estado: this.filtroEstado || undefined,
        texto: this.filtroTexto || undefined,
        page: this.page,
        pageSize: this.pageSize,
      });
      this.total = r.total;
      this.filas = r.items.map((t) => this.aFila(t));
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  private aFila(t: MusicaTrack): FilaTrack {
    const seg = Math.floor((t.duracionMs || 0) / 1000);
    const min = Math.floor(seg / 60);
    const estadoTexto =
      t.estado === 'APROBADO' ? 'Puede sonar' : t.estado === 'VETADO' ? 'Descartado' : 'Esperando';
    return {
      ...t,
      duracionTexto: `${min}:${(seg % 60).toString().padStart(2, '0')}`,
      bpmTexto: t.bpm ? `${Math.round(t.bpm)} BPM` : '—',
      estadoTexto,
      estadoClase: t.estado === 'APROBADO' ? 'ok' : t.estado === 'VETADO' ? 'veto' : 'warn',
    };
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

  async filtrar(): Promise<void> {
    this.page = 0;
    await this.buscar();
  }

  async noVa(fila: FilaTrack): Promise<void> {
    try {
      await this.musica.rechazar(fila.spotifyId, false);
      this.snack.open(`Fuera: ${fila.titulo}`, 'OK', { duration: 2500 });
      await this.buscar();
    } catch (e: any) {
      this.error(e);
    }
  }

  async vetarArtista(fila: FilaTrack): Promise<void> {
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Vetar artista',
          message: `¿Sacar del repertorio TODOS los temas de ${fila.artista}? Tampoco se va a proponer más en las búsquedas.`,
          confirmText: 'Vetar',
          danger: true,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    try {
      await this.musica.rechazar(fila.spotifyId, true);
      this.snack.open(`Artista vetado: ${fila.artista}`, 'OK', { duration: 3000 });
      await this.buscar();
    } catch (e: any) {
      this.error(e);
    }
  }

  async meGusta(fila: FilaTrack): Promise<void> {
    try {
      await this.musica.meGusta(fila.spotifyId);
      this.snack.open('Anotado: más de esto', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.error(e);
    }
  }

  async aprobar(fila: FilaTrack): Promise<void> {
    try {
      await this.musica.cambiarEstadoTrack(fila.id, 'APROBADO');
      await this.buscar();
    } catch (e: any) {
      this.error(e);
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 8000 });
  }
}
