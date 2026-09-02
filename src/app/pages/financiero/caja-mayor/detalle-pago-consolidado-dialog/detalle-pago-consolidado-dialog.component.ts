import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { confirmarSaldosNegativos, SaldoNegativoCheck } from 'src/app/shared/utils/saldo-negativo-confirm';

export interface DetallePagoConsolidadoData {
  pagoId: number;
}

/**
 * Qué obligaciones cubrió un pago consolidado y de dónde salió la plata.
 *
 * Existe porque el movimiento de Caja Mayor no puede nombrar en su observación a
 * las N obligaciones que salda: dice "PAGO CONSOLIDADO DE 3 GASTOS" y el
 * desglose se lee acá.
 */
@Component({
  selector: 'app-detalle-pago-consolidado-dialog',
  standalone: true,
  templateUrl: './detalle-pago-consolidado-dialog.component.html',
  styleUrls: ['./detalle-pago-consolidado-dialog.component.scss'],
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTableModule,
    MatDividerModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule,
    DecimalPipe, DatePipe,
  ],
})
export class DetallePagoConsolidadoDialogComponent implements OnInit {
  readonly columnasItems = ['descripcion', 'beneficiario', 'imputado'];
  readonly columnasLineas = ['fuente', 'monto', 'convertido'];

  loading = true;
  anulando = false;

  pago: any = null;
  items: any[] = [];
  lineas: any[] = [];

  // precomputados (sin funciones ni getters en el template)
  totalTexto = '';
  estaAnulado = false;
  tituloEstado = '';
  /** Un cobro (evento de ingreso) se lee y se anula al revés que un pago. */
  esIngreso = false;
  sustantivo = 'pago';
  labelItems = 'Obligaciones pagadas';
  labelLineas = 'Formas de pago';
  labelAnular = 'Anular pago';
  labelBeneficiario = 'Beneficiario';
  descuentoTexto = '';
  motivoDescuento = '';

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<DetallePagoConsolidadoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DetallePagoConsolidadoData,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const res: any = await firstValueFrom(this.repo.getPagoConsolidadoDetalle(this.data.pagoId));
      this.pago = res;
      this.items = res?.items || [];
      this.esIngreso = !!res?.esIngreso;
      this.sustantivo = this.esIngreso ? 'cobro' : 'pago';
      this.labelItems = this.esIngreso ? 'Cuotas cobradas' : 'Obligaciones pagadas';
      this.labelLineas = this.esIngreso ? 'Formas de cobro' : 'Formas de pago';
      this.labelAnular = this.esIngreso ? 'Anular cobro' : 'Anular pago';
      this.labelBeneficiario = this.esIngreso ? 'Cliente' : 'Beneficiario';
      const dec = res?.decimales ?? 0;
      this.motivoDescuento = res?.motivoDescuento || '';
      this.descuentoTexto = Number(res?.montoDescuento) > 0
        ? `${res?.monedaSimbolo || ''} ${this.fmt(res.montoDescuento, dec)}`.trim()
        : '';
      this.lineas = (res?.lineas || []).map((l: any) => ({
        ...l,
        icono: l.fuente === 'DESCUENTO'
          ? 'discount'
          : (l.fuente === 'CAJA_MAYOR' ? 'payments' : 'account_balance'),
        etiqueta: l.fuente === 'DESCUENTO'
          ? `Descuento${res?.motivoDescuento ? ` — ${res.motivoDescuento}` : ''}`
          : (l.fuente === 'CAJA_MAYOR'
            ? `${l.formaPago || 'Efectivo'} (caja mayor)`
            : 'Cuenta bancaria'),
        convertidoTexto: Number(l.cotizacion) === 1
          ? ''
          : `${res.monedaSimbolo || ''} ${this.fmt(l.montoImputado, res.decimales)}`.trim(),
        montoTexto: `${l.monedaSimbolo || ''} ${this.fmt(l.montoOrigen, l.decimales ?? 2)}`.trim(),
      }));
      this.totalTexto = `${res?.monedaSimbolo || ''} ${this.fmt(res?.montoTotal, res?.decimales ?? 0)}`.trim();
      this.estaAnulado = res?.estado === 'ANULADO';
      this.tituloEstado = this.estaAnulado ? 'ANULADO' : '';
    } catch (e: any) {
      console.error('Error cargando detalle del pago', e);
      this.snackBar.open(e?.message || 'No se pudo cargar el detalle', 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  private fmt(v: any, dec: number): string {
    return new Intl.NumberFormat('es-PY', {
      minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 0,
    }).format(Number(v) || 0);
  }

  async anular(): Promise<void> {
    if (this.anulando || this.estaAnulado) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '440px',
      data: {
        title: this.esIngreso ? 'Anular cobro' : 'Anular pago',
        message: `Se van a revertir los ${this.lineas.length} movimiento(s) de este ${this.sustantivo} y `
          + `${this.items.length} obligación(es) van a volver a quedar pendientes. ¿Confirmás?`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;

    // Anular un COBRO debita la caja: puede dejarla en rojo. En un pago la reversa
    // repone saldo y no hace falta preguntar.
    if (this.esIngreso) {
      const checks: SaldoNegativoCheck[] = [];
      for (const l of this.lineas) {
        if (l.fuente !== 'CAJA_MAYOR' || !l.cajaMayorId) continue;
        const saldos: any[] = await firstValueFrom(this.repo.getCajaMayorSaldos(l.cajaMayorId));
        const s = (saldos || []).find(
          (x: any) => x.moneda?.simbolo === l.monedaSimbolo && x.formaPago?.nombre === l.formaPago,
        );
        checks.push({
          label: `${l.monedaDenominacion || l.monedaSimbolo} / ${l.formaPago || ''}`,
          saldoActual: s ? Number(s.saldo) : 0,
          monto: Number(l.montoOrigen),
          monedaSimbolo: l.monedaSimbolo,
        });
      }
      if (checks.length && !(await confirmarSaldosNegativos(this.dialog, checks))) return;
    }

    this.anulando = true;
    try {
      await firstValueFrom(this.repo.anularPagoConsolidado(this.data.pagoId, 'ANULADO DESDE EL DETALLE'));
      this.snackBar.open(this.esIngreso ? 'Cobro anulado.' : 'Pago anulado.', 'Cerrar', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      console.error('Error anulando pago consolidado', e);
      this.snackBar.open(e?.message || `No se pudo anular el ${this.sustantivo}`, 'Cerrar', { duration: 6000 });
    } finally {
      this.anulando = false;
    }
  }

  cerrar(): void {
    this.dialogRef.close(false);
  }
}
