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
import { Receta } from '../../../database/entities/productos/receta.entity';
import { firstValueFrom } from 'rxjs';
import { CreateEditRecetaDialogComponent } from './create-edit-receta-dialog.component';

@Component({
  selector: 'app-list-recetas',
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
  templateUrl: './list-recetas.component.html',
  styleUrls: ['./list-recetas.component.scss']
})
export class ListRecetasComponent implements OnInit {
  recetas: Receta[] = [];
  displayedColumns: string[] = ['id', 'nombre', 'activo', 'actions'];
  isLoading = true;
  filterForm: FormGroup;

  // Pagination variables
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 25, 100];
  currentPage = 0;
  totalRecetas = 0;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<Receta>;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadRecetas();
  }

  async loadRecetas(): Promise<void> {
    this.isLoading = true;
    try {
      let recetas = await firstValueFrom(this.repositoryService.getRecetas());

      // Apply filters
      const filters = this.filterForm.value;

      if (filters.nombre) {
        const searchTerm = filters.nombre.toLowerCase();
        recetas = recetas.filter(receta =>
          receta.nombre.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.activo !== '') {
        const isActive = filters.activo === 'true';
        recetas = recetas.filter(receta => receta.activo === isActive);
      }

      this.recetas = recetas;
      this.totalRecetas = this.recetas.length;
    } catch (error) {
      console.error('Error loading recetas:', error);
      this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  buscar(): void {
    this.loadRecetas();
  }

  clearFilters(): void {
    this.filterForm.reset({
      nombre: '',
      activo: ''
    });
    this.loadRecetas();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditRecetaDialogComponent, {
      width: '800px',
      disableClose: true,
      data: {
        editMode: false
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecetas();
      }
    });
  }

  openEditDialog(receta: Receta): void {
    const dialogRef = this.dialog.open(CreateEditRecetaDialogComponent, {
      width: '800px',
      disableClose: true,
      data: {
        receta: receta,
        editMode: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecetas();
      }
    });
  }

  async toggleActive(receta: Receta): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.updateReceta(receta.id, {
        nombre: receta.nombre,
        modo_preparo: receta.modo_preparo,
        activo: !receta.activo
      }));

      this.snackBar.open(`Receta ${!receta.activo ? 'activada' : 'desactivada'} correctamente`, 'Cerrar', { duration: 3000 });
      this.loadRecetas();
    } catch (error) {
      console.error('Error toggling receta active state:', error);
      this.snackBar.open('Error al cambiar el estado de la receta', 'Cerrar', { duration: 3000 });
    }
  }

  openDeleteDialog(receta: Receta): void {
    if (confirm(`¿Está seguro que desea eliminar la receta "${receta.nombre}"?`)) {
      this.deleteReceta(receta.id);
    }
  }

  async deleteReceta(recetaId: number): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.deleteReceta(recetaId));
      this.snackBar.open('Receta eliminada correctamente', 'Cerrar', { duration: 3000 });
      this.loadRecetas();
    } catch (error) {
      console.error('Error deleting receta:', error);
      this.snackBar.open('Error al eliminar la receta', 'Cerrar', { duration: 3000 });
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

    this.recetas = this.recetas.slice().sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'nombre': return this.compare(a.nombre, b.nombre, isAsc);
        case 'id': return this.compare(a.id, b.id, isAsc);
        case 'activo': return this.compare(a.activo, b.activo, isAsc);
        default: return 0;
      }
    });
  }

  private compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
}
