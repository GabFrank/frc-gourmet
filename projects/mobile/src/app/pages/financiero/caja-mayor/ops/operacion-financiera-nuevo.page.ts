import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  RepositoryService,
  CAMPOS_REQUERIDOS,
  monedasDesdeCuentaBancaria,
  TipoOperacionFinanciera,
} from '@frc/shared-core';
import { formaPagoEfectivo } from '../../forma-pago-efectivo.util';

interface Opcion { id: number; label: string; }
interface MonedaOp extends Opcion { simbolo: string; decimales: number; principal: boolean; }
interface CuentaOp extends Opcion { monedaId: number; simbolo: string; }

const TODOS_LOS_CAMPOS = [
  'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen', 'cuentaBancariaOrigenId',
  'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cuentaBancariaDestinoId',
  'cotizacion',
];
const EXTRA_VALIDATORS: Record<string, any[]> = {
  montoOrigen: [Validators.min(0.01)],
  montoDestino: [Validators.min(0.01)],
  cotizacion: [Validators.min(0.000001)],
};

/**
 * Registrar Operación Financiera (mobile), full-screen. Cubre los 5 tipos:
 * cambio de divisa, depósito/retiro bancario, transferencia entre cajas y
 * transferencia bancaria. Reusa las reglas de campos requeridos de
 * `@frc/shared-core` (fuente única desktop + mobile). Tramos contra caja mayor
 * = efectivo. Requiere CAJA_MAYOR_OPERAR.
 */
