import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
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
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';

type DestinoTipo = 'CAJA_MAYOR' | 'CUENTA_BANCARIA';

@Component({
  selector: 'app-create-edit-entrada-varia-dialog',
  templateUrl: './create-edit-entrada-varia-dialog.component.html',
  styleUrls: ['./create-edit-entrada-varia-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDividerModule, MatRadioModule,
    CurrencyInputDirective,
  ]
})
export class CreateEditEntradaVariaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  decimalesMoneda = 0;

  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cajasMayor: any[] = [];
  cuentasBancarias: any[] = [];

  cajaMayorFijo = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateEditEntradaVariaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  async ngOnInit(): Promise<void> {
    this.cajaMayorFijo = !!this.data?.cajaMayorId;

    this.form = this.fb.group({
      destinoTipo: [(this.data?.destinoTipo || 'CAJA_MAYOR') as DestinoTipo, Validators.required],
      entradaVariaCategoriaId: [null, Validators.required],
      descripcion: ['', Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      formaPagoId: [null],
      fecha: [new Date(), Validators.required],
      cajaMayorId: [this.data?.cajaMayorId || null],
      cuentaBancariaId: [this.data?.cuentaBancariaId || null],
      numeroComprobante: [''],
      observacion: [''],
    });

    await this.loadOptions();
    this.applyValidators(this.form.get('destinoTipo')?.value);

    this.form.get('destinoTipo')?.valueChanges.subscribe((tipo: DestinoTipo) => {
      this.applyValidators(tipo);
    });

    // Auto-set moneda al elegir cuenta bancaria
    this.form.get('cuentaBancariaId')?.valueChanges.subscribe((id: number) => {
      const cb = this.cuentasBancarias.find(c => c.id === id);
      if (cb?.moneda?.id) {
        this.form.get('monedaId')?.setValue(cb.moneda.id, { emitEvent: false });
        this.recalcDecimalesMoneda();
      }
    });

    this.form.get('monedaId')?.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  applyValidators(tipo: DestinoTipo): void {
    const ctrl = (n: string) => this.form.get(n);
    ctrl('cajaMayorId')?.clearValidators();
    ctrl('cuentaBancariaId')?.clearValidators();
    ctrl('formaPagoId')?.clearValidators();

    if (tipo === 'CAJA_MAYOR') {
      ctrl('cajaMayorId')?.setValidators([Validators.required]);
      ctrl('formaPagoId')?.setValidators([Validators.required]);
    } else {
      ctrl('cuentaBancariaId')?.setValidators([Validators.required]);
    }

    ctrl('cajaMayorId')?.updateValueAndValidity({ emitEvent: false });
    ctrl('cuentaBancariaId')?.updateValueAndValidity({ emitEvent: false });
    ctrl('formaPagoId')?.updateValueAndValidity({ emitEvent: false });
  }

  monedaFija(): any {
    if (this.form.get('destinoTipo')?.value !== 'CUENTA_BANCARIA') return null;
    const cbId = this.form.get('cuentaBancariaId')?.value;
    const cb = this.cuentasBancarias.find(c => c.id === cbId);
    return cb?.moneda || null;
  }

  async loadOptions(): Promise<void> {
    try {
      const [categorias, monedas, formasPago, cajasMayor, cuentasBancarias] = await Promise.all([
        firstValueFrom(this.repositoryService.getEntradaVariaCategorias()),
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
      this.aplicarPreselecciones();
    } catch (error) {
      console.error('Error loading options:', error);
      this.snackBar.open('Error al cargar opciones', 'Cerrar', { duration: 3000 });
    }
  }

  /** Pre-selecciona moneda principal/única, forma de pago efectivo/principal/única y única caja abierta. */
  private aplicarPreselecciones(): void {
    if (!this.form.get('monedaId')?.value) {
      const m = preselectSingleOrPrincipal(this.monedas);
      if (m) this.form.get('monedaId')?.setValue(m.id, { emitEvent: false });
    }
    if (!this.form.get('formaPagoId')?.value) {
      const efectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      const fp = preselectSingleOrPrincipal(efectivo) || preselectSingleOrPrincipal(this.formasPago);
      if (fp) this.form.get('formaPagoId')?.setValue(fp.id, { emitEvent: false });
    }
    if (!this.form.get('cajaMayorId')?.value && this.cajasMayor.length === 1) {
      this.form.get('cajaMayorId')?.setValue(this.cajasMayor[0].id, { emitEvent: false });
    }
    this.recalcDecimalesMoneda();
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    try {
      const v = this.form.value;
      const data: any = {
        destinoTipo: v.destinoTipo,
        entradaVariaCategoria: { id: v.entradaVariaCategoriaId },
        descripcion: v.descripcion,
        monto: v.monto,
        monedaId: v.monedaId,
        formaPagoId: v.formaPagoId,
        fecha: v.fecha,
        numeroComprobante: v.numeroComprobante || null,
        observacion: v.observacion || null,
      };
      if (v.destinoTipo === 'CAJA_MAYOR') {
        data.cajaMayorId = v.cajaMayorId;
      } else {
        data.cuentaBancariaId = v.cuentaBancariaId;
      }

      await firstValueFrom(this.repositoryService.createEntradaVaria(data));
      this.snackBar.open('Entrada varia registrada', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error: any) {
      console.error('Error creating entrada varia:', error);
      this.snackBar.open(error?.message || 'Error al registrar entrada varia', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}
