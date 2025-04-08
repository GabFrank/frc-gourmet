import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { Dispositivo } from 'src/app/database/entities/financiero/dispositivo.entity';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateEditDispositivoComponent } from './create-edit-dispositivo.component';

@Component({
  selector: 'app-list-dispositivos',
  templateUrl: './list-dispositivos.component.html',
  styleUrls: ['./list-dispositivos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatChipsModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatMenuModule,
    CreateEditDispositivoComponent
  ]
})
export class ListDispositivosComponent implements OnInit {
  displayedColumns: string[] = ['id', 'nombre', 'isVenta', 'isCaja', 'isTouch', 'isMobile', 'activo', 'actions'];
  dataSource: Dispositivo[] = [];
  loading = true;
  error: string | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<Dispositivo>;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadDispositivos();
  }

  loadDispositivos(): void {
    this.loading = true;
    this.repositoryService.getDispositivos().subscribe(
      dispositivos => {
        this.dataSource = dispositivos;
        this.loading = false;
      },
      error => {
        console.error('Error loading dispositivos:', error);
        this.error = 'Error al cargar los dispositivos';
        this.loading = false;
      }
    );
  }

  // Method to create a new dispositivo
  createDispositivo(): void {
    const dialogRef = this.dialog.open(CreateEditDispositivoComponent, {
      width: '600px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadDispositivos();
      }
    });
  }

  // Method to edit a dispositivo
  editDispositivo(dispositivo: Dispositivo): void {
    const dialogRef = this.dialog.open(CreateEditDispositivoComponent, {
      width: '600px',
      data: { dispositivo }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadDispositivos();
      }
    });
  }

  // Method to toggle dispositivo active status
  toggleActive(dispositivo: Dispositivo): void {
    const updatedDispositivo = { ...dispositivo, activo: !dispositivo.activo };

    this.repositoryService.updateDispositivo(dispositivo.id!, updatedDispositivo).subscribe(
      result => {
        // Update the local data
        dispositivo.activo = !dispositivo.activo;

        // Show success message
        this.snackBar.open(
          `Dispositivo ${dispositivo.activo ? 'activado' : 'desactivado'} exitosamente`,
          'Cerrar',
          { duration: 3000 }
        );
      },
      error => {
        console.error('Error toggling dispositivo active status:', error);
        this.snackBar.open(
          'Error al cambiar el estado del dispositivo',
          'Cerrar',
          { duration: 3000 }
        );
      }
    );
  }

  // Method to delete a dispositivo
  deleteDispositivo(dispositivoId: number): void {
    if (confirm('¿Está seguro que desea eliminar este dispositivo? Esta acción no se puede deshacer.')) {
      this.repositoryService.deleteDispositivo(dispositivoId).subscribe(
        () => {
          this.snackBar.open('Dispositivo eliminado exitosamente', 'Cerrar', {
            duration: 3000
          });
          this.loadDispositivos();
        },
        error => {
          console.error('Error deleting dispositivo:', error);
          this.snackBar.open(
            'Error al eliminar el dispositivo',
            'Cerrar',
            { duration: 3000 }
          );
        }
      );
    }
  }
}
