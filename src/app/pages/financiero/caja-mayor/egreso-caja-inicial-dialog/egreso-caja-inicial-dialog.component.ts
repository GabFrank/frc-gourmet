import { Component, OnInit, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface BilleteVM {
  id: number;
  valor: number;
  cantidad: number;
  subtotal: number;
}

interface MonedaConfigVM {
  monedaId: number;
  simbolo: string;
  denominacion: string;
  digits: string; // formato para el pipe number (segun decimales)
  billetes: BilleteVM[];
  total: number;
}

/**
 * Egreso de caja inicial (Caja Mayor — Fase 2). Cuenta billete por billete el
 * efectivo que sale de la caja mayor para sembrar la apertura de una caja. Crea
 * un Conteo (reutilizable como apertura) + movimientos EGRESO_CAJA_INICIAL.
 */
@Component({
  selector: 'app-egreso-caja-inicial-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './egreso-caja-inicial-dialog.component.html',
  styleUrls: ['./egreso-caja-inicial-dialog.component.scss'],
})
export class EgresoCajaInicialDialogComponent implements OnInit {
  cajaMayorId = 0;
  observacion = '';

  monedasConfig: MonedaConfigVM[] = [];
  totalGeneralPorMoneda: { simbolo: string; total: number; digits: string }[] = [];
  tieneMonto = false;

  loading = true;
  saving = false;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<EgresoCajaInicialDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaMayorId = this.data?.cajaMayorId || 0;
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [cajasMonedas, billetes] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajasMonedas()),
        firstValueFrom(this.repositoryService.getMonedasBilletes()),
      ]);

      const activas = (cajasMonedas || [])
        .filter((cm: any) => cm.activo)
        .sort((a: any, b: any) => {
          const oa = a.orden ? parseInt(a.orden.toString(), 10) : 999;
          const ob = b.orden ? parseInt(b.orden.toString(), 10) : 999;
          return oa - ob;
        });

      this.monedasConfig = activas.map((cm: any) => {
        const moneda = cm.moneda;
        const dec = Number(moneda?.decimales);
        const digits = Number.isFinite(dec) && dec > 0 ? `1.${dec}-${dec}` : '1.0-0';
        const monedaBilletes: BilleteVM[] = (billetes || [])
          .filter((b: any) => b.moneda && b.moneda.id === moneda.id && b.activo)
          .sort((a: any, b: any) => a.valor - b.valor)
          .map((b: any) => ({ id: b.id, valor: b.valor, cantidad: 0, subtotal: 0 }));
        return {
          monedaId: moneda.id,
          simbolo: moneda.simbolo || '',
          denominacion: moneda.denominacion || '',
          digits,
          billetes: monedaBilletes,
          total: 0,
        };
      }).filter((mc: MonedaConfigVM) => mc.billetes.length > 0);
    } catch (error) {
      console.error('Error cargando monedas/billetes:', error);
      this.snackBar.open('Error al cargar datos del conteo', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  recompute(): void {
    const resumen: { simbolo: string; total: number; digits: string }[] = [];
    for (const mc of this.monedasConfig) {
      let total = 0;
      for (const b of mc.billetes) {
        const cant = Number(b.cantidad) || 0;
        b.subtotal = cant * Number(b.valor);
        total += b.subtotal;
      }
      mc.total = total;
      if (total > 0) resumen.push({ simbolo: mc.simbolo, total, digits: mc.digits });
    }
    this.totalGeneralPorMoneda = resumen;
    this.tieneMonto = resumen.length > 0;
  }

  async onSubmit(): Promise<void> {
    const detalles: { monedaBilleteId: number; cantidad: number }[] = [];
    for (const mc of this.monedasConfig) {
      for (const b of mc.billetes) {
        const cant = Number(b.cantidad) || 0;
        if (cant > 0) detalles.push({ monedaBilleteId: b.id, cantidad: cant });
      }
    }
    if (detalles.length === 0) {
      this.snackBar.open('Conte al menos un billete', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.cajaMayorId) {
      this.snackBar.open('Caja mayor no especificada', 'Cerrar', { duration: 3000 });
      return;
    }

    this.saving = true;
    try {
      const res: any = await firstValueFrom(
        this.repositoryService.egresoCajaInicial({
          cajaMayorId: this.cajaMayorId,
          observacion: this.observacion?.toUpperCase() || null,
          detalles,
        }),
      );
      this.snackBar.open('Egreso de caja inicial registrado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close({ success: true, conteoId: res?.conteoId });
    } catch (error: any) {
      console.error('Error en egreso de caja inicial:', error);
      const msg = (error?.message || '').match(/Error:\s*([^]*)$/)?.[1]?.trim() || 'Error al registrar el egreso';
      this.snackBar.open(msg, 'Cerrar', { duration: 6000, panelClass: ['error-snackbar'] });
    } finally {
      this.saving = false;
    }
  }

  selectOnFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    if (input) setTimeout(() => input.select(), 0);
  }

  onCancel(): void {
    this.dialogRef?.close();
  }
}
