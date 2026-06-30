import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { CurrencyInputDirective } from '../../directives/currency-input.directive';
import { Caja, CajaEstado } from '../../../database/entities/financiero/caja.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { Venta, VentaEstado } from '../../../database/entities/ventas/venta.entity';

export interface CierreCajaDialogData {
  caja: Caja;
  monedas: Moneda[];
}

interface MonedaConteo {
  moneda: Moneda;
  totalVentas: number;
  montoApertura: number;
  totalEsperado: number;
  totalContado: number;
  diferencia: number;
}

@Component({
  selector: 'app-cierre-caja-dialog',
  templateUrl: './cierre-caja-dialog.component.html',
  styleUrls: ['./cierre-caja-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatTableModule,
    CurrencyInputDirective,
  ],
})
export class CierreCajaDialogComponent implements OnInit {
  ventasAbiertas: Venta[] = [];
  ventasConcluidas: Venta[] = [];
  monedaConteos: MonedaConteo[] = [];
  observaciones = '';
  processing = false;
  hasOpenVentas = false;
  errorMsg = '';

  constructor(
    public dialogRef: MatDialogRef<CierreCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CierreCajaDialogData,
    private repositoryService: RepositoryService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadVentasDeCaja();
    this.initMonedaConteos();
  }

  private async loadVentasDeCaja(): Promise<void> {
    const ventas = await firstValueFrom(this.repositoryService.getVentasByCaja(this.data.caja.id));
    this.ventasAbiertas = ventas.filter(v => v.estado === VentaEstado.ABIERTA);
    this.ventasConcluidas = ventas.filter(v => v.estado === VentaEstado.CONCLUIDA);
    this.hasOpenVentas = this.ventasAbiertas.length > 0;
  }

  private initMonedaConteos(): void {
    this.monedaConteos = this.data.monedas.map(moneda => ({
      moneda,
      totalVentas: 0,
      montoApertura: 0,
      totalEsperado: 0,
      totalContado: 0,
      diferencia: 0,
    }));
  }

  onContadoChange(mc: MonedaConteo): void {
    mc.diferencia = mc.totalContado - mc.totalEsperado;
  }

  get canCerrar(): boolean {
    return !this.hasOpenVentas && !this.processing;
  }

  async cerrar(): Promise<void> {
    if (!this.canCerrar || this.processing) return;
    this.processing = true;
    this.errorMsg = '';

    try {
      // Crear conteo de cierre
      const conteo = await firstValueFrom(this.repositoryService.createConteo({
        activo: true,
        tipo: 'CIERRE',
        fecha: new Date(),
        observaciones: this.observaciones.toUpperCase() || undefined,
      }));

      // Actualizar caja
      await firstValueFrom(this.repositoryService.updateCaja(this.data.caja.id, {
        estado: CajaEstado.CERRADO,
        fechaCierre: new Date(),
        conteoCierre: conteo,
      }));

      this.dialogRef.close({ success: true });
    } catch (error: any) {
      console.error('Error al cerrar caja:', error);
      // Surfacing del guard de backend (ej. ventas abiertas por la carrera
      // multi-dispositivo): mostrar el mensaje y refrescar el estado de ventas.
      this.errorMsg = (error?.message || 'No se pudo cerrar la caja.').replace(/^Error:\s*/, '');
      await this.loadVentasDeCaja();
      this.processing = false;
    }
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }
}
