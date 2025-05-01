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
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { Codigo, TipoCodigo } from '../../../database/entities/productos/codigo.entity';
import { firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface ProductoSearchDialogData {
  searchTerm: string;
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
    MatProgressSpinnerModule
  ]
})
export class ProductoSearchDialogComponent implements OnInit {
  // Constants
  readonly DISPLAY_COLUMNS: string[] = ['codigo', 'nombre', 'precio', 'actions'];
  
  // Search form
  searchForm: FormGroup;
  
  // Loading state
  isLoading = false;
  hasSearched = false;
  
  // Results
  searchResults: Producto[] = [];
  
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
      this.searchForm.get('searchTerm')?.setValue(this.data.searchTerm);
      this.performSearch();
    }
    
    // Set up debounced search
    this.searchForm.get('searchTerm')?.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.performSearch();
    });
  }
  
  onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.performSearch();
    }
  }
  
  // Perform the search without being called directly from the template
  performSearch(): void {
    const searchTerm = this.searchForm.get('searchTerm')?.value?.trim() || '';
    
    if (!searchTerm) {
      this.searchResults = [];
      this.hasSearched = true;
      return;
    }
    
    this.isLoading = true;
    this.hasSearched = true;
    
    // First search by code (exact match)
    this.searchByCode(searchTerm)
      .then(codeResults => {
        if (codeResults.length > 0) {
          this.searchResults = codeResults;
          this.isLoading = false;
          return null; // Explicitly return null to fix the error
        } else {
          // If no results from code search, search by product name
          return this.searchByProductName(searchTerm);
        }
      })
      .then(nameResults => {
        if (nameResults && nameResults.length > 0) {
          this.searchResults = nameResults;
        }
        this.isLoading = false;
      })
      .catch(error => {
        console.error('Error searching products:', error);
        this.isLoading = false;
      });
  }
  
  private async searchByCode(searchTerm: string): Promise<Producto[]> {
    try {
      // Get all codes matching the search term
      const allCodes = await firstValueFrom(this.repositoryService.getCodigos());
      const matchingCodes = allCodes.filter(
        code => code.codigo.toUpperCase() === searchTerm.toUpperCase() && code.activo
      );
      
      if (matchingCodes.length === 0) {
        return [];
      }
      
      // Get products for each matching presentacion
      const products: Producto[] = [];
      for (const code of matchingCodes) {
        try {
          const presentacion = await firstValueFrom(
            this.repositoryService.getPresentacion(code.presentacionId)
          );
          
          if (presentacion && presentacion.productoId) {
            const producto = await firstValueFrom(
              this.repositoryService.getProducto(presentacion.productoId)
            );
            
            if (producto && producto.activo) {
              // Only add unique products
              if (!products.some(p => p.id === producto.id)) {
                // Add code info to the product for display
                (producto as any).codigo = code.codigo;
                (producto as any).tipoCodigo = code.tipoCodigo;
                (producto as any).presentacionId = presentacion.id;
                products.push(producto);
              }
            }
          }
        } catch (error) {
          console.error('Error getting product for code:', error);
        }
      }
      
      return products;
    } catch (error) {
      console.error('Error searching by code:', error);
      return [];
    }
  }
  
  private async searchByProductName(searchTerm: string): Promise<Producto[]> {
    try {
      const allProducts = await firstValueFrom(this.repositoryService.getProductos());
      
      // Filter active products that contain the search term in the name
      return allProducts.filter(
        product => 
          product.activo && 
          (
            (product.nombre && product.nombre.toUpperCase().includes(searchTerm.toUpperCase())) ||
            (product.nombreAlternativo && product.nombreAlternativo.toUpperCase().includes(searchTerm.toUpperCase()))
          )
      );
    } catch (error) {
      console.error('Error searching by product name:', error);
      return [];
    }
  }
  
  get searchTerm(): string {
    return this.searchForm.get('searchTerm')?.value || '';
  }
  
  selectProduct(product: Producto): void {
    this.dialogRef.close(product);
  }
  
  cancel(): void {
    this.dialogRef.close(null);
  }
} 