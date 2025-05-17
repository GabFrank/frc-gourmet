import { Component, OnInit } from '@angular/core';
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
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { firstValueFrom, Observable, of, Subject } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  tap,
} from 'rxjs/operators';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { Ingrediente } from 'src/app/database/entities/productos/ingrediente.entity';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

// dialog data

@Component({
  selector: 'app-create-edit-adicional-selectable-dialog',
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
    MatPaginatorModule,
    MatAutocompleteModule,
  ],
  templateUrl: './create-edit-adicional-selectable-dialog.component.html',
  styles: [
    `
      .adicionales-container {
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

      .empty-list {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        background-color: #f5f5f5;
        border-radius: 4px;
        margin-top: 16px;
      }

      .empty-list mat-icon {
        font-size: 48px;
        height: 48px;
        width: 48px;
        margin-bottom: 16px;
        color: #757575;
      }

      .empty-list p {
        margin: 0;
        color: #616161;
        text-align: center;
      }

      .empty-list .hint {
        margin-top: 8px;
        font-size: 0.9em;
        color: #9e9e9e;
      }

      .list-section {
        margin: 20px;
      }

      .list-section h4 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 18px;
        font-weight: 500;
      }

      .status-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
      }

      .status-badge.active {
        background-color: #e8f5e9;
        color: #2e7d32;
      }

      .status-badge.inactive {
        background-color: #ffebee;
        color: #c62828;
      }

      .current-adicional {
        background-color: rgba(16, 107, 24, 0.53);
      }

      .selected-row {
        background-color: rgba(76, 175, 80, 0.3);
      }

      .search-container {
        margin-bottom: 16px;
      }

      .action-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }

      .clickable-row {
        cursor: pointer;
      }

      .ingrediente-info {
        color: rgb(136, 136, 136);
        font-size: smaller;
      }

      .details-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        margin-bottom: 20px;
        font-size: smaller;

        .metric-item {
          flex: 1;
          min-width: 150px;
          padding: 12px 16px;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);


          // on dark mode text color is white on light mode text color is black
          .metric-label {
            display: block;
            margin-bottom: 6px;
            color: #8d8d8d;
          }

          .metric-value {
            display: block;
          }
        }
      }

      /* Dark theme styles */
      :host-context(.dark-theme) {
        .empty-list {
          background-color: #424242;
        }

        .empty-list mat-icon {
          color: #bdbdbd;
        }

        .empty-list p {
          color: #e0e0e0;
        }

        .empty-list .hint {
          color: #9e9e9e;
        }

        .status-badge.active {
          background-color: #1b5e20;
          color: #e8f5e9;
        }

        .status-badge.inactive {
          background-color: #b71c1c;
          color: #ffebee;
        }

        .selected-row {
          background-color: rgba(76, 175, 80, 0.5);
        }
      }
    `,
  ],
})
export class CreateEditAdicionalSelectableDialogComponent implements OnInit {
  adicionalForm: FormGroup;
  adicionales: Adicional[] = [];
  isLoading = false;
  isEditing = false;
  currentAdicionalId?: number;
  displayedColumns: string[] = [
    'nombre',
    'cantidadDefault',
    'precioVentaUnitario',
    'activo',
    'acciones',
  ];

  // Pagination and filtering
  searchTerm = '';
  searchTermChanged = new Subject<string>();
  pageSize = 10;
  pageIndex = 0;
  totalAdicionales = 0;

  // Selection
  selectedAdicional: Adicional | null = null;

  // Monedas
  monedas: Moneda[] = [];
  monedaPrincipal: Moneda | null = null;

  // Autocomplete search controls
  ingredienteSearchCtrl = new FormControl('');
  recetaSearchCtrl = new FormControl('');
  selectedIngrediente: Ingrediente | null = null;
  costoRecetaVariacion = 0;

  // Filtered options for autocomplete
  filteredIngredientes: Observable<Ingrediente[]>;
  // filteredRecetas: Observable<Receta[]>;

