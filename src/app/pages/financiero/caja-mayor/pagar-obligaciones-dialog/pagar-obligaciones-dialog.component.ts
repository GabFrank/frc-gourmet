import { Component, Inject, OnInit, Optional, ViewChild } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import {
  PagoConcepto,
  CONCEPTO_PERMITE_PARCIAL,
  CONCEPTO_SELECCION_UNICA,
  CONCEPTO_BENEFICIARIO_UNICO,
} from 'src/app/database/entities/financiero/pago-consolidado-enums';
import {
  redondear,
  toleranciaDe,
  convertirLinea,
} from 'src/app/shared/utils/pago-consolidado.util';

export interface PagarObligacionesDialogData {
  concepto: PagoConcepto;
  origenIdsPreseleccionados?: number[];
  cajaMayorId?: number;
  /** Abierto como tab en vez de diálogo (patrón híbrido). */
  isTab?: boolean;
}

interface ObligacionRow {
  origenTipo: string;
  origenId: number;
  numero: string;
  descripcion: string;
  beneficiario: string | null;
  beneficiarioId: number | null;
  fecha: string | Date | null;
  monedaId: number | null;
  monedaSimbolo: string | null;
  decimales: number;
  montoTotal: number;
  saldoPendiente: number;
  bloqueado: boolean;
  bloqueoMotivo?: string;
  extra?: any;
  // estado de UI
  selected: boolean;
  montoAPagar: number;
  /** Deshabilitada porque ya se eligió otra moneda / otro beneficiario. */
  incompatible: boolean;
}

interface LineaRow {
  fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
  monedaId: number;
  monedaSimbolo: string;
  decimales: number;
  formaPagoId: number | null;
  formaPagoNombre: string | null;
  cajaMayorId: number | null;
  cuentaBancariaId: number | null;
  cuentaNombre: string | null;
  monto: number;
  cotizacion: number;
  necesitaCotizacion: boolean;
  // precomputados para el template (sin funciones ni getters)
  etiqueta: string;
  montoTexto: string;
  convertidoTexto: string;
}

/** Etiquetas por concepto. El wizard es uno solo; sólo cambia qué lista. */
const TITULOS: Record<PagoConcepto, { titulo: string; nuevo: string | null; columnaItem: string }> = {
  [PagoConcepto.COMPRA]: { titulo: 'Pagar compras', nuevo: 'Nueva compra', columnaItem: 'Cuota' },
  [PagoConcepto.GASTO]: { titulo: 'Pagar gastos', nuevo: 'Nuevo gasto', columnaItem: 'Gasto' },
  [PagoConcepto.VALE]: { titulo: 'Pagar vales', nuevo: 'Nuevo vale', columnaItem: 'Vale' },
  [PagoConcepto.LIQUIDACION_SUELDO]: { titulo: 'Pagar salarios', nuevo: null, columnaItem: 'Liquidación' },
};

@Component({
  selector: 'app-pagar-obligaciones-dialog',
  standalone: true,
  templateUrl: './pagar-obligaciones-dialog.component.html',
  styleUrls: ['./pagar-obligaciones-dialog.component.scss'],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatButtonToggleModule,
    MatCheckboxModule, MatMenuModule, MatTableModule, MatTooltipModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDividerModule, MatStepperModule,
    DecimalPipe, DatePipe, CurrencyInputDirective,
  ],
})
export class PagarObligacionesDialogComponent implements OnInit {
  @ViewChild('stepper') stepper?: MatStepper;

  readonly columnas = ['select', 'beneficiario', 'item', 'fecha', 'saldo', 'monto'];
  readonly columnasLineas = ['fuente', 'moneda', 'forma', 'monto', 'convertido', 'acciones'];

  concepto!: PagoConcepto;
  titulo = '';
  etiquetaNuevo: string | null = null;
  columnaItem = '';
  permiteParcial = false;
  seleccionUnica = false;
  beneficiarioUnico = false;
  esTab = false;

  loading = true;
  saving = false;

  obligaciones: ObligacionRow[] = [];
  obligacionesFiltradas: ObligacionRow[] = [];
  beneficiarios: { id: number; nombre: string }[] = [];
  filtroBeneficiarioId: number | null = null;

  cajasMayor: any[] = [];
  cuentasBancarias: any[] = [];
  monedas: any[] = [];
  formasPagoEfectivo: any[] = [];

  lineas: LineaRow[] = [];
  draft!: FormGroup;
  draftNecesitaCotizacion = false;
  draftEsBanco = false;
  /** Moneda de la cuenta elegida: en banco no se elige, se hereda. */
  monedaCuentaTexto = '';

