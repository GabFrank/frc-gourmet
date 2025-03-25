import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { RepositoryService } from '../../../database/repository.service';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { Sabor } from '../../../database/entities/productos/sabor.entity';
import { PresentacionSabor } from '../../../database/entities/productos/presentacion-sabor.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  presentacion: Presentacion;
}

@Component({
  selector: 'app-create-edit-sabores',
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
    MatDialogModule,
    MatSnackBarModule,
    MatTableModule,
    MatMenuModule,
    MatDividerModule
  ],
  templateUrl: './create-edit-sabores.component.html',
  styleUrls: ['./create-edit-sabores.component.scss']
})
export class CreateEditSaboresComponent implements OnInit {
  saborForm: FormGroup;
  newSaborForm: FormGroup;
  loading = false;
  isAddingSabor = false;
  isCreatingSabor = false;
  allSabores: Sabor[] = [];
  presentacionSabores: PresentacionSabor[] = [];
  selectedSabor: Sabor | null = null;

  displayedColumns: string[] = ['nombre', 'activo', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditSaboresComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repository: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.saborForm = this.fb.group({
      saborId: [null, Validators.required],
      activo: [true]
    });

    this.newSaborForm = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.loadSabores();
    this.loadPresentacionSabores();
  }

  loadSabores(): void {
    this.loading = true;
    this.repository.getSabores().subscribe({
      next: (sabores: Sabor[]) => {
        this.allSabores = sabores;
        this.loading = false;
      },
      error: (error: Error) => {
        console.error('Error al cargar los sabores:', error);
        this.snackBar.open('Error al cargar los sabores', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadPresentacionSabores(): void {
    this.loading = true;
    this.repository.getPresentacionSabores(this.data.presentacion.id).subscribe({
      next: (presentacionSabores: PresentacionSabor[]) => {
        this.presentacionSabores = presentacionSabores;
        this.loading = false;
      },
      error: (error: Error) => {
        console.error('Error al cargar los sabores de la presentación:', error);
        this.snackBar.open('Error al cargar los sabores de la presentación', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  showAddSaborForm(): void {
    this.isAddingSabor = true;
    this.isCreatingSabor = false;
  }

  showCreateSaborForm(): void {
    this.isCreatingSabor = true;
    this.isAddingSabor = false;
  }

  cancelAddSabor(): void {
    this.isAddingSabor = false;
    this.saborForm.reset({ activo: true });
  }

  cancelCreateSabor(): void {
    this.isCreatingSabor = false;
    this.newSaborForm.reset({ activo: true });
  }

  addSabor(): void {
    if (this.saborForm.invalid) return;

    const saborId = this.saborForm.get('saborId')?.value;
    const activo = this.saborForm.get('activo')?.value;

    // Check if this sabor is already added to this presentacion
    const exists = this.presentacionSabores.some(ps => ps.saborId === saborId);
    if (exists) {
      this.snackBar.open('Este sabor ya está asociado a la presentación', 'Cerrar', { duration: 3000 });
      return;
    }

    this.loading = true;

    const newPresentacionSabor = {
      presentacionId: this.data.presentacion.id,
      saborId: saborId,
      activo: activo
    };

    // If this is the first sabor, update the presentacion.isSabores flag
    const updatePresentacion = !this.data.presentacion.isSabores;

    this.repository.createPresentacionSabor(newPresentacionSabor).subscribe({
      next: () => {
        if (updatePresentacion) {
          this.repository.updatePresentacion(this.data.presentacion.id, {
            isSabores: true
          }).subscribe({
            next: () => {
              this.loadPresentacionSabores();
              this.cancelAddSabor();
              this.snackBar.open('Sabor añadido correctamente', 'Cerrar', { duration: 3000 });
            },
            error: (error: Error) => {
              console.error('Error al actualizar la presentación:', error);
              this.snackBar.open('Error al actualizar la presentación', 'Cerrar', { duration: 3000 });
              this.loading = false;
            }
          });
        } else {
          this.loadPresentacionSabores();
          this.cancelAddSabor();
          this.snackBar.open('Sabor añadido correctamente', 'Cerrar', { duration: 3000 });
        }
      },
      error: (error: Error) => {
        console.error('Error al añadir el sabor:', error);
        this.snackBar.open('Error al añadir el sabor', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  createSabor(): void {
    if (this.newSaborForm.invalid) return;

    const nombre = this.newSaborForm.get('nombre')?.value;
    const descripcion = this.newSaborForm.get('descripcion')?.value;
    const activo = this.newSaborForm.get('activo')?.value;

    this.loading = true;

    // First create the new Sabor
    const newSabor: Partial<Sabor> = {
      nombre: nombre,
      descripcion: descripcion,
      activo: activo
    };

    this.repository.createSabor(newSabor).subscribe({
      next: (savedSabor: Sabor) => {
        // Then add it to the presentacion
        const newPresentacionSabor = {
          presentacionId: this.data.presentacion.id,
          saborId: savedSabor.id,
          activo: activo
        };

        // If this is the first sabor, update the presentacion.isSabores flag
        const updatePresentacion = !this.data.presentacion.isSabores;

        this.repository.createPresentacionSabor(newPresentacionSabor).subscribe({
          next: () => {
            if (updatePresentacion) {
              this.repository.updatePresentacion(this.data.presentacion.id, {
                isSabores: true
              }).subscribe({
                next: () => {
                  this.loadSabores(); // Reload all sabores
                  this.loadPresentacionSabores();
                  this.cancelCreateSabor();
                  this.snackBar.open('Sabor creado y añadido correctamente', 'Cerrar', { duration: 3000 });
                },
                error: (error: Error) => {
                  console.error('Error al actualizar la presentación:', error);
                  this.snackBar.open('Error al actualizar la presentación', 'Cerrar', { duration: 3000 });
                  this.loading = false;
                }
              });
            } else {
              this.loadSabores(); // Reload all sabores
              this.loadPresentacionSabores();
              this.cancelCreateSabor();
              this.snackBar.open('Sabor creado y añadido correctamente', 'Cerrar', { duration: 3000 });
            }
          },
          error: (error: Error) => {
            console.error('Error al añadir el sabor:', error);
            this.snackBar.open('Error al añadir el sabor', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      },
      error: (error: Error) => {
        console.error('Error al crear el sabor:', error);
        this.snackBar.open('Error al crear el sabor', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  toggleSaborStatus(presentacionSabor: PresentacionSabor): void {
    this.loading = true;

    this.repository.updatePresentacionSabor(presentacionSabor.id, {
      activo: !presentacionSabor.activo
    }).subscribe({
      next: () => {
        this.loadPresentacionSabores();
        this.snackBar.open(
          `Sabor ${!presentacionSabor.activo ? 'activado' : 'desactivado'} correctamente`,
          'Cerrar',
          { duration: 3000 }
        );
      },
      error: (error: Error) => {
        console.error('Error al actualizar el estado del sabor:', error);
        this.snackBar.open('Error al actualizar el estado del sabor', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  deleteSabor(presentacionSabor: PresentacionSabor): void {
    if (confirm('¿Está seguro de que desea eliminar este sabor de la presentación?')) {
      this.loading = true;

      this.repository.deletePresentacionSabor(presentacionSabor.id).subscribe({
        next: () => {
          this.loadPresentacionSabores();
          this.snackBar.open('Sabor eliminado correctamente', 'Cerrar', { duration: 3000 });
        },
        error: (error: Error) => {
          console.error('Error al eliminar el sabor:', error);
          this.snackBar.open('Error al eliminar el sabor', 'Cerrar', { duration: 3000 });
          this.loading = false;
        }
      });
    }
  }

  getSaborNombre(saborId: number): string {
    const sabor = this.allSabores.find(s => s.id === saborId);
    return sabor ? sabor.nombre : 'Sabor no encontrado';
  }

  close(): void {
    this.dialogRef.close();
  }
}
