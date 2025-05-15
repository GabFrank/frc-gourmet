import {
  Component,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { Observacion } from '../../../../database/entities/productos/observacion.entity';
import { firstValueFrom, Subject } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-create-edit-observacion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTableModule,
    MatTooltipModule,
    MatCardModule,
    MatMenuModule,
    MatPaginatorModule
  ],
  templateUrl: './create-edit-observacion-dialog.component.html',
  styles: [`
    .observaciones-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
    }

    .loading-shade {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .form-card {
      margin-bottom: 16px;
    }

    .form-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      width: 100%;
    }

    .full-width {
      width: 100%;
    }

    .checkbox-row {
      display: flex;
      gap: 24px;
      margin-top: 8px;
    }

    .empty-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin-top: 16px;
    }

    .empty-list mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      color: #757575;
    }

    .empty-list p {
      margin: 0;
      color: #616161;
      text-align: center;
    }

    .empty-list .hint {
      margin-top: 8px;
      font-size: 0.9em;
      color: #9e9e9e;
    }

    .list-section {
      margin: 20px;
    }

    .list-section h4 {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 18px;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .status-badge.active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }

    .status-badge.inactive {
      background-color: #ffebee;
      color: #c62828;
    }

    .current-observacion {
      background-color: rgba(16, 107, 24, 0.53);
    }

    .selected-row {
      background-color: rgba(76, 175, 80, 0.3);
    }

    .search-container {
      margin-bottom: 16px;
    }

    .action-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .clickable-row {
      cursor: pointer;
    }

    /* Dark theme styles */
    :host-context(.dark-theme) {
      .empty-list {
        background-color: #424242;
      }

      .empty-list mat-icon {
        color: #bdbdbd;
      }

      .empty-list p {
        color: #e0e0e0;
      }

      .empty-list .hint {
        color: #9e9e9e;
      }

      .status-badge.active {
        background-color: #1b5e20;
        color: #e8f5e9;
      }

      .status-badge.inactive {
        background-color: #b71c1c;
        color: #ffebee;
      }

      .selected-row {
        background-color: rgba(76, 175, 80, 0.5);
      }
    }
  `]
})
export class CreateEditObservacionDialogComponent implements OnInit {
  observacionForm: FormGroup;
  observaciones: Observacion[] = [];
  isLoading = false;
  isEditing = false;
  currentObservacionId?: number;
  displayedColumns: string[] = ['nombre', 'activo', 'acciones'];
  
  // Pagination and filtering
  searchTerm = '';
  searchTermChanged = new Subject<string>();
  pageSize = 10;
  pageIndex = 0;
  totalObservaciones = 0;
  
  // Selection
  selectedObservacion: Observacion | null = null;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef?: MatDialogRef<CreateEditObservacionDialogComponent>
  ) {
    this.observacionForm = this.fb.group({
      nombre: ['', Validators.required],
      activo: [true]
    });
    
    // Setup search with debounce
    this.searchTermChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.pageIndex = 0; // Reset to first page when search changes
        this.loadObservaciones();
      });
  }

  ngOnInit(): void {
    this.loadObservaciones();
  }
  
  onSearchChange(event: any): void {
    this.searchTerm = event.target.value;
    this.searchTermChanged.next(this.searchTerm);
  }
  
  handlePageEvent(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadObservaciones();
  }

  async loadObservaciones(): Promise<void> {
    this.isLoading = true;
    try {
      const result = await firstValueFrom(
        this.repositoryService.searchObservaciones(
          this.searchTerm, 
          this.pageIndex, 
          this.pageSize
        )
      );
      this.observaciones = result;
      // For now, we're setting the total equal to the items returned
      // If the API returns a proper pagination object in the future,
      // we should update this to use that value
      this.totalObservaciones = result.length;
    } catch (error) {
      console.error('Error loading observaciones:', error);
      this.snackBar.open('Error al cargar las observaciones', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async saveObservacion(): Promise<void> {
    if (this.observacionForm.invalid) return;

    this.isLoading = true;
    const formValue = this.observacionForm.value;

    try {
      // Convert string fields to uppercase
      if (formValue.nombre) {
        formValue.nombre = formValue.nombre.toUpperCase();
      }

      if (this.isEditing && this.currentObservacionId) {
        // Update existing observacion
        const result = await firstValueFrom(
          this.repositoryService.updateObservacion(this.currentObservacionId, {
            ...formValue
          })
        );

        this.snackBar.open('Observación actualizada exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new observacion
        const result = await firstValueFrom(
          this.repositoryService.createObservacion({
            ...formValue
          })
        );

        this.snackBar.open('Observación creada exitosamente', 'Cerrar', { duration: 3000 });
      }

      // Reload observaciones
      this.loadObservaciones();

      // Reset form and editing state
      this.resetForm();
    } catch (error) {
      console.error('Error saving observacion:', error);
      this.snackBar.open('Error al guardar la observación', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  editObservacion(observacion: Observacion): void {
    this.isEditing = true;
    this.currentObservacionId = observacion.id;

    this.observacionForm.patchValue({
      nombre: observacion.nombre,
      activo: observacion.activo
    });
  }

  async deleteObservacion(observacion: Observacion): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar la observación "${observacion.nombre}"?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deleteObservacion(observacion.id));

      this.snackBar.open('Observación eliminada exitosamente', 'Cerrar', { duration: 3000 });

      // Reload observaciones
      this.loadObservaciones();
      
      // If the deleted observacion was selected, clear selection
      if (this.selectedObservacion && this.selectedObservacion.id === observacion.id) {
        this.selectedObservacion = null;
      }
    } catch (error) {
      console.error('Error deleting observacion:', error);
      this.snackBar.open('Error al eliminar la observación', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentObservacionId = undefined;
    this.observacionForm.reset({
      nombre: '',
      activo: true
    });
  }

  closeDialog(): void {
    this.dialogRef?.close();
  }
  
  selectObservacion(observacion: Observacion): void {
    if (this.selectedObservacion && this.selectedObservacion.id === observacion.id) {
      // Deselect if already selected
      this.selectedObservacion = null;
    } else {
      this.selectedObservacion = observacion;
    }
  }
  
  confirmSelection(): void {
    if (this.selectedObservacion) {
      this.dialogRef?.close(this.selectedObservacion);
    } else {
      this.snackBar.open('Debe seleccionar una observación', 'Cerrar', { 
        duration: 3000 
      });
    }
  }
  
  isSelected(observacion: Observacion): boolean {
    return this.selectedObservacion?.id === observacion.id;
  }
} 