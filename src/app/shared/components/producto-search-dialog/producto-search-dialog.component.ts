import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { Codigo, TipoCodigo } from '../../../database/entities/productos/codigo.entity';
import { firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Presentacion } from 'src/app/database/entities/productos/presentacion.entity';
import { PrecioVenta } from 'src/app/database/entities/productos/precio-venta.entity';

export interface ProductoSearchDialogData {
  searchTerm: string;
  cantidad: number;
}

@Component({
  selector: 'app-producto-search-dialog',
  templateUrl: './producto-search-dialog.component.html',
  styleUrls: ['./producto-search-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatPaginatorModule
  ]
})
export class ProductoSearchDialogComponent implements OnInit {
  // Constants
  readonly DISPLAY_COLUMNS: string[] = ['nombre', 'precio', 'actions'];
  
  // Search form
  searchForm: FormGroup;

  // cantidad form control
  cantidadFormControl = new FormControl(1);
  
  // Loading state
  isLoading = false;
  hasSearched = false;
  
  // Results
  searchResults: Producto[] = [];
  selectedProduct: Producto | null = null;
  selectedPresentacion: Presentacion | null = null;

  // replace cantidad
  willReplace = true;
  
  // Pagination
  totalItems = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  
  constructor(
    private dialogRef: MatDialogRef<ProductoSearchDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProductoSearchDialogData,
    private repositoryService: RepositoryService,
    private fb: FormBuilder
  ) {
    // Initialize form
    this.searchForm = this.fb.group({
      searchTerm: ['']
    });
  }
  
  ngOnInit(): void {
    // Set initial search term if provided
    if (this.data && this.data.searchTerm) {
      if (this.data.cantidad) {
        this.cantidadFormControl.setValue(this.data.cantidad);
      }
      this.searchForm.get('searchTerm')?.setValue(this.data.searchTerm);
      this.performSearch();
    }
    
    // Set up debounced search
    this.searchForm.get('searchTerm')?.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.pageIndex = 0; // Reset to first page on new search
      this.performSearch();
    });
  }
  
  onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.performSearch();
    }
  }
  
  // Handle page events
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.performSearch();
  }
  
  // Perform the search
  async performSearch(): Promise<void> {
    // Get search term and ensure it's a string
    const rawSearchTerm = this.searchForm.get('searchTerm')?.value;
    const searchTerm = (typeof rawSearchTerm === 'string') ? rawSearchTerm.trim() : '';
    
    if (!searchTerm) {
      this.searchResults = [];
      this.totalItems = 0;
      this.hasSearched = true;
      return;
    }
    
    this.isLoading = true;
    this.hasSearched = true;

    try {
      // First try to find by exact code match
      const exactCodeResult = await firstValueFrom(
        this.repositoryService.searchProductosByCode(searchTerm)
      );

      if (exactCodeResult) {
        // extract the principalPrecio from the presentacion
        const principalPrecio = (exactCodeResult.presentacion as any)?.principalPrecio;
        this.dialogRef.close({
          producto: exactCodeResult.product,
          presentacion: exactCodeResult.presentacion,
          cantidad: this.cantidadFormControl.value,
          precioVenta: principalPrecio
        });
        return;
      }

      // Otherwise, do a regular search
      const searchResults = await firstValueFrom(
        this.repositoryService.searchProductos({
          searchTerm: searchTerm,
          page: this.pageIndex + 1, // Convert to 1-based for backend
          pageSize: this.pageSize,
          exactMatch: false
        })
      );
      console.log(searchResults);
      this.searchResults = searchResults.items;
      this.totalItems = searchResults.total;
    } catch (error) {
      console.error('Error searching products:', error);
      this.searchResults = [];
      this.totalItems = 0;
    } finally {
      this.isLoading = false;
    }
  }
  
  get searchTerm(): string {
    return this.searchForm.get('searchTerm')?.value || '';
  }
  
  selectProduct(producto: Producto, presentacion: Presentacion, precioVenta?: PrecioVenta): void {
    console.log(producto, presentacion, precioVenta);
    this.dialogRef.close({
      producto,
      presentacion,
      cantidad: this.cantidadFormControl.value,
      precioVenta
    });
  }
  
  cancel(): void {
    this.dialogRef.close(null);
  }

  onCantidadPress(digit: number): void {
    // this will work as a calculator
    if (this.willReplace) {
      this.cantidadFormControl.setValue(digit);
      this.willReplace = false;
    } else {
      // we need to sum the digit to the current value and replace the current value
      this.cantidadFormControl.setValue((this.cantidadFormControl.value || 0) + digit);
    }
  }

  onClearPress(): void {
    this.cantidadFormControl.setValue(0);
    this.willReplace = true;
  }
} 