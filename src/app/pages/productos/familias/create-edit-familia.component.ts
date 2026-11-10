import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { RepositoryService } from '../../../database/repository.service';
import { Familia } from '../../../database/entities/productos/familia.entity';
import { Subfamilia } from '../../../database/entities/productos/subfamilia.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

interface DialogData {
  isEdit: boolean;
  familia?: Familia;
}

@Component({
  selector: 'app-create-edit-familia',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSelectModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatExpansionModule,
    MatTableModule,
    MatTooltipModule,
    MatMenuModule,
    MatCardModule,
    MatDividerModule
  ],
  templateUrl: './create-edit-familia.component.html',
  styleUrls: ['./create-edit-familia.component.scss']
})
export class CreateEditFamiliaComponent implements OnInit {
  familiaForm: FormGroup;
  subfamiliaForm: FormGroup;
  isLoading = false;
  isLoadingSubfamilias = false;
  dialogTitle: string;
  
  // Subfamilias management
  subfamilias: Subfamilia[] = [];
  subfamiliaDataSource = new MatTableDataSource<Subfamilia>();
  subfamiliaDisplayedColumns: string[] = ['nombre', 'clase', 'activo', 'actions'];
  isAddingSubfamilia = false;
  editingSubfamiliaId: number | null = null;
  
  // Track if familia was just created
  isNewlyCreated = false;
  currentFamilia: Familia | null = null;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    public dialogRef: MatDialogRef<CreateEditFamiliaComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.dialogTitle = data.isEdit ? 'EDITAR FAMILIA' : 'CREAR FAMILIA';
    
