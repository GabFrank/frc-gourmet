import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RepositoryService } from '../../../../database/repository.service';
import { Categoria } from '../../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  id?: number;
}

@Component({
  selector: 'app-create-edit-categoria',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-edit-categoria.component.html',
  styleUrls: ['./create-edit-categoria.component.scss']
})
export class CreateEditCategoriaComponent implements OnInit {
  categoriaForm: FormGroup;
  isEditing = false;
  loading = false;

  constructor(
    private dialogRef: MatDialogRef<CreateEditCategoriaComponent>,
    @Inject(MAT_DIALOG_DATA) private data: DialogData,
    private fb: FormBuilder,
    private repository: RepositoryService
  ) {
    this.categoriaForm = this.fb.group({
      nombre: ['', [Validators.required]],
      descripcion: [''],
      posicion: [0, [Validators.required, Validators.min(0)]],
      activo: [true]
    });
    
    this.isEditing = !!data?.id;
  }

  ngOnInit(): void {
    if (this.isEditing && this.data.id) {
      this.loadCategoria(this.data.id);
    }
  }

  loadCategoria(id: number): void {
    this.loading = true;
    
    this.repository.getCategoria(id).subscribe({
      next: (categoria) => {
        if (categoria) {
          this.categoriaForm.patchValue({
            nombre: categoria.nombre,
            descripcion: categoria.descripcion || '',
            posicion: categoria.posicion,
            activo: categoria.activo
          });
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading categoria:', error);
        this.loading = false;
      }
    });
  }

  onSubmit(): void {
    if (this.categoriaForm.invalid) {
      return;
    }
    
    this.loading = true;
    const formData = this.categoriaForm.value;
    
    if (this.isEditing && this.data.id) {
      this.repository.updateCategoria(this.data.id, formData).subscribe({
        next: (result) => {
          this.dialogRef.close(result);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error updating categoria:', error);
          this.loading = false;
        }
      });
    } else {
      this.repository.createCategoria(formData).subscribe({
        next: (result) => {
          this.dialogRef.close(result);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error creating categoria:', error);
          this.loading = false;
        }
      });
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  // Helper method to mark all form controls as touched to trigger validation errors
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
} 