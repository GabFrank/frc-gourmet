import { Component, OnInit, Input } from '@angular/core';
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
import { Observable, firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { Compra } from '../../../database/entities/compras/compra.entity';
import { CompraEstado } from '../../../database/entities/compras/estado.enum';
import { Proveedor } from '../../../database/entities/compras/proveedor.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from '../../../services/tabs.service';
import { CreateEditCompraComponent } from './create-edit-compra.component';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';

// Extend the compra type with display values for the view
interface CompraViewModel {
  id: number;
  estado: CompraEstado;
  isRecepcionMercaderia: boolean;
  activo: boolean;
  createdAt: Date;
  proveedor?: Proveedor;
  moneda?: Moneda;
  formaPago?: FormasPago;
  numeroNota?: string;
  tipoBoleta?: string;
  fechaCompra?: Date;
  credito?: boolean;
  plazoDias?: number;
  total: number;
  displayValues: {
    estadoLabel: string;
    proveedorNombre?: string;
    monedaNombre?: string;
    formaPagoNombre?: string;
  };
}

@Component({
  selector: 'app-list-compras',
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
    ConfirmationDialogComponent
  ],
  templateUrl: './list-compras.component.html',
  styleUrls: ['./list-compras.component.scss']
})
export class ListComprasComponent implements OnInit {
  @Input() data: any;

  // Data
  compras: CompraViewModel[] = [];
  proveedores: Proveedor[] = [];
  monedas: Moneda[] = [];

  // Table columns
  displayedColumns: string[] = ['id', 'proveedor', 'fecha', 'numeroNota', 'estado', 'moneda', 'formaPago', 'recepcion', 'total', 'acciones'];

  // Loading state
  isLoading = false;

