import { AfterViewInit, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormGroup, FormBuilder } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RepositoryService } from '../../../../database/repository.service';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { Subcategoria } from '../../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../../database/entities/productos/categoria.entity';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../../services/tabs.service';
import { CreateEditProductoComponent } from '../create-edit-producto/create-edit-producto.component';

@Component({
  selector: 'app-list-productos',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    ConfirmationDialogComponent
  ],
  templateUrl: './list-productos.component.html',
  styleUrls: ['./list-productos.component.scss']
})
export class ListProductosComponent implements OnInit {
  productos: Producto[] = [];
  categorias: Categoria[] = [];
  subcategorias: Subcategoria[] = [];
  displayedColumns: string[] = ['id', 'nombre', 'subcategoria', 'precio', 'stock', 'activo', 'acciones'];
  isLoading = false;

  // Pagination
  totalProductos = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];

  // Filtering
  filterForm: FormGroup;

  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      categoriaId: [''],
      subcategoriaId: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadCategorias();
    this.loadProductos();

    // When categoria changes, load subcategorias
    this.filterForm.get('categoriaId')?.valueChanges.subscribe((categoriaId) => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
      } else {
        this.subcategorias = [];
        this.filterForm.get('subcategoriaId')?.setValue('');
      }
    });
  }

  /**
   * Opens a specific product in edit mode by its ID
   */
  private async openProductWithId(id: number): Promise<void> {
    try {
      const producto = await firstValueFrom(this.repositoryService.getProducto(id));
      if (producto) {
        this.tabsService.openTabWithData(
          `Editar Producto: ${producto.nombre}`,
          CreateEditProductoComponent,
          { producto: producto }
        );
      } else {
        console.error(`Product with ID ${id} not found`);
      }
    } catch (error) {
      console.error(`Error loading product with ID ${id}:`, error);
    }
  }

  async loadCategorias(): Promise<void> {
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getCategorias());
    } catch (error) {
      console.error('Error loading categorias:', error);
      this.snackBar.open('Error al cargar categorías', 'Cerrar', {
        duration: 3000
      });
    }
  }

  async loadSubcategoriasByCategoria(categoriaId: number): Promise<void> {
    try {
      this.subcategorias = await firstValueFrom(this.repositoryService.getSubcategoriasByCategoria(categoriaId));
    } catch (error) {
      console.error('Error loading subcategorias:', error);
      this.snackBar.open('Error al cargar subcategorías', 'Cerrar', {
        duration: 3000
      });
    }
  }

  async loadProductos(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        nombre?: string,
        categoriaId?: number,
        subcategoriaId?: number,
        activo?: boolean
      } = {
        nombre: this.filterForm.get('nombre')?.value?.trim() || undefined,
        categoriaId: this.filterForm.get('categoriaId')?.value || undefined,
        subcategoriaId: this.filterForm.get('subcategoriaId')?.value || undefined,
        activo: this.filterForm.get('activo')?.value === 'true' ? true :
                this.filterForm.get('activo')?.value === 'false' ? false : undefined
      };

      // Filter out empty/null/undefined values
      Object.keys(filters).forEach(key => {
        const k = key as keyof typeof filters;
        if (filters[k] === '' || filters[k] === null || filters[k] === undefined) {
          delete filters[k];
        }
      });

      // Get all productos
      const result = await firstValueFrom(this.repositoryService.getProductos());
      this.productos = result;

      // Apply filters manually
      if (Object.keys(filters).length > 0) {
        this.productos = this.productos.filter(producto => {
          let matches = true;

          if (filters.nombre && producto.nombre) {
            matches = matches && producto.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
          }

          if (filters.subcategoriaId) {
            matches = matches && producto.subcategoriaId === filters.subcategoriaId;
          } else if (filters.categoriaId && producto.subcategoria?.categoria) {
            matches = matches && producto.subcategoria.categoriaId === filters.categoriaId;
          }

          if (filters.activo !== undefined) {
            matches = matches && producto.activo === filters.activo;
          }

          return matches;
        });
      }

      // Sort by nombre
      this.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));

      this.totalProductos = this.productos.length;

    } catch (error) {
      console.error('Error loading productos:', error);
      this.snackBar.open('Error al cargar productos', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }

  onSort(sortState: Sort): void {
    // if (!sortState.active || sortState.direction === '') {
    //   return;
    // }

    // this.productos = this.productos.sort((a, b) => {
    //   const isAsc = sortState.direction === 'asc';
    //   switch (sortState.active) {
    //     case 'nombre': return this.compare(a.nombre || '', b.nombre || '', isAsc);
    //     case 'subcategoria':
    //       const subcatA = a.subcategoria?.nombre || '';
    //       const subcatB = b.subcategoria?.nombre || '';
    //       return this.compare(subcatA, subcatB, isAsc);
    //     case 'precio': return this.compare(a.precio || 0, b.precio || 0, isAsc);
    //     case 'stock': return this.compare(a.stock || 0, b.stock || 0, isAsc);
    //     case 'activo': return this.compare(a.activo || false, b.activo || false, isAsc);
    //     default: return 0;
    //   }
    // });
  }

  compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      nombre: '',
      categoriaId: '',
      subcategoriaId: '',
      activo: ''
    });

    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadProductos();
  }

  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadProductos();
  }

  editProducto(producto: Producto): void {
    // Open the edit producto component in a tab
    this.tabsService.openTabWithData(
      `Editar Producto: ${producto.nombre}`,
      CreateEditProductoComponent,
      { producto: producto }
    );

    // Update this component when the tab container calls back
    const tabContainerSubscription = this.tabsService.tabs$.subscribe(() => {
      // Only reload if this component is visible (active tab)
      const currentTabs = this.tabsService.getCurrentTabs();
      const activeTabId = this.tabsService.getActiveTabId();
      const activeTab = currentTabs.find(tab => tab.id === activeTabId);

      if (activeTab?.componentType === ListProductosComponent) {
        this.loadProductos();
        // Unsubscribe after one update to avoid memory leaks
        tabContainerSubscription.unsubscribe();
      }
    });
  }

  deleteProducto(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar Eliminación',
        message: '¿Está seguro de que desea eliminar este producto?'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;

        firstValueFrom(this.repositoryService.deleteProducto(id))
          .then((response) => {
            this.isLoading = false;
            if (response?.deleted) {
              this.snackBar.open('Producto eliminado correctamente', 'Cerrar', {
                duration: 3000
              });
            } else {
              this.snackBar.open('Producto marcado como inactivo', 'Cerrar', {
                duration: 3000
              });
            }
            this.loadProductos();
          })
          .catch((error) => {
            console.error('Error deleting producto:', error);

            // Check if error is due to database restrictions
            const errorMessage = error?.message || '';
            const hasRestrictions =
              errorMessage.includes('restricciones') ||
              errorMessage.includes('constraint') ||
              errorMessage.includes('restrict') ||
              errorMessage.includes('reference') ||
              errorMessage.includes('FOREIGN KEY');

            if (hasRestrictions) {
              this.snackBar.open(
                'No se puede eliminar el producto debido a restricciones en la base de datos. Se establecerá como inactivo.',
                'Cerrar',
                { duration: 5000 }
              );

              // Set product as inactive instead - this is now handled by the backend
              // Just reload the list to show updated status
              this.loadProductos();
              this.isLoading = false;
            } else {
              // Other error
              this.snackBar.open('Error al eliminar producto: ' + (error?.message || 'Error desconocido'), 'Cerrar', { duration: 3000 });
              this.isLoading = false;
            }
          });
      }
    });
  }

  addProducto(): void {
    // Open the create producto component in a tab
    this.tabsService.openTabWithData(
      'Nuevo Producto',
      CreateEditProductoComponent,
      { producto: null }
    );

    // Update this component when the tab container calls back
    const tabContainerSubscription = this.tabsService.tabs$.subscribe(() => {
      // Only reload if this component is visible (active tab)
      const currentTabs = this.tabsService.getCurrentTabs();
      const activeTabId = this.tabsService.getActiveTabId();
      const activeTab = currentTabs.find(tab => tab.id === activeTabId);

      if (activeTab?.componentType === ListProductosComponent) {
        this.loadProductos();
        // Unsubscribe after one update to avoid memory leaks
        tabContainerSubscription.unsubscribe();
      }
    });
  }

  // Helper method to get the full path of a producto
  getProductPath(producto: Producto): string {
    const categoria = producto.subcategoria?.categoria?.nombre || 'Sin categoría';
    const subcategoria = producto.subcategoria?.nombre || 'Sin subcategoría';
    return `${categoria} > ${subcategoria}`;
  }

}
