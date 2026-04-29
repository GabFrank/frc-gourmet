import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LiquidacionComisionDetalleComponent } from '../liquidacion-comision-detalle/liquidacion-comision-detalle.component';
import { GenerarLiquidacionDialogComponent } from '../generar-liquidacion-dialog/generar-liquidacion-dialog.component';
import { GenerarLiquidacionesMesDialogComponent } from '../generar-liquidaciones-mes-dialog/generar-liquidaciones-mes-dialog.component';
import { AgregarItemManualDialogComponent } from '../agregar-item-manual-dialog/agregar-item-manual-dialog.component';

@Component({
  selector: 'app-list-liquidaciones-comision',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-liquidaciones-comision.component.html',
  styleUrls: ['./list-liquidaciones-comision.component.scss'],
})
export class ListLiquidacionesComisionComponent implements OnInit {
  liquidaciones: any[] = [];
  loading = false;
  funcionarios: any[] = [];
  displayedColumns = ['funcionario', 'periodo', 'totalCalculado', 'estado', 'acciones'];

  filtroFuncionarioId: number | null = null;
  filtroPeriodo = '';
  filtroEstado = '';

  estados = ['BORRADOR', 'APROBADA', 'INTEGRADA', 'ANULADA'];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.repo.getFuncionarios({}).subscribe({ next: (f) => this.funcionarios = f });
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    const filtros: any = {};
    if (this.filtroFuncionarioId) filtros.funcionarioId = this.filtroFuncionarioId;
    if (this.filtroPeriodo) filtros.periodo = this.filtroPeriodo;
    if (this.filtroEstado) filtros.estado = this.filtroEstado;
    this.repo.getLiquidacionesComision(filtros).subscribe({
      next: (d) => { this.liquidaciones = d; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  aplicarFiltro(): void { this.cargar(); }
  limpiarFiltro(): void {
    this.filtroFuncionarioId = null;
    this.filtroPeriodo = '';
    this.filtroEstado = '';
    this.cargar();
  }

  abrirGenerar(): void {
    const ref = this.dialog.open(GenerarLiquidacionDialogComponent, { width: '500px' });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  abrirGenerarMes(): void {
    const ref = this.dialog.open(GenerarLiquidacionesMesDialogComponent, { width: '400px' });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  verDetalle(liq: any): void {
    this.dialog.open(LiquidacionComisionDetalleComponent, { width: '800px', data: { liquidacionId: liq.id } });
  }

  async aprobar(liq: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Aprobar liquidación', message: `¿Aprobar la liquidación de comisión de ${liq.funcionario?.persona?.nombre} — ${liq.periodo}?` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.aprobarLiquidacionComision(liq.id));
      this.snackBar.open('Liquidación aprobada', 'OK', { duration: 3000 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  async anular(liq: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Anular liquidación', message: `¿Anular la liquidación de comisión?` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.anularLiquidacionComision(liq.id));
      this.snackBar.open('Liquidación anulada', 'OK', { duration: 3000 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  abrirAgregarItemManual(liq: any): void {
    const ref = this.dialog.open(AgregarItemManualDialogComponent, { width: '500px', data: { liquidacionId: liq.id } });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  getEstadoClass(estado: string): string {
    const map: any = { BORRADOR: 'estado-borrador', APROBADA: 'estado-aprobada', INTEGRADA: 'estado-integrada', ANULADA: 'estado-anulada' };
    return map[estado] || '';
  }
}