  // ── precomputados para el template ──
  seleccionadas: ObligacionRow[] = [];
  cantidadSeleccionada = 0;
  monedaDeudaId: number | null = null;
  monedaDeudaSimbolo = '';
  decimalesDeuda = 0;
  beneficiarioSeleccionado: string | null = null;
  totalDeuda = 0;
  totalDeudaTexto = '0';
  totalPago = 0;
  totalPagoTexto = '0';
  cuadra = false;
  diferenciaTexto = '';
  puedeAvanzarSeleccion = false;
  errores: string[] = [];
  resumenItems: Array<{ descripcion: string; beneficiario: string | null; montoTexto: string }> = [];

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() private dialogRef: MatDialogRef<PagarObligacionesDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: PagarObligacionesDialogData,
  ) {}

  ngOnInit(): void {
    this.concepto = this.data?.concepto || PagoConcepto.GASTO;
    const t = TITULOS[this.concepto];
    this.titulo = t.titulo;
    this.etiquetaNuevo = t.nuevo;
    this.columnaItem = t.columnaItem;
    this.permiteParcial = CONCEPTO_PERMITE_PARCIAL[this.concepto];
    this.seleccionUnica = CONCEPTO_SELECCION_UNICA[this.concepto];
    this.beneficiarioUnico = CONCEPTO_BENEFICIARIO_UNICO[this.concepto];
    this.esTab = !!this.data?.isTab || !this.dialogRef;

    this.draft = this.fb.group({
      fuente: ['CAJA_MAYOR'],
      cajaMayorId: [this.data?.cajaMayorId || null],
      cuentaBancariaId: [null],
      monedaId: [null],
      formaPagoId: [null],
      monto: [null],
      cotizacion: [null],
    });
    this.draft.get('fuente')!.valueChanges.subscribe(() => this.onDraftFuenteChange());
    this.draft.get('monedaId')!.valueChanges.subscribe(() => this.onDraftMonedaChange());

    this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [items, cajas, cuentas, monedas, formas] = await Promise.all([
        firstValueFrom(this.repo.getObligacionesPendientes(this.concepto, {})),
        firstValueFrom(this.repo.getCajasMayor()),
        firstValueFrom(this.repo.getCuentasBancarias()),
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getFormasPago()),
      ]);

      this.cajasMayor = ((cajas as any[]) || []).filter((c: any) => c.estado === 'ABIERTA');
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.monedas = (monedas as any[]) || [];
      // Por Caja Mayor sólo sale efectivo: es la regla de negocio del dominio.
      this.formasPagoEfectivo = ((formas as any[]) || [])
        .filter((f: any) => f.movimentaCaja && (f.nombre || '').toUpperCase().includes('EFECTIVO'));

      const pre = new Set<number>(this.data?.origenIdsPreseleccionados || []);
      this.obligaciones = ((items as any[]) || []).map((it: any): ObligacionRow => ({
        ...it,
        selected: pre.has(Number(it.origenId)) && !it.bloqueado,
        montoAPagar: Number(it.saldoPendiente) || 0,
        incompatible: false,
      }));

      const bmap = new Map<number, string>();
      for (const o of this.obligaciones) {
        if (o.beneficiarioId != null && !bmap.has(o.beneficiarioId)) {
          bmap.set(o.beneficiarioId, o.beneficiario || '—');
        }
      }
      this.beneficiarios = Array.from(bmap.entries())
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      const cajaPre = preselectSingleOrPrincipal(this.cajasMayor);
      if (cajaPre && !this.draft.get('cajaMayorId')!.value) {
        this.draft.patchValue({ cajaMayorId: cajaPre.id }, { emitEvent: false });
      }
      const formaPre = preselectSingleOrPrincipal(this.formasPagoEfectivo);
      if (formaPre) this.draft.patchValue({ formaPagoId: formaPre.id }, { emitEvent: false });

      this.aplicarFiltro();
      this.recalcular();
    } catch (e: any) {
      console.error('Error cargando obligaciones pendientes', e);
      this.snackBar.open(e?.message || 'No se pudieron cargar las obligaciones', 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  aplicarFiltro(): void {
    this.obligacionesFiltradas = this.filtroBeneficiarioId == null
      ? [...this.obligaciones]
      : this.obligaciones.filter((o) => o.beneficiarioId === this.filtroBeneficiarioId);
  }

  limpiarFiltro(): void {
    this.filtroBeneficiarioId = null;
    this.aplicarFiltro();
  }

  toggle(row: ObligacionRow): void {
    if (row.bloqueado || row.incompatible) return;
    // Un salario por vez: la nómina no se paga en una sola operación.
    if (this.seleccionUnica && !row.selected) {
      this.obligaciones.forEach((o) => (o.selected = false));
    }
    row.selected = !row.selected;
    if (row.selected && row.montoAPagar <= 0) row.montoAPagar = row.saldoPendiente;
    this.recalcular();
  }

  marcarTodo(marcar: boolean): void {
    if (this.seleccionUnica) return;
    for (const o of this.obligacionesFiltradas) {
      if (o.bloqueado || o.incompatible) continue;
      o.selected = marcar;
      if (marcar && o.montoAPagar <= 0) o.montoAPagar = o.saldoPendiente;
    }
    this.recalcular();
  }

  onMontoChange(): void {
    this.recalcular();
  }

  /**
   * Recalcula TODO lo que el template muestra. Las reglas de este repo prohíben
   * llamadas a función y getters en la vista, así que cada cambio pasa por acá.
   */
  recalcular(): void {
    this.seleccionadas = this.obligaciones.filter((o) => o.selected);
    this.cantidadSeleccionada = this.seleccionadas.length;

    const primera = this.seleccionadas[0] || null;
    this.monedaDeudaId = primera?.monedaId ?? null;
    this.monedaDeudaSimbolo = primera?.monedaSimbolo || '';
    this.decimalesDeuda = primera?.decimales ?? 0;
    this.beneficiarioSeleccionado = primera?.beneficiario ?? null;

    // Deshabilitar lo que ya no se puede mezclar: otra moneda, y en compras,
    // otro proveedor. Se marca en la fila para que el usuario vea el porqué.
    for (const o of this.obligaciones) {
      if (o.selected || o.bloqueado) { o.incompatible = false; continue; }
      const otraMoneda = this.monedaDeudaId != null && o.monedaId !== this.monedaDeudaId;
      const otroBenef = this.beneficiarioUnico && primera != null && o.beneficiarioId !== primera.beneficiarioId;
      o.incompatible = !!(otraMoneda || otroBenef || (this.seleccionUnica && this.cantidadSeleccionada > 0));
    }

    this.totalDeuda = redondear(
      this.seleccionadas.reduce((s, o) => s + (Number(o.montoAPagar) || 0), 0),
      this.decimalesDeuda,
    );
    this.totalDeudaTexto = this.formatear(this.totalDeuda, this.decimalesDeuda);

    // Las líneas se revalúan contra la moneda de la deuda vigente.
    for (const l of this.lineas) this.actualizarLinea(l);
    this.totalPago = redondear(
      this.lineas.reduce((s, l) => s + convertirLinea(l.monto, l.cotizacion, this.decimalesDeuda), 0),
      this.decimalesDeuda,
    );
    this.totalPagoTexto = this.formatear(this.totalPago, this.decimalesDeuda);

    const tol = toleranciaDe(this.decimalesDeuda);
    const dif = redondear(this.totalPago - this.totalDeuda, this.decimalesDeuda);
    this.cuadra = this.lineas.length > 0 && this.totalDeuda > 0 && Math.abs(dif) <= tol;
    this.diferenciaTexto = dif === 0 ? '' :
      (dif > 0 ? `Sobran ${this.formatear(dif, this.decimalesDeuda)}` : `Faltan ${this.formatear(-dif, this.decimalesDeuda)}`);

    this.errores = this.validar();
    this.puedeAvanzarSeleccion = this.cantidadSeleccionada > 0 && this.errores.length === 0;

    this.resumenItems = this.seleccionadas.map((o) => ({
      descripcion: o.descripcion,
      beneficiario: o.beneficiario,
      montoTexto: `${o.monedaSimbolo || ''} ${this.formatear(o.montoAPagar, o.decimales)}`.trim(),
    }));
  }

  private validar(): string[] {
    const errs: string[] = [];
    const tol = toleranciaDe(this.decimalesDeuda);
    for (const o of this.seleccionadas) {
      if (!(o.montoAPagar > 0)) {
        errs.push(`${o.descripcion}: el monto tiene que ser mayor a 0.`);
      } else if (o.montoAPagar > o.saldoPendiente + tol) {
        errs.push(`${o.descripcion}: el monto supera el saldo pendiente.`);
      } else if (!this.permiteParcial && Math.abs(o.montoAPagar - o.saldoPendiente) > tol) {
        errs.push(`${o.descripcion} se paga entero o no se paga.`);
      }
    }
    return errs;
  }

  private formatear(valor: number, decimales: number): string {
    return new Intl.NumberFormat('es-PY', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(Number(valor) || 0);
  }

  // ── Paso 2: líneas de pago ──

  onDraftFuenteChange(): void {
    this.draftEsBanco = this.draft.get('fuente')!.value === 'CUENTA_BANCARIA';
    this.draft.patchValue({ monedaId: null, cotizacion: null }, { emitEvent: false });
    this.draftNecesitaCotizacion = false;
    this.monedaCuentaTexto = '';
  }

  onDraftMonedaChange(): void {
    const monedaId = this.draft.get('monedaId')!.value;
    this.draftNecesitaCotizacion = !!monedaId && this.monedaDeudaId != null && monedaId !== this.monedaDeudaId;
    if (!this.draftNecesitaCotizacion) this.draft.patchValue({ cotizacion: 1 }, { emitEvent: false });
  }

  onCuentaChange(): void {
    // La moneda de una línea bancaria la fija la cuenta: no se elige aparte.
    // `CuentaBancaria.saldo` es un escalar en una sola moneda; debitar un monto
    // denominado en otra lo corrompe sin aviso. El backend lo rechaza igual.
    const id = this.draft.get('cuentaBancariaId')!.value;
    const cuenta = this.cuentasBancarias.find((c) => c.id === id);
    if (cuenta?.moneda?.id) {
      this.draft.patchValue({ monedaId: cuenta.moneda.id });
      this.monedaCuentaTexto = cuenta.moneda.denominacion || cuenta.moneda.simbolo || '';
      this.onDraftMonedaChange();
    } else {
      this.monedaCuentaTexto = '';
    }
  }

  agregarLinea(): void {
    const v = this.draft.value;
    const esBanco = v.fuente === 'CUENTA_BANCARIA';
    const monto = Number(v.monto) || 0;
    if (!(monto > 0)) {
      this.snackBar.open('Poné un monto mayor a 0.', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!v.monedaId) {
      this.snackBar.open('Elegí la moneda.', 'Cerrar', { duration: 3000 });
      return;
    }
    if (esBanco && !v.cuentaBancariaId) {
      this.snackBar.open('Elegí la cuenta bancaria.', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!esBanco && (!v.cajaMayorId || !v.formaPagoId)) {
      this.snackBar.open('Elegí la caja y la forma de pago.', 'Cerrar', { duration: 3000 });
      return;
    }
    const cotizacion = Number(v.cotizacion) || (this.draftNecesitaCotizacion ? 0 : 1);
    if (this.draftNecesitaCotizacion && !(cotizacion > 0)) {
      this.snackBar.open('Falta la cotización para convertir a la moneda de la deuda.', 'Cerrar', { duration: 4000 });
      return;
    }

    const moneda = this.monedas.find((m) => m.id === v.monedaId);
    const cuenta = this.cuentasBancarias.find((c) => c.id === v.cuentaBancariaId);
    const forma = this.formasPagoEfectivo.find((f) => f.id === v.formaPagoId);

    const linea: LineaRow = {
      fuente: esBanco ? 'CUENTA_BANCARIA' : 'CAJA_MAYOR',
      monedaId: v.monedaId,
      monedaSimbolo: moneda?.simbolo || '',
      decimales: Number(moneda?.decimales) || 0,
      formaPagoId: esBanco ? null : v.formaPagoId,
      formaPagoNombre: esBanco ? null : (forma?.nombre || null),
      cajaMayorId: esBanco ? null : v.cajaMayorId,
      cuentaBancariaId: esBanco ? v.cuentaBancariaId : null,
      cuentaNombre: esBanco ? (cuenta?.nombre || cuenta?.numeroCuenta || null) : null,
      monto,
      cotizacion,
      necesitaCotizacion: this.draftNecesitaCotizacion,
      etiqueta: '', montoTexto: '', convertidoTexto: '',
    };
    this.actualizarLinea(linea);
    this.lineas = [...this.lineas, linea];
    this.draft.patchValue({ monto: null }, { emitEvent: false });
    this.recalcular();
  }

  quitarLinea(idx: number): void {
    this.lineas = this.lineas.filter((_, i) => i !== idx);
    this.recalcular();
  }

  /** Completa el mismo importe que falta para cuadrar, en la moneda de la deuda. */
  completarFaltante(): void {
    const falta = redondear(this.totalDeuda - this.totalPago, this.decimalesDeuda);
    if (falta <= 0 || this.monedaDeudaId == null) return;
    this.draft.patchValue({ monedaId: this.monedaDeudaId, monto: falta });
    this.onDraftMonedaChange();
  }

  private actualizarLinea(l: LineaRow): void {
    l.necesitaCotizacion = this.monedaDeudaId != null && l.monedaId !== this.monedaDeudaId;
    if (!l.necesitaCotizacion) l.cotizacion = 1;
    l.etiqueta = l.fuente === 'CAJA_MAYOR'
      ? `${l.formaPagoNombre || 'Efectivo'} (caja mayor)`
      : `Cuenta ${l.cuentaNombre || ''}`.trim();
    l.montoTexto = `${l.monedaSimbolo} ${this.formatear(l.monto, l.decimales)}`.trim();
    const conv = convertirLinea(l.monto, l.cotizacion, this.decimalesDeuda);
    l.convertidoTexto = l.necesitaCotizacion
      ? `${this.monedaDeudaSimbolo} ${this.formatear(conv, this.decimalesDeuda)}`.trim()
      : '';
  }

  // ── Alta rápida sin salir del componente ──

  async nuevaObligacion(): Promise<void> {
    let ref: MatDialogRef<any> | null = null;
    if (this.concepto === PagoConcepto.GASTO) {
      const { CreateEditGastoDialogComponent } = await import('../gastos/create-edit-gasto/create-edit-gasto-dialog.component');
      ref = this.dialog.open(CreateEditGastoDialogComponent, {
        width: '800px', maxHeight: '90vh',
        data: { cajaMayorId: this.draft.get('cajaMayorId')!.value, diferido: true },
      });
    } else if (this.concepto === PagoConcepto.VALE) {
      const { CreateEditValeDialogComponent } = await import('src/app/pages/rrhh/vales/create-edit-vale-dialog.component');
      ref = this.dialog.open(CreateEditValeDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });
    } else if (this.concepto === PagoConcepto.COMPRA) {
      const { CrearCompraSimplificadaDialogComponent } = await import('src/app/pages/compras/crear-compra-simplificada-dialog/crear-compra-simplificada-dialog.component');
      ref = this.dialog.open(CrearCompraSimplificadaDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });
    }
    if (!ref) return;
    const res = await firstValueFrom(ref.afterClosed());
    if (res) await this.cargar();
  }

  // ── Confirmación ──

  async confirmar(): Promise<void> {
    if (this.saving || !this.cuadra || this.errores.length) return;

    // Aviso de saldo negativo: la caja puede quedar en rojo a propósito, pero
    // que sea una decisión y no una sorpresa.
    const checks = this.lineas
      .filter((l) => l.fuente === 'CAJA_MAYOR')
      .map((l) => {
        const caja = this.cajasMayor.find((c) => c.id === l.cajaMayorId);
        const saldo = (caja?.saldos || []).find(
          (s: any) => s.moneda?.id === l.monedaId && s.formaPago?.id === l.formaPagoId,
        );
        return {
          label: `${caja?.nombre || 'Caja mayor'} · ${l.monedaSimbolo} ${l.formaPagoNombre || ''}`.trim(),
          saldoActual: Number(saldo?.saldo) || 0,
          monto: l.monto,
          monedaSimbolo: l.monedaSimbolo,
        };
      });
    if (checks.length && !(await confirmarSaldosNegativos(this.dialog, checks))) return;

    this.saving = true;
    try {
      const payload = {
        concepto: this.concepto,
        items: this.seleccionadas.map((o) => ({ origenId: o.origenId, monto: o.montoAPagar })),
        lineas: this.lineas.map((l) => ({
          fuente: l.fuente,
          monedaId: l.monedaId,
          formaPagoId: l.formaPagoId,
          cajaMayorId: l.cajaMayorId,
          cuentaBancariaId: l.cuentaBancariaId,
          monto: l.monto,
          cotizacion: l.cotizacion,
        })),
      };
      const res = await firstValueFrom(this.repo.registrarPagoConsolidado(payload));
      this.snackBar.open('Pago registrado.', 'Cerrar', { duration: 3000 });
      if (this.dialogRef) this.dialogRef.close(res);
      else { this.lineas = []; await this.cargar(); }
    } catch (e: any) {
      console.error('Error registrando pago consolidado', e);
      this.snackBar.open(e?.message || 'No se pudo registrar el pago', 'Cerrar', { duration: 6000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    if (this.dialogRef) this.dialogRef.close(null);
  }
}
