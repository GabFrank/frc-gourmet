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
import { ProductoAdicional } from '../../../../database/entities/productos/producto-adicional.entity';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { Presentacion } from '../../../../database/entities/productos/presentacion.entity';
import { firstValueFrom } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { CreateEditAdicionalDialogComponent } from '../../adicionales/create-edit-adicional-dialog/create-edit-adicional-dialog.component';
import { CreateEditAdicionalSelectableDialogComponent } from '../create-edit-adicional-selectable-dialog/create-edit-adicional-selectable-dialog.component';


export interface ProductoAdicionalDialogData {
  producto: Producto;
  productoAdicional?: ProductoAdicional;
  adicional?: Adicional;
}

@Component({
  selector: 'app-create-edit-producto-adicional-dialog',
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
  templateUrl: './create-edit-producto-adicional-dialog.component.html',
  styles: [`
    .producto-adicional-container {
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
export class CreateEditProductoAdicionalDialogComponent implements OnInit {
  productoAdicionalForm: FormGroup;
  adicionalNombreControl = new FormControl('');
  isLoading = false;
  isEditing = false;
  adicionales: Adicional[] = [];
  presentaciones: Presentacion[] = [];
  producto: Producto | null = null;
  selectedAdicional: Adicional | null = null;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    public dialogRef: MatDialogRef<CreateEditProductoAdicionalDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProductoAdicionalDialogData
  ) {
    this.productoAdicionalForm = this.fb.group({
      adicionalId: ['', Validators.required],
      presentacionId: ['', Validators.required],
      cantidadDefault: [1],
      productoId: [this.data.producto.id, Validators.required],
      activo: [true]
    });

    this.isEditing = !!data.productoAdicional;
  }

  ngOnInit(): void {
    this.loadData();

    if (this.isEditing && this.data.productoAdicional) {
      this.patchFormWithData(this.data.productoAdicional);
    }
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      // Load adicionales
      this.adicionales = await firstValueFrom(this.repositoryService.getAdicionales());
      
      // Load presentaciones for this product
      this.presentaciones = await firstValueFrom(
        this.repositoryService.getPresentacionesByProducto(this.data.producto.id)
      );

      // If we are in edit mode, preselect the adicional
      if (this.isEditing && this.data.productoAdicional) {
        this.selectedAdicional = this.data.productoAdicional.adicional;
        this.producto = this.data.producto;
      } else {
        // Load producto information
        if (this.data.producto) {
          this.producto = this.data.producto;
        }
        // load adicional from data.adicional
        if (this.data.adicional) {
          this.selectedAdicional = this.data.adicional;
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

  patchFormWithData(productoAdicional: ProductoAdicional): void {
    this.productoAdicionalForm.patchValue({
      adicionalId: productoAdicional.adicionalId,
      presentacionId: productoAdicional.presentacionId,
      cantidadDefault: productoAdicional.cantidadDefault,
      activo: productoAdicional.activo
    });
  }

  async openAdicionalDialog(): Promise<void> {
    const dialogRef = this.dialog.open(CreateEditAdicionalSelectableDialogComponent, {
      width: '50%',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result && typeof result === 'object' && 'id' in result) {
      // Refresh adicionales list
      await this.loadData();

      // Select the newly created adicional
      this.productoAdicionalForm.patchValue({
        adicionalId: result.id
      });

      this.selectedAdicional = result as Adicional;
      this.adicionalNombreControl.setValue(this.selectedAdicional?.nombre);
    }
  }

  async save(): Promise<void> {
    if (this.isLoading || this.productoAdicionalForm.invalid) {
      return;
    }

    const formValue = this.productoAdicionalForm.getRawValue();

    this.isLoading = true;

    try {
      if (this.isEditing && this.data.productoAdicional) {
        // Update existing productoAdicional
        await firstValueFrom(
          this.repositoryService.updateProductoAdicional(
            this.data.productoAdicional.id,
            {
              ...formValue,
              productoId: this.data.producto.id
            }
          )
        );

        this.snackBar.open('Adicional de producto actualizado exitosamente', 'Cerrar', {
          duration: 3000
        });
      } else {
        // Create new productoAdicional
        const response = await firstValueFrom(
          this.repositoryService.createProductoAdicional({
            ...formValue,
            productoId: this.data.producto.id
          })
        );

        // Check if operation was successful
        if (response && typeof response === 'object' && 'success' in response && !response.success) {
          // Handle duplicate entries
          if (response.error === 'duplicate') {
            this.snackBar.open(response.message || 'Este adicional ya existe para este producto.', 'Cerrar', {
              duration: 5000
            });
            return;
          } else {
            throw new Error(response.message || 'Error desconocido al guardar el adicional de producto');
          }
        }

        this.snackBar.open('Adicional de producto creado exitosamente', 'Cerrar', {
          duration: 3000
        });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving producto adicional:', error);
      this.snackBar.open('Error al guardar el adicional de producto', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  onAdicionalSelectionChange(adicionalId: number): void {
    this.selectedAdicional = this.adicionales.find(a => a.id === adicionalId) || null;
  }

  clearAdicional(): void {
    this.adicionalNombreControl.setValue('');
    this.selectedAdicional = null;
  }

  cancel(): void {
    this.dialogRef.close();
  }
} 