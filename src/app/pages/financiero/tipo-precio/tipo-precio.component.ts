import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ReactiveFormsModule } from '@angular/forms';
import { TipoPrecio } from '../../../database/entities/financiero/tipo-precio.entity';
import { RepositoryService } from '../../../database/repository.service';
import { firstValueFrom } from 'rxjs';
import { CreateEditTipoPrecioComponent } from './create-edit-tipo-precio.component';

@Component({
  selector: 'app-tipo-precio',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    CreateEditTipoPrecioComponent
  ],
  template: `
    <div class="tipos-precio-container">
      <div class="loading-overlay" *ngIf="isLoading">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <div class="header-actions">
        <h2></h2>
        <button mat-raised-button color="primary" (click)="openCreateDialog()">
          <mat-icon>add</mat-icon>
          Nuevo Tipo de Precio
        </button>
      </div>

      <div *ngIf="tipoPrecios.length === 0" class="empty-list">
        <mat-icon>attach_money</mat-icon>
        <p>No hay tipos de precio configurados</p>
        <p class="hint">Utilice el botón "Nuevo Tipo de Precio" para agregar</p>
      </div>

      <table mat-table [dataSource]="tipoPrecios" class="mat-elevation-z1" *ngIf="tipoPrecios.length > 0">
        <!-- Descripcion Column -->
        <ng-container matColumnDef="descripcion">
          <th mat-header-cell *matHeaderCellDef>Descripción</th>
          <td mat-cell *matCellDef="let item">{{ item.descripcion }}</td>
        </ng-container>

        <!-- Autorizacion Column -->
        <ng-container matColumnDef="autorizacion">
          <th mat-header-cell *matHeaderCellDef>Requiere Autorización</th>
          <td mat-cell *matCellDef="let item">
            <mat-icon *ngIf="item.autorizacion" color="primary">check_circle</mat-icon>
            <mat-icon *ngIf="!item.autorizacion" color="disabled">radio_button_unchecked</mat-icon>
          </td>
        </ng-container>

        <!-- Activo Column -->
        <ng-container matColumnDef="activo">
          <th mat-header-cell *matHeaderCellDef>Activo</th>
          <td mat-cell *matCellDef="let item">
            <span class="status-badge" [ngClass]="item.activo ? 'active' : 'inactive'">
              {{ item.activo ? 'Activo' : 'Inactivo' }}
            </span>
          </td>
        </ng-container>

        <!-- Actions Column -->
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef>Acciones</th>
          <td mat-cell *matCellDef="let item" style="display: flex; justify-content: center; align-items: center;">
            <button mat-icon-button color="primary" (click)="editTipoPrecio(item)" matTooltip="Editar">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button color="warn" (click)="deleteTipoPrecio(item)" matTooltip="Eliminar">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
      </table>
    </div>
  `,
  styles: [`
    .tipos-precio-container {
      padding: 16px;
      position: relative;
    }

    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: rgba(0, 0, 0, 0.1);
    }

    .header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .header-actions h2 {
      margin: 0;
    }

    table {
      width: 100%;
    }

    /* Center table headers and content */
    .mat-mdc-header-cell {
      text-align: center;
      justify-content: center;
    }

    .mat-mdc-cell {
      text-align: center;
      justify-content: center;
    }

    /* Keep action buttons side by side */
    .mat-column-acciones {
      white-space: nowrap;

      button {
        display: inline-flex;
        margin: 0 2px;
      }
    }

    .empty-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      border-radius: 4px;
      margin-top: 1rem;
    }

    .empty-list mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 1rem;
      color: #757575;
    }

    .empty-list p {
      margin: 0;
      color: #616161;
      text-align: center;
    }

    .empty-list .hint {
      margin-top: 0.5rem;
      font-size: 0.9em;
      color: #9e9e9e;
    }

    .status-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .active {
      background-color: rgba(46, 125, 50, 0.2);
      color: #2e7d32;
    }

    .inactive {
      background-color: rgba(198, 40, 40, 0.2);
      color: #c62828;
    }

    /* Dark theme adjustments */
    :host-context(.dark-theme) {
      .mat-mdc-header-cell, .mat-mdc-cell {
        color: rgba(255, 255, 255, 0.87);
      }

      .empty-list mat-icon {
        color: #9e9e9e;
      }

      .empty-list p {
        color: #e0e0e0;
      }

      .empty-list .hint {
        color: #9e9e9e;
      }
    }
  `]
})
export class TipoPrecioComponent implements OnInit {
  tipoPrecios: TipoPrecio[] = [];
  isLoading = false;
  displayedColumns: string[] = ['descripcion', 'autorizacion', 'activo', 'acciones'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadTipoPrecios();
  }

  async loadTipoPrecios(): Promise<void> {
    this.isLoading = true;
    try {
      this.tipoPrecios = await firstValueFrom(this.repositoryService.getTipoPrecios());
    } catch (error) {
      console.error('Error loading tipos de precio:', error);
      this.snackBar.open('Error al cargar los tipos de precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditTipoPrecioComponent, {
      width: '500px',
      data: { editMode: false }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadTipoPrecios();
      }
    });
  }

  editTipoPrecio(tipoPrecio: TipoPrecio): void {
    const dialogRef = this.dialog.open(CreateEditTipoPrecioComponent, {
      width: '500px',
      data: { tipoPrecio, editMode: true }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadTipoPrecios();
      }
    });
  }

  async deleteTipoPrecio(tipoPrecio: TipoPrecio): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar el tipo de precio "${tipoPrecio.descripcion}"?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deleteTipoPrecio(tipoPrecio.id));
      this.snackBar.open('Tipo de precio eliminado exitosamente', 'Cerrar', { duration: 3000 });
      this.loadTipoPrecios();
    } catch (error) {
      console.error('Error deleting tipo precio:', error);
      this.snackBar.open('Error al eliminar el tipo de precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}
