import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort, MatSort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from 'src/app/database/repository.service';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from 'src/app/database/entities/financiero/moneda-cambio.entity';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditMonedaCambioDialogComponent } from './create-edit-moneda-cambio-dialog.component';

@Component({
  selector: 'app-list-monedas-cambio-dialog',
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSortModule,
    MatTooltipModule,
    MatMenuModule,
    FormsModule,
    ReactiveFormsModule,
    ConfirmationDialogComponent
  ],
  templateUrl: './list-monedas-cambio-dialog.component.html',
  styleUrls: ['./list-monedas-cambio-dialog.component.scss']
})
export class ListMonedasCambioDialogComponent implements OnInit {
  monedaOrigen: Moneda;
  displayedColumns: string[] = ['monedaDestino', 'compraOficial', 'ventaOficial', 'compraLocal', 'ventaLocal', 'activo', 'acciones'];
  dataSource = new MatTableDataSource<MonedaCambio>([]);
  loading = false;
  saving = false;
  error: string | null = null;
  currentSort: Sort = { active: '', direction: '' };

  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private dialogRef: MatDialogRef<ListMonedasCambioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { monedaOrigen: Moneda },
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.monedaOrigen = data.monedaOrigen;
  }

  ngOnInit(): void {
    this.loadCambios();
  }

  private loadCambios(): void {
    this.loading = true;
    this.error = null;

    this.repositoryService.getMonedasCambioByMonedaOrigen(this.monedaOrigen.id!).subscribe(
      (cambios) => {
        this.dataSource.data = cambios;
        this.loading = false;
      },
      (error) => {
        console.error('Error loading cambios:', error);
        this.error = 'Error al cargar los tipos de cambio. Verifique la conexión o contacte al administrador.';
        this.loading = false;

        this.snackBar.open('Error al cargar los tipos de cambio.', 'Cerrar', {
          duration: 5000
        });
      }
    );
  }

  sortData(sort: Sort): void {
    this.currentSort = sort;

    if (!sort.active || sort.direction === '') {
      return;
    }

    this.dataSource.data = this.dataSource.data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'monedaDestino':
          return this.compare(a.monedaDestino?.denominacion || '', b.monedaDestino?.denominacion || '', isAsc);
        case 'compraOficial':
          return this.compare(a.compraOficial, b.compraOficial, isAsc);
        case 'ventaOficial':
          return this.compare(a.ventaOficial, b.ventaOficial, isAsc);
        case 'compraLocal':
          return this.compare(a.compraLocal, b.compraLocal, isAsc);
        case 'ventaLocal':
          return this.compare(a.ventaLocal, b.ventaLocal, isAsc);
        case 'activo':
          return this.compare(a.activo, b.activo, isAsc);
        default: return 0;
      }
    });
  }

  private compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  addCambio(): void {
    const dialogRef = this.dialog.open(CreateEditMonedaCambioDialogComponent, {
      width: '800px',
      data: { monedaCambio: null, monedaOrigen: this.monedaOrigen },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadCambios();
        this.snackBar.open('Tipo de cambio creado exitosamente', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  editCambio(cambio: MonedaCambio): void {
    const dialogRef = this.dialog.open(CreateEditMonedaCambioDialogComponent, {
      width: '800px',
      data: { monedaCambio: cambio },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadCambios();
        this.snackBar.open('Tipo de cambio actualizado exitosamente', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  toggleActivo(cambio: MonedaCambio): void {
    this.saving = true;

    const cambioData: Partial<MonedaCambio> = {
      ...cambio,
      activo: !cambio.activo
    };

    this.repositoryService.updateMonedaCambio(cambio.id!, cambioData).subscribe(
      () => {
        cambio.activo = !cambio.activo;
        this.dataSource.data = [...this.dataSource.data];
        this.saving = false;
        this.snackBar.open(
          `Tipo de cambio ${cambio.activo ? 'activado' : 'desactivado'} exitosamente`,
          'Cerrar',
          { duration: 3000 }
        );
      },
      (error) => {
        console.error('Error toggling cambio status:', error);
        this.saving = false;
        this.snackBar.open('Error al actualizar el estado del tipo de cambio.', 'Cerrar', {
          duration: 5000
        });
      }
    );
  }

  deleteCambio(cambio: MonedaCambio): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar Tipo de Cambio',
        message: `¿Está seguro que desea eliminar el tipo de cambio de ${this.monedaOrigen.simbolo} a ${cambio.monedaDestino.simbolo}?`
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.saving = true;

        this.repositoryService.deleteMonedaCambio(cambio.id!).subscribe(
          () => {
            this.dataSource.data = this.dataSource.data.filter(c => c.id !== cambio.id);
            this.saving = false;
            this.snackBar.open('Tipo de cambio eliminado exitosamente', 'Cerrar', {
              duration: 3000
            });
          },
          (error) => {
            console.error('Error deleting cambio:', error);
            this.saving = false;
            this.snackBar.open('Error al eliminar el tipo de cambio.', 'Cerrar', {
              duration: 5000
            });
          }
        );
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
