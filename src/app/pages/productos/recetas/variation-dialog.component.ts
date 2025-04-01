import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../../database/entities/productos/receta-variacion-item.entity';
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';

interface IngredienteWithCosto extends Ingrediente {
  totalCosto?: number;
}

interface DialogData {
  variacion: RecetaVariacion;
  ingredientes: Ingrediente[];
  variacionItems: RecetaVariacionItem[];
}

@Component({
  selector: 'app-variation-dialog',
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
    MatTableModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule
  ],
  providers: [
    FormBuilder
  ],
  templateUrl: './variation-dialog.component.html',
  styleUrls: ['./variation-dialog.component.scss']
})
export class VariationDialogComponent implements OnInit {
  variationForm: FormGroup;
  items: RecetaVariacionItem[] = [];
  allIngredientes: Ingrediente[] = [];
  loading = false;
  displayedColumns: string[] = ['ingrediente', 'cantidad', 'costo', 'activo', 'acciones'];
  defaultMonedaSimbolo: string = '$';
  totalCost: number = 0;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<VariationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.variationForm = this.fb.group({
      nombre: [data.variacion.nombre, Validators.required],
      descripcion: [data.variacion.descripcion || ''],
      activo: [data.variacion.activo],
      principal: [data.variacion.principal || false]
    });

