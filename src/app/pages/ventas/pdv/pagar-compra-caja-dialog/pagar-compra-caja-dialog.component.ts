import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { TabsService } from 'src/app/services/tabs.service';
import { CreateEditCompraComponent } from 'src/app/pages/compras/create-edit-compra/create-edit-compra.component';

/**
 * Crea+paga una compra SIMPLIFICADA o paga una cuota de compra existente con el
 * efectivo de la caja de venta (PdV). Para una compra detallada abre el módulo
 * de Compras. Descuenta del cajón y aparece en el resumen de cierre.
 */
@Component({
  selector: 'app-pagar-compra-caja-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatDatepickerModule,
    MatNativeDateModule, MatProgressSpinnerModule, MatSnackBarModule, MatCheckboxModule,
    MatTableModule, MatTooltipModule, DecimalPipe, CurrencyInputDirective,
  ],
  templateUrl: './pagar-compra-caja-dialog.component.html',
  styleUrls: ['./pagar-compra-caja-dialog.component.scss'],
})
export class PagarCompraCajaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  loading = true;

  cajaId = 0;
  cajaNombre = '';

  proveedores: any[] = [];
  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cuotasPendientes: any[] = [];
  cargandoCuotas = false;

  decimalesMoneda = 0;
  efectivoPorMoneda: { [monedaId: number]: number } = {};
  resumenCargado = false;

  // Precomputados (evita getters con lógica en el template — regla del repo).
  esPagar = false;
  saldoInsuficiente = false;

  // Pago mixto (varias formas/monedas efectivo).
  esMixto = false;
  readonly lineasCols = ['moneda', 'forma', 'monto', 'convertido', 'acciones'];
  lineas: { monedaId: number | null; formaPagoId: number | null; monto: number; decimales: number }[] = [];
  private cambios: any[] = [];
  saldoCuotaSeleccionada = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
    @Optional() public dialogRef: MatDialogRef<PagarCompraCajaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';

    this.form = this.fb.group({
      modo: ['CREAR', Validators.required],
      // CREAR
      proveedorId: [null],
      proveedorNombre: [''],
      compraCategoriaId: [null],
      numeroNota: [''],
      fecha: [new Date()],
      // PAGAR
      cuotaId: [null],
      // común
      monto: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      pagoMixto: [false],
    });

    this.esPagar = this.form.get('modo')!.value === 'PAGAR';
    this.form.get('modo')!.valueChanges.subscribe(() => this.onModoChange());
    this.form.get('pagoMixto')!.valueChanges.subscribe(() => this.onMixtoChange());
    this.form.get('monedaId')!.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcSaldo(); });
    this.form.get('monto')!.valueChanges.subscribe(() => this.recalcSaldo());
    this.form.get('cuotaId')!.valueChanges.subscribe((id) => this.onCuotaSelected(id));

    this.onModoChange();
    this.loadLookups();
  }

  private onModoChange(): void {
    this.esPagar = this.form.get('modo')!.value === 'PAGAR';
    const proveedorCtrl = this.form.get('proveedorId')!;
    const cuotaCtrl = this.form.get('cuotaId')!;
    const montoCtrl = this.form.get('monto')!;
    const monedaCtrl = this.form.get('monedaId')!;
    if (this.esPagar) {
      proveedorCtrl.clearValidators();
      cuotaCtrl.setValidators([Validators.required]);
      montoCtrl.disable({ emitEvent: false });
      monedaCtrl.disable({ emitEvent: false });
      this.cargarCuotasPendientes();
    } else {
      proveedorCtrl.setValidators([Validators.required]);
      cuotaCtrl.clearValidators();
      cuotaCtrl.reset(null, { emitEvent: false });
      montoCtrl.enable({ emitEvent: false });
      monedaCtrl.enable({ emitEvent: false });
    }
    proveedorCtrl.updateValueAndValidity({ emitEvent: false });
    cuotaCtrl.updateValueAndValidity({ emitEvent: false });
    this.recalcSaldo();
  }

  private async cargarCuotasPendientes(): Promise<void> {
    this.cargandoCuotas = true;
    try {
      this.cuotasPendientes = await firstValueFrom(this.repositoryService.getCuotasPendientesCompras()) || [];
    } catch (e) {
      console.error('Error cargando cuotas pendientes:', e);
      this.cuotasPendientes = [];
    } finally {
      this.cargandoCuotas = false;
    }
  }

  private onCuotaSelected(cuotaId: number): void {
    if (!this.esPagar || !cuotaId) return;
    const cuota = this.cuotasPendientes.find(c => c.id === cuotaId);
    if (cuota) {
      this.saldoCuotaSeleccionada = Number(cuota.saldoPendiente) || 0;
      this.form.patchValue({
        monto: Number(cuota.saldoPendiente),
        monedaId: cuota.monedaId,
      }, { emitEvent: true });
    }
  }

  // ─── Pago mixto ──────────────────────────────────────────────────────────────
  onMixtoChange(): void {
    this.esMixto = !!this.form.get('pagoMixto')!.value;
    const monto = this.form.get('monto')!;
    const fp = this.form.get('formaPagoId')!;
    if (this.esMixto) {
      monto.clearValidators();
      fp.clearValidators();
      if (!this.lineas.length) this.agregarLinea();
    } else {
      if (!this.esPagar) monto.setValidators([Validators.required, Validators.min(0.01)]);
      fp.setValidators([Validators.required]);
    }
    monto.updateValueAndValidity({ emitEvent: false });
    fp.updateValueAndValidity({ emitEvent: false });
  }

  /** Moneda de la deuda (destino de la conversión): compra (CREAR) o cuota (PAGAR). */
  private get targetMonedaId(): number | null {
    return this.form?.get('monedaId')?.value ?? null;
  }

  private decimalesDeMoneda(monedaId: number | null): number {
    const m = this.monedas.find((x: any) => x.id === monedaId);
    const dec = Number(m?.decimales);
    return Number.isFinite(dec) ? dec : 0;
  }

  /** Cotización (compraLocal) de `origenId` → moneda destino. 1 si igual; null si falta. */
  cotizacionA(origenId: number | null): number | null {
    const destinoId = this.targetMonedaId;
    if (origenId == null || destinoId == null) return null;
    if (origenId === destinoId) return 1;
    const c = this.cambios.find((x: any) => x?.monedaOrigen?.id === origenId && x?.monedaDestino?.id === destinoId && x?.activo !== false);
    const tasa = c ? Number(c.compraLocal) : 0;
    return tasa > 0 ? tasa : null;
  }

  convertido(l: { monedaId: number | null; monto: number }): number | null {
    const tasa = this.cotizacionA(l.monedaId);
    if (tasa == null) return null;
    return +(Number(l.monto || 0) * tasa).toFixed(2);
  }

  get totalConvertido(): number {
    return +this.lineas.reduce((s, l) => s + (this.convertido(l) ?? 0), 0).toFixed(2);
  }

  get hayLineaSinCotizacion(): boolean {
    return this.lineas.some(l => Number(l.monto) > 0 && this.cotizacionA(l.monedaId) == null);
  }

  agregarLinea(): void {
    const efectivo = this.formasPago.find((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO')) || this.formasPago[0];
    const monedaId = this.targetMonedaId ?? (this.monedas[0]?.id ?? null);
    this.lineas.push({ monedaId, formaPagoId: efectivo?.id ?? null, monto: 0, decimales: this.decimalesDeMoneda(monedaId) });
    this.lineas = [...this.lineas];
  }

  quitarLinea(i: number): void {
    this.lineas.splice(i, 1);
    this.lineas = [...this.lineas];
  }

  onLineaMonedaChange(l: { monedaId: number | null; decimales: number }): void {
    l.decimales = this.decimalesDeMoneda(l.monedaId);
  }

  onLineaMontoChange(l: { monto: number }, value: any): void {
    const n = Number(value || 0);
    l.monto = isNaN(n) ? 0 : n;
  }

  mixtoValido(): boolean {
    if (!this.lineas.length || this.hayLineaSinCotizacion) return false;
    for (const l of this.lineas) {
      if (l.monedaId == null || l.formaPagoId == null || !(Number(l.monto) > 0)) return false;
    }
    if (this.totalConvertido <= 0) return false;
    // En PAGAR no superar el saldo de la cuota.
    if (this.esPagar && this.totalConvertido > this.saldoCuotaSeleccionada + 0.005) return false;
    return true;
  }

  private async loadLookups(): Promise<void> {
    this.loading = true;
    try {
      const [proveedores, categorias, monedas, formasPago, cambios, resumen] = await Promise.all([
        firstValueFrom(this.repositoryService.getProveedores()),
        firstValueFrom(this.repositoryService.getCompraCategorias()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getMonedasCambio()).catch(() => []),
        firstValueFrom(this.repositoryService.getResumenCaja(this.cajaId)).catch(() => null),
      ]);
      this.proveedores = ((proveedores as any[]) || []).filter((p: any) => p.activo !== false);
      this.categorias = categorias || [];
      this.monedas = monedas || [];
      this.cambios = (cambios as any[]) || [];
      this.formasPago = ((formasPago as any[]) || []).filter((f: any) => f.activo !== false && f.movimentaCaja);
      this.efectivoPorMoneda = (resumen as any)?.efectivoPorMoneda || {};
      this.resumenCargado = !!resumen;
      this.preseleccionar();
    } catch (e) {
      console.error('Error cargando datos:', e);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private preseleccionar(): void {
    const monedaPrincipal = this.monedas.find((m: any) => m.principal) || this.monedas[0];
    if (monedaPrincipal) this.form.patchValue({ monedaId: monedaPrincipal.id }, { emitEvent: true });
    const efectivo = this.formasPago.find((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO')) || this.formasPago[0];
    if (efectivo) this.form.patchValue({ formaPagoId: efectivo.id }, { emitEvent: false });
  }

  private recalcDecimales(): void {
    const m = this.monedas.find((x: any) => x.id === this.form.get('monedaId')!.value);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  private recalcSaldo(): void {
    if (!this.resumenCargado) { this.saldoInsuficiente = false; return; }
    const monedaId = this.form?.get('monedaId')?.value;
    const monto = Number(this.form?.get('monto')?.value) || 0;
    if (!monedaId || !monto) { this.saldoInsuficiente = false; return; }
    const disponible = Number(this.efectivoPorMoneda[monedaId] || 0);
    this.saldoInsuficiente = monto > disponible;
  }

  onProveedorChange(id: number): void {
    const prov = this.proveedores.find(p => p.id === id);
    this.form.patchValue({ proveedorNombre: prov?.nombre || '' }, { emitEvent: false });
  }

  abrirCompraDetallada(): void {
    this.dialogRef?.close();
    this.tabsService.openTab(
      'Nueva compra',
      CreateEditCompraComponent,
      { mode: 'create' },
      `nueva-compra-${Date.now()}`,
      true,
    );
  }

  async guardar(): Promise<void> {
    if (this.saving) return;
    if (this.esMixto ? !this.mixtoValido() : this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const lineas = this.esMixto
      ? this.lineas.map(l => ({
          monedaId: l.monedaId,
          formaPagoId: l.formaPagoId,
          monto: +Number(l.monto).toFixed(2),
          cotizacion: this.cotizacionA(l.monedaId),
        }))
      : null;
    this.saving = true;
    try {
      if (this.esPagar) {
        await firstValueFrom(this.repositoryService.pagarCompraCuotaCaja({
          cajaId: this.cajaId,
          cuotaId: v.cuotaId,
          ...(this.esMixto ? { lineas } : { monto: Number(v.monto), formaPagoId: v.formaPagoId }),
        }));
      } else {
        await firstValueFrom(this.repositoryService.crearCompraSimplificadaCaja({
          cajaId: this.cajaId,
          proveedorId: v.proveedorId,
          proveedorNombre: v.proveedorNombre,
          compraCategoriaId: v.compraCategoriaId || null,
          numeroNota: v.numeroNota || null,
          fechaCompra: v.fecha,
          total: this.esMixto ? this.totalConvertido : Number(v.monto),
          monedaId: v.monedaId,
          ...(this.esMixto ? { lineas } : { formaPagoId: v.formaPagoId }),
        }));
      }
      this.snackBar.open('Compra registrada', 'Cerrar', { duration: 2500 });
      this.dialogRef?.close({ success: true });
    } catch (e: any) {
      console.error('Error registrando compra:', e);
      const msg = e?.message?.includes('Error invoking remote method')
        ? 'Error al registrar la compra' : (e?.message || 'Error al registrar la compra');
      this.snackBar.open(msg, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef?.close();
  }
}
