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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RecetaVariacion } from '../../../../database/entities/productos/receta-variacion.entity';
import { Ingrediente } from '../../../../database/entities/productos/ingrediente.entity';
import { RepositoryService } from '../../../../database/repository.service';
import { Observable, catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';

export interface VariacionItemDialogData {
  variacion: RecetaVariacion;
  ingredientes: Ingrediente[];
  itemId?: number; // For editing existing item
  ingredienteId?: number; // Pre-selected ingredient
  cantidad?: number; // Pre-filled quantity
}

// Interface for the transformed ingredient with display properties
interface IngredienteViewModel {
  id: number;
  descripcion: string;
  tipoMedida: string;
  costo: number;
  isProduccion: boolean;
  activo: boolean;
  displayText: string;  // For display in the input when selected
  optionText: string;   // Name with ID for option display
}

@Component({
  selector: 'app-create-edit-receta-variacion-item',
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
    MatAutocompleteModule,
    MatSnackBarModule
  ],
  templateUrl: './create-edit-receta-variacion-item.component.html',
  styleUrls: ['./create-edit-receta-variacion-item.component.scss']
})
export class CreateEditRecetaVariacionItemComponent implements OnInit {
  itemForm: FormGroup;
  isEditing = false;
  loading = false;
  searchLoading = false;
  selectedIngrediente: IngredienteViewModel | null = null;
  filteredIngredientes: Observable<IngredienteViewModel[]>;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaVariacionItemComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VariacionItemDialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    // Check if we're editing by examining if itemId is provided
    this.isEditing = !!data.itemId;

    // Initialize the form with data if available
    this.itemForm = this.fb.group({
      ingredienteId: [data.ingredienteId || '', Validators.required],
      ingredienteSearch: [''],
      cantidad: [data.cantidad || 1, [Validators.required, Validators.min(0.01)]],
      porcentajeAprovechamiento: [100, [Validators.required, Validators.min(0), Validators.max(100)]]
    });

    // Set up autocomplete filtering
    this.filteredIngredientes = this.itemForm.get('ingredienteSearch')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        // If value is already an object (selected ingredient), don't search again
        if (typeof value === 'object' && value !== null) {
          return of([value as IngredienteViewModel]);
        }

        // If the value is empty or start typing, search server-side
        const searchText = value || '';
        this.searchLoading = true;

        return this.repositoryService.searchIngredientesByDescripcion(searchText).pipe(
          map(results => {
            this.searchLoading = false;
            return this.transformIngredientes(results);
          }),
          catchError(error => {
            this.searchLoading = false;
            console.error('Error searching ingredientes:', error);
            return of([]);
          })
        );
      })
    );
  }

  ngOnInit(): void {
    // If editing, load the selected ingredient
    if (this.isEditing && this.data.ingredienteId) {
      this.loadIngrediente(this.data.ingredienteId);
    }

    // Subscribe to changes in the selected ingredient
    this.itemForm.get('ingredienteId')?.valueChanges.subscribe(() => {
      // This will trigger change detection which will update the label
      // No need to explicitly do anything here
    });
  }

  private async loadIngrediente(ingredienteId: number): Promise<void> {
    try {
      this.loading = true;
      const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(ingredienteId));

      if (ingrediente) {
        this.selectedIngrediente = this.transformIngrediente(ingrediente);
        this.itemForm.patchValue({
          ingredienteSearch: this.selectedIngrediente
        });
      }
    } catch (error) {
      console.error('Error loading ingrediente:', error);
      this.snackBar.open('Error al cargar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getSelectedIngredientTipoMedida(): string {
    if (this.selectedIngrediente) {
      return this.selectedIngrediente.tipoMedida;
    }

    const ingredienteId = this.itemForm?.get('ingredienteId')?.value;
    if (!ingredienteId) return '';

    const ingrediente = this.data.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.tipoMedida : '';
  }

  // Transform a list of ingredients to include display properties
  private transformIngredientes(ingredientes: Ingrediente[]): IngredienteViewModel[] {
    return ingredientes.map(ingrediente => this.transformIngrediente(ingrediente));
  }

  // Transform a single ingredient to include display properties
  private transformIngrediente(ingrediente: Ingrediente): IngredienteViewModel {
    return {
      id: ingrediente.id,
      descripcion: ingrediente.descripcion,
      tipoMedida: ingrediente.tipoMedida,
      costo: ingrediente.costo,
      isProduccion: ingrediente.isProduccion,
      activo: ingrediente.activo,
      displayText: `${ingrediente.descripcion} (${ingrediente.tipoMedida})`,
      optionText: `${ingrediente.id} - ${ingrediente.descripcion}`
    };
  }

  // Display function for the autocomplete
  displayIngrediente(ingrediente: IngredienteViewModel): string {
    if (!ingrediente) return '';
    return ingrediente.displayText;
  }

  // Handle selection from autocomplete
  onIngredienteSelected(event: any): void {
    this.selectedIngrediente = event.option.value as IngredienteViewModel;
    this.itemForm.patchValue({
      ingredienteId: this.selectedIngrediente.id
    });
  }

  save(): void {
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }

    const formValues = this.itemForm.value;

    // Return data with the id if we're editing
    this.dialogRef.close({
      ingredienteId: formValues.ingredienteId,
      cantidad: formValues.cantidad,
      itemId: this.data.itemId, // This will be undefined when creating a new item
      isEditing: this.isEditing
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

}
