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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../database/repository.service';
import { Proveedor } from '../../../database/entities/compras/proveedor.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditProveedorComponent } from './create-edit-proveedor.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-list-proveedores',
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
  templateUrl: './list-proveedores.component.html',
  styleUrls: ['./list-proveedores.component.scss']
})
export class ListProveedoresComponent implements OnInit {
  // Data
  proveedores: Proveedor[] = [];
  allProveedores: Proveedor[] = []; // Store all proveedores for client-side filtering

  // Table columns
  displayedColumns: string[] = ['id', 'nombre', 'razon_social', 'ruc', 'telefono', 'activo', 'acciones'];

  // Loading state
  isLoading = false;

  // Pagination
  totalProveedores = 0;
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
      nombre: [''],
      ruc: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadProveedores();
  }

  // Load proveedores with filters
  async loadProveedores(): Promise<void> {
    this.isLoading = true;

    try {
      // Get all proveedores from the database
      this.allProveedores = await firstValueFrom(this.repositoryService.getProveedores());

      // Apply filters
      this.applyFilters();
    } catch (error: any) {
      console.error('Error loading proveedores:', error);
      this.snackBar.open(`Error al cargar proveedores: ${error.message}`, 'Cerrar', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  // Apply filters to the loaded data
  applyFilters(): void {
    const filters = {
      nombre: this.filterForm.get('nombre')?.value || '',
      ruc: this.filterForm.get('ruc')?.value || '',
      activo: this.filterForm.get('activo')?.value
    };

    // Apply filters to our data
    let filteredData = [...this.allProveedores];

    if (filters.nombre) {
      filteredData = filteredData.filter(p =>
        p.nombre.toLowerCase().includes(filters.nombre.toLowerCase())
      );
    }

    if (filters.ruc) {
      filteredData = filteredData.filter(p =>
        p.ruc && p.ruc.includes(filters.ruc)
      );
    }

    if (filters.activo !== '') {
      filteredData = filteredData.filter(p =>
        p.activo === filters.activo
      );
    }

    // Calculate total for pagination
    this.totalProveedores = filteredData.length;

    // Apply sorting if needed
    // Here you can add sorting logic if needed

    // Apply pagination
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    this.proveedores = filteredData.slice(start, end);
  }

  buscar(): void {
    this.currentPage = 0; // Reset to first page
    this.applyFilters();
  }

  clearFilters(): void {
    this.filterForm.reset({
      nombre: '',
      ruc: '',
      activo: ''
    });
    this.currentPage = 0; // Reset to first page
    this.applyFilters();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
    this.applyFilters();
  }

  onSort(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.allProveedores.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'id': return this.compare(a.id, b.id, isAsc);
        case 'nombre': return this.compare(a.nombre, b.nombre, isAsc);
        case 'razon_social': return this.compare(a.razon_social || '', b.razon_social || '', isAsc);
        case 'ruc': return this.compare(a.ruc || '', b.ruc || '', isAsc);
        case 'telefono': return this.compare(a.telefono || '', b.telefono || '', isAsc);
        case 'activo': return this.compare(a.activo, b.activo, isAsc);
        default: return 0;
      }
    });

    this.applyFilters();
  }

  private compare(a: number | string | boolean, b: number | string | boolean, isAsc: boolean) {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  // Open dialog to create a new proveedor
  addProveedor(): void {
    const dialogRef = this.dialog.open(CreateEditProveedorComponent, {
      width: '600px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open(
          `Proveedor ${result.action === 'create' ? 'creado' : 'actualizado'} correctamente`,
          'Cerrar',
          { duration: 3000 }
        );
        this.loadProveedores();
      }
    });
  }

  // Open dialog to edit a proveedor
  editProveedor(proveedor: Proveedor): void {
    const dialogRef = this.dialog.open(CreateEditProveedorComponent, {
      width: '600px',
      data: { proveedor }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Proveedor actualizado correctamente', 'Cerrar', { duration: 3000 });
        this.loadProveedores();
      }
    });
  }

  // Toggle proveedor active status
  async toggleProveedorStatus(proveedor: Proveedor): Promise<void> {
    this.isLoading = true;

    try {
      const updatedProveedor = await firstValueFrom(
        this.repositoryService.updateProveedor(proveedor.id!, {
          activo: !proveedor.activo
        })
      );

      this.snackBar.open(
        `Proveedor ${updatedProveedor.activo ? 'activado' : 'desactivado'} correctamente`,
        'Cerrar',
        { duration: 3000 }
      );

      this.loadProveedores();
    } catch (error: any) {
      console.error('Error toggling proveedor status:', error);
      this.snackBar.open(`Error al cambiar estado del proveedor: ${error.message}`, 'Cerrar', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  // Delete a proveedor
  deleteProveedor(proveedor: Proveedor): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar proveedor',
        message: `¿Está seguro que desea eliminar al proveedor "${proveedor.nombre}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        this.isLoading = true;

        try {
          await firstValueFrom(this.repositoryService.deleteProveedor(proveedor.id!));

          this.snackBar.open('Proveedor eliminado correctamente', 'Cerrar', {
            duration: 3000
          });

          this.loadProveedores();
        } catch (error: any) {
          console.error('Error deleting proveedor:', error);
          this.snackBar.open(`Error al eliminar el proveedor: ${error.message}`, 'Cerrar', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        } finally {
          this.isLoading = false;
        }
      }
    });
  }

  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for ListProveedoresComponent:', data);
    // Additional initialization if needed when opened from a tab
  }
}