  // Loading states
  isSearchingIngredientes = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef?: MatDialogRef<CreateEditAdicionalSelectableDialogComponent>
  ) {
    this.adicionalForm = this.fb.group({
      nombre: ['', Validators.required],
      monedaId: [null],
      precioVentaUnitario: [0, [Validators.required, Validators.min(0)]],
      activo: [true],
      ingredienteId: [null, Validators.required],
      cantidadDefault: [1, [Validators.required, Validators.min(0.01)]],
    });

    // Very simple implementation to prevent initial search
    this.filteredIngredientes = this.ingredienteSearchCtrl.valueChanges.pipe(
      debounceTime(300),
      switchMap((value) => {
        // Start loading
        this.isSearchingIngredientes = true;

        if (typeof value === 'string' && value.length >= 2) {
          // Perform search only if there's text input with at least 2 chars
          return this.repositoryService
            .searchIngredientesByDescripcion(value)
            .pipe(
              tap(() => {
                // Stop loading when data arrives
                this.isSearchingIngredientes = false;
              }),
              catchError(() => {
                // Stop loading on error and return empty array
                this.isSearchingIngredientes = false;
                return of([]);
              })
            );
        } else {
          // No search needed, return empty and stop loading
          this.isSearchingIngredientes = false;
          return of([]);
        }
      })
    );

    // Setup search with debounce
    this.searchTermChanged
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.pageIndex = 0; // Reset to first page when search changes
        this.loadAdicionales();
      });
  }

  ngOnInit(): void {
    this.loadAdicionales();
    this.loadMonedas();
  }

  async loadMonedas(): Promise<void> {
    this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
    this.monedaPrincipal =
      this.monedas.find((m) => m.principal) || this.monedas[0];
  }

  onSearchChange(event: any): void {
    this.searchTerm = event.target.value;
    this.searchTermChanged.next(this.searchTerm);
  }

  handlePageEvent(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadAdicionales();
  }

  async loadAdicionales(): Promise<void> {
    this.isLoading = true;
    try {
      const filters = {
        nombre: this.searchTerm ? this.searchTerm : undefined,
        pageIndex: this.pageIndex,
        pageSize: this.pageSize,
      };

      const result = await firstValueFrom(
        this.repositoryService.getAdicionalesFiltered(filters)
      );

      this.adicionales = result.items;
      this.totalAdicionales = result.total;
    } catch (error) {
      console.error('Error loading adicionales:', error);
      this.snackBar.open('Error al cargar los adicionales', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async saveAdicional(): Promise<void> {
    if (this.adicionalForm.invalid){
      //log all invalid fields, erros is null
      console.log(this.adicionalForm);
      this.snackBar.open('Debe completar todos los campos', 'Cerrar', {
        duration: 3000,
      });
      return;
    }

    this.isLoading = true;
    const formValue = this.adicionalForm.value;

    try {
      // Convert string fields to uppercase
      if (formValue.nombre) {
        formValue.nombre = formValue.nombre.toUpperCase();
      }

      if (this.isEditing && this.currentAdicionalId) {
        // Update existing adicional
        const result = await firstValueFrom(
          this.repositoryService.updateAdicional(this.currentAdicionalId, {
            ...formValue,
          })
        );

        this.snackBar.open('Adicional actualizado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      } else {
        // Create new adicional
        const result = await firstValueFrom(
          this.repositoryService.createAdicional({
            ...formValue,
          })
        );

        this.snackBar.open('Adicional creado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      }

      // Reload adicionales
      this.loadAdicionales();

      // Reset form and editing state
      this.resetForm();
    } catch (error) {
      console.error('Error saving adicional:', error);
      this.snackBar.open('Error al guardar el adicional', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async editAdicional(adicional: Adicional): Promise<void> {
    this.isEditing = true;
    this.currentAdicionalId = adicional.id;

    this.adicionalForm.patchValue({
      nombre: adicional.nombre,
      precioVentaUnitario: adicional.precioVentaUnitario,
      activo: adicional.activo,
      ingredienteId: adicional.ingredienteId,
      cantidadDefault: adicional.cantidadDefault,
    });
    // select the ingrediente
    if (adicional.ingrediente) {
      this.selectedIngrediente = adicional.ingrediente;
      this.ingredienteSearchCtrl.setValue(this.displayIngrediente(adicional.ingrediente));
      if (adicional.ingrediente.variacionId) {
        this.costoRecetaVariacion = await firstValueFrom(
          this.repositoryService.getRecetaVariacionCosto(adicional.ingrediente.variacionId)
        );
      }
    }
  }

  async deleteAdicional(adicional: Adicional): Promise<void> {
    if (
      !confirm(
        `¿Está seguro que desea eliminar el adicional "${adicional.nombre}"?`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(
        this.repositoryService.deleteAdicional(adicional.id)
      );

      this.snackBar.open('Adicional eliminado exitosamente', 'Cerrar', {
        duration: 3000,
      });

      // Reload adicionales
      this.loadAdicionales();

      // If the deleted adicional was selected, clear selection
      if (
        this.selectedAdicional &&
        this.selectedAdicional.id === adicional.id
      ) {
        this.selectedAdicional = null;
      }
    } catch (error) {
      console.error('Error deleting adicional:', error);
      this.snackBar.open('Error al eliminar el adicional', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentAdicionalId = undefined;
    this.adicionalForm.reset({
      nombre: '',
      precioVentaUnitario: 0,
      activo: true,
    });
  }

  closeDialog(): void {
    this.dialogRef?.close();
  }

  selectAdicional(adicional: Adicional): void {
    if (this.selectedAdicional && this.selectedAdicional.id === adicional.id) {
      // Deselect if already selected
      this.selectedAdicional = null;
    } else {
      this.selectedAdicional = adicional;
    }
  }

  confirmSelection(): void {
    if (this.selectedAdicional) {
      this.dialogRef?.close(this.selectedAdicional);
    } else {
      this.snackBar.open('Debe seleccionar un adicional', 'Cerrar', {
        duration: 3000,
      });
    }
  }

  isSelected(adicional: Adicional): boolean {
    return this.selectedAdicional?.id === adicional.id;
  }

  // Display functions for the autocomplete
  displayIngrediente(ingrediente: Ingrediente): string {
    if (!ingrediente) return '';
    return typeof ingrediente === 'object'
      ? ingrediente.descripcion || ''
      : String(ingrediente);
  }

  // Selection handlers
  async selectIngrediente(event: any): Promise<void> {
    const ingrediente = event.option.value as Ingrediente;
    this.adicionalForm.patchValue({ ingredienteId: ingrediente.id });
    this.selectedIngrediente = ingrediente;
    if (ingrediente.variacionId) {
      console.log('ingrediente.variacionId', ingrediente.variacionId);
      this.costoRecetaVariacion = await firstValueFrom(
        this.repositoryService.getRecetaVariacionCosto(ingrediente.variacionId)
      );
      console.log('costoRecetaVariacion', this.costoRecetaVariacion);
    } else {
      if(ingrediente.monedaId) {
        this.costoRecetaVariacion = await firstValueFrom(
          this.repositoryService.getValorEnMonedaPrincipal(ingrediente.monedaId, ingrediente.costo)
        );
      } else {
        // notification warning
        this.snackBar.open('El ingrediente no tiene una moneda asignada', 'Cerrar', {
          duration: 3000,
        });
      }
    }
  }
}