  // Pagination
  totalCompras = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];

  // Filtering
  filterForm: FormGroup;

  // Estado options
  estadoOptions = [
    { value: CompraEstado.ABIERTO, label: 'Abierto' },
    { value: CompraEstado.ACTIVO, label: 'Activo' },
    { value: CompraEstado.FINALIZADO, label: 'Finalizado' },
    { value: CompraEstado.CANCELADO, label: 'Cancelado' }
  ];

  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService
  ) {
    this.filterForm = this.fb.group({
      proveedorId: [''],
      monedaId: [''],
      estado: [''],
      recepcion: ['']
    });
  }

  ngOnInit(): void {
    console.log('[ListComprasComponent] ngOnInit with data:', this.data);

    // Load lookup data
    this.loadProveedores();
    this.loadMonedas();

    // Apply initial data if available
    if (this.data) {
      this.processData();
    } else {
      // Otherwise just load all compras
      this.loadCompras();
    }
  }

  // Process data passed from tabs service
  private processData(): void {
    console.log('[ListComprasComponent] Processing data:', this.data);

    if (this.data.source === 'dashboard') {
      // If coming from dashboard, just load all compras
      this.loadCompras();
    } else if (this.data.filters) {
      // If filters provided, apply them
      this.filterForm.patchValue(this.data.filters);
      this.buscar();
    } else {
      // Default case
      this.loadCompras();
    }
  }

  // Load compras with current filters and pagination
  async loadCompras(): Promise<void> {
    this.isLoading = true;

    const filters = {
      ...this.filterForm.value
    };

    // Convert string values to appropriate types
    if (filters.proveedorId === '') filters.proveedorId = null;
    if (filters.monedaId === '') filters.monedaId = null;
    if (filters.estado === '') filters.estado = null;
    if (filters.recepcion === '') filters.recepcion = null;
    else filters.recepcion = filters.recepcion === 'true';

    console.log('Loading compras with filters:', filters);

    try {
      // In a future implementation, we would call the real API with filter parameters
      // For now, we'll implement client-side filtering since the mock implementation just filters locally
      const allCompras: Compra[] = await firstValueFrom(this.repositoryService.getCompras());

      // Apply filters
      let filteredCompras = [...allCompras];

      if (filters.proveedorId) {
        filteredCompras = filteredCompras.filter((c: Compra) => c.proveedor?.id === Number(filters.proveedorId));
      }

      if (filters.monedaId) {
        filteredCompras = filteredCompras.filter((c: Compra) => c.moneda?.id === Number(filters.monedaId));
      }

      if (filters.estado) {
        filteredCompras = filteredCompras.filter((c: Compra) => c.estado === filters.estado);
      }

      if (filters.recepcion !== null) {
        filteredCompras = filteredCompras.filter((c: Compra) => c.isRecepcionMercaderia === filters.recepcion);
      }

      // Calculate total for pagination
      this.totalCompras = filteredCompras.length;

      // Apply pagination
      const start = this.currentPage * this.pageSize;
      const end = start + this.pageSize;

      // Convert to view model
      this.compras = filteredCompras
        .slice(start, end)
        .map(compra => this.convertToViewModel(compra));

    } catch (error: any) {
      console.error('Error loading compras:', error);
      this.snackBar.open('Error al cargar compras: ' + error.message, 'Cerrar', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  // Load proveedores for filter dropdown
  async loadProveedores(): Promise<void> {
    try {
      this.proveedores = await firstValueFrom(this.repositoryService.getProveedores());
    } catch (error: any) {
      console.error('Error loading proveedores:', error);
    }
  }

  // Load monedas for filter dropdown
  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
    } catch (error: any) {
      console.error('Error loading monedas:', error);
    }
  }

  // Apply filters
  buscar(): void {
    this.currentPage = 0;
    this.loadCompras();
  }

  // Clear all filters
  clearFilters(): void {
    this.filterForm.reset({
      proveedorId: '',
      monedaId: '',
      estado: '',
      recepcion: ''
    });
    this.buscar();
  }

  // Handle page change
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadCompras();
  }

  // Handle sort change - simplified since sorting is removed from UI
  onSort(sort: Sort): void {
    // Method kept for compatibility but no longer used
    console.log('Sort functionality removed as per project guidelines');
  }

  // Open tab to create new compra
  addCompra(): void {
    this.tabsService.openTab(
      'Nueva Compra',
      CreateEditCompraComponent,
      {}, // No specific data needed for new compra
      `nueva-compra-${Date.now()}`, // Unique ID for the tab
      true // Closable
    );
  }

  // Edit compra in a new tab
  editCompra(compra: CompraViewModel): void {
    this.tabsService.openTab(
      `Editar Compra #${compra.id}`,
      CreateEditCompraComponent,
      { compra: compra }, // Pass the compra to edit
      `editar-compra-${compra.id}`, // Unique ID for the tab
      true // Closable
    );
  }

  // Delete (deactivate) compra
  deleteCompra(compra: CompraViewModel): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Confirmar eliminación',
        message: `¿Está seguro que desea eliminar la compra #${compra.id}?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        this.isLoading = true;

        try {
          // Call the repository service to delete the compra
          await firstValueFrom(this.repositoryService.deleteCompra(compra.id));

          this.snackBar.open('Compra eliminada correctamente', 'Cerrar', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });

          // Reload the compras list
          this.loadCompras();
        } catch (error: any) {
          console.error('Error al eliminar compra:', error);
          this.snackBar.open('Error al eliminar compra: ' + error.message, 'Cerrar', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        } finally {
          this.isLoading = false;
        }
      }
    });
  }

  // Helper to display estado label
  getEstadoLabel(estado: CompraEstado): string {
    return this.estadoOptions.find(option => option.value === estado)?.label || estado;
  }

  // Convert Compra to ViewModel with display values
  private convertToViewModel(compra: Compra): CompraViewModel {
    return {
      id: compra.id,
      estado: compra.estado,
      isRecepcionMercaderia: compra.isRecepcionMercaderia,
      activo: compra.activo,
      createdAt: compra.createdAt,
      proveedor: compra.proveedor,
      moneda: compra.moneda,
      formaPago: compra.formaPago,
      numeroNota: compra.numeroNota,
      tipoBoleta: compra.tipoBoleta,
      fechaCompra: compra.fechaCompra,
      credito: compra.credito,
      plazoDias: compra.plazoDias,
      total: (compra as any).total || 0, // Access total property safely
      displayValues: {
        estadoLabel: this.getEstadoLabel(compra.estado),
        proveedorNombre: compra.proveedor?.nombre,
        monedaNombre: compra.moneda?.denominacion,
        formaPagoNombre: compra.formaPago?.nombre
      }
    };
  }

  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for Compras list component:', data);
    this.data = data;
    if (data) {
      this.processData();
    }
  }
}
