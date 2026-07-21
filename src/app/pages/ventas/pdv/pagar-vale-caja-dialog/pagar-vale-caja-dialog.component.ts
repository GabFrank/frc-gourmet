import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

/**
 * Crea+paga o paga un vale de funcionario existente con el efectivo de la caja
 * de venta (PdV). Descuenta del cajón y aparece en el resumen de cierre.
 */
@Component({
  selector: 'app-pagar-vale-caja-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatDatepickerModule,
    MatNativeDateModule, MatProgressSpinnerModule, MatSnackBarModule, CurrencyInputDirective,
  ],
  templateUrl: './pagar-vale-caja-dialog.component.html',
  styleUrls: ['./pagar-vale-caja-dialog.component.scss'],
})
export class PagarValeCajaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  loading = true;

  cajaId = 0;
  cajaNombre = '';

  funcionarios: any[] = [];
  motivos: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  valesPendientes: any[] = [];
  cargandoVales = false;

  decimalesMoneda = 0;
  efectivoPorMoneda: { [monedaId: number]: number } = {};
  resumenCargado = false;

  // Precomputados (evita getters con lógica en el template — regla del repo).
  esPagar = false;
  saldoInsuficiente = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<PagarValeCajaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';

    this.form = this.fb.group({
      modo: ['CREAR', Validators.required],
      funcionarioId: [null, Validators.required],
      valeId: [null],
      motivoId: [null],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      descripcion: [''],
      fecha: [new Date(), Validators.required],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
    });

    this.esPagar = this.form.get('modo')!.value === 'PAGAR';
    this.form.get('modo')!.valueChanges.subscribe(() => this.onModoChange());
    this.form.get('monedaId')!.valueChanges.subscribe(() => { this.recalcDecimales(); this.recalcSaldo(); });
    this.form.get('monto')!.valueChanges.subscribe(() => this.recalcSaldo());
    this.form.get('funcionarioId')!.valueChanges.subscribe(() => {
      if (this.esPagar) {
        // Reset del vale al cambiar de funcionario: evita pagar el vale de otro.
        this.form.get('valeId')!.reset(null, { emitEvent: false });
        this.cargarValesPendientes();
      }
    });
    this.form.get('valeId')!.valueChanges.subscribe((id) => this.onValeSelected(id));

    this.loadLookups();
  }

  private onModoChange(): void {
    this.esPagar = this.form.get('modo')!.value === 'PAGAR';
    const valeCtrl = this.form.get('valeId')!;
    const montoCtrl = this.form.get('monto')!;
    const motivoCtrl = this.form.get('motivoId')!;
    const monedaCtrl = this.form.get('monedaId')!;
    this.valesPendientes = [];
    valeCtrl.reset(null, { emitEvent: false });
    if (this.esPagar) {
      valeCtrl.setValidators([Validators.required]);
      montoCtrl.disable({ emitEvent: false });
      motivoCtrl.disable({ emitEvent: false });
      // En PAGAR la moneda la fija el vale; se muestra pero no se edita.
      monedaCtrl.disable({ emitEvent: false });
      const fid = this.form.get('funcionarioId')!.value;
      if (fid) this.cargarValesPendientes();
    } else {
      valeCtrl.clearValidators();
      montoCtrl.enable({ emitEvent: false });
      motivoCtrl.enable({ emitEvent: false });
      monedaCtrl.enable({ emitEvent: false });
    }
    valeCtrl.updateValueAndValidity({ emitEvent: false });
    this.recalcSaldo();
  }

  private async cargarValesPendientes(): Promise<void> {
    const fid = this.form.get('funcionarioId')!.value;
    if (!fid) { this.valesPendientes = []; return; }
    this.cargandoVales = true;
    try {
      this.valesPendientes = await firstValueFrom(this.repositoryService.getValesPendientesFuncionario(fid)) || [];
    } catch (e) {
      console.error('Error cargando vales pendientes:', e);
      this.valesPendientes = [];
    } finally {
      this.cargandoVales = false;
    }
  }

  private onValeSelected(valeId: number): void {
    if (!this.esPagar || !valeId) return;
    const vale = this.valesPendientes.find(v => v.id === valeId);
    if (vale) {
      this.form.patchValue({
        monto: Number(vale.monto),
        monedaId: vale.moneda?.id ?? this.form.get('monedaId')!.value,
      }, { emitEvent: true });
    }
  }

  private async loadLookups(): Promise<void> {
    this.loading = true;
    try {
      const [funcionarios, motivos, monedas, formasPago, resumen] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios()),
        firstValueFrom(this.repositoryService.getMotivosVale()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getResumenCaja(this.cajaId)).catch(() => null),
      ]);
      this.funcionarios = ((funcionarios as any[]) || []).filter((f: any) => f.activo !== false);
      this.motivos = (motivos || []).filter((m: any) => m.activo !== false);
      this.monedas = monedas || [];
      // Solo formas de pago que mueven caja (efectivo) — el egreso debe descontar del cajón.
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

  // Precalcula el flag de saldo insuficiente. Solo advierte si el resumen de caja
  // se cargó (evita falso positivo cuando getResumenCaja falla y el diccionario
  // queda vacío → disponible=0 → siempre negativo).
  private recalcSaldo(): void {
    if (!this.resumenCargado) { this.saldoInsuficiente = false; return; }
    const monedaId = this.form?.get('monedaId')?.value;
    const monto = Number(this.form?.get('monto')?.value) || 0;
    if (!monedaId || !monto) { this.saldoInsuficiente = false; return; }
    const disponible = Number(this.efectivoPorMoneda[monedaId] || 0);
    this.saldoInsuficiente = monto > disponible;
  }

  async guardar(): Promise<void> {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving = true;
    try {
      if (this.esPagar) {
        await firstValueFrom(this.repositoryService.pagarValeCaja({
          cajaId: this.cajaId,
          valeId: v.valeId,
          formaPagoId: v.formaPagoId,
        }));
      } else {
        await firstValueFrom(this.repositoryService.crearValeCaja({
          cajaId: this.cajaId,
          funcionarioId: v.funcionarioId,
          motivoId: v.motivoId || null,
          monto: Number(v.monto),
          descripcion: v.descripcion || null,
          fecha: v.fecha,
          monedaId: v.monedaId,
          formaPagoId: v.formaPagoId,
          esAdelanto: false,
        }));
      }
      this.snackBar.open('Vale registrado', 'Cerrar', { duration: 2500 });
      this.dialogRef?.close({ success: true });
    } catch (e: any) {
      console.error('Error registrando vale:', e);
      const msg = e?.message?.includes('Error invoking remote method')
        ? 'Error al registrar el vale' : (e?.message || 'Error al registrar el vale');
      this.snackBar.open(msg, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef?.close();
  }
}
