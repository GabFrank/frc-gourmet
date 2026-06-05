import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { convertirMonto, requiereCotizacion, cotizacionMercadoPara } from 'src/app/shared/utils/conversion-moneda';

@Component({
  selector: 'app-create-edit-vale-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ modoConfirmar ? 'Registrar egreso por vale' : 'Crear vale / adelanto' }}</h2>
    <mat-dialog-content class="dialog-content">
      <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
      <form [formGroup]="form" *ngIf="!loading" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Funcionario</mat-label>
          <mat-select formControlName="funcionarioId">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">
              {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="motivoId">
            <mat-option [value]="null">-- Sin motivo --</mat-option>
            <mat-option *ngFor="let m of motivos" [value]="m.id">{{ m.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Monto</mat-label>
          <input matInput type="number" formControlName="monto" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fecha" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Moneda</mat-label>
          <mat-select formControlName="monedaId">
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-button-toggle-group *ngIf="modoConfirmar" formControlName="fuente" class="full fuente-toggle">
          <mat-button-toggle value="CAJA_MAYOR">Caja Mayor (efectivo)</mat-button-toggle>
          <mat-button-toggle value="CUENTA_BANCARIA">Cuenta Bancaria</mat-button-toggle>
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" *ngIf="!modoConfirmar || form.get('fuente')?.value === 'CAJA_MAYOR'">
          <mat-label>{{ modoConfirmar ? 'Caja Mayor' : 'Caja Mayor (opcional)' }}</mat-label>
          <mat-select formControlName="cajaMayorId">
            <mat-option *ngIf="!modoConfirmar" [value]="null">-- Definir luego --</mat-option>
            <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" *ngIf="!modoConfirmar || form.get('fuente')?.value === 'CAJA_MAYOR'">
          <mat-label>{{ modoConfirmar ? 'Forma de pago' : 'Forma de pago (opcional)' }}</mat-label>
          <mat-select formControlName="formaPagoId">
            <mat-option *ngIf="!modoConfirmar" [value]="null">-- Definir luego --</mat-option>
            <mat-option *ngFor="let f of (modoConfirmar ? formasPagoEfectivo : formasPago)" [value]="f.id">{{ f.descripcion || f.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" *ngIf="modoConfirmar && form.get('fuente')?.value === 'CUENTA_BANCARIA'">
          <mat-label>Cuenta Bancaria</mat-label>
          <mat-select formControlName="cuentaBancariaId">
            <mat-option *ngFor="let cb of cuentasBancarias" [value]="cb.id">{{ cb.nombre }} <span *ngIf="cb.banco">- {{ cb.banco }}</span><span *ngIf="cb.moneda"> ({{ cb.moneda.simbolo }})</span></mat-option>
          </mat-select>
        </mat-form-field>

        <ng-container *ngIf="requiereCotiz">
          <mat-form-field appearance="outline">
            <mat-label>Cotización</mat-label>
            <input matInput type="number" formControlName="cotizacion" step="any">
            <mat-hint>Moneda principal por 1 {{ monedaCuentaSimbolo }}</mat-hint>
          </mat-form-field>
          <div class="full convertido">Se debitará: <b>{{ montoConvertido | number:'1.0-2' }} {{ monedaCuentaSimbolo }}</b></div>
        </ng-container>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripcion</mat-label>
          <input matInput formControlName="descripcion" />
        </mat-form-field>

        <mat-slide-toggle formControlName="esAdelanto">
          Es adelanto de salario (se descuenta automatico en proxima liquidacion)
        </mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        {{ modoConfirmar ? 'Registrar egreso (CONFIRMADO)' : 'Crear (estado SOLICITADO)' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-content { min-width: 720px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
    .full { grid-column: 1 / -1; }
    .fuente-toggle .mat-button-toggle { flex: 1; }
    .convertido { color: #1565c0; font-size: 14px; align-self: center; }
  `],
})
export class CreateEditValeDialogComponent implements OnInit {
  loading = false;
  saving = false;
  form!: FormGroup;
  funcionarios: any[] = [];
  motivos: any[] = [];
  monedas: any[] = [];
  cajasMayor: any[] = [];
  formasPago: any[] = [];
  formasPagoEfectivo: any[] = [];
  cuentasBancarias: any[] = [];
  modoConfirmar = false;

  requiereCotiz = false;
  montoConvertido = 0;
  monedaCuentaSimbolo = '';
  private cotizMercado: any = null;

  constructor(
    private dialogRef: MatDialogRef<CreateEditValeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.modoConfirmar = !!data?.modoConfirmar;
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      motivoId: [null],
      monto: [0, [Validators.required, Validators.min(1)]],
      fecha: [new Date(), Validators.required],
      monedaId: [null, Validators.required],
      fuente: ['CAJA_MAYOR'],
      cajaMayorId: [null, this.modoConfirmar ? Validators.required : null],
      formaPagoId: [null, this.modoConfirmar ? Validators.required : null],
      cuentaBancariaId: [null],
      cotizacion: [null],
      descripcion: [''],
      esAdelanto: [true],
    });
    if (this.modoConfirmar) {
      this.form.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresFuente());
      this.form.get('cuentaBancariaId')!.valueChanges.subscribe(() => this.recalcularCotizacion());
      this.form.get('monedaId')!.valueChanges.subscribe(() => this.recalcularCotizacion());
      this.form.get('cotizacion')!.valueChanges.subscribe(() => this.recalcularConvertido());
      this.form.get('monto')!.valueChanges.subscribe(() => this.recalcularConvertido());
    }
  }

  private recalcularCotizacion(): void {
    const monedaVale = this.monedas.find((m: any) => m.id === this.form.get('monedaId')!.value);
    const cuenta = this.cuentasBancarias.find((c: any) => c.id === this.form.get('cuentaBancariaId')!.value);
    const cuentaMoneda = cuenta?.moneda;
    this.requiereCotiz = this.form.get('fuente')!.value === 'CUENTA_BANCARIA'
      && requiereCotizacion(monedaVale, cuentaMoneda);
    this.monedaCuentaSimbolo = cuentaMoneda?.simbolo || '';
    const cotizCtrl = this.form.get('cotizacion')!;
    if (this.requiereCotiz) {
      cotizCtrl.setValidators([Validators.required, Validators.min(0.000001)]);
      if (!cotizCtrl.value) {
        const divisa = monedaVale?.principal ? cuentaMoneda : monedaVale;
        const tasa = cotizacionMercadoPara(this.cotizMercado, divisa?.denominacion, 'VENTA');
        if (tasa) cotizCtrl.setValue(tasa, { emitEvent: false });
      }
    } else {
      cotizCtrl.clearValidators();
      cotizCtrl.setValue(null, { emitEvent: false });
    }
    cotizCtrl.updateValueAndValidity({ emitEvent: false });
    this.recalcularConvertido();
  }

  private recalcularConvertido(): void {
    if (!this.requiereCotiz) { this.montoConvertido = 0; return; }
    const monedaVale = this.monedas.find((m: any) => m.id === this.form.get('monedaId')!.value);
    const cuenta = this.cuentasBancarias.find((c: any) => c.id === this.form.get('cuentaBancariaId')!.value);
    this.montoConvertido = convertirMonto(
      Number(this.form.get('monto')!.value),
      monedaVale,
      cuenta?.moneda,
      Number(this.form.get('cotizacion')!.value),
    );
  }

  /** Solo aplica al confirmar el egreso: CAJA_MAYOR usa caja+efectivo,
   * CUENTA_BANCARIA usa la cuenta. */
  private aplicarValidadoresFuente(): void {
    const esBanco = this.form.get('fuente')!.value === 'CUENTA_BANCARIA';
    const caja = this.form.get('cajaMayorId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;
    if (esBanco) {
      caja.clearValidators();
      fp.clearValidators();
      cb.setValidators([Validators.required]);
    } else {
      caja.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
      this.preseleccionarEfectivo();
    }
    caja.updateValueAndValidity({ emitEvent: false });
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
    this.recalcularCotizacion();
  }

  private preseleccionarEfectivo(): void {
    if (this.formasPagoEfectivo.length === 1) {
      this.form.get('formaPagoId')!.setValue(this.formasPagoEfectivo[0].id, { emitEvent: false });
    }
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [funcs, motivos, monedas, cajasMayor, formasPago, cuentas] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        firstValueFrom(this.repositoryService.getMotivosVale()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.funcionarios = funcs || [];
      this.motivos = (motivos || []).filter((m: any) => m.activo);
      this.monedas = monedas || [];
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA' || c.estado === 'ACTIVA');
      this.formasPago = formasPago || [];
      this.formasPagoEfectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      if (this.modoConfirmar) {
        this.preseleccionarEfectivo();
        if (this.data?.cajaMayorId) this.form.patchValue({ cajaMayorId: this.data.cajaMayorId });
        this.repositoryService.getCotizacionMercado().subscribe({
          next: (r) => { this.cotizMercado = r; },
          error: () => { this.cotizMercado = null; },
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const value = this.form.value;

    if (this.modoConfirmar && value.fuente !== 'CUENTA_BANCARIA') {
      const ok = await this.confirmarSaldoSiNegativo(value.cajaMayorId, value.monedaId, value.formaPagoId, Number(value.monto));
      if (!ok) return;
    }

    this.saving = true;
    try {
      if (this.modoConfirmar) {
        await firstValueFrom(this.repositoryService.crearValeConfirmado({
          ...value,
          montoCuentaBancaria: this.requiereCotiz ? this.montoConvertido : null,
        }));
        this.snackBar.open('Vale registrado y egreso aplicado en Caja Mayor', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createVale(value));
        this.snackBar.open('Vale creado en estado SOLICITADO', 'Cerrar', { duration: 3000 });
      }
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al registrar vale', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }

  private async confirmarSaldoSiNegativo(cajaMayorId: number, monedaId: number, formaPagoId: number, monto: number): Promise<boolean> {
    try {
      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(cajaMayorId));
      const s = (saldos || []).find(x => x.moneda?.id === monedaId && x.formaPago?.id === formaPagoId);
      const saldoActual = s ? Number(s.saldo) : 0;
      const moneda = this.monedas.find(m => m.id === monedaId);
      const fp = this.formasPago.find(p => p.id === formaPagoId);
      return confirmarSaldosNegativos(this.dialog, [{
        label: `${moneda?.denominacion || ''} / ${fp?.nombre || fp?.descripcion || ''}`,
        saldoActual,
        monto,
        monedaSimbolo: moneda?.simbolo || '',
      }]);
    } catch (e) {
      console.error('Error verificando saldo:', e);
      return true;
    }
  }
}
