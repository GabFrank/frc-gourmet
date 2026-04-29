import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CobrarCuotaDialogComponent } from '../cobrar-cuota-dialog/cobrar-cuota-dialog.component';

@Component({
  selector: 'app-cuenta-por-cobrar-detalle',
  templateUrl: './cuenta-por-cobrar-detalle.component.html',
  styleUrls: ['./cuenta-por-cobrar-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
    MatTooltipModule,
    DatePipe,
  ]
})
export class CuentaPorCobrarDetalleComponent implements OnInit {
  cuentaPorCobrarId: number | null = null;
  cpc: any = null;
  cuotas: any[] = [];
  loading = false;
  cuotaColumns = ['numero', 'fechaVencimiento', 'monto', 'montoCobrado', 'restante', 'estado', 'fechaCobro', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    if (this.cuentaPorCobrarId) this.loadData();
  }

  setData(data: any): void {
    this.cuentaPorCobrarId = data?.cuentaPorCobrarId || null;
    if (this.cuentaPorCobrarId) this.loadData();
  }

  async loadData(): Promise<void> {
    if (!this.cuentaPorCobrarId) return;
    this.loading = true;
    try {
      const [cpc, cuotas] = await Promise.all([
        firstValueFrom(this.repositoryService.getCuentaPorCobrar(this.cuentaPorCobrarId)),
        firstValueFrom(this.repositoryService.getCuentaPorCobrarCuotas(this.cuentaPorCobrarId)),
      ]);
      this.cpc = cpc;
      this.cuotas = cuotas || [];
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  cobrar(cuota: any): void {
    const ref = this.dialog.open(CobrarCuotaDialogComponent, {
      width: '600px',
      data: {
        cuota,
        contextoLabel: this.cpc?.descripcion || `CPC #${this.cpc?.id}`,
      },
    });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  async anularCobro(cuota: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Cobro',
        message: `¿Anular el cobro de la cuota #${cuota.numero}? Se revertirá el movimiento en la caja mayor.`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularCobroCpcCuota({ cuotaId: cuota.id, motivo: 'ANULACION MANUAL' }));
      this.snackBar.open('Cobro anulado', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open(e?.message || 'Error al anular', 'Cerrar', { duration: 3000 });
    }
  }

  estadoColor(estado: string): string {
    switch (estado) {
      case 'PENDIENTE': return 'yellow';
      case 'PARCIAL': return 'orange';
      case 'COBRADO': return 'green';
      case 'CANCELADO': return 'gray';
      default: return 'gray';
    }
  }

  restante(c: any): number {
    return +(Number(c.monto || 0) - Number(c.montoCobrado || 0)).toFixed(2);
  }

  cpcEstadoColor(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return 'primary';
      case 'COBRADO': return 'accent';
      default: return '';
    }
  }

  clienteNombre(): string {
    return this.cpc?.cliente?.razon_social || this.cpc?.cliente?.persona?.nombre || '-';
  }
}