@Component({
  selector: 'app-operacion-financiera-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './operacion-financiera-nuevo.page.html',
  styles: [
    `
      .op-section {
        margin: 18px 4px 6px; font-size: 0.95rem; font-weight: 600;
        color: var(--text-primary); border-bottom: 1px solid var(--border-color, rgba(128,128,128,0.25));
        padding-bottom: 4px;
      }
      .op-hint { margin: 0 4px 10px; font-size: 0.8rem; color: var(--text-secondary); }
    `,
  ],
})
export class OperacionFinancieraNuevoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;

  categorias: Opcion[] = [];
  monedas: MonedaOp[] = [];
  cajas: Opcion[] = [];
  cuentas: CuentaOp[] = [];
  private efectivoId: number | null = null;
  efectivoLabel = 'Efectivo';

  loading = true;
  saving = false;

  tipos = [
    { value: 'CAMBIO_DIVISA', label: 'Cambio de divisa' },
    { value: 'DEPOSITO_BANCARIO', label: 'Depósito bancario' },
    { value: 'RETIRO_BANCARIO', label: 'Retiro bancario' },
    { value: 'TRANSFERENCIA_ENTRE_CAJAS', label: 'Transferencia entre cajas' },
    { value: 'TRANSFERENCIA_BANCARIA', label: 'Transferencia bancaria' },
  ];
  tipoOperacion: TipoOperacionFinanciera = 'CAMBIO_DIVISA';

  diferenciaOpciones = [
    { value: 'IGNORAR', label: 'Ignorar' },
    { value: 'GASTO', label: 'Gasto' },
    { value: 'VALE', label: 'Vale' },
  ];

  // Flags de visibilidad (precomputados; sin funciones en template).
  showCajaOrigen = false;
  showCuentaOrigen = false;
  showMonedaOrigenSelect = false;
  showCajaDestino = false;
  showCuentaDestino = false;
  showMonedaDestinoSelect = false;
  showCotizacion = false;
  monedaOrigenLabel = '';
  monedaDestinoLabel = '';

  readonly form = this.fb.group({
    tipoOperacion: ['CAMBIO_DIVISA' as TipoOperacionFinanciera, Validators.required],
    operacionFinancieraCategoriaId: [null as number | null],
    descripcion: ['', Validators.required],
    cajaMayorOrigenId: [null as number | null],
    monedaOrigenId: [null as number | null],
    formaPagoOrigenId: [null as number | null],
    montoOrigen: [null as number | null],
    cuentaBancariaOrigenId: [null as number | null],
    cajaMayorDestinoId: [null as number | null],
    monedaDestinoId: [null as number | null],
    formaPagoDestinoId: [null as number | null],
    montoDestino: [null as number | null],
    cuentaBancariaDestinoId: [null as number | null],
    cotizacion: [null as number | null],
    diferencia: [0 as number | null],
    diferenciaDestinoTipo: ['IGNORAR' as string],
    diferenciaObservacion: [''],
    observacion: [''],
  });

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();

    this.form.controls.tipoOperacion.valueChanges.subscribe((t) => {
      this.tipoOperacion = (t || 'CAMBIO_DIVISA') as TipoOperacionFinanciera;
      this.aplicarTipo();
    });
    this.form.controls.montoOrigen.valueChanges.subscribe(() => this.recalcularMontoDestino());
    this.form.controls.cotizacion.valueChanges.subscribe(() => this.recalcularMontoDestino());
    this.form.controls.cuentaBancariaOrigenId.valueChanges.subscribe((id) => this.onCuentaSeleccionada(id, 'origen'));
    this.form.controls.cuentaBancariaDestinoId.valueChanges.subscribe((id) => this.onCuentaSeleccionada(id, 'destino'));
    this.form.controls.monedaOrigenId.valueChanges.subscribe(() => this.refrescarLabelsMoneda());
    this.form.controls.monedaDestinoId.valueChanges.subscribe(() => this.refrescarLabelsMoneda());
  }

  private cargar(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getOperacionFinancieraCategorias()),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([cats, monedas, formas, cajas, cuentas]: [any[], any[], any[], any[], any[]]) => {
        this.categorias = (cats || []).filter((c) => c.activo !== false).map((c) => ({ id: c.id, label: c.nombre }));
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}`, simbolo: m.simbolo || '', decimales: m.decimales ?? 0, principal: !!m.principal }));
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoId = efectivo?.id ?? null;
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        this.cajas = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.cuentas = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`, monedaId: c.moneda.id, simbolo: c.moneda?.simbolo || '' }));
        // Preseleccionar la caja actual como origen si aplica.
        if (this.cajas.some((c) => c.id === this.cajaMayorId)) {
          this.form.controls.cajaMayorOrigenId.setValue(this.cajaMayorId, { emitEvent: false });
        }
        this.aplicarTipo();
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los catálogos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  private aplicarTipo(): void {
    const t = this.tipoOperacion;
    this.showCajaOrigen = t === 'CAMBIO_DIVISA' || t === 'DEPOSITO_BANCARIO' || t === 'TRANSFERENCIA_ENTRE_CAJAS';
    this.showCuentaOrigen = t === 'RETIRO_BANCARIO' || t === 'TRANSFERENCIA_BANCARIA';
    this.showMonedaOrigenSelect = t === 'CAMBIO_DIVISA' || t === 'TRANSFERENCIA_ENTRE_CAJAS';
    this.showCajaDestino = t === 'RETIRO_BANCARIO' || t === 'TRANSFERENCIA_ENTRE_CAJAS';
    this.showCuentaDestino = t === 'DEPOSITO_BANCARIO' || t === 'TRANSFERENCIA_BANCARIA';
    this.showMonedaDestinoSelect = t === 'CAMBIO_DIVISA' || t === 'TRANSFERENCIA_ENTRE_CAJAS';
    this.recomputarCotizacion();

    // Limpiar los controles del lado/moneda que NO aplican al tipo elegido, para
    // no persistir relaciones obsoletas (ej. cuentaBancariaDestinoId arrastrado
    // de un depósito hacia un cambio de divisa). El handler guarda cualquier *Id
    // presente como relación, así que el arrastre crearía una relación bogus.
    const clr = (n: string) => this.form.get(n)?.setValue(null, { emitEvent: false });
    if (!this.showCajaOrigen) clr('cajaMayorOrigenId');
    if (!this.showCuentaOrigen) clr('cuentaBancariaOrigenId');
    if (!this.showCajaDestino) clr('cajaMayorDestinoId');
    if (!this.showCuentaDestino) clr('cuentaBancariaDestinoId');
    if (!this.showCotizacion) clr('cotizacion');
    // Las monedas se re-eligen (select) o se heredan de la cuenta; reset evita arrastre.
    clr('monedaOrigenId');
    clr('monedaDestinoId');
    clr('formaPagoOrigenId');
    clr('formaPagoDestinoId');

    // Re-preseleccionar la caja de contexto como origen si el tipo la usa.
    if (this.showCajaOrigen && !this.form.controls.cajaMayorOrigenId.value && this.cajas.some((c) => c.id === this.cajaMayorId)) {
      this.form.controls.cajaMayorOrigenId.setValue(this.cajaMayorId, { emitEvent: false });
    }

    // Forma de pago de los tramos contra caja = efectivo (fijo).
    if (this.efectivoId) {
      if (this.showCajaOrigen) this.form.controls.formaPagoOrigenId.setValue(this.efectivoId, { emitEvent: false });
      if (this.showCajaDestino || t === 'RETIRO_BANCARIO') this.form.controls.formaPagoDestinoId.setValue(this.efectivoId, { emitEvent: false });
    }
    this.aplicarValidadores();
    this.refrescarLabelsMoneda();
  }

  private recomputarCotizacion(): void {
    const t = this.tipoOperacion;
    if (t === 'CAMBIO_DIVISA') { this.showCotizacion = true; return; }
    if (t === 'TRANSFERENCIA_BANCARIA') {
      const mo = this.cuentaMoneda('origen');
      const md = this.cuentaMoneda('destino');
      this.showCotizacion = !!(mo && md && mo !== md);
      return;
    }
    this.showCotizacion = false;
  }

  private aplicarValidadores(): void {
    const requeridos = CAMPOS_REQUERIDOS[this.tipoOperacion] || [];
    for (const n of TODOS_LOS_CAMPOS) {
      const c = this.form.get(n);
      if (!c) continue;
      if (requeridos.includes(n)) c.setValidators([Validators.required, ...(EXTRA_VALIDATORS[n] || [])]);
      else c.clearValidators();
      c.updateValueAndValidity({ emitEvent: false });
    }
  }

  private cuentaMoneda(lado: 'origen' | 'destino'): number | null {
    const id = lado === 'origen' ? this.form.controls.cuentaBancariaOrigenId.value : this.form.controls.cuentaBancariaDestinoId.value;
    return this.cuentas.find((c) => c.id === id)?.monedaId ?? null;
  }

  private onCuentaSeleccionada(id: number | null, lado: 'origen' | 'destino'): void {
    const cb = this.cuentas.find((c) => c.id === id);
    if (cb?.monedaId) {
      if (this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
        const ctrl = lado === 'origen' ? 'monedaOrigenId' : 'monedaDestinoId';
        this.form.get(ctrl)?.setValue(cb.monedaId, { emitEvent: false });
      } else {
        const { monedaOrigenId, monedaDestinoId } = monedasDesdeCuentaBancaria(cb.monedaId);
        this.form.controls.monedaOrigenId.setValue(monedaOrigenId, { emitEvent: false });
        this.form.controls.monedaDestinoId.setValue(monedaDestinoId, { emitEvent: false });
      }
    }
    this.recomputarCotizacion();
    this.refrescarLabelsMoneda();
    this.recalcularMontoDestino();
  }

  private refrescarLabelsMoneda(): void {
    const mo = this.monedas.find((m) => m.id === this.form.controls.monedaOrigenId.value);
    const md = this.monedas.find((m) => m.id === this.form.controls.monedaDestinoId.value);
    this.monedaOrigenLabel = mo ? mo.label : '';
    this.monedaDestinoLabel = md ? md.label : '';
  }

  private recalcularMontoDestino(): void {
    const monto = Number(this.form.controls.montoOrigen.value);
    const t = this.tipoOperacion;
    if (t === 'TRANSFERENCIA_BANCARIA' && !this.showCotizacion) {
      if (monto > 0) this.form.controls.montoDestino.setValue(monto, { emitEvent: false });
      return;
    }
    if (t === 'CAMBIO_DIVISA' || t === 'TRANSFERENCIA_BANCARIA') {
      const cotiz = Number(this.form.controls.cotizacion.value);
      if (monto > 0 && cotiz > 0) {
        const mo = this.monedas.find((m) => m.id === this.form.controls.monedaOrigenId.value);
        const md = this.monedas.find((m) => m.id === this.form.controls.monedaDestinoId.value);
        const dest = mo?.principal && !md?.principal ? +(monto / cotiz).toFixed(2) : +(monto * cotiz).toFixed(2);
        this.form.controls.montoDestino.setValue(dest, { emitEvent: false });
      }
    } else if (monto > 0) {
      this.form.controls.montoDestino.setValue(monto, { emitEvent: false });
    }
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      this.snack.open('Completá los campos requeridos', 'OK', { duration: 3000 });
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload: any = {
      tipoOperacion: v.tipoOperacion,
      operacionFinancieraCategoriaId: v.operacionFinancieraCategoriaId || null,
      descripcion: (v.descripcion || '').toUpperCase(),
      fecha: new Date(),
      cajaMayorOrigenId: v.cajaMayorOrigenId || null,
      monedaOrigenId: v.monedaOrigenId || null,
      formaPagoOrigenId: v.formaPagoOrigenId || null,
      montoOrigen: v.montoOrigen || null,
      cuentaBancariaOrigenId: v.cuentaBancariaOrigenId || null,
      cajaMayorDestinoId: v.cajaMayorDestinoId || null,
      monedaDestinoId: v.monedaDestinoId || null,
      formaPagoDestinoId: v.formaPagoDestinoId || null,
      montoDestino: v.montoDestino || null,
      cuentaBancariaDestinoId: v.cuentaBancariaDestinoId || null,
      cotizacion: v.cotizacion || null,
      diferencia: v.diferencia || 0,
      diferenciaDestinoTipo: v.diferenciaDestinoTipo || 'IGNORAR',
      diferenciaObservacion: v.diferenciaObservacion ? v.diferenciaObservacion.toUpperCase() : null,
      observacion: v.observacion ? v.observacion.toUpperCase() : null,
    };
    try {
      await firstValueFrom(this.repo.createOperacionFinanciera(payload));
      this.snack.open('Operación financiera registrada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para operar' : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
