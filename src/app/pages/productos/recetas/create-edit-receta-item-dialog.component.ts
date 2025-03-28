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
import { RepositoryService } from '../../../database/repository.service';
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, of } from 'rxjs';
import { map, startWith, switchMap, debounceTime, catchError } from 'rxjs/operators';

interface DialogData {
  recetaId: number;
  recetaItem?: RecetaItem;
  editMode: boolean;
  ingredientes: Ingrediente[];
}

interface IngredienteViewModel {
  id: number;
  descripcion: string;
  tipoMedida: TipoMedida;
  displayText: string;  // For display in the input when selected
  optionText: string;   // Name with ID for option display
  medidaText: string;   // Formatted measurement type
}

@Component({
  selector: 'app-create-edit-receta-item-dialog',
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
    MatAutocompleteModule
  ],
  templateUrl: './create-edit-receta-item-dialog.component.html',
  styleUrls: ['./create-edit-receta-item-dialog.component.scss']
})
export class CreateEditRecetaItemDialogComponent implements OnInit {
  recetaItemForm: FormGroup;
  loading = false;
  filteredIngredientes: Observable<IngredienteViewModel[]>;
  selectedIngrediente: IngredienteViewModel | null = null;
  unidadSuffix = '';
  searchLoading = false;

  // Map measurement types to display text
  private tipoMedidaMap: Record<string, string> = {
    'UNIDAD': 'Unidad',
    'GRAMO': 'Gramo',
    'MILILITRO': 'Mililitro',
    'PAQUETE': 'Paquete'
  };

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaItemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.recetaItemForm = this.fb.group({
      ingredienteId: ['', Validators.required],
      ingredienteSearch: ['', Validators.required],
      cantidad: [0, [Validators.required, Validators.min(0.01)]],
      activo: [true]
    });

    // Initialize filtered ingredients observable with server-side search
    this.filteredIngredientes = this.recetaItemForm.get('ingredienteSearch')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
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
    if (this.data.editMode && this.data.recetaItem) {
      const ingrediente = this.data.ingredientes.find(i => i.id === this.data.recetaItem?.ingredienteId);

      if (ingrediente) {
        this.selectedIngrediente = this.transformIngrediente(ingrediente);
        this.unidadSuffix = this.selectedIngrediente.medidaText;

        this.recetaItemForm.patchValue({
          ingredienteId: this.data.recetaItem.ingredienteId,
          ingredienteSearch: this.selectedIngrediente,
          cantidad: this.data.recetaItem.cantidad,
          activo: this.data.recetaItem.activo
        });
      } else {
        // If we don't have the ingredient data, fetch it
        this.loadIngrediente(this.data.recetaItem.ingredienteId);
      }
    }
  }

  private async loadIngrediente(ingredienteId: number): Promise<void> {
    try {
      this.loading = true;
      const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(ingredienteId));

      if (ingrediente) {
        this.selectedIngrediente = this.transformIngrediente(ingrediente);
        this.unidadSuffix = this.selectedIngrediente.medidaText;

        this.recetaItemForm.patchValue({
          ingredienteId: ingredienteId,
          ingredienteSearch: this.selectedIngrediente,
          cantidad: this.data.recetaItem?.cantidad || 0,
          activo: this.data.recetaItem?.activo !== undefined ? this.data.recetaItem.activo : true
        });
      }
    } catch (error) {
      console.error('Error loading ingrediente:', error);
      this.snackBar.open('Error al cargar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private transformIngredientes(ingredientes: Ingrediente[]): IngredienteViewModel[] {
    return ingredientes.map(ingrediente => this.transformIngrediente(ingrediente));
  }

  private transformIngrediente(ingrediente: Ingrediente): IngredienteViewModel {
    const medidaText = this.tipoMedidaMap[ingrediente.tipoMedida] || ingrediente.tipoMedida;

    return {
      ...ingrediente,
      displayText: `${ingrediente.id} - ${ingrediente.descripcion}`,
      optionText: `${ingrediente.id} - ${ingrediente.descripcion}`,
      medidaText
    };
  }

  displayIngrediente(ingrediente: IngredienteViewModel): string {
    if (!ingrediente) return '';
    return ingrediente.displayText;
  }

  onIngredienteSelected(event: any): void {
    this.selectedIngrediente = event.option.value as IngredienteViewModel;
    this.unidadSuffix = this.selectedIngrediente.medidaText;

    this.recetaItemForm.patchValue({
      ingredienteId: this.selectedIngrediente.id
    });
  }

  async save(): Promise<void> {
    if (this.recetaItemForm.invalid) {
      this.recetaItemForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    try {
      const formValues = this.recetaItemForm.value;

      if (this.data.editMode && this.data.recetaItem) {
        // Update existing receta item
        await firstValueFrom(this.repositoryService.updateRecetaItem(this.data.recetaItem.id, {
          ingredienteId: formValues.ingredienteId,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta item
        await firstValueFrom(this.repositoryService.createRecetaItem({
          recetaId: this.data.recetaId,
          ingredienteId: formValues.ingredienteId,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente agregado correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving receta item:', error);
      this.snackBar.open('Error al guardar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }
}
