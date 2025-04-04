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
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { firstValueFrom, forkJoin } from 'rxjs';

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
  recetaForm: FormGroup;
  loading = false;
  isAddingSabor = false;
  isCreatingSabor = false;
  isEditingReceta = false;
  allSabores: Sabor[] = [];
  allRecetas: Receta[] = [];
  allVariaciones: RecetaVariacion[] = [];
  // Map to store all variaciones by recetaId
  variacionesByRecetaId: Map<number, RecetaVariacion[]> = new Map();
  presentacionSabores: PresentacionSabor[] = [];
  selectedSabor: Sabor | null = null;
  currentPresentacionSabor: PresentacionSabor | null = null;
  selectedRecetaId: number | null = null;

  displayedColumns: string[] = ['nombre', 'receta', 'variacion', 'activo', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditSaboresComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repository: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.saborForm = this.fb.group({
      saborId: [null, Validators.required],
      recetaId: [null],
      variacionId: [null],
      activo: [true]
    });

    this.newSaborForm = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      recetaId: [null],
      variacionId: [null],
      activo: [true]
    });

    this.recetaForm = this.fb.group({
      recetaId: [null],
      variacionId: [null]
    });

    // Listen for recetaId changes in the saborForm
    this.saborForm.get('recetaId')?.valueChanges.subscribe(recetaId => {
      if (recetaId !== this.selectedRecetaId) {
        this.selectedRecetaId = recetaId;
        this.saborForm.get('variacionId')?.setValue(null);
        if (recetaId) {
          this.loadVariacionesByReceta(recetaId);
        } else {
          this.allVariaciones = [];
        }
      }
    });

    // Listen for recetaId changes in the newSaborForm
    this.newSaborForm.get('recetaId')?.valueChanges.subscribe(recetaId => {
      if (recetaId !== this.selectedRecetaId) {
        this.selectedRecetaId = recetaId;
        this.newSaborForm.get('variacionId')?.setValue(null);
        if (recetaId) {
          this.loadVariacionesByReceta(recetaId);
        } else {
          this.allVariaciones = [];
        }
      }
    });

    // Listen for recetaId changes in the recetaForm
    this.recetaForm.get('recetaId')?.valueChanges.subscribe(recetaId => {
      if (recetaId !== this.selectedRecetaId) {
        this.selectedRecetaId = recetaId;
        this.recetaForm.get('variacionId')?.setValue(null);
        if (recetaId) {
          this.loadVariacionesByReceta(recetaId);
        } else {
          this.allVariaciones = [];
        }
      }
    });
  }

  ngOnInit(): void {
    this.loadSabores();
    this.loadRecetas();
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

  loadRecetas(): void {
    this.loading = true;
    this.repository.getRecetas().subscribe({
      next: (recetas: Receta[]) => {
        this.allRecetas = recetas;
        this.loading = false;
      },
      error: (error: Error) => {
        console.error('Error al cargar las recetas:', error);
        this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadVariacionesByReceta(recetaId: number): void {
    // Check if we already have the variations for this recipe
    if (this.variacionesByRecetaId.has(recetaId)) {
      this.allVariaciones = this.variacionesByRecetaId.get(recetaId) || [];
      return;
    }

    this.loading = true;
    this.repository.getRecetaVariaciones(recetaId).subscribe({
      next: (variaciones: RecetaVariacion[]) => {
        this.allVariaciones = variaciones;
        // Store the variations in the map
        this.variacionesByRecetaId.set(recetaId, variaciones);
        this.loading = false;
      },
      error: (error: Error) => {
        console.error('Error al cargar las variaciones de la receta:', error);
        this.snackBar.open('Error al cargar las variaciones de la receta', 'Cerrar', { duration: 3000 });
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

        // Load all variations for each recipe that has a sabor assigned
        this.loadAllRelevantVariaciones();
      },
      error: (error: Error) => {
        console.error('Error al cargar los sabores de la presentación:', error);
        this.snackBar.open('Error al cargar los sabores de la presentación', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadAllRelevantVariaciones(): void {
    // Get unique recetaIds from presentacionSabores
    const recetaIds = [...new Set(
      this.presentacionSabores
        .filter(ps => ps.recetaId !== null && ps.recetaId !== undefined)
        .map(ps => ps.recetaId as number)
    )];

    if (recetaIds.length === 0) return;

    this.loading = true;

    // Create an array of observables for loading variations
    const loadRequests = recetaIds.map(recetaId =>
      this.repository.getRecetaVariaciones(recetaId)
    );

    // Execute all requests in parallel
    forkJoin(loadRequests).subscribe({
      next: (results) => {
        // Store each result in the map
        results.forEach((variaciones, index) => {
          const recetaId = recetaIds[index];
          this.variacionesByRecetaId.set(recetaId, variaciones);
        });
        this.loading = false;
      },
      error: (error) => {
        console.error('Error al cargar las variaciones:', error);
        this.snackBar.open('Error al cargar las variaciones', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  showAddSaborForm(): void {
    this.isAddingSabor = true;
    this.isCreatingSabor = false;
    this.isEditingReceta = false;
  }

  showCreateSaborForm(): void {
    this.isCreatingSabor = true;
    this.isAddingSabor = false;
    this.isEditingReceta = false;
  }

  showEditRecetaForm(presentacionSabor: PresentacionSabor): void {
    this.isEditingReceta = true;
    this.isAddingSabor = false;
    this.isCreatingSabor = false;
    this.currentPresentacionSabor = presentacionSabor;
    this.recetaForm.patchValue({
      recetaId: presentacionSabor.recetaId,
      variacionId: presentacionSabor.variacionId
    });

    // Load variaciones if there's a receta selected
    if (presentacionSabor.recetaId) {
      this.loadVariacionesByReceta(presentacionSabor.recetaId);
    }
  }

  cancelAddSabor(): void {
    this.isAddingSabor = false;
    this.saborForm.reset({ activo: true });
    this.allVariaciones = [];
    this.selectedRecetaId = null;
  }

  cancelCreateSabor(): void {
    this.isCreatingSabor = false;
    this.newSaborForm.reset({ activo: true });
    this.allVariaciones = [];
    this.selectedRecetaId = null;
  }

  cancelEditReceta(): void {
    this.isEditingReceta = false;
    this.currentPresentacionSabor = null;
    this.recetaForm.reset();
    this.allVariaciones = [];
    this.selectedRecetaId = null;
  }

  addSabor(): void {
    if (this.saborForm.invalid) return;

    const saborId = this.saborForm.get('saborId')?.value;
    const recetaId = this.saborForm.get('recetaId')?.value;
    const variacionId = this.saborForm.get('variacionId')?.value;
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
      recetaId: recetaId,
      variacionId: variacionId,
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

    const nombre = this.newSaborForm.get('nombre')?.value?.toUpperCase();
    const descripcion = this.newSaborForm.get('descripcion')?.value?.toUpperCase();
    const recetaId = this.newSaborForm.get('recetaId')?.value;
    const variacionId = this.newSaborForm.get('variacionId')?.value;
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
          recetaId: recetaId,
          variacionId: variacionId,
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

  updateReceta(): void {
    if (!this.currentPresentacionSabor) return;

    const recetaId = this.recetaForm.get('recetaId')?.value;
    const variacionId = this.recetaForm.get('variacionId')?.value;

    this.loading = true;

    this.repository.updatePresentacionSabor(this.currentPresentacionSabor.id, {
      recetaId: recetaId,
      variacionId: variacionId
    }).subscribe({
      next: () => {
        this.loadPresentacionSabores();
        this.cancelEditReceta();
        this.snackBar.open('Receta actualizada correctamente', 'Cerrar', { duration: 3000 });
      },
      error: (error: Error) => {
        console.error('Error al actualizar la receta:', error);
        this.snackBar.open('Error al actualizar la receta', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  toggleSaborStatus(presentacionSabor: PresentacionSabor): void {
    this.loading = true;
    const newStatus = !presentacionSabor.activo;

    this.repository.updatePresentacionSabor(presentacionSabor.id, {
      activo: newStatus
    }).subscribe({
      next: () => {
        // Update locally
        const index = this.presentacionSabores.findIndex(ps => ps.id === presentacionSabor.id);
        if (index >= 0) {
          this.presentacionSabores[index].activo = newStatus;
        }
        this.loading = false;
        this.snackBar.open(
          `Sabor ${newStatus ? 'activado' : 'desactivado'} correctamente`,
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
    if (confirm(`¿Está seguro de eliminar este sabor?`)) {
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
    return sabor ? sabor.nombre : '';
  }

  getRecetaNombre(recetaId?: number): string {
    if (!recetaId) return 'No asignada';
    const receta = this.allRecetas.find(r => r.id === recetaId);
    return receta ? receta.nombre : 'No asignada';
  }

  getVariacionNombre(variacionId?: number, recetaId?: number): string {
    if (!variacionId) return 'No asignada';

    // First check if we need to load variations for this recipe
    if (recetaId && !this.variacionesByRecetaId.has(recetaId)) {
      this.loadVariacionesByReceta(recetaId);
      return 'Cargando...';
    }

    // Try to find the variation in the map first if we have a recetaId
    if (recetaId && this.variacionesByRecetaId.has(recetaId)) {
      const variations = this.variacionesByRecetaId.get(recetaId) || [];
      const variacion = variations.find(v => v.id === variacionId);
      if (variacion) return variacion.nombre;
    }

    // Fallback to the allVariaciones array
    const variacion = this.allVariaciones.find(v => v.id === variacionId);
    if (variacion) return variacion.nombre;

    // Check all maps as a last resort
    for (const variations of this.variacionesByRecetaId.values()) {
      const variacion = variations.find(v => v.id === variacionId);
      if (variacion) return variacion.nombre;
    }

    return 'No asignada';
  }

  close(): void {
    this.dialogRef.close();
  }
}
