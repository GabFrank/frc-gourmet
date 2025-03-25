import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-list-ingredientes',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatSnackBarModule,
    MatDialogModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Ingredientes</h1>
        <button mat-raised-button color="primary" (click)="addIngrediente()">
          <mat-icon>add</mat-icon>
          Nuevo Ingrediente
        </button>
      </div>

      <mat-card class="filter-card">
        <form [formGroup]="filterForm">
          <div class="filter-row">
            <mat-form-field appearance="outline">
              <mat-label>Descripción</mat-label>
              <input matInput formControlName="descripcion" placeholder="Buscar por descripción">
              <button *ngIf="filterForm.get('descripcion')?.value" matSuffix mat-icon-button aria-label="Clear"
                      (click)="filterForm.get('descripcion')?.setValue('')">
                <mat-icon>close</mat-icon>
              </button>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Tipo de Medida</mat-label>
              <mat-select formControlName="tipoMedida">
                <mat-option [value]="''">Todos</mat-option>
                <mat-option [value]="TipoMedida.UNIDAD">Unidad</mat-option>
                <mat-option [value]="TipoMedida.GRAMO">Gramo</mat-option>
                <mat-option [value]="TipoMedida.MILILITRO">Mililitro</mat-option>
                <mat-option [value]="TipoMedida.PAQUETE">Paquete</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Estado</mat-label>
              <mat-select formControlName="activo">
                <mat-option [value]="''">Todos</mat-option>
                <mat-option [value]="true">Activos</mat-option>
                <mat-option [value]="false">Inactivos</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="filter-actions">
              <button mat-raised-button color="primary" (click)="buscar()">
                <mat-icon>search</mat-icon>
                Buscar
              </button>
              <button mat-button (click)="clearFilters()">
                <mat-icon>clear</mat-icon>
                Limpiar
              </button>
            </div>
          </div>
        </form>
      </mat-card>

      <div class="table-container mat-elevation-z2">
        <div class="loading-shade" *ngIf="isLoading">
          <mat-spinner diameter="50"></mat-spinner>
        </div>

        <table mat-table [dataSource]="ingredientes" matSort (matSortChange)="onSort($event)">
          <!-- ID Column -->
          <ng-container matColumnDef="id">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
            <td mat-cell *matCellDef="let ingrediente">{{ ingrediente.id }}</td>
          </ng-container>

          <!-- Descripción Column -->
          <ng-container matColumnDef="descripcion">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Descripción</th>
            <td mat-cell *matCellDef="let ingrediente">{{ ingrediente.descripcion }}</td>
          </ng-container>

          <!-- Tipo Medida Column -->
          <ng-container matColumnDef="tipoMedida">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo de Medida</th>
            <td mat-cell *matCellDef="let ingrediente">{{ getTipoMedidaLabel(ingrediente.tipoMedida) }}</td>
          </ng-container>

          <!-- Costo Column -->
          <ng-container matColumnDef="costo">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Costo</th>
            <td mat-cell *matCellDef="let ingrediente">{{ ingrediente.costo | currency }}</td>
          </ng-container>

          <!-- Producción Column -->
          <ng-container matColumnDef="isProduccion">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Producción</th>
            <td mat-cell *matCellDef="let ingrediente">
              <mat-icon [color]="ingrediente.isProduccion ? 'primary' : ''">
                {{ ingrediente.isProduccion ? 'check_circle' : 'cancel' }}
              </mat-icon>
            </td>
          </ng-container>

          <!-- Estado Column -->
          <ng-container matColumnDef="activo">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
            <td mat-cell *matCellDef="let ingrediente">
              <span class="status-badge" [ngClass]="ingrediente.activo ? 'active' : 'inactive'">
                {{ ingrediente.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
          </ng-container>

          <!-- Acciones Column -->
          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef>Acciones</th>
            <td mat-cell *matCellDef="let ingrediente">
              <button mat-icon-button color="primary" (click)="editIngrediente(ingrediente)">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteIngrediente(ingrediente.id)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>

          <!-- No data row -->
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty-row" [attr.colspan]="displayedColumns.length">
              <div class="no-data-message">
                <mat-icon>sentiment_dissatisfied</mat-icon>
                <span>No se encontraron ingredientes</span>
              </div>
            </td>
          </tr>
        </table>

        <mat-paginator [pageSizeOptions]="pageSizeOptions" [pageSize]="pageSize"
                       [length]="totalIngredientes" (page)="onPageChange($event)">
        </mat-paginator>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 20px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .filter-card {
      margin-bottom: 20px;
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
    }

    .filter-actions {
      display: flex;
      gap: 8px;
    }

    .table-container {
      position: relative;
      min-height: 400px;
      overflow: auto;
    }

    .loading-shade {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.15);
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    mat-form-field {
      margin-right: 12px;
      width: 250px;
    }

    table {
      width: 100%;
    }

    .status-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .active {
      background-color: rgba(0, 150, 136, 0.1);
      color: #00796b;
    }

    .inactive {
      background-color: rgba(158, 158, 158, 0.1);
      color: #757575;
    }

    .empty-row {
      text-align: center;
      padding: 2rem;
    }

    .no-data-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: rgba(0, 0, 0, 0.54);
    }

    .no-data-message mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 10px;
    }

    @media (max-width: 768px) {
      .filter-row {
        flex-direction: column;
        align-items: stretch;
      }

      mat-form-field {
        width: 100%;
        margin-right: 0;
      }
    }
  `]
})
export class ListIngredientesComponent implements OnInit, AfterViewInit {
  ingredientes: Ingrediente[] = [];
  displayedColumns: string[] = ['id', 'descripcion', 'tipoMedida', 'costo', 'isProduccion', 'activo', 'acciones'];
  isLoading = false;
  totalIngredientes = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  filterForm: FormGroup;
  TipoMedida = TipoMedida; // Make enum available to template

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<Ingrediente>;

  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.filterForm = this.fb.group({
      descripcion: [''],
      tipoMedida: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadIngredientes();
  }

  ngAfterViewInit(): void {
    if (this.sort) {
      this.sort.sortChange.subscribe(() => {
        this.paginator.pageIndex = 0;
        this.loadIngredientes();
      });
    }
  }

  async loadIngredientes(): Promise<void> {
    this.isLoading = true;
    try {
      const ingredientes = await firstValueFrom(this.repositoryService.getIngredientes());

      // Apply filters
      let filteredIngredientes = ingredientes;
      const filters = this.filterForm.value;

      if (filters.descripcion) {
        const searchTerm = filters.descripcion.toLowerCase();
        filteredIngredientes = filteredIngredientes.filter(
          ingrediente => ingrediente.descripcion.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.tipoMedida) {
        filteredIngredientes = filteredIngredientes.filter(
          ingrediente => ingrediente.tipoMedida === filters.tipoMedida
        );
      }

      if (filters.activo !== '') {
        filteredIngredientes = filteredIngredientes.filter(
          ingrediente => ingrediente.activo === filters.activo
        );
      }

      // Apply sorting
      if (this.sort && this.sort.active && this.sort.direction !== '') {
        filteredIngredientes = filteredIngredientes.sort((a, b) => {
          const isAsc = this.sort.direction === 'asc';
          switch (this.sort.active) {
            case 'id': return this.compare(a.id, b.id, isAsc);
            case 'descripcion': return this.compare(a.descripcion, b.descripcion, isAsc);
            case 'tipoMedida': return this.compare(a.tipoMedida, b.tipoMedida, isAsc);
            case 'costo': return this.compare(a.costo, b.costo, isAsc);
            case 'isProduccion': return this.compare(a.isProduccion, b.isProduccion, isAsc);
            case 'activo': return this.compare(a.activo, b.activo, isAsc);
            default: return 0;
          }
        });
      }

      this.totalIngredientes = filteredIngredientes.length;

      // Apply pagination
      const startIndex = this.currentPage * this.pageSize;
      filteredIngredientes = filteredIngredientes.slice(startIndex, startIndex + this.pageSize);

      this.ingredientes = filteredIngredientes;
    } catch (error) {
      console.error('Error al cargar ingredientes:', error);
      this.snackBar.open('Error al cargar los ingredientes', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadIngredientes();
  }

  onSort(sortState: Sort): void {
    if (this.ingredientes.length > 0) {
      this.loadIngredientes();
    }
  }

  compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      descripcion: '',
      tipoMedida: '',
      activo: ''
    });
    this.currentPage = 0;
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    this.loadIngredientes();
  }

  buscar(): void {
    this.currentPage = 0;
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    this.loadIngredientes();
  }

  addIngrediente(): void {
    // TODO: Implement this when CreateEditIngredienteComponent is available
    this.snackBar.open('Función de agregar ingrediente pendiente de implementación', 'Cerrar', { duration: 3000 });
  }

  editIngrediente(ingrediente: Ingrediente): void {
    // TODO: Implement this when CreateEditIngredienteComponent is available
    this.snackBar.open('Función de editar ingrediente pendiente de implementación', 'Cerrar', { duration: 3000 });
  }

  deleteIngrediente(ingredienteId: number): void {
    if (confirm('¿Está seguro de que desea eliminar este ingrediente?')) {
      this.isLoading = true;
      this.repositoryService.deleteIngrediente(ingredienteId).subscribe({
        next: () => {
          this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 3000 });
          this.loadIngredientes();
        },
        error: (error: Error) => {
          console.error('Error al eliminar el ingrediente:', error);
          this.snackBar.open('Error al eliminar el ingrediente', 'Cerrar', { duration: 3000 });
          this.isLoading = false;
        }
      });
    }
  }

  getTipoMedidaLabel(tipo: TipoMedida): string {
    switch (tipo) {
      case TipoMedida.UNIDAD: return 'Unidad';
      case TipoMedida.GRAMO: return 'Gramo';
      case TipoMedida.MILILITRO: return 'Mililitro';
      case TipoMedida.PAQUETE: return 'Paquete';
      default: return tipo;
    }
  }
}
