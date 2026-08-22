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
  CAJAS_EN_UI,
  CUENTAS_EN_UI,
  MONEDAS_EN_UI,
  LADOS_CAJA_MAYOR,
  COTIZACION_EN_UI,
  monedasDesdeCuentaBancaria,
  camposFaltantes,
  validarCoherencia,
  etiquetaDe,
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
      .op-alerta {
        margin: 8px 4px 14px; padding: 10px 12px; border-radius: 6px;
        font-size: 0.85rem; color: var(--warning-color);
        border: 1px solid var(--warning-color);
      }
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
  /** No existe una forma de pago EFECTIVO configurada (bloquea los tramos de caja). */
  sinFormaPagoEfectivo = false;

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
  /** La diferencia sólo aplica si hay una caja mayor donde imputarla. */
  showDiferencia = true;
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
        // Sin forma de pago efectivo no hay manera de completar el tramo contra
        // caja mayor y el formulario quedaría inválido sin explicación. Se avisa
        // en vez de dejar el botón muerto.
        this.sinFormaPagoEfectivo = !this.efectivoId;
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
    // Visibilidad derivada de la fuente única (@frc/shared-core), no hardcodeada:
    // así el validador, la UI y el test no pueden desincronizarse.
    this.showCajaOrigen = CAJAS_EN_UI[t].origen;
    this.showCajaDestino = CAJAS_EN_UI[t].destino;
    this.showCuentaOrigen = CUENTAS_EN_UI[t].origen;
    this.showCuentaDestino = CUENTAS_EN_UI[t].destino;
    this.showMonedaOrigenSelect = MONEDAS_EN_UI[t].includes('monedaOrigenId');
    this.showMonedaDestinoSelect = MONEDAS_EN_UI[t].includes('monedaDestinoId');
    // El backend imputa la diferencia a la caja destino u origen; una
    // transferencia banco→banco no tiene ninguna y la descarta en silencio.
    this.showDiferencia = LADOS_CAJA_MAYOR[t].origen || LADOS_CAJA_MAYOR[t].destino;

    // Limpiar los controles del lado/moneda que NO aplican al tipo elegido, para
    // no persistir relaciones obsoletas (ej. cuentaBancariaDestinoId arrastrado
    // de un depósito hacia un cambio de divisa). El handler guarda cualquier *Id
    // presente como relación, así que el arrastre crearía una relación bogus.
    const clr = (n: string) => this.form.get(n)?.setValue(null, { emitEvent: false });
    if (!this.showCajaOrigen) clr('cajaMayorOrigenId');
    if (!this.showCuentaOrigen) clr('cuentaBancariaOrigenId');
    if (!this.showCajaDestino) clr('cajaMayorDestinoId');
    if (!this.showCuentaDestino) clr('cuentaBancariaDestinoId');
    // Las monedas se re-eligen (select) o se heredan de la cuenta; reset evita arrastre.
    clr('monedaOrigenId');
    clr('monedaDestinoId');
    clr('formaPagoOrigenId');
    clr('formaPagoDestinoId');
    if (!this.showDiferencia) {
      this.form.controls.diferencia.setValue(0, { emitEvent: false });
      this.form.controls.diferenciaDestinoTipo.setValue('IGNORAR', { emitEvent: false });
      this.form.controls.diferenciaObservacion.setValue('', { emitEvent: false });
    }

    // Re-preseleccionar la caja de contexto como origen si el tipo la usa.
    if (this.showCajaOrigen && !this.form.controls.cajaMayorOrigenId.value && this.cajas.some((c) => c.id === this.cajaMayorId)) {
      this.form.controls.cajaMayorOrigenId.setValue(this.cajaMayorId, { emitEvent: false });
    }

    // Forma de pago de los tramos contra caja = efectivo (fijo).
    //
    // La condición es "¿este LADO mueve caja mayor?" (LADOS_CAJA_MAYOR) y NO
    // "¿se muestra un select de caja de este lado?" (CAJAS_EN_UI). En
    // CAMBIO_DIVISA los dos lados mueven caja pero es la MISMA caja, así que hay
    // un solo select: con la condición vieja `formaPagoDestinoId` quedaba null,
    // era requerido y el formulario nunca se podía guardar.
    if (this.efectivoId) {
      if (LADOS_CAJA_MAYOR[t].origen) this.form.controls.formaPagoOrigenId.setValue(this.efectivoId, { emitEvent: false });
      if (LADOS_CAJA_MAYOR[t].destino) this.form.controls.formaPagoDestinoId.setValue(this.efectivoId, { emitEvent: false });
    }

    // Re-derivar las monedas heredadas de las cuentas que SOBREVIVIERON al
    // cambio de tipo (arriba se limpian todas). Sin esto, al pasar de
    // RETIRO_BANCARIO a TRANSFERENCIA_BANCARIA y volver, la cuenta seguía
    // elegida pero su moneda quedaba en null y era irrecuperable: re-elegir la
    // misma opción en un mat-select no emite `valueChanges`.
    this.resincronizarMonedasDesdeCuentas();

    // Después de resincronizar: en TRANSFERENCIA_BANCARIA la cotización sólo se
    // muestra si las monedas de las dos cuentas difieren.
    this.recomputarCotizacion();
    this.aplicarValidadores();
    this.refrescarLabelsMoneda();
  }

  /** Vuelve a aplicar la moneda de cada cuenta bancaria todavía seleccionada. */
  private resincronizarMonedasDesdeCuentas(): void {
    if (this.showCuentaOrigen) {
      this.aplicarMonedaDeCuenta(this.form.controls.cuentaBancariaOrigenId.value, 'origen');
    }
    if (this.showCuentaDestino) {
      this.aplicarMonedaDeCuenta(this.form.controls.cuentaBancariaDestinoId.value, 'destino');
    }
  }

  private recomputarCotizacion(): void {
    const modo = COTIZACION_EN_UI[this.tipoOperacion];
    if (modo === 'SIEMPRE') {
      this.showCotizacion = true;
      return;
    }
    if (modo === 'SI_MONEDAS_DISTINTAS') {
      const mo = this.cuentaMoneda('origen');
      const md = this.cuentaMoneda('destino');
      this.showCotizacion = !!(mo && md && mo !== md);
    } else {
      this.showCotizacion = false;
    }
    // Sin campo visible no puede quedar una cotización vieja en el payload.
    if (!this.showCotizacion && this.form.controls.cotizacion.value !== null) {
      this.form.controls.cotizacion.setValue(null, { emitEvent: false });
    }
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

  /**
   * Aplica la moneda de una cuenta bancaria a los controles de moneda.
   *  - TRANSFERENCIA_BANCARIA (dos cuentas, posible multi-moneda): cada cuenta
   *    setea SOLO su lado, los lados no se pisan.
   *  - DEPOSITO/RETIRO (una sola cuenta, efectivo): la misma divisa a AMBOS
   *    lados (si no, la moneda requerida del lado sin UI queda en null).
   */
  private aplicarMonedaDeCuenta(id: number | null, lado: 'origen' | 'destino'): void {
    const cb = this.cuentas.find((c) => c.id === id);
    if (!cb?.monedaId) return;
    if (this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
      const ctrl = lado === 'origen' ? 'monedaOrigenId' : 'monedaDestinoId';
      this.form.get(ctrl)?.setValue(cb.monedaId, { emitEvent: false });
    } else {
      const { monedaOrigenId, monedaDestinoId } = monedasDesdeCuentaBancaria(cb.monedaId);
      this.form.controls.monedaOrigenId.setValue(monedaOrigenId, { emitEvent: false });
      this.form.controls.monedaDestinoId.setValue(monedaDestinoId, { emitEvent: false });
    }
  }

  private onCuentaSeleccionada(id: number | null, lado: 'origen' | 'destino'): void {
    this.aplicarMonedaDeCuenta(id, lado);
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
    if (this.saving) return;
    const valores = this.form.getRawValue() as unknown as Record<string, unknown>;
    // El tipo sale del form (única fuente de verdad de lo que se va a guardar),
    // no del campo espejo `tipoOperacion` que sólo usan los flags de la vista.
    const tipo = (valores['tipoOperacion'] || 'CAMBIO_DIVISA') as TipoOperacionFinanciera;

    // Errores semánticos primero: son los que el `required` no ve.
    const incoherencias = validarCoherencia(tipo, valores);
    if (incoherencias.length) {
      this.snack.open(incoherencias[0], 'OK', { duration: 5000 });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Nombrar los campos que faltan: varios de ellos (forma de pago, moneda
      // heredada de la cuenta) no se renderizan, así que un mensaje genérico no
      // le decía al usuario qué corregir.
      const faltantes = camposFaltantes(tipo, valores).map(etiquetaDe);
      this.snack.open(
        faltantes.length ? `Faltan completar: ${faltantes.join(', ')}` : 'Revisá los datos cargados',
        'OK',
        { duration: 5000 },
      );
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
