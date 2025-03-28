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
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';
import { CreateEditRecetaItemDialogComponent } from './create-edit-receta-item-dialog.component';

interface DialogData {
  receta?: Receta | null;
  recetaId?: number;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-receta-dialog',
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
    MatDividerModule,
    MatTooltipModule,
    MatMenuModule
  ],
  templateUrl: './create-edit-receta-dialog.component.html',
  styleUrls: ['./create-edit-receta-dialog.component.scss']
})
export class CreateEditRecetaDialogComponent implements OnInit {
  recetaForm: FormGroup;
  ingredientes: Ingrediente[] = [];
  recetaItems: RecetaItem[] = [];
  displayedColumns: string[] = ['ingrediente', 'cantidad', 'activo', 'acciones'];
  loading = false;
  savingReceta = false;
  recetaId?: number;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.recetaForm = this.fb.group({
      nombre: ['', Validators.required],
      modo_preparo: [''],
      activo: [true]
    });
  }

  ngOnInit(): void {
    // Set recetaId if available
    if (this.data.receta && this.data.receta.id) {
      this.recetaId = this.data.receta.id;
    } else if (this.data.recetaId) {
      this.recetaId = this.data.recetaId;
    }

    // Load data based on mode
    if (this.data.editMode) {
      if (this.data.receta) {
        this.patchRecetaForm(this.data.receta);
        this.loadRecetaItems();
      } else if (this.recetaId) {
        this.loadRecetaById(this.recetaId);
      }
    }

    // Don't load all ingredients at startup - we'll use server-side filtering
  }

  private patchRecetaForm(receta: Receta): void {
    this.recetaForm.patchValue({
      nombre: receta.nombre,
      modo_preparo: receta.modo_preparo || '',
      activo: receta.activo
    });
  }

  async loadRecetaById(recetaId: number): Promise<void> {
    try {
      this.loading = true;
      const receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
      this.data.receta = receta;
      this.patchRecetaForm(receta);
      this.loadRecetaItems();
    } catch (error) {
      console.error('Error loading receta:', error);
      this.snackBar.open('Error al cargar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async loadRecetaItems(): Promise<void> {
    if (!this.recetaId) return;

    try {
      this.loading = true;
      this.recetaItems = await firstValueFrom(this.repositoryService.getRecetaItems(this.recetaId));

      // Load ingredient details for display
      const ingredientIds = this.recetaItems.map(item => item.ingredienteId);
      await this.loadIngredientesByIds(ingredientIds);
    } catch (error) {
      console.error('Error loading receta items:', error);
      this.snackBar.open('Error al cargar ingredientes de la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async loadIngredientesByIds(ingredientIds: number[]): Promise<void> {
    if (!ingredientIds.length) return;

    try {
      // Make sure the ingredientes array is initialized
      if (!this.ingredientes) {
        this.ingredientes = [];
      }

      // Add the ingredients we need for display purposes
      for (const id of ingredientIds) {
        if (!this.ingredientes.some(i => i.id === id)) {
          const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(id));
          this.ingredientes.push(ingrediente);
        }
      }
    } catch (error) {
      console.error('Error loading specific ingredients:', error);
    }
  }

  async save(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;

      if (this.data.editMode && this.recetaId) {
        // Update existing receta
        await firstValueFrom(this.repositoryService.updateReceta(this.recetaId, {
          nombre: formValues.nombre.toUpperCase(),
          modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
          activo: formValues.activo
        }));
        this.snackBar.open('Receta actualizada correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta
        const newReceta = await firstValueFrom(this.repositoryService.createReceta({
          nombre: formValues.nombre.toUpperCase(),
          modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
          activo: formValues.activo
        }));
        this.recetaId = newReceta.id;
        this.snackBar.open('Receta creada correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }

  addRecetaItem(): void {
    if (!this.recetaId) {
      // Save the recipe first if it doesn't exist
      this.saveAndContinue();
      return;
    }

    this.openRecetaItemDialog();
  }

  async saveAndContinue(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;

      // Create new receta
      const newReceta = await firstValueFrom(this.repositoryService.createReceta({
        nombre: formValues.nombre.toUpperCase(),
        modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
        activo: formValues.activo
      }));

      this.recetaId = newReceta.id;
      this.data.receta = newReceta;
      this.data.editMode = true;

      this.snackBar.open('Receta guardada correctamente', 'Cerrar', { duration: 3000 });

      // Open the dialog to add a recipe item
      this.openRecetaItemDialog();
    } catch (error) {
      console.error('Error saving receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }

  openRecetaItemDialog(recetaItem?: RecetaItem): void {
    if (!this.recetaId) {
      this.snackBar.open('Primero debe guardar la receta', 'Cerrar', { duration: 3000 });
      return;
    }

    // If editing, make sure we have the ingredient loaded
    if (recetaItem) {
      this.loadIngredientesByIds([recetaItem.ingredienteId]);
    }

    const dialogRef = this.dialog.open(CreateEditRecetaItemDialogComponent, {
      width: '500px',
      disableClose: true,
      data: {
        recetaId: this.recetaId,
        recetaItem: recetaItem,
        editMode: !!recetaItem,
        ingredientes: recetaItem ? this.ingredientes.filter(i => i.id === recetaItem.ingredienteId) : []
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecetaItems();
      }
    });
  }

  editRecetaItem(recetaItem: RecetaItem): void {
    this.openRecetaItemDialog(recetaItem);
  }

  async deleteRecetaItem(recetaItemId: number): Promise<void> {
    try {
      this.loading = true;
      await firstValueFrom(this.repositoryService.deleteRecetaItem(recetaItemId));
      this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 3000 });
      this.loadRecetaItems();
    } catch (error) {
      console.error('Error deleting receta item:', error);
      this.snackBar.open('Error al eliminar ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async toggleRecetaItemActive(recetaItem: RecetaItem): Promise<void> {
    try {
      this.loading = true;
      await firstValueFrom(this.repositoryService.updateRecetaItem(recetaItem.id, {
        ...recetaItem,
        activo: !recetaItem.activo
      }));
      this.snackBar.open('Estado actualizado correctamente', 'Cerrar', { duration: 3000 });
      this.loadRecetaItems();
    } catch (error) {
      console.error('Error updating receta item:', error);
      this.snackBar.open('Error al actualizar estado', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getIngredienteName(ingredienteId: number): string {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }
}
