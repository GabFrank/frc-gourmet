import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';
import { CreateEditIngredienteDialogComponent } from './index';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';

@Component({
  selector: 'app-list-ingredientes',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatCardModule,
    MatDividerModule,
    MatCheckboxModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './list-ingredientes.component.html',
  styleUrls: ['./list-ingredientes.component.scss']
})
export class ListIngredientesComponent implements OnInit {
  ingredientes: Ingrediente[] = [];
  displayedColumns: string[] = ['id', 'descripcion', 'tipoMedida', 'costo', 'isProduccion', 'activo', 'actions'];
  isLoading = true;
  filterForm: FormGroup;
  tipoMedidaOptions = Object.values(TipoMedida);
  monedas: Moneda[] = [];

  // Pagination variables
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 25, 100];
  currentPage = 0;
  totalIngredientes = 0;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<Ingrediente>;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      descripcion: [''],
      tipoMedida: [''],
      monedaId: [''],
      isProduccion: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadMonedas();
    this.loadIngredientes();
  }

  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar las monedas', 'Cerrar', { duration: 3000 });
    }
  }

  getMonedaSymbol(monedaId?: number): string {
    if (!monedaId) return '-';
    const moneda = this.monedas.find(m => m.id === monedaId);
    return moneda ? moneda.simbolo : '-';
  }

  async loadIngredientes(): Promise<void> {
    this.isLoading = true;
    try {
      let ingredientes = await firstValueFrom(this.repositoryService.getIngredientes());

      // Apply filters
      const filters = this.filterForm.value;

      if (filters.descripcion) {
        const searchTerm = filters.descripcion.toLowerCase();
        ingredientes = ingredientes.filter(ingrediente =>
          ingrediente.descripcion.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.tipoMedida) {
        ingredientes = ingredientes.filter(ingrediente =>
          ingrediente.tipoMedida === filters.tipoMedida
        );
      }

      if (filters.monedaId) {
        ingredientes = ingredientes.filter(ingrediente =>
          ingrediente.monedaId === parseInt(filters.monedaId)
        );
      }

      if (filters.isProduccion !== '') {
        const isProduccion = filters.isProduccion === 'true';
        ingredientes = ingredientes.filter(ingrediente =>
          ingrediente.isProduccion === isProduccion
        );
      }

      if (filters.activo !== '') {
        const isActive = filters.activo === 'true';
        ingredientes = ingredientes.filter(ingrediente =>
          ingrediente.activo === isActive
        );
      }

      this.ingredientes = ingredientes;
      this.totalIngredientes = this.ingredientes.length;
    } catch (error) {
      console.error('Error loading ingredientes:', error);
      this.snackBar.open('Error al cargar los ingredientes', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  buscar(): void {
    this.loadIngredientes();
  }

  clearFilters(): void {
    this.filterForm.reset({
      descripcion: '',
      tipoMedida: '',
      monedaId: '',
      isProduccion: '',
      activo: ''
    });
    this.loadIngredientes();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditIngredienteDialogComponent, {
      width: '600px',
      disableClose: true,
      data: {
        editMode: false
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadIngredientes();
      }
    });
  }

  openEditDialog(ingrediente: Ingrediente): void {
    const dialogRef = this.dialog.open(CreateEditIngredienteDialogComponent, {
      width: '600px',
      disableClose: true,
      data: {
        ingrediente: ingrediente,
        editMode: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadIngredientes();
      }
    });
  }

  async toggleActive(ingrediente: Ingrediente): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.updateIngrediente(ingrediente.id, {
        ...ingrediente,
        activo: !ingrediente.activo
      }));

      this.snackBar.open(
        `Ingrediente ${!ingrediente.activo ? 'activado' : 'desactivado'} correctamente`,
        'Cerrar',
        { duration: 3000 }
      );
      this.loadIngredientes();
    } catch (error) {
      console.error('Error toggling ingrediente active state:', error);
      this.snackBar.open('Error al cambiar el estado del ingrediente', 'Cerrar', { duration: 3000 });
    }
  }

  openDeleteDialog(ingrediente: Ingrediente): void {
    if (confirm(`¿Está seguro que desea eliminar el ingrediente "${ingrediente.descripcion}"?`)) {
      this.deleteIngrediente(ingrediente.id);
    }
  }

  async deleteIngrediente(ingredienteId: number): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.deleteIngrediente(ingredienteId));
      this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 3000 });
      this.loadIngredientes();
    } catch (error) {
      console.error('Error deleting ingrediente:', error);
      this.snackBar.open('Error al eliminar el ingrediente', 'Cerrar', { duration: 3000 });
    }
  }

  // Pagination handling
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }

  // Sorting handling
  onSort(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.ingredientes = this.ingredientes.slice().sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'descripcion': return this.compare(a.descripcion, b.descripcion, isAsc);
        case 'id': return this.compare(a.id, b.id, isAsc);
        case 'tipoMedida': return this.compare(a.tipoMedida, b.tipoMedida, isAsc);
        case 'costo': return this.compare(a.costo, b.costo, isAsc);
        case 'isProduccion': return this.compare(a.isProduccion, b.isProduccion, isAsc);
        case 'activo': return this.compare(a.activo, b.activo, isAsc);
        default: return 0;
      }
    });
  }

  private compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  formatCurrency(value: number, monedaId?: number): string {
    const symbol = this.getMonedaSymbol(monedaId);
    return `${symbol} ${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getTipoMedidaText(tipo: TipoMedida): string {
    switch (tipo) {
      case TipoMedida.UNIDAD:
        return 'Unidad';
      case TipoMedida.GRAMO:
        return 'Gramo';
      case TipoMedida.MILILITRO:
        return 'Mililitro';
      case TipoMedida.PAQUETE:
        return 'Paquete';
      default:
        return tipo;
    }
  }
}
