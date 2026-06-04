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
  ];

  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
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

    // Cuando se selecciona una cuenta bancaria, fijar la moneda correspondiente
    this.form.get('cuentaBancariaOrigenId')?.valueChanges.subscribe((id: number) => {
      const cb = this.cuentasBancarias.find(c => c.id === id);
      if (cb?.moneda?.id) {
        this.form.get('monedaOrigenId')?.setValue(cb.moneda.id, { emitEvent: false });
        this.recalcDecimales();
      }
    });
    this.form.get('cuentaBancariaDestinoId')?.valueChanges.subscribe((id: number) => {
      const cb = this.cuentasBancarias.find(c => c.id === id);
      if (cb?.moneda?.id) {
        this.form.get('monedaDestinoId')?.setValue(cb.moneda.id, { emitEvent: false });
        this.recalcDecimales();
      }
    });
    this.form.get('monedaOrigenId')?.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcularMontoDestino(); });
    this.form.get('monedaDestinoId')?.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcularMontoDestino(); });
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
    if (this.tipoOperacion === 'RETIRO_BANCARIO') {
      const cbId = this.form.get('cuentaBancariaOrigenId')?.value;
      const cb = this.cuentasBancarias.find(c => c.id === cbId);
      return cb?.moneda || null;
    }
    return null;
  }

  monedaFijaDestino(): any {
    if (this.tipoOperacion === 'DEPOSITO_BANCARIO') {
      const cbId = this.form.get('cuentaBancariaDestinoId')?.value;
      const cb = this.cuentasBancarias.find(c => c.id === cbId);
      return cb?.moneda || null;
    }
    return null;
  }

  recalcularMontoDestino(): void {
    const monto = Number(this.form.get('montoOrigen')?.value);
    if (this.tipoOperacion === 'CAMBIO_DIVISA') {
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

  applyValidators(tipo: string): void {
    const ctrl = (n: string) => this.form.get(n);

    // Reset todos los validators primero
    [
      'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen', 'cuentaBancariaOrigenId',
      'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cuentaBancariaDestinoId',
      'cotizacion',
    ].forEach(n => {
      ctrl(n)?.clearValidators();
      ctrl(n)?.updateValueAndValidity({ emitEvent: false });
    });

    switch (tipo) {
      case 'CAMBIO_DIVISA':
        ctrl('cajaMayorOrigenId')?.setValidators([Validators.required]);
        ctrl('monedaOrigenId')?.setValidators([Validators.required]);
        ctrl('formaPagoOrigenId')?.setValidators([Validators.required]);
        ctrl('montoOrigen')?.setValidators([Validators.required, Validators.min(0.01)]);
        ctrl('monedaDestinoId')?.setValidators([Validators.required]);
        ctrl('formaPagoDestinoId')?.setValidators([Validators.required]);
        ctrl('montoDestino')?.setValidators([Validators.required, Validators.min(0.01)]);
        ctrl('cotizacion')?.setValidators([Validators.required, Validators.min(0.000001)]);
        break;
      case 'DEPOSITO_BANCARIO':
        ctrl('cajaMayorOrigenId')?.setValidators([Validators.required]);
        ctrl('monedaOrigenId')?.setValidators([Validators.required]);
        ctrl('formaPagoOrigenId')?.setValidators([Validators.required]);
        ctrl('montoOrigen')?.setValidators([Validators.required, Validators.min(0.01)]);
        ctrl('cuentaBancariaDestinoId')?.setValidators([Validators.required]);
        ctrl('montoDestino')?.setValidators([Validators.required, Validators.min(0.01)]);
        break;
      case 'RETIRO_BANCARIO':
        ctrl('cuentaBancariaOrigenId')?.setValidators([Validators.required]);
        ctrl('montoOrigen')?.setValidators([Validators.required, Validators.min(0.01)]);
        ctrl('cajaMayorDestinoId')?.setValidators([Validators.required]);
        ctrl('monedaDestinoId')?.setValidators([Validators.required]);
        ctrl('formaPagoDestinoId')?.setValidators([Validators.required]);
        ctrl('montoDestino')?.setValidators([Validators.required, Validators.min(0.01)]);
        break;
      case 'TRANSFERENCIA_ENTRE_CAJAS':
        ctrl('cajaMayorOrigenId')?.setValidators([Validators.required]);
        ctrl('monedaOrigenId')?.setValidators([Validators.required]);
        ctrl('formaPagoOrigenId')?.setValidators([Validators.required]);
        ctrl('montoOrigen')?.setValidators([Validators.required, Validators.min(0.01)]);
        ctrl('cajaMayorDestinoId')?.setValidators([Validators.required]);
        ctrl('monedaDestinoId')?.setValidators([Validators.required]);
        ctrl('formaPagoDestinoId')?.setValidators([Validators.required]);
        ctrl('montoDestino')?.setValidators([Validators.required, Validators.min(0.01)]);
        break;
    }

    [
      'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen', 'cuentaBancariaOrigenId',
      'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cuentaBancariaDestinoId',
      'cotizacion',
    ].forEach(n => ctrl(n)?.updateValueAndValidity({ emitEvent: false }));
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
    }

    return checks;
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
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
