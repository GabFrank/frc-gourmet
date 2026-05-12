import { Component, Inject, OnInit, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { Venta, VentaEstado } from '../../../database/entities/ventas/venta.entity';
import { VentaItem, EstadoVentaItem } from '../../../database/entities/ventas/venta-item.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { Caja } from '../../../database/entities/financiero/caja.entity';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';
import { Pago } from '../../../database/entities/compras/pago.entity';
import { PagoEstado } from '../../../database/entities/compras/estado.enum';
import { PagoDetalle, TipoDetalle } from '../../../database/entities/compras/pago-detalle.entity';
import { AjusteCobrarDialogComponent } from './ajuste-cobrar-dialog.component';
import { EditDetalleDialogComponent } from './edit-detalle-dialog.component';
import { CobrarCreditoDialogComponent, CobrarCreditoDialogData } from './cobrar-credito-dialog.component';
import { CurrencyInputDirective } from '../../directives/currency-input.directive';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface CobrarVentaDialogData {
  venta: Venta;
  items: VentaItem[];
  monedas: Moneda[];
  exchangeRates: MonedaCambio[];
  principalMoneda: Moneda;
  caja: Caja;
}

interface DetalleRow {
  id: number;
  moneda: Moneda;
  formaPago: FormasPago;
  valor: number;
  tipo: TipoDetalle;
  tipoLabel: string;
  observacion?: string;
  valorDisplay: string; // pre-formatted: "PYG 40,000" or "USD 6.35"
  maquinaPosId?: number; // máquina POS elegida para esta línea (si la formaPago tiene maquinasPos)
  maquinaPosNombre?: string;
  cuentaBancariaId?: number; // cuenta bancaria elegida (transferencia / PIX). Acreditacion instantanea.
  cuentaBancariaNombre?: string;
}

interface CurrencyDisplay {
  moneda: Moneda;
  total: number;
  saldo: number;
  vuelto: number;
  cotizacion: number;
  isPrincipal: boolean;
  totalDisplay: string;
  saldoDisplay: string;
  vueltoDisplay: string;
}

@Component({
  selector: 'app-cobrar-venta-dialog',
  templateUrl: './cobrar-venta-dialog.component.html',
  styleUrls: ['./cobrar-venta-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
    MatTableModule,
    MatMenuModule,
    MatTooltipModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ],
})
export class CobrarVentaDialogComponent implements OnInit, AfterViewInit {
  readonly DISPLAY_COLUMNS = ['numero', 'moneda', 'formaPago', 'valor', 'tipo', 'actions'];

  @ViewChild('monedaSelect') monedaSelectRef!: ElementRef;
  @ViewChild('valorInputRef') valorInputRef!: ElementRef;

  // Selections
  selectedMoneda: Moneda | null = null;
  selectedFormaPago: FormasPago | null = null;
  selectedMaquinaPosId: number | null = null;
  selectedCuentaBancariaId: number | null = null;
  valorInput = 0;
  observacionInput = '';

  // Data
  formasPago: FormasPago[] = [];
  detalleRows: DetalleRow[] = [];
  pago: Pago | null = null;

  // Pre-computed for template
  currencyDisplays: CurrencyDisplay[] = [];
  activeItems: VentaItem[] = [];
  subtotal = 0;
  descuentoTotal = 0;
  totalPrincipal = 0;
  saldoPrincipal = 0;
  vueltoPrincipal = 0;

  // Indicates if the current input line will be PAGO or VUELTO
  currentLineType: 'PAGO' | 'VUELTO' = 'PAGO';

  // Decimales de la moneda actualmente seleccionada (para appCurrencyInput)
  decimalesMoneda = 0;

  // Costo
  costoTotal = 0;
  showCosto = false;

  // División de cuenta
  divisionPersonas = 1;
  divisionValorDisplay = '';

  // State
  processing = false;
  addingLine = false;

  private formatValor(valor: number, moneda: Moneda): string {
    const dec = moneda.decimales || 0;
    return moneda.simbolo + ' ' + valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  // Pre-computed flags para el botón "Cobrar a crédito"
  canCobrarCredito = false;
  cobrarCreditoTooltip = '';

  constructor(
    public dialogRef: MatDialogRef<CobrarVentaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CobrarVentaDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    this.activeItems = this.data.items.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    this.calculateTotals();
    await this.loadFormasPago();
    await this.loadExistingPago();

    if (this.data.monedas.length > 0) {
      this.selectedMoneda = this.data.principalMoneda || this.data.monedas[0];
      this.autoFillValor();
    }
  }

  private async loadExistingPago(): Promise<void> {
    try {
      // Fetch venta fresh with pago relation
      const ventaFresh = await firstValueFrom(this.repositoryService.getVenta(this.data.venta.id));
      if (ventaFresh?.pago?.id) {
        this.pago = ventaFresh.pago;
        const detalles = await firstValueFrom(this.repositoryService.getPagoDetalles(ventaFresh.pago.id));
        this.detalleRows = detalles
          .filter((d: any) => d.activo)
          .map((d: any) => {
            const moneda = d.moneda || this.data.principalMoneda;
            return {
              id: d.id,
              moneda,
              formaPago: d.formaPago || this.formasPago[0],
              valor: Number(d.valor),
              tipo: d.tipo as TipoDetalle,
              tipoLabel: d.tipo as string,
              observacion: d.observacion,
              valorDisplay: this.formatValor(Number(d.valor), moneda),
            };
          });
        this.updateCurrencyDisplays();
        this.autoFillValor();
      }
    } catch (error) {
      console.error('Error loading existing pago:', error);
    }
  }

  ngAfterViewInit(): void {
    // Focus moneda select on open
    setTimeout(() => {
      const monedaEl = document.querySelector('.moneda-select .mat-mdc-select-trigger') as HTMLElement;
      if (monedaEl) monedaEl.focus();
    }, 300);
  }

  private async loadFormasPago(): Promise<void> {
    this.formasPago = await firstValueFrom(this.repositoryService.getFormasPago());
    this.formasPago = this.formasPago.filter(fp => fp.activo);
    this.formasPago.sort((a, b) => a.orden - b.orden);
    if (this.formasPago.length > 0) {
      this.selectedFormaPago = this.formasPago.find(fp => fp.principal) || this.formasPago[0];
    }
    this.onFormaPagoChange();
  }

  // Cuando cambia la forma de pago, autoselecciona maquina POS / cuenta bancaria si solo hay 1
  onFormaPagoChange(): void {
    const maquinas = this.maquinasPosDisponibles;
    if (maquinas.length === 1) {
      this.selectedMaquinaPosId = maquinas[0].id;
      this.aplicarMonedaDeMaquinaPos(maquinas[0]);
    } else {
      this.selectedMaquinaPosId = null;
    }

    const cuentas = this.cuentasBancariasDisponibles;
    if (cuentas.length === 1) {
      this.selectedCuentaBancariaId = cuentas[0].id;
      this.aplicarMonedaDeCuentaBancaria(cuentas[0]);
    } else {
      this.selectedCuentaBancariaId = null;
    }
  }

  onMaquinaPosSelected(mp: any): void {
    this.selectedMaquinaPosId = mp.id;
    this.aplicarMonedaDeMaquinaPos(mp);
  }

  onCuentaBancariaSelected(cb: any): void {
    this.selectedCuentaBancariaId = cb.id;
    this.aplicarMonedaDeCuentaBancaria(cb);
  }

  // Cambia la moneda seleccionada para que coincida con la de la cuenta bancaria de la maquina POS.
  // Busca la moneda en la lista habilitada (data.monedas); si no esta, deja la actual.
  private aplicarMonedaDeMaquinaPos(mp: any): void {
    const monedaId = mp?.cuentaBancaria?.moneda?.id;
    if (!monedaId) return;
    const m = this.data.monedas.find(x => x.id === monedaId);
    if (m) {
      this.selectedMoneda = m;
      this.autoFillValor();
    }
  }

  private aplicarMonedaDeCuentaBancaria(cb: any): void {
    const monedaId = cb?.moneda?.id;
    if (!monedaId) return;
    const m = this.data.monedas.find(x => x.id === monedaId);
    if (m) {
      this.selectedMoneda = m;
      this.autoFillValor();
    }
  }

  get maquinasPosDisponibles(): any[] {
    return (this.selectedFormaPago as any)?.maquinasPos || [];
  }

  get cuentasBancariasDisponibles(): any[] {
    return (this.selectedFormaPago as any)?.cuentasBancarias || [];
  }

  get requiereSeleccionMaquinaPos(): boolean {
    return this.maquinasPosDisponibles.length >= 2;
  }

  get requiereSeleccionCuentaBancaria(): boolean {
    return this.cuentasBancariasDisponibles.length >= 2;
  }

  get muestraSelectorMaquinaPos(): boolean {
    return this.maquinasPosDisponibles.length >= 1;
  }

  get muestraSelectorCuentaBancaria(): boolean {
    return this.cuentasBancariasDisponibles.length >= 1;
  }

  private calculateTotals(): void {
    this.subtotal = 0;
    this.descuentoTotal = 0;

    for (const item of this.activeItems) {
      this.subtotal += (item.precioVentaUnitario + (item.precioAdicionales || 0)) * item.cantidad;
      this.descuentoTotal += (item.descuentoUnitario || 0) * item.cantidad;
    }

    this.totalPrincipal = this.subtotal - this.descuentoTotal;

    // Calcular costo total
    this.costoTotal = 0;
    for (const item of this.activeItems) {
      this.costoTotal += (Number(item.precioCostoUnitario) || 0) * item.cantidad;
    }

    this.updateCurrencyDisplays();
  }

  private getExchangeRate(monedaId: number): number {
    if (this.data.principalMoneda && monedaId === this.data.principalMoneda.id) {
      return 1;
    }
    // Aceptamos rate en cualquier sentido. compraLocal expresa cuántos
    // PRINCIPAL vale 1 OTRA, así que la fórmula es la misma en ambos casos.
    const rate = this.data.exchangeRates.find(
      r =>
        (r.monedaOrigen?.id === this.data.principalMoneda?.id && r.monedaDestino?.id === monedaId) ||
        (r.monedaOrigen?.id === monedaId && r.monedaDestino?.id === this.data.principalMoneda?.id)
    );
    return rate?.compraLocal || 1;
  }

  private convertToPrincipal(valor: number, monedaId: number): number {
    const rate = this.getExchangeRate(monedaId);
    return valor * rate;
  }

  private convertFromPrincipal(principalAmount: number, monedaId: number): number {
    const rate = this.getExchangeRate(monedaId);
    return rate !== 0 ? principalAmount / rate : 0;
  }

  private updateCurrencyDisplays(): void {
    let totalPagadoPrincipal = 0;
    let totalDescuentoPrincipal = 0;
    let totalAumentoPrincipal = 0;
    let totalVueltoPrincipal = 0;
    for (const d of this.detalleRows) {
      if (d.tipo === TipoDetalle.PAGO) {
        totalPagadoPrincipal += this.convertToPrincipal(d.valor, d.moneda.id);
      } else if (d.tipo === TipoDetalle.DESCUENTO) {
        totalDescuentoPrincipal += this.convertToPrincipal(d.valor, d.moneda.id);
      } else if (d.tipo === TipoDetalle.AUMENTO) {
        totalAumentoPrincipal += this.convertToPrincipal(d.valor, d.moneda.id);
      } else if (d.tipo === TipoDetalle.VUELTO) {
        totalVueltoPrincipal += this.convertToPrincipal(d.valor, d.moneda.id);
      }
    }

    // Lo que se debe = total + aumentos - descuentos
    const totalDeuda = this.totalPrincipal + totalAumentoPrincipal - totalDescuentoPrincipal;
    // Lo que se recibió neto = pagos - vueltos
    const totalRecibidoNeto = totalPagadoPrincipal - totalVueltoPrincipal;
    // Saldo neto: positivo = falta pagar, negativo = falta dar vuelto
    const saldoNeto = totalDeuda - totalRecibidoNeto;

    this.saldoPrincipal = saldoNeto > 0 ? saldoNeto : 0;
    this.vueltoPrincipal = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;

    this.recomputeCobrarCredito();

    this.currencyDisplays = this.data.monedas.map(moneda => {
      const rate = this.getExchangeRate(moneda.id);
      const isPrincipal = this.data.principalMoneda?.id === moneda.id;
      const total = isPrincipal ? this.totalPrincipal : this.convertFromPrincipal(this.totalPrincipal, moneda.id);
      const saldo = isPrincipal ? this.saldoPrincipal : this.convertFromPrincipal(this.saldoPrincipal, moneda.id);
      const vuelto = isPrincipal ? this.vueltoPrincipal : this.convertFromPrincipal(this.vueltoPrincipal, moneda.id);
      const dec = moneda.decimales || 0;
      const fmt = (v: number) => v.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      return {
        moneda, total, saldo, vuelto, cotizacion: rate, isPrincipal,
        totalDisplay: fmt(total),
        saldoDisplay: fmt(saldo),
        vueltoDisplay: fmt(vuelto),
      };
    });
  }

  autoFillValor(): void {
    if (!this.selectedMoneda) return;
    const dec = Number(this.selectedMoneda.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
    const display = this.currencyDisplays.find(cd => cd.moneda.id === this.selectedMoneda!.id);
    if (!display) return;

    if (this.saldoPrincipal > 0) {
      // Still owed — pre-fill with saldo as PAGO
      this.valorInput = display.isPrincipal ? Math.round(display.saldo) : Math.round(display.saldo * 100) / 100;
      this.currentLineType = 'PAGO';
    } else if (this.vueltoPrincipal > 0) {
      // Overpaid — pre-fill with vuelto as VUELTO
      this.valorInput = display.isPrincipal ? Math.round(display.vuelto) : Math.round(display.vuelto * 100) / 100;
      this.currentLineType = 'VUELTO';
    } else {
      this.valorInput = 0;
      this.currentLineType = 'PAGO';
    }
  }

  // --- Form navigation ---

  onMonedaSelectEnter(): void {
    // Move focus to forma pago select
    const fpEl = document.querySelector('.fp-select .mat-mdc-select-trigger') as HTMLElement;
    if (fpEl) fpEl.focus();
  }

  onFpSelectEnter(): void {
    // Move focus to valor input and select all
    this.focusValorInput();
  }

  focusValorInput(): void {
    setTimeout(() => {
      if (this.valorInputRef?.nativeElement) {
        this.valorInputRef.nativeElement.focus();
        this.valorInputRef.nativeElement.select();
      }
    }, 50);
  }

  onValorEnter(): void {
    this.addDetalle();
  }

  onMonedaChange(): void {
    this.autoFillValor();
  }

  // --- Payment line management ---

  async addDetalle(): Promise<void> {
    if (!this.selectedMoneda || !this.selectedFormaPago || this.valorInput <= 0 || this.addingLine) return;

    const tipo = this.currentLineType === 'VUELTO' ? TipoDetalle.VUELTO : TipoDetalle.PAGO;

    // Si la formaPago tiene maquinasPos vinculadas y no se eligió una, bloquear
    if (tipo === TipoDetalle.PAGO && this.maquinasPosDisponibles.length > 0 && !this.selectedMaquinaPosId) {
      if (this.maquinasPosDisponibles.length === 1) {
        this.selectedMaquinaPosId = this.maquinasPosDisponibles[0].id;
      } else {
        return;
      }
    }

    // Si la formaPago tiene cuentasBancarias vinculadas y no se eligió una, bloquear
    if (tipo === TipoDetalle.PAGO && this.cuentasBancariasDisponibles.length > 0 && !this.selectedCuentaBancariaId) {
      if (this.cuentasBancariasDisponibles.length === 1) {
        this.selectedCuentaBancariaId = this.cuentasBancariasDisponibles[0].id;
      } else {
        return;
      }
    }

    this.addingLine = true;
    const descripcion = tipo === TipoDetalle.VUELTO ? 'VUELTO' : 'COBRO DE VENTA';

    try {
      if (!this.pago) {
        this.pago = await firstValueFrom(this.repositoryService.createPago({
          estado: PagoEstado.ABIERTO,
          caja: this.data.caja,
          activo: true,
        }));
        // Vincular pago a venta inmediatamente
        await firstValueFrom(this.repositoryService.updateVenta(this.data.venta.id, {
          pago: this.pago!,
        }));
      }

      const obs = this.observacionInput.trim().toUpperCase() || undefined;
      const detalle = await firstValueFrom(this.repositoryService.createPagoDetalle({
        valor: this.valorInput,
        descripcion,
        tipo,
        pago: this.pago!,
        moneda: this.selectedMoneda,
        formaPago: this.selectedFormaPago,
        activo: true,
        observacion: obs,
      }));

      const maquinaSeleccionada = this.maquinasPosDisponibles.find(m => m.id === this.selectedMaquinaPosId);
      const cuentaSeleccionada = this.cuentasBancariasDisponibles.find(c => c.id === this.selectedCuentaBancariaId);

      this.detalleRows = [...this.detalleRows, {
        id: detalle.id,
        moneda: this.selectedMoneda,
        formaPago: this.selectedFormaPago,
        valor: this.valorInput,
        tipo,
        tipoLabel: this.currentLineType,
        observacion: obs,
        valorDisplay: this.formatValor(this.valorInput, this.selectedMoneda),
        maquinaPosId: tipo === TipoDetalle.PAGO ? (this.selectedMaquinaPosId || undefined) : undefined,
        maquinaPosNombre: tipo === TipoDetalle.PAGO ? (maquinaSeleccionada?.nombre || undefined) : undefined,
        cuentaBancariaId: tipo === TipoDetalle.PAGO ? (this.selectedCuentaBancariaId || undefined) : undefined,
        cuentaBancariaNombre: tipo === TipoDetalle.PAGO ? (cuentaSeleccionada?.nombre || undefined) : undefined,
      }];

      this.observacionInput = '';
      this.updateCurrencyDisplays();
      this.autoFillValor();

      // Focus back to moneda select for next line
      setTimeout(() => {
        const monedaEl = document.querySelector('.moneda-select .mat-mdc-select-trigger') as HTMLElement;
        if (monedaEl) monedaEl.focus();
      }, 100);
    } catch (error) {
      console.error('Error al agregar línea de pago:', error);
    } finally {
      this.addingLine = false;
    }
  }

  async deleteDetalle(row: DetalleRow): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.deletePagoDetalle(row.id));
      this.detalleRows = this.detalleRows.filter(d => d.id !== row.id);
      this.updateCurrencyDisplays();
      this.autoFillValor();
    } catch (error) {
      console.error('Error al eliminar línea de pago:', error);
    }
  }

  editObservacion(row: DetalleRow): void {
    const dialogRef = this.dialog.open(EditDetalleDialogComponent, {
      width: '400px',
      data: { modo: 'observacion', observacionActual: row.observacion },
    });
    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (result === null || result === undefined) return;
      row.observacion = result.observacion || undefined;
      await firstValueFrom(this.repositoryService.updatePagoDetalle(row.id, { observacion: result.observacion || '' }));
      this.detalleRows = [...this.detalleRows];
    });
  }

  async duplicarDetalle(row: DetalleRow): Promise<void> {
    if (!this.pago) return;
    try {
      const detalle = await firstValueFrom(this.repositoryService.createPagoDetalle({
        valor: row.valor,
        descripcion: row.tipo === TipoDetalle.VUELTO ? 'VUELTO' : 'COBRO DE VENTA',
        tipo: row.tipo,
        pago: this.pago!,
        moneda: row.moneda,
        formaPago: row.formaPago,
        activo: true,
        observacion: row.observacion,
      }));
      this.detalleRows = [...this.detalleRows, {
        ...row,
        id: detalle.id,
      }];
      this.updateCurrencyDisplays();
      this.autoFillValor();
    } catch (error) {
      console.error('Error al duplicar detalle:', error);
    }
  }

  editValor(row: DetalleRow): void {
    const dialogRef = this.dialog.open(EditDetalleDialogComponent, {
      width: '400px',
      data: { modo: 'valor', valorActual: row.valor, monedaSimbolo: row.moneda.simbolo },
    });
    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (result === null || result === undefined) return;
      row.valor = result.valor;
      row.valorDisplay = this.formatValor(result.valor, row.moneda);
      await firstValueFrom(this.repositoryService.updatePagoDetalle(row.id, { valor: result.valor }));
      this.detalleRows = [...this.detalleRows];
      this.updateCurrencyDisplays();
      this.autoFillValor();
    });
  }

  openAjusteDialog(): void {
    // Siempre trabajar en moneda principal para ajustes
    const monedaPrincipal = this.data.principalMoneda;
    if (!monedaPrincipal) return;

    // Pre-determinar tipo según saldo
    const tipoSugerido: 'descuento' | 'aumento' = this.saldoPrincipal > 0 ? 'descuento' : 'aumento';
    // Pre-cargar valor con el saldo/vuelto restante en moneda principal
    const valorSugerido = this.saldoPrincipal > 0 ? this.saldoPrincipal : this.vueltoPrincipal;

    const dialogRef = this.dialog.open(AjusteCobrarDialogComponent, {
      width: '400px',
      data: {
        total: this.totalPrincipal,
        moneda: monedaPrincipal,
        tipoSugerido,
        valorSugerido,
        costoTotal: this.costoTotal,
      },
    });

    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (!result) return;

      const tipo = result.valor >= 0 ? TipoDetalle.DESCUENTO : TipoDetalle.AUMENTO;
      const valor = Math.abs(result.valor);
      const descripcion = result.motivo || (tipo === TipoDetalle.DESCUENTO ? 'DESCUENTO' : 'AUMENTO/REDONDEO');
      const fpPrincipal = this.formasPago.find(fp => fp.principal) || this.selectedFormaPago || this.formasPago[0];

      try {
        if (!this.pago) {
          this.pago = await firstValueFrom(this.repositoryService.createPago({
            estado: PagoEstado.ABIERTO,
            caja: this.data.caja,
            activo: true,
          }));
          await firstValueFrom(this.repositoryService.updateVenta(this.data.venta.id, {
            pago: this.pago!,
          }));
        }

        const detalle = await firstValueFrom(this.repositoryService.createPagoDetalle({
          valor,
          descripcion,
          tipo,
          pago: this.pago!,
          moneda: monedaPrincipal,
          formaPago: fpPrincipal!,
          activo: true,
        }));

        this.detalleRows = [...this.detalleRows, {
          id: detalle.id,
          moneda: monedaPrincipal,
          formaPago: fpPrincipal!,
          valor,
          tipo,
          tipoLabel: tipo === TipoDetalle.DESCUENTO ? 'DESCUENTO' : 'AUMENTO',
          valorDisplay: this.formatValor(valor, monedaPrincipal),
        }];

        this.updateCurrencyDisplays();
        this.autoFillValor();
      } catch (error) {
        console.error('Error al agregar ajuste:', error);
      }
    });
  }

  // --- División de cuenta ---

  recalcularDivision(): void {
    if (this.divisionPersonas <= 1) {
      this.divisionValorDisplay = '';
      return;
    }
    const valorPorPersona = this.totalPrincipal / this.divisionPersonas;
    const dec = this.data.principalMoneda?.decimales || 0;
    this.divisionValorDisplay = this.data.principalMoneda?.simbolo + ' ' +
      valorPorPersona.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec });

    // Auto-llenar el input con el valor por persona
    if (this.selectedMoneda?.id === this.data.principalMoneda?.id) {
      this.valorInput = Math.round(valorPorPersona);
      this.currentLineType = 'PAGO';
    }
  }

  // --- Ver costo ---

  toggleCosto(): void {
    if (this.showCosto) {
      this.showCosto = false;
      return;
    }
    // Pedir credenciales para mostrar costo
    const dialogRef = this.dialog.open(EditDetalleDialogComponent, {
      width: '400px',
      data: { modo: 'password' },
    });
    dialogRef.afterClosed().subscribe(async (result: any) => {
      console.log('Auth dialog result:', result);
      if (!result?.nickname || !result?.password) return;
      try {
        const validationResult = await firstValueFrom(this.repositoryService.validateCredentials({
          nickname: result.nickname,
          password: result.password,
        }));
        console.log('Validation result:', validationResult);
        if (validationResult?.success) {
          this.showCosto = true;
        }
      } catch (error) {
        console.error('Error validating credentials:', error);
      }
    });
  }

  // --- Finalize ---

  get canFinalizar(): boolean {
    // Saldo must be 0: fully paid with no unresolved vuelto
    return this.detalleRows.length > 0 && this.saldoPrincipal <= 0 && this.vueltoPrincipal === 0 && !this.processing;
  }

  get canCobroParcial(): boolean {
    return this.detalleRows.length > 0 && this.saldoPrincipal > 0 && !this.processing;
  }

  async finalizar(): Promise<void> {
    if (!this.canFinalizar) return;
    this.processing = true;

    try {
      const principalFp = this.detalleRows
        .filter(d => d.tipo === TipoDetalle.PAGO)
        .sort((a, b) => this.convertToPrincipal(b.valor, b.moneda.id) - this.convertToPrincipal(a.valor, a.moneda.id))[0]?.formaPago;

      // Actualizar pago a PAGADO
      await firstValueFrom(this.repositoryService.updatePago(this.pago!.id, {
        estado: PagoEstado.PAGADO,
      }));

      await firstValueFrom(this.repositoryService.updateVenta(this.data.venta.id, {
        estado: VentaEstado.CONCLUIDA,
        formaPago: principalFp || this.selectedFormaPago!,
        pago: this.pago!,
        fechaCierre: new Date(),
      }));

      // 1) Crear AcreditacionPos por cada detalle con maquina POS elegida (tipo=PAGO).
      //    Las acreditaciones se procesan al cumplir los minutos configurados.
      try {
        const pagosConMaquina = this.detalleRows.filter(
          (d) => d.tipo === TipoDetalle.PAGO && d.maquinaPosId,
        );
        for (const det of pagosConMaquina) {
          await firstValueFrom(this.repositoryService.createAcreditacionPos({
            maquinaPosId: det.maquinaPosId!,
            montoOriginal: det.valor,
            ventaId: this.data.venta.id,
            fechaTransaccion: new Date(),
          }));
        }
      } catch (e) {
        console.error('Error creando acreditacion(es) POS (no-blocking):', e);
      }

      // 2) Acreditar instantaneamente cada detalle con cuenta bancaria elegida (transferencia/PIX).
      //    Sin comision, sin demora.
      try {
        const transferencias = this.detalleRows.filter(
          (d) => d.tipo === TipoDetalle.PAGO && d.cuentaBancariaId,
        );
        for (const det of transferencias) {
          await firstValueFrom(this.repositoryService.acreditarTransferenciaBancaria({
            cuentaBancariaId: det.cuentaBancariaId!,
            monto: det.valor,
          }));
        }
      } catch (e) {
        console.error('Error acreditando transferencia(s) bancaria(s) (no-blocking):', e);
      }

      // Procesar stock (fire-and-forget, no bloquea la venta)
      this.repositoryService.procesarStockVenta(this.data.venta.id).subscribe({
        next: (r) => console.log('Stock procesado:', r),
        error: (e) => console.error('Error procesando stock (no-blocking):', e),
      });

      this.dialogRef.close({ success: true, pago: this.pago });
    } catch (error) {
      console.error('Error al finalizar cobro:', error);
      this.processing = false;
    }
  }

  private recomputeCobrarCredito(): void {
    const cliente: any = this.data.venta?.cliente;
    if (!cliente?.id) {
      this.canCobrarCredito = false;
      this.cobrarCreditoTooltip = 'Asigne un cliente a la venta para vender a crédito';
      return;
    }
    if (!cliente.credito) {
      this.canCobrarCredito = false;
      this.cobrarCreditoTooltip = `El cliente "${cliente.persona?.nombre || cliente.razon_social || cliente.id}" no tiene crédito habilitado`;
      return;
    }
    if (this.saldoPrincipal <= 0) {
      this.canCobrarCredito = false;
      this.cobrarCreditoTooltip = 'No hay saldo pendiente para financiar';
      return;
    }
    if (this.processing) {
      this.canCobrarCredito = false;
      this.cobrarCreditoTooltip = 'Procesando…';
      return;
    }
    this.canCobrarCredito = true;
    this.cobrarCreditoTooltip = 'Cerrar la venta como crédito y generar la cuenta por cobrar';
  }

  async cobrarCredito(): Promise<void> {
    if (!this.canCobrarCredito) {
      if (this.cobrarCreditoTooltip) {
        this.snackBar.open(this.cobrarCreditoTooltip, 'Cerrar', { duration: 3500 });
      }
      return;
    }
    const cliente: any = this.data.venta.cliente;
    const nombreCliente = cliente.persona
      ? `${cliente.persona.nombre || ''}${cliente.persona.apellido ? ' ' + cliente.persona.apellido : ''}`.trim()
      : (cliente.razon_social || '—');

    const dialogData: CobrarCreditoDialogData = {
      ventaId: this.data.venta.id!,
      clienteId: cliente.id,
      clienteNombre: nombreCliente || '—',
      saldoActual: Number(cliente.saldoActual) || 0,
      limiteCredito: Number(cliente.limite_credito) || 0,
      monto: this.saldoPrincipal,
      monedaId: this.data.principalMoneda.id!,
      monedaSimbolo: this.data.principalMoneda.simbolo,
    };

    const ref = this.dialog.open(CobrarCreditoDialogComponent, {
      width: '720px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: true,
    });

    ref.afterClosed().subscribe((result) => {
      if (result?.success) {
        // Stock fire-and-forget (igual que finalizar())
        this.repositoryService.procesarStockVenta(this.data.venta.id!).subscribe({
          next: (r) => console.log('Stock procesado:', r),
          error: (e) => console.error('Error procesando stock (no-blocking):', e),
        });
        this.dialogRef.close({ success: true, credito: true, ventaId: result.ventaId, cpcId: result.cpcId });
      }
    });
  }

  async cobroParcial(): Promise<void> {
    if (!this.canCobroParcial) return;
    // Pago already linked to venta on first line addition
    // Just close the dialog — lines are already persisted
    this.dialogRef.close({ success: false, partial: true, pago: this.pago });
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  // --- Keyboard shortcuts ---

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Don't handle shortcuts if a select is open
    const target = event.target as HTMLElement;
    const isInSelect = target.closest('mat-select') || target.closest('.mat-mdc-select');

    if (isInSelect && event.key === 'Enter') {
      // Let the select handle Enter, then move to next field
      return;
    }

    switch (event.key) {
      case 'F1':
        event.preventDefault();
        if (this.data.monedas[0]) { this.selectedMoneda = this.data.monedas[0]; this.autoFillValor(); }
        break;
      case 'F2':
        event.preventDefault();
        if (this.data.monedas[1]) { this.selectedMoneda = this.data.monedas[1]; this.autoFillValor(); }
        break;
      case 'F3':
        event.preventDefault();
        if (this.data.monedas[2]) { this.selectedMoneda = this.data.monedas[2]; this.autoFillValor(); }
        break;
      case 'F4':
        event.preventDefault();
        if (this.formasPago[0]) this.selectedFormaPago = this.formasPago[0];
        break;
      case 'F5':
        event.preventDefault();
        if (this.formasPago[1]) this.selectedFormaPago = this.formasPago[1];
        break;
      case 'F6':
        event.preventDefault();
        if (this.formasPago[2]) this.selectedFormaPago = this.formasPago[2];
        break;
      case 'F7':
        event.preventDefault();
        if (this.formasPago[3]) this.selectedFormaPago = this.formasPago[3];
        break;
      case 'F9':
        event.preventDefault();
        this.openAjusteDialog();
        break;
      case 'F10':
        event.preventDefault();
        this.finalizar();
        break;
    }
  }
}
