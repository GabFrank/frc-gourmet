import { Component, OnInit, OnDestroy, Inject, Optional } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../../database/repository.service';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { Ingrediente } from '../../../../database/entities/productos/ingrediente.entity';
import { Receta } from '../../../../database/entities/productos/receta.entity';
import { Subscription, forkJoin, Observable, of, debounceTime, switchMap, tap, startWith, catchError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { CurrencyInputComponent } from 'src/app/shared/components/currency-input/currency-input.component';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
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
  
  // Autocomplete search controls
  ingredienteSearchCtrl = new FormControl('');
  recetaSearchCtrl = new FormControl('');
  
  // Filtered options for autocomplete
  filteredIngredientes: Observable<Ingrediente[]>;
  // filteredRecetas: Observable<Receta[]>;

  // Data
  ingredientes: Ingrediente[] = [];
  recetas: Receta[] = [];

  // moneda principal
  monedaPrincipal: Moneda = new Moneda();

  // igrediente or receta formcontrols, only one can be true at a time
  isIngrediente = new FormControl(true);
  isReceta = new FormControl(false);
  
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
    private snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: { adicionalId?: number }
  ) {
    this.adicionalForm = this.fb.group({
      id: [null],
      nombre: ['', Validators.required],
      ingredienteId: [null],
      recetaId: [null],
      precioVentaUnitario: [0, [Validators.required, Validators.min(0)]],
      activo: [true]
    });
    
    // Very simple implementation to prevent initial search
    this.filteredIngredientes = this.ingredienteSearchCtrl.valueChanges.pipe(
      debounceTime(300),
      switchMap(value => {
        // Start loading
        this.isSearchingIngredientes = true;
        
        if (typeof value === 'string' && value.length >= 2) {
          // Perform search only if there's text input with at least 2 chars
          return this.repository.searchIngredientesByDescripcion(value)
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
    
    // this.filteredRecetas = this.recetaSearchCtrl.valueChanges.pipe(
    //   startWith(''),
    //   debounceTime(300),
    //   tap(() => this.isSearchingRecetas = true),
    //   switchMap(value => {
    //     if (typeof value === 'string') {
    //       return this.searchRecetas(value);
    //     } else {
    //       return of(this.recetas);
    //     }
    //   }),
    //   tap(() => this.isSearchingRecetas = false)
    // );

    // this.subscriptions.add(this.isIngrediente.valueChanges.subscribe(value => {
    //   if (value) {
    //     this.isReceta.setValue(false);
    //   }
    // }));

    // this.subscriptions.add(this.isReceta.valueChanges.subscribe(value => {
    //   if (value) {
    //     this.isIngrediente.setValue(false);
    //   }
    // }));
    
    this.loadMonedaPrincipal();
  }

  ngOnInit(): void {    
    // Update selected ingrediente/receta display when form values change
    this.adicionalForm.get('ingredienteId')?.valueChanges.subscribe(id => {
      if (id) {
        const ingrediente = this.ingredientes.find(i => i.id === id);
        if (ingrediente) {
          this.ingredienteSearchCtrl.setValue(ingrediente.descripcion, { emitEvent: false });
        }
      }
    });
    
    // Check if we're in edit mode
    if (this.data && this.data.adicionalId) {
      this.loadAdicional(this.data.adicionalId);
    }
  }

  loadMonedaPrincipal(): void {
    this.repository.getMonedaPrincipal().subscribe(moneda => {
      this.monedaPrincipal = moneda;
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadAdicional(id: number): void {
    this.isLoading = true;
    
    // Get full details of the adicional for editing
    const subscription = this.repository.getAdicional(id).subscribe({
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
        
        // Set the correct radio button
        if (result.ingredienteId) {
          this.isIngrediente.setValue(true);
          this.isReceta.setValue(false);

          //search for the ingrediente in database
          this.repository.getIngrediente(result.ingredienteId).subscribe(ingrediente => {
            this.ingredienteSearchCtrl.setValue(ingrediente.descripcion, { emitEvent: false });
          });
        } 
        
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
    // set nombre to uppercase
    this.adicionalForm.get('nombre')?.setValue(this.adicionalForm.get('nombre')?.value.toUpperCase());
    const adicional = this.adicionalForm.value as Adicional;
    
    const saveOperation = this.isEditMode
      ? this.repository.updateAdicional(adicional.id, adicional)
      : this.repository.createAdicional(adicional);
      
    const subscription = saveOperation.subscribe({
      next: () => {
        this.showSuccess(this.isEditMode ? 'Adicional actualizado correctamente' : 'Adicional creado correctamente');
        this.dialogRef.close(true);
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError(this.isEditMode ? 'Error al actualizar adicional' : 'Error al crear adicional');
        console.error('Error saving adicional:', error);
      }
    });
    
    this.subscriptions.add(subscription);
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