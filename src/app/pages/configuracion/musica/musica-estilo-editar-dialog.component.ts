import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { EstiloConDatos, MusicaService } from 'src/app/services/musica.service';

export interface EstiloEditarDialogData {
  estiloId: number;
}

/**
 * Editar un estilo del catalogo: nombre, descripcion y sus generos crudos.
 *
 * La DESCRIPCION no es decorativa: viaja al prompt del etiquetador y es lo que
 * le permite al modelo distinguir dos estilos que comparten genero. "Bossa
 * covers" y "bossa clasica" son ambos `BOSSA NOVA` en la metadata; sin una
 * frase que los diferencie, el modelo no tiene con que elegir.
 *
 * Los alias se manejan aca —y no en la lista— porque pertenecen al estilo:
 * mover `MPB` a otro estilo reclasifica de una todos sus temas, sin tocar tema
 * por tema.
 */
@Component({
  selector: 'app-musica-estilo-editar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-estilo-editar-dialog.component.html',
  styleUrls: ['./musica-estilo-editar-dialog.component.scss'],
})
export class MusicaEstiloEditarDialogComponent implements OnInit {
  cargando = false;
  guardando = false;

  nombre = '';
  descripcion = '';
  activo = true;

  estilo: EstiloConDatos | null = null;
  /** Los demas estilos, para poder mover un alias. */
  otros: EstiloConDatos[] = [];
  /** True si se toco algo que obliga a reclasificar al cerrar. */
  private aliasTocado = false;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<MusicaEstiloEditarDialogComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: EstiloEditarDialogData,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const estilos = await this.musicaService.listarEstilos();
      this.estilo = estilos.find((e) => e.id === this.data.estiloId) || null;
      this.otros = estilos.filter((e) => e.id !== this.data.estiloId);
      if (this.estilo) {
        this.nombre = this.estilo.nombre;
        this.descripcion = this.estilo.descripcion || '';
        this.activo = this.estilo.activo;
      }
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  async guardar(): Promise<void> {
    const nombre = (this.nombre || '').trim();
    if (!nombre || !this.estilo) return;
    this.guardando = true;
    try {
      await this.musicaService.guardarEstilo({
        id: this.estilo.id,
        nombre,
        // Cadena vacía y no `undefined`: es la diferencia entre "borrar la
        // descripción" y "no la toqué", y el backend necesita distinguirlas
        // para poder nulear la columna.
        descripcion: (this.descripcion || '').trim(),
        activo: this.activo,
      });
      this.dialogRef.close({ guardado: true, reclasificar: this.aliasTocado });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.guardando = false;
    }
  }

  /**
   * Saca el género de este estilo: sus temas quedan sin clasificar por género.
   *
   * Se confirma porque mueve todos los temas de ese género de una — el mismo
   * criterio que eliminar un estilo.
   */
  quitarAlias(alias: { id: number; valor: string }): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Quitar género',
        message:
          `¿Sacar "${alias.valor}" de ${this.nombre}?\n\n` +
          'Sus temas quedan sin clasificación por género. Lo que dijo el agente y las ' +
          'correcciones manuales no se tocan.',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.quitarAlias(alias.id);
        this.aliasTocado = true;
        await this.cargar();
        this.snackBar.open('GÉNERO QUITADO', 'OK', { duration: 2500 });
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  /** Mueve el género a otro estilo. El UNIQUE del alias hace que sea un cambio, no un duplicado. */
  moverAlias(valor: string, destino: EstiloConDatos): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Mover género',
        message:
          `¿Mover "${valor}" de ${this.nombre} a ${destino.nombre}?\n\n` +
          'Todos los temas de ese género se reclasifican de una.',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.asignarAlias(valor, destino.id);
        this.aliasTocado = true;
        await this.cargar();
        this.snackBar.open('GÉNERO MOVIDO', 'OK', { duration: 2500 });
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  cerrar(): void {
    this.dialogRef.close({ guardado: false, reclasificar: this.aliasTocado });
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 7000 });
  }
}
