import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditChequeraDialogComponent } from '../create-edit-chequera/create-edit-chequera-dialog.component';
import { ListChequesComponent } from '../list-cheques/list-cheques.component';

@Component({
  selector: 'app-list-chequeras',
  templateUrl: './list-chequeras.component.html',
  styleUrls: ['./list-chequeras.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatProgressSpinnerModule, MatChipsModule, MatDialogModule, MatSnackBarModule,
    MatTooltipModule, DecimalPipe,
  ]
})
export class ListChequerasComponent implements OnInit {
  chequeras: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'cuentaBancaria', 'rango', 'siguienteNumero', 'estado', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  setData(_data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.chequeras = await firstValueFrom(this.repositoryService.getChequeras());
    } catch (error) {
      console.error('Error loading chequeras:', error);
      this.snackBar.open('Error al cargar chequeras', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateEditChequeraDialogComponent, {
      width: '600px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  verHistorico(chequera: any): void {
    this.dialog.open(ListChequesComponent, {
      width: '95vw',
      maxWidth: '1300px',
      maxHeight: '90vh',
      data: { chequeraId: chequera.id, chequeraNombre: chequera.nombre },
    });
  }

  openEditDialog(chequera: any): void {
    const ref = this.dialog.open(CreateEditChequeraDialogComponent, {
      width: '600px',
      data: { chequeraId: chequera.id },
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  async eliminar(chequera: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Chequera',
        message: `¿Anular la chequera "${chequera.nombre}"?`,
      }
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteChequera(chequera.id));
      this.snackBar.open('Chequera anulada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Error anulando chequera:', error);
      this.snackBar.open('Error al anular chequera', 'Cerrar', { duration: 3000 });
    }
  }

  estadoColor(e: string): string {
    switch (e) {
      case 'ACTIVA': return '#4caf50';
      case 'AGOTADA': return '#ff9800';
      case 'ANULADA': return '#f44336';
      default: return '#757575';
    }
  }
}
