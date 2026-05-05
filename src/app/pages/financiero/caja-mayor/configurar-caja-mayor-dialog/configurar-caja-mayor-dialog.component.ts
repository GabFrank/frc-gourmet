import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface OpcionFp {
  id: number;
  nombre: string;
  visible: boolean;
}

interface OpcionCb {
  id: number;
  nombre: string;
  banco: string;
  numeroCuenta: string;
  monedaSimbolo: string;
  visible: boolean;
}

@Component({
  selector: 'app-configurar-caja-mayor-dialog',
  templateUrl: './configurar-caja-mayor-dialog.component.html',
  styleUrls: ['./configurar-caja-mayor-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
  ],
})
export class ConfigurarCajaMayorDialogComponent implements OnInit {
  loading = true;
  guardando = false;
  formasPago: OpcionFp[] = [];
  cuentasBancarias: OpcionCb[] = [];
  mostrarCuentasPorPagar = false;
  mostrarCuentasPorCobrar = false;

  constructor(
    public dialogRef: MatDialogRef<ConfigurarCajaMayorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { cajaMayorId: number },
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [fps, cbs, config] = await Promise.all([
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
        firstValueFrom(this.repositoryService.getCajaMayorConfiguracion(this.data.cajaMayorId)),
      ]);

      const fpVisibleIds = new Set<number>(
        (config?.formasPagoVisibles || []).map((x: any) => x.id),
      );
      const cbVisibleIds = new Set<number>(
        (config?.cuentasBancariasVisibles || []).map((x: any) => x.id),
      );
      const tieneConfig = !!config;

      this.formasPago = (fps || [])
        .filter((fp: any) => fp.activo)
        .map((fp: any) => ({
          id: fp.id,
          nombre: fp.nombre,
          // Sin config previa: marcar todas las FPs (compatibilidad).
          visible: tieneConfig ? fpVisibleIds.has(fp.id) : true,
        }));

      this.cuentasBancarias = (cbs || [])
        .filter((cb: any) => cb.activo)
        .map((cb: any) => ({
          id: cb.id,
          nombre: cb.nombre,
          banco: cb.banco,
          numeroCuenta: cb.numeroCuenta,
          monedaSimbolo: cb.moneda?.simbolo || '-',
          // Default: opt-in. Solo si la config previa lo marcaba.
          visible: tieneConfig ? cbVisibleIds.has(cb.id) : false,
        }));

      this.mostrarCuentasPorPagar = !!config?.mostrarCuentasPorPagar;
      this.mostrarCuentasPorCobrar = !!config?.mostrarCuentasPorCobrar;
    } catch (error: any) {
      console.error('Error cargando configuracion de caja mayor:', error);
      this.snackBar.open('Error al cargar configuracion', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  toggleTodasFp(check: boolean): void {
    this.formasPago.forEach((fp) => (fp.visible = check));
  }

  toggleTodasCb(check: boolean): void {
    this.cuentasBancarias.forEach((cb) => (cb.visible = check));
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }

  async guardar(): Promise<void> {
    if (this.guardando) return;
    this.guardando = true;
    try {
      const formaPagoIds = this.formasPago.filter((x) => x.visible).map((x) => x.id);
      const cuentaBancariaIds = this.cuentasBancarias.filter((x) => x.visible).map((x) => x.id);
      await firstValueFrom(
        this.repositoryService.saveCajaMayorConfiguracion(this.data.cajaMayorId, {
          formaPagoIds,
          cuentaBancariaIds,
          mostrarCuentasPorPagar: this.mostrarCuentasPorPagar,
          mostrarCuentasPorCobrar: this.mostrarCuentasPorCobrar,
        }),
      );
      this.snackBar.open('Configuracion guardada', 'Cerrar', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (error: any) {
      console.error('Error guardando configuracion:', error);
      this.snackBar.open(`Error: ${error?.message || 'no se pudo guardar'}`, 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar'],
      });
    } finally {
      this.guardando = false;
    }
  }
}
