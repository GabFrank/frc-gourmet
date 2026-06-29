import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { Timbrado } from '../../../../database/entities/facturacion/timbrado.entity';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditTimbradoComponent } from '../create-edit-timbrado/create-edit-timbrado.component';
import { TimbradoDetallesDialogComponent } from '../timbrado-detalles-dialog/timbrado-detalles-dialog.component';

@Component({
  selector: 'app-list-timbrados',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-timbrados.component.html',
  styleUrls: ['./list-timbrados.component.scss'],
})
export class ListTimbradosComponent implements OnInit {
  timbrados: Timbrado[] = [];
  displayedColumns: string[] = ['numero', 'ruc', 'tipo', 'vigencia', 'detalles', 'activo', 'acciones'];
  isLoading = false;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.loadTimbrados();
  }

  async loadTimbrados(): Promise<void> {
    this.isLoading = true;
    try {
      this.timbrados = await firstValueFrom(this.repositoryService.getTimbrados());
    } catch (error) {
      console.error('Error loading timbrados:', error);
      this.snackBar.open('Error al cargar timbrados', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  addTimbrado(): void {
    const ref = this.dialog.open(CreateEditTimbradoComponent, {
      width: '720px',
      maxHeight: '90vh',
      data: { timbrado: null },
    });
    ref.afterClosed().subscribe((r) => { if (r) this.loadTimbrados(); });
  }

  editTimbrado(timbrado: Timbrado): void {
    const ref = this.dialog.open(CreateEditTimbradoComponent, {
      width: '720px',
      maxHeight: '90vh',
      data: { timbrado },
    });
    ref.afterClosed().subscribe((r) => { if (r) this.loadTimbrados(); });
  }

  openDetalles(timbrado: Timbrado): void {
    const ref = this.dialog.open(TimbradoDetallesDialogComponent, {
      width: '900px',
      maxHeight: '90vh',
      data: { timbrado },
    });
    ref.afterClosed().subscribe(() => this.loadTimbrados());
  }

  deleteTimbrado(timbrado: Timbrado): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar timbrado',
        message: `¿Eliminar el timbrado ${timbrado.numero}? Esta accion no se puede deshacer.`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      firstValueFrom(this.repositoryService.deleteTimbrado(timbrado.id!))
        .then(() => {
          this.snackBar.open('Timbrado eliminado', 'Cerrar', { duration: 3000 });
          this.loadTimbrados();
        })
        .catch((e) => {
          this.snackBar.open(e?.message || 'No se pudo eliminar el timbrado', 'Cerrar', { duration: 5000 });
        });
    });
  }
}
