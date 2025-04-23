import { Component, OnInit } from '@angular/core';
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
import { RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../database/repository.service';
import { MovimientoStock, TipoReferencia } from '../../../database/entities/productos/movimiento-stock.entity';
import { firstValueFrom } from 'rxjs';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { DecimalPipe } from '@angular/common';
import { CreateEditMovimientoStockComponent } from './create-edit-movimiento-stock.component';

// Extended interface to include display values
interface MovimientoStockViewModel extends Partial<MovimientoStock> {
  displayValues: {
    tipoReferenciaLabel: string;
    productoNombre: string;
    ingredienteNombre: string;
    fechaCreacion: string;
  };
}

@Component({
  selector: 'app-list-movimientos-stock',
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
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    RouterModule,
    ConfirmationDialogComponent,
    DecimalPipe
  ],
  templateUrl: './list-movimientos-stock.component.html',
  styleUrls: ['./list-movimientos-stock.component.scss']
})
export class ListMovimientosStockComponent implements OnInit {
  movimientos: MovimientoStockViewModel[] = [];
  tipoReferencias = Object.values(TipoReferencia);
  displayedColumns: string[] = [
    'id', 
    'productoIngrediente', 
    'tipoMedida', 
    'cantidadActual', 
    'tipoReferencia', 
    'referencia', 
    'fechaCreacion', 
    'activo', 
    'acciones'
  ];
  isLoading = false;
  
  // Pre-computed label maps
  tipoReferenciaLabels: Record<TipoReferencia, string> = {
    [TipoReferencia.VENTA]: 'Venta',
    [TipoReferencia.COMPRA]: 'Compra',
    [TipoReferencia.AJUSTE]: 'Ajuste',
    [TipoReferencia.TRANSFERENCIA]: 'Transferencia',
    [TipoReferencia.DESCARTE]: 'Descarte'
  };