    this.familiaForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
      activo: [true]
    });

    this.subfamiliaForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
      activo: [true],
      claseId: [null as number | null],
    });
  }

  /** Clases de ítem de compra: la subfamilia define la clase por defecto de sus productos. */
  clases: any[] = [];

  claseNombre(id: number | null | undefined): string {
    const c = this.clases.find((x) => x.id === id);
    return c ? c.nombre : '—';
  }

  ngOnInit(): void {
    this.repositoryService.getCompraItemClases({ incluirInactivas: true }).subscribe({
      next: (c) => (this.clases = c || []),
      error: () => (this.clases = []),
    });
    if (this.data.isEdit && this.data.familia) {
      this.currentFamilia = this.data.familia;
      this.familiaForm.patchValue({
        nombre: this.data.familia.nombre,
        activo: this.data.familia.activo
      });
      // Load subfamilias for existing familia
      this.loadSubfamilias();
    }
  }

  // Load subfamilias for the current familia
  loadSubfamilias(): void {
    if (this.currentFamilia?.id) {
      this.isLoadingSubfamilias = true;
      this.repositoryService.getSubfamiliasByFamilia(this.currentFamilia.id).subscribe({
        next: (subfamilias) => {
          this.subfamilias = subfamilias;
          this.subfamiliaDataSource.data = subfamilias;
          this.isLoadingSubfamilias = false;
        },
        error: (error) => {
          console.error('ERROR_LOADING_SUBFAMILIAS', error);
          this.snackBar.open('Error al cargar subfamilias', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingSubfamilias = false;
        }
      });
    }
  }

  // Start adding a new subfamilia
  startAddingSubfamilia(): void {
    this.isAddingSubfamilia = true;
    this.editingSubfamiliaId = null;
    this.subfamiliaForm.reset({
      nombre: '',
      activo: true,
      claseId: null,
    });
  }

  // Cancel adding/editing subfamilia
  cancelSubfamiliaEdit(): void {
    this.isAddingSubfamilia = false;
    this.editingSubfamiliaId = null;
    this.subfamiliaForm.reset();
  }

  // Start editing a subfamilia
  editSubfamilia(subfamilia: Subfamilia): void {
    this.isAddingSubfamilia = false;
    this.editingSubfamiliaId = subfamilia.id!;
    this.subfamiliaForm.patchValue({
      nombre: subfamilia.nombre,
      activo: subfamilia.activo,
      claseId: subfamilia.claseId ?? null,
    });
  }

  // Save subfamilia (create or update)
  saveSubfamilia(): void {
    if (this.subfamiliaForm.valid && this.currentFamilia?.id) {
      this.isLoadingSubfamilias = true;
      
      const subfamiliaData = {
        ...this.subfamiliaForm.value,
        nombre: this.subfamiliaForm.value.nombre?.toUpperCase(), // Convert to UPPERCASE
        familiaId: this.currentFamilia.id
      };

      const operation = this.editingSubfamiliaId
        ? this.repositoryService.updateSubfamilia(this.editingSubfamiliaId, subfamiliaData)
        : this.repositoryService.createSubfamilia(subfamiliaData);

      operation.subscribe({
        next: () => {
          const actionText = this.editingSubfamiliaId ? 'actualizada' : 'creada';
          this.snackBar.open(`Subfamilia ${actionText} correctamente`, 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.cancelSubfamiliaEdit();
          this.loadSubfamilias();
        },
        error: (error) => {
          console.error('ERROR_SAVING_SUBFAMILIA', error);
          const actionText = this.editingSubfamiliaId ? 'actualizar' : 'crear';
          this.snackBar.open(`Error al ${actionText} subfamilia`, 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingSubfamilias = false;
        }
      });
    }
  }

  // Delete subfamilia
  deleteSubfamilia(subfamilia: Subfamilia): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR ELIMINACION',
        message: `¿Está seguro que desea eliminar la subfamilia "${subfamilia.nombre}"?`,
        confirmText: 'ELIMINAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && subfamilia.id) {
        this.isLoadingSubfamilias = true;
        this.repositoryService.deleteSubfamilia(subfamilia.id).subscribe({
          next: () => {
            this.snackBar.open('Subfamilia eliminada correctamente', 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadSubfamilias();
          },
          error: (error) => {
            console.error('ERROR_DELETING_SUBFAMILIA', error);
            this.snackBar.open('Error al eliminar subfamilia', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoadingSubfamilias = false;
          }
        });
      }
    });
  }

  // Toggle subfamilia status
  toggleSubfamiliaStatus(subfamilia: Subfamilia): void {
    if (subfamilia.id) {
      const updatedData = { ...subfamilia, activo: !subfamilia.activo };
      this.isLoadingSubfamilias = true;
      
      this.repositoryService.updateSubfamilia(subfamilia.id, updatedData).subscribe({
        next: () => {
          const statusText = updatedData.activo ? 'activada' : 'desactivada';
          this.snackBar.open(`Subfamilia ${statusText} correctamente`, 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadSubfamilias();
        },
        error: (error) => {
          console.error('ERROR_UPDATING_SUBFAMILIA_STATUS', error);
          this.snackBar.open('Error al cambiar estado de subfamilia', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingSubfamilias = false;
        }
      });
    }
  }

  onSubmit(): void {
    if (this.familiaForm.valid) {
      this.isLoading = true;
      const familiaData = {
        ...this.familiaForm.value,
        nombre: this.familiaForm.value.nombre?.toUpperCase() // Convert to UPPERCASE
      };

      const operation = this.data.isEdit 
        ? this.repositoryService.updateFamilia(this.data.familia!.id!, familiaData)
        : this.repositoryService.createFamilia(familiaData);

      operation.subscribe({
        next: (result) => {
          const actionText = this.data.isEdit ? 'actualizada' : 'creada';
          this.snackBar.open(`Familia ${actionText} correctamente`, 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          
          if (this.data.isEdit) {
            // For edit mode, close the dialog
            this.dialogRef.close(result);
          } else {
            // For create mode, keep dialog open and switch to edit mode
            this.isNewlyCreated = true;
            this.currentFamilia = result;
            this.data.isEdit = true;
            this.dialogTitle = 'EDITAR FAMILIA';
            this.isLoading = false;
            
            // Load subfamilias for the newly created familia
            this.loadSubfamilias();
          }
        },
        error: (error) => {
          console.error('ERROR_SAVING_FAMILIA', error);
          const actionText = this.data.isEdit ? 'actualizar' : 'crear';
          this.snackBar.open(`Error al ${actionText} familia`, 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoading = false;
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  private markFormGroupTouched(): void {
    Object.keys(this.familiaForm.controls).forEach(key => {
      const control = this.familiaForm.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.familiaForm.get(fieldName);
    
    if (control?.hasError('required')) {
      return `${fieldName.toUpperCase()}_REQUIRED`;
    }
    
    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return `MINIMUM_LENGTH_${minLength}`;
    }
    
    if (control?.hasError('maxlength')) {
      const maxLength = control.errors?.['maxlength'].requiredLength;
      return `MAXIMUM_LENGTH_${maxLength}`;
    }
    
    return '';
  }
} 