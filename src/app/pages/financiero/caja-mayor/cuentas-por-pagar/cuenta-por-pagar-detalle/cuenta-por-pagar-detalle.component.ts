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
import { PagarCuotaDialogComponent } from '../pagar-cuota-dialog/pagar-cuota-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';

@Component({
  selector: 'app-cuenta-por-pagar-detalle',
  templateUrl: './cuenta-por-pagar-detalle.component.html',
  styleUrls: ['./cuenta-por-pagar-detalle.component.scss'],
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
    HasPermissionDirective,
  ]
})
export class CuentaPorPagarDetalleComponent implements OnInit {
  cuentaPorPagarId: number | null = null;
  cpp: any = null;
  cuotas: any[] = [];
  cuotasConMixto = new Set<number>();
  loading = false;
  cuotaColumns = ['numero', 'fechaVencimiento', 'monto', 'montoPagado', 'restante', 'estado', 'fechaPago', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    if (this.cuentaPorPagarId) this.loadData();
  }

  setData(data: any): void {
    this.cuentaPorPagarId = data?.cuentaPorPagarId || null;
    if (this.cuentaPorPagarId) this.loadData();
  }

  async loadData(): Promise<void> {
    if (!this.cuentaPorPagarId) return;
    this.loading = true;
    try {
      const [cpp, cuotas] = await Promise.all([
        firstValueFrom(this.repositoryService.getCuentaPorPagar(this.cuentaPorPagarId)),
        firstValueFrom(this.repositoryService.getCuentaPorPagarCuotas(this.cuentaPorPagarId)),
      ]);
      this.cpp = cpp;
      this.cuotas = cuotas || [];
      try {
        const ids: any = await firstValueFrom(this.repositoryService.getCuotasConPagoMixto(this.cuentaPorPagarId));
        this.cuotasConMixto = new Set<number>((ids || []).map((n: any) => Number(n)));
      } catch { this.cuotasConMixto = new Set<number>(); }
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  pagar(cuota: any): void {
    const ref = this.dialog.open(PagarCuotaDialogComponent, {
      width: '600px',
      data: {
        cuotaTipo: 'CPP',
        cuota,
        contextoLabel: this.cpp?.descripcion,
      },
    });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  // El pago mixto (varias formas/monedas) aplica a cuotas de compras (tipo COMPRA).
  get permiteMixto(): boolean {
    return this.cpp?.tipo === 'COMPRA';
  }

  async pagoMixto(cuota: any): Promise<void> {
    const saldo = +(Number(cuota.monto || 0) - Number(cuota.montoPagado || 0)).toFixed(2);
    const { PagoMixtoCuotaDialogComponent } = await import(
      '../../pago-mixto-cuota-dialog/pago-mixto-cuota-dialog.component'
    );
    const ref = this.dialog.open(PagoMixtoCuotaDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      data: {
        cuota: {
          id: cuota.id,
          numero: cuota.numero,
          saldoPendiente: saldo,
          monedaId: this.cpp?.moneda?.id,
          monedaSimbolo: this.cpp?.moneda?.simbolo,
          monedaDenominacion: this.cpp?.moneda?.denominacion,
          cppId: this.cpp?.id,
          proveedorNombre: this.cpp?.proveedor?.nombre,
          compraNumeroNota: this.cpp?.observacion,
        },
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (ok) this.loadData();
  }

  tieneMixto(cuota: any): boolean {
    return this.cuotasConMixto.has(Number(cuota.id));
  }

  async anularPagoMixto(cuota: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular pago mixto',
        message: `¿Anular los pagos mixtos de la cuota #${cuota.numero}? Se revertirán los movimientos de Caja Mayor/banco y el saldo de la cuota.`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularPagoMixtoCuota({ cuotaId: cuota.id, motivo: 'ANULACION MANUAL' }));
      this.snackBar.open('Pago mixto anulado', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e: any) {
      console.error(e);
      const msg = (e?.message || String(e)).replace(/^Error invoking remote method '[^']+': Error: /, '');
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    }
  }

  estadoColor(estado: string): string {
    switch (estado) {
      case 'PENDIENTE': return '#9e9e9e';
      case 'PARCIAL': return '#ff9800';
      case 'PAGADA': return '#4caf50';
      case 'VENCIDA': return '#f44336';
      default: return '#9e9e9e';
    }
  }

  restante(c: any): number {
    return +(Number(c.monto || 0) - Number(c.montoPagado || 0)).toFixed(2);
  }

  cppEstadoColor(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return '#1976d2';
      case 'PAGADO': return '#4caf50';
      case 'CANCELADO': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  }
}
