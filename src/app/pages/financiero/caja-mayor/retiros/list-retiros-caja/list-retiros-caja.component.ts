import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { IngresarRetiroCajaDialogComponent } from '../ingresar-retiro-caja-dialog/ingresar-retiro-caja-dialog.component';

interface RetiroRow {
  retiro: any;
  totalRetiro: number;
}

@Component({
  selector: 'app-list-retiros-caja',
  templateUrl: './list-retiros-caja.component.html',
  styleUrls: ['./list-retiros-caja.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    DatePipe,
  ]
})
export class ListRetirosCajaComponent implements OnInit {
  retiroRows: RetiroRow[] = [];
  loading = false;
  displayedColumns = ['id', 'caja', 'origen', 'estado', 'fechaRetiro', 'cajaMayor', 'responsable', 'total', 'actions'];

  estadoFilter = new FormControl(null);
  estadoOptions = ['FLOTANTE', 'VINCULADO_PENDIENTE', 'INGRESADO'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  setData(data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const filtros: any = {};
      if (this.estadoFilter.value) {
        filtros.estado = this.estadoFilter.value;
      }
      const retiros = await firstValueFrom(this.repositoryService.getRetirosCaja(filtros));
      this.retiroRows = (retiros || []).map((retiro: any) => {
        const totalRetiro = (retiro.detalles || []).reduce((sum: number, d: any) => sum + (d.monto || 0), 0);
        return { retiro, totalRetiro };
      });
    } catch (error) {
      console.error('Error loading retiros:', error);
      this.snackBar.open('Error al cargar retiros', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  aplicarFiltro(): void {
    this.loadData();
  }

  limpiarFiltro(): void {
    this.estadoFilter.reset();
    this.loadData();
  }

  ingresarACajaMayor(retiroRow: RetiroRow): void {
    const dialogRef = this.dialog.open(IngresarRetiroCajaDialogComponent, {
      width: '600px',
      data: { retiro: retiroRow.retiro },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      }
    });
  }

  verDetalles(retiroRow: RetiroRow): void {
    this.snackBar.open('Detalle del retiro #' + retiroRow.retiro.id, 'Cerrar', { duration: 3000 });
  }
}
