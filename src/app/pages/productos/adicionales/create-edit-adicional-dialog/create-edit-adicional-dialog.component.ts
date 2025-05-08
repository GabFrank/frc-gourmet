import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RepositoryService } from '../../../../database/repository.service';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { Ingrediente } from '../../../../database/entities/productos/ingrediente.entity';
import { Receta } from '../../../../database/entities/productos/receta.entity';
import { Subscription, forkJoin, Observable, of, debounceTime, switchMap, tap, startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { CurrencyInputComponent } from 'src/app/shared/components/currency-input/currency-input.component';

interface FilterParams {
  nombre?: string;
  ingredienteId?: number;
  recetaId?: number;
  activo?: boolean;
  pageIndex: number;
  pageSize: number;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatPaginatorModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatCardModule,
    MatTabsModule,
    MatAutocompleteModule,
    CurrencyInputComponent
  ],
  selector: 'app-create-edit-adicional-dialog',
  templateUrl: './create-edit-adicional-dialog.component.html',
  styleUrls: ['./create-edit-adicional-dialog.component.scss']
})
export class CreateEditAdicionalDialogComponent implements OnInit, OnDestroy {
  // Forms
  adicionalForm: FormGroup;
  filterForm: FormGroup;
  
  // Autocomplete search controls
  ingredienteSearchCtrl = new FormControl('');
  recetaSearchCtrl = new FormControl('');
  
  // Filtered options for autocomplete
  filteredIngredientes: Observable<Ingrediente[]>;
  filteredRecetas: Observable<Receta[]>;

  // Data
  adicionales: Adicional[] = [];
  ingredientes: Ingrediente[] = [];
  recetas: Receta[] = [];
  totalItems = 0;

