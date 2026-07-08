import { Component, OnInit, ViewChild } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TabsService } from '../../../services/tabs.service';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { GestionRecetasComponent } from '../gestion-recetas.component';
import { RecetaDetalleComponent } from '../receta-detalle/receta-detalle.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { RecetaDependenciesDialogComponent } from '../../../shared/components/receta-dependencies-dialog/receta-dependencies-dialog.component';

@Component({
  selector: 'app-list-recetas',
  templateUrl: './list-recetas.component.html',
  styleUrls: ['./list-recetas.component.scss']
})
export class ListRecetasComponent implements OnInit {

  // Table properties
  displayedColumns: string[] = ['nombre', 'descripcion', 'costoCalculado', 'activo', 'acciones'];
  dataSource = new MatTableDataSource<Receta>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Loading state
  loading = false;

  // Search filter
  searchTerm = '';

  // Pagination properties
  totalItems = 0;
  currentPage = 0;
  pageSize = 10;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService
  ) {}

  ngOnInit(): void {
    this.loadRecetas();
  }

  // Method used by the tab service to set data
  setData(data: any): void {
    console.log('Setting data for ListRecetasComponent:', data);
    // Additional initialization if needed when opened from a tab
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadRecetas(): void {
    this.loading = true;

    const filters = {
      search: this.searchTerm,
      activo: null, // Mostrar todas las recetas
      page: this.currentPage,
      pageSize: this.pageSize
    };

    this.repositoryService.getRecetasWithFilters(filters).subscribe({
      next: (response) => {
        this.dataSource.data = response.items;
        this.totalItems = response.total;
        this.loading = false;

        // Log para debugging
        response.items.forEach(receta => {
          console.log(`${receta.nombre}: Costo calculado = $${receta.costoCalculado}`);
        });
      },
      error: (error) => {
        console.error('Error loading recetas:', error);
        this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    // El backend mayusculiza el término (los datos se guardan en MAYÚSCULAS).
    this.searchTerm = filterValue.trim();
    this.currentPage = 0; // Reset to first page when filtering
    this.loadRecetas();
  }

  onPageChange(event: any): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadRecetas();
  }

  createNewReceta(): void {
    this.tabsService.openTab(
      'Nueva Receta',
      GestionRecetasComponent,
      { mode: 'create' },
      'nueva-receta-tab'
    );
  }

  editReceta(receta: Receta): void {
    this.tabsService.openTab(
      `Editar Receta - ${receta.nombre}`,
      GestionRecetasComponent,
      { mode: 'edit', recetaId: receta.id },
      `editar-receta-${receta.id}-tab`
    );
  }

  deleteReceta(receta: Receta): void {
    // Primero verificar dependencias
    this.loading = true;
    this.repositoryService.checkRecetaDependencies(receta.id!).subscribe({
      next: (dependencies) => {
        this.loading = false;

        if (dependencies.productosVinculados.length > 0) {
          // Hay productos vinculados, mostrar diálogo de dependencias
          const dialogRef = this.dialog.open(RecetaDependenciesDialogComponent, {
            width: '600px',
            data: dependencies
          });

          dialogRef.afterClosed().subscribe(result => {
            if (result) {
              this.performDeleteReceta(receta);
            }
          });
        } else {
          // No hay dependencias, mostrar confirmación simple
          const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
            width: '400px',
            data: {
              title: 'Confirmar eliminación',
              message: `¿Está seguro que desea eliminar la receta "${receta.nombre}"? Esta acción no se puede deshacer.`
            }
          });

          dialogRef.afterClosed().subscribe(result => {
            if (result) {
              this.performDeleteReceta(receta);
            }
          });
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error checking receta dependencies:', error);
        this.snackBar.open('Error al verificar dependencias de la receta', 'Cerrar', { duration: 3000 });
      }
    });
  }

  private performDeleteReceta(receta: Receta): void {
    this.loading = true;
    this.repositoryService.deleteReceta(receta.id!).subscribe({
      next: () => {
        this.snackBar.open('Receta eliminada correctamente', 'Cerrar', { duration: 2000 });
        this.loadRecetas(); // Recargar la lista
        this.loading = false;
      },
      error: (error) => {
        console.error('Error deleting receta:', error);
        this.snackBar.open('Error al eliminar la receta', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  toggleRecetaActivo(receta: Receta): void {
    const updatedReceta = { ...receta, activo: !receta.activo };
    this.repositoryService.updateReceta(receta.id!, updatedReceta).subscribe({
      next: () => {
        this.loadRecetas();
        this.snackBar.open('Receta actualizada correctamente', 'Cerrar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Error updating receta:', error);
        this.snackBar.open('Error al actualizar la receta', 'Cerrar', { duration: 3000 });
      }
    });
  }

  viewRecetaDetalle(receta: Receta): void {
    this.tabsService.openTab(
      `Detalle de Receta - ${receta.nombre}`,
      RecetaDetalleComponent,
      { recetaId: receta.id },
      `detalle-receta-${receta.id}-tab`
    );
  }

  // ✅ Nuevo método para recalcular costos manualmente
  recalculateRecipeCosts(): void {
    this.loading = true;
    this.snackBar.open('Recalculando costos de recetas...', 'Cerrar', { duration: 2000 });

    this.repositoryService.recalculateAllRecipeCosts().subscribe({
      next: (results) => {
        this.loading = false;

        // Mostrar resultados del recálculo
        const actualizadas = results.filter((r: any) => r.updated).length;
        const total = results.length;

        this.snackBar.open(
          `Recálculo completado: ${actualizadas} de ${total} recetas actualizadas`,
          'Cerrar',
          { duration: 3000 }
        );

        // Recargar la lista para mostrar los nuevos costos
        this.loadRecetas();
      },
      error: (error) => {
        console.error('Error recalculating recipe costs:', error);
        this.snackBar.open('Error al recalcular costos', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }
}