  // Pagination
  totalMovimientos = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  
  // Filtering
  filterForm: FormGroup;
  
  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.filterForm = this.fb.group({
      productoId: [''],
      ingredienteId: [''],
      tipoReferencia: [''],
      desde: [''],
      hasta: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadMovimientos();
  }

  async loadMovimientos(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        productoId?: number,
        ingredienteId?: number,
        tipoReferencia?: TipoReferencia,
        desde?: Date,
        hasta?: Date,
        activo?: boolean
      } = {
        productoId: this.filterForm.get('productoId')?.value || undefined,
        ingredienteId: this.filterForm.get('ingredienteId')?.value || undefined,
        tipoReferencia: this.filterForm.get('tipoReferencia')?.value || undefined,
        desde: this.filterForm.get('desde')?.value || undefined,
        hasta: this.filterForm.get('hasta')?.value || undefined,
        activo: this.filterForm.get('activo')?.value === 'true' ? true : 
                this.filterForm.get('activo')?.value === 'false' ? false : undefined
      };

      // Filter out empty/null/undefined values
      if (!filters.productoId) delete filters.productoId;
      if (!filters.ingredienteId) delete filters.ingredienteId;
      if (!filters.tipoReferencia) delete filters.tipoReferencia;
      if (!filters.desde) delete filters.desde;
      if (!filters.hasta) delete filters.hasta;
      if (filters.activo === undefined) delete filters.activo;
      
      // Get data from repository service
      let result;
      
      // Check if specific filters are applied
      if (filters.productoId) {
        result = await firstValueFrom(this.repositoryService.getMovimientosStockByProducto(filters.productoId));
      } else if (filters.ingredienteId) {
        result = await firstValueFrom(this.repositoryService.getMovimientosStockByIngrediente(filters.ingredienteId));
      } else if (filters.tipoReferencia) {
        result = await firstValueFrom(this.repositoryService.getMovimientosStockByTipoReferencia(filters.tipoReferencia));
      } else {
        result = await firstValueFrom(this.repositoryService.getMovimientosStock());
      }
      
      const movimientos = result as Partial<MovimientoStock>[];
      
      // Apply remaining filters manually
      let filteredMovimientos = movimientos;
      
      if (filters.desde || filters.hasta || (filters.activo !== undefined && Object.keys(filters).length > 1)) {
        filteredMovimientos = movimientos.filter(movimiento => {
          let matches = true;
          
          if (filters.desde && movimiento.createdAt) {
            const createdDate = new Date(movimiento.createdAt);
            const filterDate = new Date(filters.desde);
            matches = matches && createdDate >= filterDate;
          }
          
          if (filters.hasta && movimiento.createdAt) {
            const createdDate = new Date(movimiento.createdAt);
            const filterDate = new Date(filters.hasta);
            // Set the filter date to end of day
            filterDate.setHours(23, 59, 59, 999);
            matches = matches && createdDate <= filterDate;
          }
          
          if (filters.activo !== undefined) {
            matches = matches && movimiento.activo === filters.activo;
          }
          
          return matches;
        });
      }
      
      // Convert to view model with pre-computed values
      this.movimientos = filteredMovimientos.map(movimiento => this.convertToViewModel(movimiento));
      this.totalMovimientos = this.movimientos.length;
      
    } catch (error) {
      console.error('Error loading movimientos stock:', error);
      this.snackBar.open('Error al cargar movimientos de stock', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  // Convert MovimientoStock to MovimientoStockViewModel with pre-computed display values
  private convertToViewModel(movimiento: Partial<MovimientoStock>): MovimientoStockViewModel {
    return {
      ...movimiento,
      displayValues: {
        tipoReferenciaLabel: this.computeTipoReferenciaLabel(movimiento.tipoReferencia),
        productoNombre: movimiento.producto?.nombre || '-',
        ingredienteNombre: movimiento.ingrediente?.descripcion || '-',
        fechaCreacion: movimiento.createdAt ? new Date(movimiento.createdAt).toLocaleString() : '-'
      }
    };
  }
  
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }
  
  onSort(sortState: Sort): void {
    if (!sortState.active || sortState.direction === '') {
      return;
    }
    
    this.movimientos = this.movimientos.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'id': return this.compare(a.id || 0, b.id || 0, isAsc);
        case 'productoIngrediente': 
          if (a.productoId) {
            return this.compare(a.displayValues.productoNombre, b.displayValues.productoNombre, isAsc);
          } else {
            return this.compare(a.displayValues.ingredienteNombre, b.displayValues.ingredienteNombre, isAsc);
          }
        case 'tipoMedida': return this.compare(a.tipoMedida || '', b.tipoMedida || '', isAsc);
        case 'cantidadActual': return this.compare(a.cantidadActual || 0, b.cantidadActual || 0, isAsc);
        case 'tipoReferencia': return this.compare(a.tipoReferencia || '', b.tipoReferencia || '', isAsc);
        case 'referencia': return this.compare(a.referencia || 0, b.referencia || 0, isAsc);
        case 'fechaCreacion': return this.compare(a.createdAt || '', b.createdAt || '', isAsc);
        case 'activo': return this.compare(a.activo || false, b.activo || false, isAsc);
        default: return 0;
      }
    });
  }
  
  compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
  
  clearFilters(): void {
    this.filterForm.reset({
      productoId: '',
      ingredienteId: '',
      tipoReferencia: '',
      desde: '',
      hasta: '',
      activo: ''
    });
    this.loadMovimientos();
  }
  
  buscar(): void {
    this.loadMovimientos();
  }
  
  editMovimientoStock(movimiento: MovimientoStockViewModel): void {
    const dialogRef = this.dialog.open(CreateEditMovimientoStockComponent, {
      width: '800px',
      disableClose: true,
      data: {
        movimientoStock: movimiento,
        isEditMode: true
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadMovimientos();
      }
    });
  }
  
  deleteMovimientoStock(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Desactivar Movimiento de Stock',
        message: '¿Está seguro que desea desactivar este movimiento de stock?',
        confirmText: 'Desactivar',
        cancelText: 'Cancelar'
      }
    });
    
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await firstValueFrom(this.repositoryService.deleteMovimientoStock(id));
          this.snackBar.open('Movimiento de stock desactivado correctamente', 'Cerrar', { duration: 3000 });
          this.loadMovimientos();
        } catch (error) {
          console.error('Error deactivating movimiento stock:', error);
          this.snackBar.open('Error al desactivar el movimiento de stock', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }
  
  addMovimientoStock(): void {
    const dialogRef = this.dialog.open(CreateEditMovimientoStockComponent, {
      width: '800px',
      disableClose: true,
      data: {
        isEditMode: false
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadMovimientos();
      }
    });
  }
  
  // Private computation methods
  private computeTipoReferenciaLabel(tipo?: TipoReferencia): string {
    if (!tipo) return '-';
    return this.tipoReferenciaLabels[tipo] || tipo;
  }
  
  // Public methods - these shouldn't be called directly from the template
  getTipoReferenciaLabel(tipo?: TipoReferencia): string {
    return this.computeTipoReferenciaLabel(tipo);
  }
  
  getProductoOrIngredienteName(movimiento: MovimientoStockViewModel): string {
    if (movimiento.productoId && movimiento.displayValues.productoNombre !== '-') {
      return `Producto: ${movimiento.displayValues.productoNombre}`;
    } else if (movimiento.ingredienteId && movimiento.displayValues.ingredienteNombre !== '-') {
      return `Ingrediente: ${movimiento.displayValues.ingredienteNombre}`;
    } else {
      return 'No asociado';
    }
  }
} 