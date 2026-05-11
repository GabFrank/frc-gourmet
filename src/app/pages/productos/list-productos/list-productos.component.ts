import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { TabsService } from '../../../services/tabs.service';
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { ProductoTipo } from '../../../database/entities/productos/producto-tipo.enum';
import { GestionarProductoComponent } from '../gestionar-producto/gestionar-producto.component';
import { thumbUrl, resolveAppUrl } from 'src/app/shared/utils/image-url.util';

@Component({
  selector: 'app-list-productos',
  templateUrl: './list-productos.component.html',
  styleUrls: ['./list-productos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSlideToggleModule,
    FormsModule,
  ]
})
export class ListProductosComponent implements OnInit {
  
  // Table properties
  displayedColumns: string[] = ['id', 'nombre', 'tipo', 'subfamilia', 'activo', 'acciones'];
  dataSource = new MatTableDataSource<Producto>([]);
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  
  // Loading state
  loading = false;
  
  // Search and filters
  searchTerm = '';
  searchControl = new FormControl('');
  
  // Filter controls
  tipoFilter = new FormControl('');
  activoFilter = new FormControl('');
  esVendibleFilter = new FormControl('');
  esComprableFilter = new FormControl('');
  controlaStockFilter = new FormControl('');
  esIngredienteFilter = new FormControl('');
  registroCompletoFilter = new FormControl('');
  
  // Filter options
  tipoOptions = Object.values(ProductoTipo);
  activoOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' }
  ];
  booleanOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'true', label: 'Sí' },
    { value: 'false', label: 'No' }
  ];
  
  // Pagination
  currentPage = 0;
  pageSize = 10;
  totalItems = 0;
  
  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService
  ) {}
  
  ngOnInit(): void {
    this.loadProductos();
    this.setupFilterListeners();
  }
  
  // Method used by the tab service to set data
  setData(data: any): void {
    console.log('Setting data for ListProductosComponent:', data);
    // Additional initialization if needed when opened from a tab
  }
  
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  
  setupFilterListeners(): void {
    // Listen to filter changes
    this.searchControl.valueChanges.subscribe(() => this.applyFilters());
    this.tipoFilter.valueChanges.subscribe(() => this.applyFilters());
    this.activoFilter.valueChanges.subscribe(() => this.applyFilters());
    this.esVendibleFilter.valueChanges.subscribe(() => this.applyFilters());
    this.esComprableFilter.valueChanges.subscribe(() => this.applyFilters());
    this.controlaStockFilter.valueChanges.subscribe(() => this.applyFilters());
    this.esIngredienteFilter.valueChanges.subscribe(() => this.applyFilters());
    this.registroCompletoFilter.valueChanges.subscribe(() => this.applyFilters());
  }
  
  loadProductos(): void {
    this.loading = true;
    
    const filters = {
      search: this.searchControl.value || '',
      tipo: this.tipoFilter.value || '',
      activo: this.activoFilter.value || '',
      esVendible: this.esVendibleFilter.value || '',
      esComprable: this.esComprableFilter.value || '',
      controlaStock: this.controlaStockFilter.value || '',
      esIngrediente: this.esIngredienteFilter.value || '',
      registroCompleto: this.registroCompletoFilter.value || '',
      page: this.currentPage,
      pageSize: this.pageSize
    };
    
    this.repositoryService.getProductosWithFilters(filters).subscribe({
      next: (response) => {
        this.dataSource.data = response.items;
        this.totalItems = response.total;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading productos:', error);
        this.snackBar.open('Error al cargar los productos', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }
  
  applyFilters(): void {
    this.currentPage = 0;
    this.loadProductos();
  }
  
  onPageChange(event: any): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadProductos();
  }
  
  clearFilters(): void {
    this.searchControl.setValue('');
    this.tipoFilter.setValue('');
    this.activoFilter.setValue('');
    this.esVendibleFilter.setValue('');
    this.esComprableFilter.setValue('');
    this.controlaStockFilter.setValue('');
    this.esIngredienteFilter.setValue('');
    this.registroCompletoFilter.setValue('');
    this.applyFilters();
  }
  
  createNewProducto(): void {
    this.tabsService.openTab(
      'Nuevo Producto',
      GestionarProductoComponent,
      { mode: 'create' },
      'nuevo-producto-tab'
    );
  }
  
  editProducto(producto: Producto): void {
    this.tabsService.openTab(
      `Editar Producto - ${producto.nombre}`,
      GestionarProductoComponent,
      { mode: 'edit', productoId: producto.id },
      `editar-producto-${producto.id}-tab`
    );
  }
  
  deleteProducto(producto: Producto): void {
    // TODO: Implementar confirmación y eliminación
    console.log('Delete producto:', producto);
  }
  
  toggleProductoActivo(producto: Producto): void {
    const updatedProducto = { ...producto, activo: !producto.activo };
    this.repositoryService.updateProducto(producto.id!, updatedProducto).subscribe({
      next: () => {
        this.loadProductos();
        this.snackBar.open('Producto actualizado correctamente', 'Cerrar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Error updating producto:', error);
        this.snackBar.open('Error al actualizar el producto', 'Cerrar', { duration: 3000 });
      }
    });
  }
  
  viewProductoDetalle(producto: Producto): void {
    this.tabsService.openTab(
      `Detalle de Producto - ${producto.nombre}`,
      GestionarProductoComponent,
      { mode: 'view', productoId: producto.id },
      `detalle-producto-${producto.id}-tab`
    );
  }

  thumbFor(url?: string | null): string | undefined {
    return thumbUrl(url) || resolveAppUrl(url ?? undefined);
  }

  onThumbError(event: Event, originalUrl?: string | null): void {
    // Si la derivada thumb no existe (legacy), caer al original.
    // F4: en mode=client el "original" debe pasarse por el proxy tambien.
    const img = event.target as HTMLImageElement;
    const fallback = resolveAppUrl(originalUrl);
    if (fallback && img.src !== fallback) {
      img.src = fallback;
    }
  }

  getTipoLabel(tipo: string): string {
    const tipoMap: { [key: string]: string } = {
      'RETAIL_INGREDIENTE': 'Ingrediente Retail',
      'ELABORADO_SIN_VARIACION': 'Elaborado Sin Variación',
      'ELABORADO_CON_VARIACION': 'Elaborado Con Variación',
      'SERVICIO': 'Servicio'
    };
    return tipoMap[tipo] || tipo;
  }
} 