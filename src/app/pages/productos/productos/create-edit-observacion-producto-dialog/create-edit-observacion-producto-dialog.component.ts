import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
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
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { ObservacionProducto } from '../../../../database/entities/productos/observacion-producto.entity';
import { Observacion } from '../../../../database/entities/productos/observacion.entity';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { firstValueFrom } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { CreateEditObservacionDialogComponent } from '../create-edit-observacion-dialog/create-edit-observacion-dialog.component';

export interface ObservacionProductoDialogData {
  producto: Producto;
  observacionProducto?: ObservacionProducto;
  observacion?: Observacion;
}

@Component({
  selector: 'app-create-edit-observacion-producto-dialog',
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
  ],
  templateUrl: './create-edit-observacion-producto-dialog.component.html',
  styles: [`
    .observacion-producto-container {
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

    .action-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    /* Dark theme styles */
    :host-context(.dark-theme) {
      .status-badge.active {
        background-color: #1b5e20;
        color: #e8f5e9;
      }

      .status-badge.inactive {
        background-color: #b71c1c;
        color: #ffebee;
      }
    }
  `]
})
export class CreateEditObservacionProductoDialogComponent implements OnInit {
  observacionProductoForm: FormGroup;
  observacionNombreControl = new FormControl('');
  isLoading = false;
  isEditing = false;
  observaciones: Observacion[] = [];
  producto: Producto | null = null;
  selectedObservacion: Observacion | null = null;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    public dialogRef: MatDialogRef<CreateEditObservacionProductoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ObservacionProductoDialogData
  ) {
    this.observacionProductoForm = this.fb.group({
      observacionId: ['', Validators.required],
      obligatorio: [false],
      cantidadDefault: [1],
      productoId: [this.data.producto.id, Validators.required],
      activo: [true]
    });

    this.isEditing = !!data.observacionProducto;
  }

  ngOnInit(): void {
    this.loadData();

    if (this.isEditing && this.data.observacionProducto) {
      this.patchFormWithData(this.data.observacionProducto);
    }
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      // If we are in edit mode, preselect the observacion
      if (this.isEditing && this.data.observacionProducto) {
        this.selectedObservacion = this.data.observacionProducto.observacion;
        this.producto = this.data.producto;
      } else {
        // Load producto information
        if (this.data.producto) {
          this.producto = this.data.producto;
        }
        // load observacion from data.observacion
        if (this.data.observacion) {
          this.selectedObservacion = this.data.observacion;
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error al cargar los datos', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  patchFormWithData(observacionProducto: ObservacionProducto): void {
    this.observacionProductoForm.patchValue({
      observacionId: observacionProducto.observacionId,
      obligatorio: observacionProducto.obligatorio,
      cantidadDefault: observacionProducto.cantidadDefault,
      activo: observacionProducto.activo
    });
  }

  async openObservacionDialog(): Promise<void> {
    const dialogRef = this.dialog.open(CreateEditObservacionDialogComponent, {
      width: '600px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result && typeof result === 'object' && 'id' in result) {
      // Refresh observaciones list
      await this.loadData();

      // Select the newly created observacion
      this.observacionProductoForm.patchValue({
        observacionId: result.id
      });

      this.selectedObservacion = result as Observacion;
      this.observacionNombreControl.setValue(this.selectedObservacion?.nombre);
    }
  }

  async save(): Promise<void> {
    if (this.isLoading || this.observacionProductoForm.invalid) {
      return;
    }

    const formValue = this.observacionProductoForm.getRawValue();

    this.isLoading = true;

    try {
      if (this.isEditing && this.data.observacionProducto) {
        // Update existing observacionProducto
        await firstValueFrom(
          this.repositoryService.updateObservacionProducto(
            this.data.observacionProducto.id,
            {
              ...formValue,
              productoId: this.data.producto.id
            }
          )
        );

        this.snackBar.open('Observación de producto actualizada exitosamente', 'Cerrar', {
          duration: 3000
        });
      } else {
        // Create new observacionProducto
        const response = await firstValueFrom(
          this.repositoryService.createObservacionProducto({
            ...formValue,
            productoId: this.data.producto.id
          })
        );

        // Check if operation was successful
        if (!response.success) {
          // Handle duplicate entries
          if (response.error === 'duplicate') {
            this.snackBar.open(response.message || 'Esta observación ya existe para este producto.', 'Cerrar', {
              duration: 5000
            });
            return;
          } else {
            throw new Error(response.message || 'Error desconocido al guardar la observación de producto');
          }
        }

        this.snackBar.open('Observación de producto creada exitosamente', 'Cerrar', {
          duration: 3000
        });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving observacion producto:', error);
      this.snackBar.open('Error al guardar la observación de producto', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  onObservacionSelectionChange(observacionId: number): void {
    this.selectedObservacion = this.observaciones.find(o => o.id === observacionId) || null;
  }

  clearObservacion(): void {
    this.observacionNombreControl.setValue('');
    this.selectedObservacion = null;
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