  // Pagination
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50];

  // moneda principal
  monedaPrincipal: Moneda = new Moneda();

  // igrediente or receta formcontrols, only one can be true at a time
  isIngrediente = new FormControl(true);
  isReceta = new FormControl(false);
  // Table
  displayedColumns: string[] = ['nombre', 'ingrediente', 'receta', 'precioVentaUnitario', 'activo', 'actions'];
  
  // State
  isEditMode = false;
  isLoading = false;
  isSearchingIngredientes = false;
  isSearchingRecetas = false;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditAdicionalDialogComponent>,
    private repository: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.adicionalForm = this.fb.group({
      id: [null],
      nombre: ['', Validators.required],
      ingredienteId: [null],
      recetaId: [null],
      precioVentaUnitario: [0, [Validators.required, Validators.min(0)]],
      activo: [true]
    });

    this.filterForm = this.fb.group({
      nombreFilter: [''],
      ingredienteFilter: [null],
      recetaFilter: [null],
      activoFilter: [null]
    });
    
    // Initialize the autocomplete observables
    this.filteredIngredientes = this.ingredienteSearchCtrl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      tap(() => this.isSearchingIngredientes = true),
      switchMap(value => {
        if (typeof value === 'string') {
          return this.searchIngredientes(value);
        } else {
          return of(this.ingredientes);
        }
      }),
      tap(() => this.isSearchingIngredientes = false)
    );
    
    this.filteredRecetas = this.recetaSearchCtrl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      tap(() => this.isSearchingRecetas = true),
      switchMap(value => {
        if (typeof value === 'string') {
          return this.searchRecetas(value);
        } else {
          return of(this.recetas);
        }
      }),
      tap(() => this.isSearchingRecetas = false)
    );

    this.subscriptions.add(this.isIngrediente.valueChanges.subscribe(value => {
      if (value) {
        this.isReceta.setValue(false);
      }
    }));

    this.subscriptions.add(this.isReceta.valueChanges.subscribe(value => {
      if (value) {
        this.isIngrediente.setValue(false);
      }
    }));
    
    this.loadMonedaPrincipal();
  }

  ngOnInit(): void {
    this.loadData();
    
    // Update selected ingrediente/receta display when form values change
    this.adicionalForm.get('ingredienteId')?.valueChanges.subscribe(id => {
      if (id) {
        const ingrediente = this.ingredientes.find(i => i.id === id);
        if (ingrediente) {
          this.ingredienteSearchCtrl.setValue(ingrediente.descripcion, { emitEvent: false });
        }
      }
    });
    
    this.adicionalForm.get('recetaId')?.valueChanges.subscribe(id => {
      if (id) {
        const receta = this.recetas.find(r => r.id === id);
        if (receta) {
          this.recetaSearchCtrl.setValue(receta.nombre, { emitEvent: false });
        }
      }
    });
  }

  loadMonedaPrincipal(): void {
    this.repository.getMonedaPrincipal().subscribe(moneda => {
      this.monedaPrincipal = moneda;
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadData(): void {
    this.isLoading = true;
    
    // Load ingredientes and recetas for dropdowns
    const loadSubcription = forkJoin({
      ingredientes: this.repository.getIngredientes(),
      recetas: this.repository.getRecetas()
    }).subscribe({
      next: (result: any) => {
        this.ingredientes = result.ingredientes;
        this.recetas = result.recetas;
        this.loadAdicionales();
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError('Error al cargar datos de referencia');
        console.error('Error loading reference data:', error);
      }
    });
    
    this.subscriptions.add(loadSubcription);
  }

  loadAdicionales(): void {
    this.isLoading = true;
    
    // Create filter object from the filter form
    const filters: FilterParams = {
      pageIndex: this.pageIndex,
      pageSize: this.pageSize
    };
    
    // Add filter values if they exist
    const nombreFilter = this.filterForm.get('nombreFilter')?.value;
    if (nombreFilter) {
      filters.nombre = nombreFilter;
    }
    
    const ingredienteFilter = this.filterForm.get('ingredienteFilter')?.value;
    if (ingredienteFilter !== null) {
      filters.ingredienteId = ingredienteFilter;
    }
    
    const recetaFilter = this.filterForm.get('recetaFilter')?.value;
    if (recetaFilter !== null) {
      filters.recetaId = recetaFilter;
    }
    
    const activoFilter = this.filterForm.get('activoFilter')?.value;
    if (activoFilter !== null) {
      filters.activo = activoFilter;
    }
    
    // Get filtered adicionales from repository
    const subscription = this.repository.getAdicionalesFiltered(filters).subscribe({
      next: (result: any) => {
        this.adicionales = result.items;
        this.totalItems = result.total;
        this.isLoading = false;
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError('Error al cargar adicionales');
        console.error('Error loading adicionales:', error);
      }
    });
    
    this.subscriptions.add(subscription);
  }

  applyFilter(): void {
    this.pageIndex = 0; // Reset to first page when filtering
    this.loadAdicionales();
  }

  resetFilters(): void {
    this.filterForm.reset({
      nombreFilter: '',
      ingredienteFilter: null,
      recetaFilter: null,
      activoFilter: null
    });
    this.pageIndex = 0;
    this.loadAdicionales();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadAdicionales();
  }

  editAdicional(adicional: Adicional): void {
    this.isLoading = true;
    
    // Get full details of the adicional for editing
    const subscription = this.repository.getAdicional(adicional.id).subscribe({
      next: (result: Adicional) => {
        this.isEditMode = true;
        this.adicionalForm.patchValue({
          id: result.id,
          nombre: result.nombre,
          ingredienteId: result.ingredienteId,
          recetaId: result.recetaId,
          precioVentaUnitario: result.precioVentaUnitario,
          activo: result.activo
        });
        this.isLoading = false;
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError('Error al cargar detalles del adicional');
        console.error('Error loading adicional details:', error);
      }
    });
    
    this.subscriptions.add(subscription);
  }

  saveAdicional(): void {
    if (this.adicionalForm.invalid) {
      return;
    }
    
    this.isLoading = true;
    const adicional = this.adicionalForm.value as Adicional;
    
    const saveOperation = this.isEditMode
      ? this.repository.updateAdicional(adicional.id, adicional)
      : this.repository.createAdicional(adicional);
      
    const subscription = saveOperation.subscribe({
      next: () => {
        this.showSuccess(this.isEditMode ? 'Adicional actualizado correctamente' : 'Adicional creado correctamente');
        this.resetForm();
        this.loadAdicionales();
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError(this.isEditMode ? 'Error al actualizar adicional' : 'Error al crear adicional');
        console.error('Error saving adicional:', error);
      }
    });
    
    this.subscriptions.add(subscription);
  }

  resetForm(): void {
    this.isEditMode = false;
    this.adicionalForm.reset({
      id: null,
      nombre: '',
      ingredienteId: null,
      recetaId: null,
      precioVentaUnitario: 0,
      activo: true
    });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  // Search functions for the autocomplete
  searchIngredientes(query: string): Observable<Ingrediente[]> {
    if (!query || query.trim() === '') {
      return of(this.ingredientes);
    }
    
    // Use the existing searchIngredientesByDescripcion method
    return this.repository.searchIngredientesByDescripcion(query);
  }
  
  searchRecetas(query: string): Observable<Receta[]> {
    if (!query || query.trim() === '') {
      return of(this.recetas);
    }
    
    // Fallback to local filtering since there doesn't seem to be a server-side search for recetas
    console.info('Using local filtering for recetas search');
    const filteredResults = this.recetas.filter(r => {
      const searchText = r.nombre?.toLowerCase() || '';
      return searchText.includes(query.toLowerCase());
    });
    return of(filteredResults);
  }
  
  // Display functions for the autocomplete
  displayIngrediente(ingrediente: Ingrediente): string {
    if (!ingrediente) return '';
    return typeof ingrediente === 'object' ? ingrediente.descripcion || '' : String(ingrediente);
  }
  
  displayReceta(receta: Receta): string {
    if (!receta) return '';
    
    // Access properties safely checking if they exist on the object
    if (typeof receta === 'object') {
      // Use a property that's known to exist on Receta objects
      return receta.nombre || '';
    }
    return String(receta);
  }
  
  // Selection handlers
  selectIngrediente(event: any): void {
    const ingrediente = event.option.value as Ingrediente;
    this.adicionalForm.patchValue({ ingredienteId: ingrediente.id });
  }
  
  selectReceta(event: any): void {
    const receta = event.option.value as Receta;
    this.adicionalForm.patchValue({ recetaId: receta.id });
  }
} 