    this.items = [...data.variacionItems];
    this.allIngredientes = [...data.ingredientes];
  }

  ngOnInit(): void {
    this.calculateTotalCost();
    this.loadAllIngredientes();
  }

  private async loadAllIngredientes(): Promise<void> {
    try {
      // Only load all ingredients if the provided list is empty
      if (this.allIngredientes.length === 0) {
        this.loading = true;
        const ingredientes = await firstValueFrom(this.repositoryService.getIngredientes());
        this.allIngredientes = ingredientes.filter(i => i.activo);
      }
    } catch (error) {
      console.error('Error loading ingredientes:', error);
      this.snackBar.open('Error al cargar ingredientes', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getIngredienteName(ingredienteId: number): string {
    const ingrediente = this.allIngredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }

  getIngredientSimbol(ingredienteId: number): string {
    const ingrediente = this.allIngredientes.find(i => i.id === ingredienteId);
    return ingrediente?.moneda?.simbolo || this.defaultMonedaSimbolo;
  }

  getIngredientTotalCost(item: RecetaVariacionItem): number {
    const ingrediente = this.allIngredientes.find(i => i.id === item.ingredienteId);
    return ingrediente ? (ingrediente.costo || 0) * item.cantidad : 0;
  }

  calculateTotalCost(): void {
    this.totalCost = this.items.reduce((total, item) => {
      return total + this.getIngredientTotalCost(item);
    }, 0);
  }

  addIngredient(): void {
    this.openIngredientDialog();
  }

  editIngredient(item: RecetaVariacionItem): void {
    this.openIngredientDialog(item);
  }

  private openIngredientDialog(item?: RecetaVariacionItem): void {
    // We would implement a dialog to add/edit ingredient items
    // For now, we'll just use a simplified approach
    const ingredienteId = prompt('Enter ingredient ID:');
    const cantidad = prompt('Enter quantity:');
    
    if (ingredienteId && cantidad) {
      this.loading = true;
      
      try {
        const id = parseInt(ingredienteId);
        const cant = parseFloat(cantidad);
        
        if (item) {
          // Update existing item - using partial update to avoid type issues
          const updatedItemData = {
            ingredienteId: id,
            cantidad: cant
          };
          
          this.updateIngredient(item.id, updatedItemData);
        } else {
          // Create new item
          const newItem: Partial<RecetaVariacionItem> = {
            variacionId: this.data.variacion.id,
            ingredienteId: id,
            cantidad: cant,
            activo: true
          };
          
          this.createIngredient(newItem);
        }
      } catch (error) {
        console.error('Error processing ingredient:', error);
        this.snackBar.open('Error al procesar ingrediente', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    }
  }

  private async createIngredient(item: Partial<RecetaVariacionItem>): Promise<void> {
    try {
      const newItem = await firstValueFrom(
        this.repositoryService.createRecetaVariacionItem(item)
      );
      this.items.push(newItem);
      this.calculateTotalCost();
      this.snackBar.open('Ingrediente agregado exitosamente', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error creating ingredient:', error);
      this.snackBar.open('Error al crear ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private async updateIngredient(itemId: number, updateData: Partial<RecetaVariacionItem>): Promise<void> {
    try {
      const updatedItem = await firstValueFrom(
        this.repositoryService.updateRecetaVariacionItem(itemId, updateData)
      );
      
      // Update in the local array
      const index = this.items.findIndex(i => i.id === itemId);
      if (index !== -1) {
        this.items[index] = updatedItem;
      }
      
      this.calculateTotalCost();
      this.snackBar.open('Ingrediente actualizado exitosamente', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error updating ingredient:', error);
      this.snackBar.open('Error al actualizar ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async toggleIngredientActive(item: RecetaVariacionItem): Promise<void> {
    try {
      this.loading = true;
      const updatedItem = await firstValueFrom(
        this.repositoryService.updateRecetaVariacionItem(item.id, {
          activo: !item.activo
        })
      );
      
      // Update in the local array
      const index = this.items.findIndex(i => i.id === item.id);
      if (index !== -1) {
        this.items[index] = updatedItem;
      }
      
      this.calculateTotalCost();
      this.snackBar.open('Estado actualizado exitosamente', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error toggling active state:', error);
      this.snackBar.open('Error al actualizar estado', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async deleteIngredient(item: RecetaVariacionItem): Promise<void> {
    const confirm = window.confirm(`¿Está seguro que desea eliminar el ingrediente "${this.getIngredienteName(item.ingredienteId)}"?`);
    if (!confirm) return;

    try {
      this.loading = true;
      await firstValueFrom(this.repositoryService.deleteRecetaVariacionItem(item.id));
      
      // Remove from local array
      const index = this.items.findIndex(i => i.id === item.id);
      if (index !== -1) {
        this.items.splice(index, 1);
      }
      
      this.calculateTotalCost();
      this.snackBar.open('Ingrediente eliminado exitosamente', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error deleting ingredient:', error);
      this.snackBar.open('Error al eliminar ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async saveVariation(): Promise<void> {
    if (this.variationForm.invalid) {
      this.variationForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const formValues = this.variationForm.value;
      const updateData: Partial<RecetaVariacion> = {
        nombre: formValues.nombre.toUpperCase(),
        descripcion: formValues.descripcion ? formValues.descripcion.toUpperCase() : null,
        activo: formValues.activo,
        principal: formValues.principal
      };

      let result: RecetaVariacion;

      // Check if we're setting this variation as principal and another one is already principal
      if (formValues.principal && !this.data.variacion.principal) {
        // Get all variations for this recipe to find the current principal
        const allVariations = await firstValueFrom(
          this.repositoryService.getRecetaVariaciones(this.data.variacion.recetaId)
        );
        
        // Find current principal variation
        const currentPrincipal = allVariations.find(v => v.principal && v.id !== this.data.variacion.id);
        
        // If there's a current principal, update it to not be principal
        if (currentPrincipal) {
          await firstValueFrom(
            this.repositoryService.updateRecetaVariacion(currentPrincipal.id, { principal: false })
          );
        }
      }

      // Check if this is a new variation or an update
      if (this.data.variacion.id === 0) {
        // Creating a new variation
        const newVariationData: Partial<RecetaVariacion> = {
          ...updateData,
          recetaId: this.data.variacion.recetaId,
          costo: this.totalCost
        };
        
        result = await firstValueFrom(this.repositoryService.createRecetaVariacion(newVariationData));
      } else {
        // Updating existing variation
        updateData.costo = this.totalCost;
        result = await firstValueFrom(this.repositoryService.updateRecetaVariacion(this.data.variacion.id, updateData));
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving variation:', error);
      this.snackBar.open('Error al guardar la variación', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }
} 