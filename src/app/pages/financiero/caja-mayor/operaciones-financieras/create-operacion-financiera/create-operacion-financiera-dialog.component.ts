import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos, SaldoNegativoCheck } from 'src/app/shared/utils/saldo-negativo-confirm';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import {
  CAMPOS_REQUERIDOS, CAJAS_EN_UI, CUENTAS_EN_UI, LADOS_CAJA_MAYOR,
  COTIZACION_EN_UI, monedasDesdeCuentaBancaria, camposFaltantes, validarCoherencia,
  etiquetaDe, TipoOperacionFinanciera,
} from './operacion-financiera-validacion.util';
import { formaPagoEfectivo, formasPagoDeCaja } from 'src/app/shared/utils/forma-pago-efectivo.util';

@Component({
  selector: 'app-create-operacion-financiera-dialog',
  templateUrl: './create-operacion-financiera-dialog.component.html',
  styleUrls: ['./create-operacion-financiera-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDividerModule,
    MatTabsModule, MatTooltipModule,
    CurrencyInputDirective,
  ]
})
export class CreateOperacionFinancieraDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  decimalesOrigen = 0;
  decimalesDestino = 0;

  tipoOperacion = 'CAMBIO_DIVISA';
  tiposOperacion = [
    { value: 'CAMBIO_DIVISA', label: 'Cambio de Divisa', icon: 'swap_horiz' },
    { value: 'DEPOSITO_BANCARIO', label: 'Deposito Bancario', icon: 'account_balance' },
    { value: 'RETIRO_BANCARIO', label: 'Retiro Bancario', icon: 'savings' },
    { value: 'TRANSFERENCIA_ENTRE_CAJAS', label: 'Transferencia entre Cajas', icon: 'sync_alt' },
    { value: 'TRANSFERENCIA_BANCARIA', label: 'Transferencia Bancaria', icon: 'compare_arrows' },
  ];

  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  // Tramos contra Caja Mayor = siempre efectivo (regla de negocio).
  formasPagoEfectivo: any[] = [];
  /** Forma de pago preseleccionada en los tramos contra Caja Mayor. */
  formaPagoEfectivoId: number | null = null;
  /** No hay ninguna forma de pago usable para mover caja (bloquea esos tramos). */
  sinFormaPagoEfectivo = false;
  cajasMayor: any[] = [];
  cuentasBancarias: any[] = [];

  diferenciaDestinoOpciones = [
    { value: 'IGNORAR', label: 'Ignorar' },
    { value: 'GASTO', label: 'Gasto' },
    { value: 'VALE', label: 'Vale' },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<CreateOperacionFinancieraDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      tipoOperacion: ['CAMBIO_DIVISA', Validators.required],
      operacionFinancieraCategoriaId: [null],
      descripcion: ['', Validators.required],
      fecha: [new Date(), Validators.required],

      // Origen
      cajaMayorOrigenId: [this.data?.cajaMayorId || null],
      monedaOrigenId: [null],
      formaPagoOrigenId: [null],
      montoOrigen: [null],
      cuentaBancariaOrigenId: [null],

      // Destino
      cajaMayorDestinoId: [null],
      monedaDestinoId: [null],
      formaPagoDestinoId: [null],
      montoDestino: [null],
      cuentaBancariaDestinoId: [null],

      // Cambio divisa
      cotizacion: [null],

      // Deposito / Retiro
      numeroComprobante: [''],
      comprobanteUrl: [''],

      // Diferencia
      diferencia: [0],
      diferenciaDestinoTipo: ['IGNORAR'],
      diferenciaObservacion: [''],

      observacion: [''],
    });

    await this.loadOptions();
    this.applyValidators(this.tipoOperacion);

    this.form.get('tipoOperacion')?.valueChanges.subscribe((tipo: string) => {
      this.tipoOperacion = tipo;
      this.applyValidators(tipo);
    });

    // Recalcular monto destino cuando cambia montoOrigen o cotizacion (para CAMBIO_DIVISA)
    this.form.get('montoOrigen')?.valueChanges.subscribe(() => this.recalcularMontoDestino());
    this.form.get('cotizacion')?.valueChanges.subscribe(() => this.recalcularMontoDestino());

    // Al elegir una cuenta bancaria se hereda la moneda (ver setMonedaDeCuenta).
    this.form.get('cuentaBancariaOrigenId')?.valueChanges.subscribe((id: number) => {
      this.setMonedaDeCuenta(id, 'origen');
      this.recalcDecimales();
      this.recalcularMontoDestino();
    });
    this.form.get('cuentaBancariaDestinoId')?.valueChanges.subscribe((id: number) => {
      this.setMonedaDeCuenta(id, 'destino');
      this.recalcDecimales();
      this.recalcularMontoDestino();
    });
    this.form.get('monedaOrigenId')?.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcularMontoDestino(); });
    this.form.get('monedaDestinoId')?.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcularMontoDestino(); });
  }

  /**
   * Fija la moneda del lado que corresponde a partir de la cuenta bancaria:
   *  - DEPOSITO/RETIRO (una sola cuenta, efectivo): misma divisa a AMBOS lados
   *    (setear solo un lado dejaba la moneda requerida del otro en null → form
   *    inválido, botón Registrar deshabilitado).
   *  - TRANSFERENCIA_BANCARIA (dos cuentas, posible multi-moneda): cada cuenta
   *    setea SOLO su lado; los lados NO se pisan entre sí.
   */
  private setMonedaDeCuenta(id: number | null, lado: 'origen' | 'destino'): void {
    const cb = this.cuentasBancarias.find(c => c.id === id);
    if (!cb?.moneda?.id) return;
    if (this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
      const ctrl = lado === 'origen' ? 'monedaOrigenId' : 'monedaDestinoId';
      this.form.get(ctrl)?.setValue(cb.moneda.id, { emitEvent: false });
    } else {
      const { monedaOrigenId, monedaDestinoId } = monedasDesdeCuentaBancaria(cb.moneda.id);
      this.form.get('monedaOrigenId')?.setValue(monedaOrigenId, { emitEvent: false });
      this.form.get('monedaDestinoId')?.setValue(monedaDestinoId, { emitEvent: false });
    }
  }

  private recalcDecimales(): void {
    const origenId = this.form?.get('monedaOrigenId')?.value;
    const destinoId = this.form?.get('monedaDestinoId')?.value;
    const mo = this.monedas.find((x: any) => x.id === origenId);
    const md = this.monedas.find((x: any) => x.id === destinoId);
    const decO = Number(mo?.decimales);
    const decD = Number(md?.decimales);
    this.decimalesOrigen = Number.isFinite(decO) ? decO : 0;
    this.decimalesDestino = Number.isFinite(decD) ? decD : 0;
  }

  // Devuelve la moneda fija si la origen/destino esta atada a una cuenta bancaria
  monedaFijaOrigen(): any {
    if (this.tipoOperacion === 'RETIRO_BANCARIO' || this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
      const cbId = this.form.get('cuentaBancariaOrigenId')?.value;
      const cb = this.cuentasBancarias.find(c => c.id === cbId);
      return cb?.moneda || null;
    }
    return null;
  }

  monedaFijaDestino(): any {
    if (this.tipoOperacion === 'DEPOSITO_BANCARIO' || this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
      const cbId = this.form.get('cuentaBancariaDestinoId')?.value;
      const cb = this.cuentasBancarias.find(c => c.id === cbId);
      return cb?.moneda || null;
    }
    return null;
  }

  /**
   * ¿Las cuentas origen y destino de una TRANSFERENCIA_BANCARIA tienen monedas
   * distintas? Si difieren se muestra el campo de cotización y `montoDestino` se
   * calcula; si son la misma, montoDestino = montoOrigen.
   */
  monedasTransferenciaDistintas(): boolean {
    if (this.tipoOperacion !== 'TRANSFERENCIA_BANCARIA') return false;
    const mo = this.monedaFijaOrigen();
    const md = this.monedaFijaDestino();
    return !!(mo && md && mo.id !== md.id);
  }

  recalcularMontoDestino(): void {
    const monto = Number(this.form.get('montoOrigen')?.value);

    // TRANSFERENCIA_BANCARIA con monedas distintas: se comporta como cambio de
    // divisa (aplica cotización). Con la misma moneda: destino = origen.
    if (this.tipoOperacion === 'TRANSFERENCIA_BANCARIA' && !this.monedasTransferenciaDistintas()) {
      if (monto > 0) this.form.get('montoDestino')?.setValue(monto, { emitEvent: false });
      return;
    }

    if (this.tipoOperacion === 'CAMBIO_DIVISA' || this.tipoOperacion === 'TRANSFERENCIA_BANCARIA') {
      const cotiz = Number(this.form.get('cotizacion')?.value);
      if (monto > 0 && cotiz > 0) {
        // La cotizacion se expresa en moneda principal (ej. Gs) por 1 unidad de
        // la divisa extranjera. Por eso: si el ORIGEN es la principal se DIVIDE
        // (Gs -> divisa: 600.000 / 6.000 = 100); si el DESTINO es la principal se
        // MULTIPLICA (divisa -> Gs: 100 * 6.000 = 600.000).
        const monedaOrigen = this.monedas.find((m: any) => m.id === this.form.get('monedaOrigenId')?.value);
        const monedaDestino = this.monedas.find((m: any) => m.id === this.form.get('monedaDestinoId')?.value);
        let dest: number;
        if (monedaOrigen?.principal && !monedaDestino?.principal) {
          dest = +(monto / cotiz).toFixed(2);
        } else {
          // destino principal, o divisa->divisa (cotizacion como factor directo)
          dest = +(monto * cotiz).toFixed(2);
        }
        this.form.get('montoDestino')?.setValue(dest, { emitEvent: false });
      }
    } else {
      // DEPOSITO_BANCARIO, RETIRO_BANCARIO, TRANSFERENCIA_ENTRE_CAJAS:
      // Por defecto montoDestino = montoOrigen. El usuario puede ajustar.
      if (monto > 0) {
        this.form.get('montoDestino')?.setValue(monto, { emitEvent: false });
      }
    }
  }

  // Validators adicionales (además de `required`) por campo.
  private static readonly EXTRA_VALIDATORS: Record<string, any[]> = {
    montoOrigen: [Validators.min(0.01)],
    montoDestino: [Validators.min(0.01)],
    cotizacion: [Validators.min(0.000001)],
  };

  private static readonly TODOS_LOS_CAMPOS = [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen', 'cuentaBancariaOrigenId',
    'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cuentaBancariaDestinoId',
    'cotizacion',
  ];

  /**
   * Limpia el VALOR de los controles que el tipo elegido no usa y repuebla los
   * que se derivan solos.
   *
   * `applyValidators` sólo cambiaba validadores: los valores viejos quedaban en
   * `form.value` y el handler los persistía como relaciones bogus (ej. la cuenta
   * bancaria elegida en un depósito seguía adjunta a un cambio de divisa), y las
   * monedas heredadas de una cuenta se arrastraban a un tipo donde el usuario
   * debe elegirlas — un "cambio de divisa" con la misma moneda a ambos lados.
   */
  private limpiarCamposDelTipo(tipo: string): void {
    const t = tipo as TipoOperacionFinanciera;
    if (!CAJAS_EN_UI[t]) return;
    const clr = (n: string) => this.form.get(n)?.setValue(null, { emitEvent: false });

    if (!CAJAS_EN_UI[t].origen) clr('cajaMayorOrigenId');
    if (!CAJAS_EN_UI[t].destino) clr('cajaMayorDestinoId');
    if (!CUENTAS_EN_UI[t].origen) clr('cuentaBancariaOrigenId');
    if (!CUENTAS_EN_UI[t].destino) clr('cuentaBancariaDestinoId');
    if (COTIZACION_EN_UI[t] === 'NUNCA') clr('cotizacion');

    // Las monedas se re-eligen o se heredan de la cuenta; reset + re-derivación
    // desde las cuentas que sobrevivieron al cambio de tipo (reelegir la misma
    // opción en un mat-select no emite `valueChanges`, así que no alcanza con
    // esperar al usuario).
    clr('monedaOrigenId');
    clr('monedaDestinoId');
    if (CUENTAS_EN_UI[t].origen) this.setMonedaDeCuenta(this.form.get('cuentaBancariaOrigenId')?.value, 'origen');
    if (CUENTAS_EN_UI[t].destino) this.setMonedaDeCuenta(this.form.get('cuentaBancariaDestinoId')?.value, 'destino');

    // Forma de pago sólo en los lados que mueven caja mayor, con el efectivo
    // preseleccionado (el usuario puede cambiarlo dentro del pool de caja).
    if (LADOS_CAJA_MAYOR[t].origen) {
      if (!this.form.get('formaPagoOrigenId')?.value) this.form.get('formaPagoOrigenId')?.setValue(this.formaPagoEfectivoId, { emitEvent: false });
    } else {
      clr('formaPagoOrigenId');
    }
    if (LADOS_CAJA_MAYOR[t].destino) {
      if (!this.form.get('formaPagoDestinoId')?.value) this.form.get('formaPagoDestinoId')?.setValue(this.formaPagoEfectivoId, { emitEvent: false });
    } else {
      clr('formaPagoDestinoId');
    }

    // La caja de contexto vuelve a preseleccionarse si el tipo la usa.
    if (CAJAS_EN_UI[t].origen && !this.form.get('cajaMayorOrigenId')?.value && this.data?.cajaMayorId) {
      this.form.get('cajaMayorOrigenId')?.setValue(this.data.cajaMayorId, { emitEvent: false });
    }

    // Sin caja mayor no hay dónde imputar la diferencia: el backend la descarta.
    if (!LADOS_CAJA_MAYOR[t].origen && !LADOS_CAJA_MAYOR[t].destino) {
      this.form.get('diferencia')?.setValue(0, { emitEvent: false });
      this.form.get('diferenciaDestinoTipo')?.setValue('IGNORAR', { emitEvent: false });
      this.form.get('diferenciaObservacion')?.setValue('', { emitEvent: false });
    }

    this.recalcDecimales();
  }

  applyValidators(tipo: string): void {
    const ctrl = (n: string) => this.form.get(n);
    const requeridos = CAMPOS_REQUERIDOS[tipo as TipoOperacionFinanciera] || [];
    this.limpiarCamposDelTipo(tipo);

    // Los campos requeridos se toman de una única fuente de verdad
    // (operacion-financiera-validacion.util) para que la UI, el validador y el
    // test no puedan desincronizarse.
    for (const n of CreateOperacionFinancieraDialogComponent.TODOS_LOS_CAMPOS) {
      if (requeridos.includes(n)) {
        ctrl(n)?.setValidators([Validators.required, ...(CreateOperacionFinancieraDialogComponent.EXTRA_VALIDATORS[n] || [])]);
      } else {
        ctrl(n)?.clearValidators();
      }
      ctrl(n)?.updateValueAndValidity({ emitEvent: false });
    }
  }

  async loadOptions(): Promise<void> {
    try {
      const [categorias, monedas, formasPago, cajasMayor, cuentasBancarias] = await Promise.all([
        firstValueFrom(this.repositoryService.getOperacionFinancieraCategorias()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.categorias = (categorias || []).filter((c: any) => c.activo);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      // Los selects de forma de pago (tramos de Caja Mayor) solo ofrecen las
      // formas que mueven caja; se preselecciona la de efectivo. Misma regla que
      // la PWA (fuente única `forma-pago-efectivo.util`): el filtro viejo era
      // `nombre.includes('EFECTIVO')` y dejaba el select vacío si la forma no se
      // llamaba así, o ignoraba que estuviera inactiva.
      this.formasPagoEfectivo = formasPagoDeCaja(this.formasPago);
      this.formaPagoEfectivoId = formaPagoEfectivo(this.formasPago)?.id ?? null;
      this.sinFormaPagoEfectivo = !this.formaPagoEfectivoId;
      this.cajasMayor = (cajasMayor || []).filter((cm: any) => cm.estado === 'ABIERTA');
      this.cuentasBancarias = (cuentasBancarias || []).filter((cb: any) => cb.activo);
      this.recalcDecimales();
    } catch (error) {
      console.error('Error loading options:', error);
      this.snackBar.open('Error al cargar opciones', 'Cerrar', { duration: 3000 });
    }
  }

  setTipo(tipo: string): void {
    this.form.get('tipoOperacion')?.setValue(tipo);
  }

  // Construye los checks de saldo negativo segun tipo
  async getSaldoChecks(): Promise<SaldoNegativoCheck[]> {
    const v = this.form.value;
    const checks: SaldoNegativoCheck[] = [];

    const buscarSaldo = async (cmId: number, monId: number, fpId: number): Promise<number> => {
      if (!cmId || !monId || !fpId) return 0;
      try {
        const saldos = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(cmId));
        const s = (saldos || []).find((x: any) => x.moneda?.id === monId && x.formaPago?.id === fpId);
        return Number(s?.saldo || 0);
      } catch { return 0; }
    };

    const moneda = (id: number) => this.monedas.find(m => m.id === id);
    const fp = (id: number) => this.formasPago.find(f => f.id === id);

    switch (this.tipoOperacion) {
      case 'CAMBIO_DIVISA': {
        const saldo = await buscarSaldo(v.cajaMayorOrigenId, v.monedaOrigenId, v.formaPagoOrigenId);
        const m = moneda(v.monedaOrigenId);
        const fpO = fp(v.formaPagoOrigenId);
        checks.push({
          label: `Caja Mayor (${m?.simbolo} - ${fpO?.nombre})`,
          saldoActual: saldo,
          monto: Number(v.montoOrigen),
          monedaSimbolo: m?.simbolo || '',
        });
        break;
      }
      case 'DEPOSITO_BANCARIO': {
        const saldo = await buscarSaldo(v.cajaMayorOrigenId, v.monedaOrigenId, v.formaPagoOrigenId);
        const m = moneda(v.monedaOrigenId);
        const fpO = fp(v.formaPagoOrigenId);
        checks.push({
          label: `Caja Mayor (${m?.simbolo} - ${fpO?.nombre})`,
          saldoActual: saldo,
          monto: Number(v.montoOrigen),
          monedaSimbolo: m?.simbolo || '',
        });
        break;
      }
      case 'RETIRO_BANCARIO': {
        const cb = this.cuentasBancarias.find(c => c.id === v.cuentaBancariaOrigenId);
        if (cb) {
          checks.push({
            label: `Cuenta ${cb.nombre} (${cb.banco})`,
            saldoActual: Number(cb.saldo || 0),
            monto: Number(v.montoOrigen),
            monedaSimbolo: cb.moneda?.simbolo || '',
          });
        }
        break;
      }
      case 'TRANSFERENCIA_ENTRE_CAJAS': {
        const saldo = await buscarSaldo(v.cajaMayorOrigenId, v.monedaOrigenId, v.formaPagoOrigenId);
        const m = moneda(v.monedaOrigenId);
        const fpO = fp(v.formaPagoOrigenId);
        checks.push({
          label: `Caja Mayor #${v.cajaMayorOrigenId} (${m?.simbolo} - ${fpO?.nombre})`,
          saldoActual: saldo,
          monto: Number(v.montoOrigen),
          monedaSimbolo: m?.simbolo || '',
        });
        break;
      }
      case 'TRANSFERENCIA_BANCARIA': {
        const cb = this.cuentasBancarias.find(c => c.id === v.cuentaBancariaOrigenId);
        if (cb) {
          checks.push({
            label: `Cuenta ${cb.nombre} (${cb.banco})`,
            saldoActual: Number(cb.saldo || 0),
            monto: Number(v.montoOrigen),
            monedaSimbolo: cb.moneda?.simbolo || '',
          });
        }
        break;
      }
    }

    return checks;
  }

  async save(): Promise<void> {
    const valores = this.form.getRawValue() as Record<string, unknown>;

    // Errores semánticos que ningún `required` detecta.
    const incoherencias = validarCoherencia(this.tipoOperacion as TipoOperacionFinanciera, valores);
    if (incoherencias.length) {
      this.snackBar.open(incoherencias[0], 'Cerrar', { duration: 5000 });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Nombrar lo que falta: varios requeridos (moneda heredada de la cuenta,
      // forma de pago del tramo de caja) no siempre se renderizan, y entonces
      // `markAllAsTouched` no mostraba ningún error en ningún lado.
      const faltantes = camposFaltantes(this.tipoOperacion as TipoOperacionFinanciera, valores).map(etiquetaDe);
      this.snackBar.open(
        faltantes.length ? `Faltan completar: ${faltantes.join(', ')}` : 'Revisá los datos cargados',
        'Cerrar',
        { duration: 5000 },
      );
      return;
    }

    // Verificar saldos negativos
    const checks = await this.getSaldoChecks();
    const ok = await confirmarSaldosNegativos(this.dialog, checks);
    if (!ok) return;

    this.saving = true;
    try {
      const v = this.form.value;
      const data: any = {
        tipoOperacion: v.tipoOperacion,
        operacionFinancieraCategoriaId: v.operacionFinancieraCategoriaId || null,
        descripcion: v.descripcion,
        fecha: v.fecha,
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
        numeroComprobante: v.numeroComprobante || null,
        comprobanteUrl: v.comprobanteUrl || null,
        diferencia: v.diferencia || 0,
        diferenciaDestinoTipo: v.diferenciaDestinoTipo,
        diferenciaObservacion: v.diferenciaObservacion || null,
        observacion: v.observacion || null,
      };
      await firstValueFrom(this.repositoryService.createOperacionFinanciera(data));
      this.snackBar.open('Operacion financiera registrada', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error creating operacion financiera:', error);
      this.snackBar.open('Error al registrar operacion', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}
