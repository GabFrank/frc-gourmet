import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';

@Component({
  selector: 'app-crear-compra-simplificada-dialog',
  templateUrl: './crear-compra-simplificada-dialog.component.html',
  styleUrls: ['./crear-compra-simplificada-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    CurrencyInputDirective,
  ],
})
export class CrearCompraSimplificadaDialogComponent implements OnInit {
  form!: FormGroup;
  loading = true;
  saving = false;

  proveedores: any[] = [];
  monedas: any[] = [];
  categorias: any[] = [];
  cajasMayor: any[] = [];
  formasPago: any[] = [];
  formasPagoEfectivo: any[] = [];
  cuentasBancarias: any[] = [];

  cajaMayorId = 0;
  decimalesMoneda = 0;

  tiposBoleta = [
    { value: 'LEGAL', label: 'LEGAL' },
    { value: 'COMUN', label: 'COMÚN' },
    { value: 'OTRO', label: 'OTRO' },
    { value: 'SIN_COMPROBANTE', label: 'SIN COMPROBANTE' },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CrearCompraSimplificadaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaMayorId = this.data?.cajaMayorId || 0;
    this.form = this.fb.group({
      proveedorId: [null, Validators.required],
      monedaId: [null, Validators.required],
      compraCategoriaId: [null],
      fechaCompra: [new Date(), Validators.required],
      numeroNota: [''],
      tipoBoleta: [null],
      total: [null, [Validators.required, Validators.min(0.01)]],
      // Pago
      credito: [false],
      cantidadCuotas: [1, [Validators.min(1)]],
      fechaCreditoInicio: [new Date()],
      pagarAhora: [true],
      fuente: ['CAJA_MAYOR'],
      cajaMayorId: [this.cajaMayorId || null],
      formaPagoId: [null],
      cuentaBancariaId: [null],
    });

    this.form.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
    this.form.get('credito')!.valueChanges.subscribe(() => this.aplicarValidadoresPago());
    this.form.get('pagarAhora')!.valueChanges.subscribe(() => this.aplicarValidadoresPago());
    this.form.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresPago());

    this.loadData();
  }

  get esCredito(): boolean {
    return !!this.form?.get('credito')?.value;
  }

  get pagaAhora(): boolean {
    return !this.esCredito && !!this.form?.get('pagarAhora')?.value;
  }

  get esBanco(): boolean {
    return this.form?.get('fuente')?.value === 'CUENTA_BANCARIA';
  }

  /** Ajusta validadores según crédito / pagar ahora / fuente. */
  private aplicarValidadoresPago(): void {
    const cuotas = this.form.get('cantidadCuotas')!;
    const fechaCred = this.form.get('fechaCreditoInicio')!;
    const caja = this.form.get('cajaMayorId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;

    // Reset
    [cuotas, fechaCred, caja, fp, cb].forEach(c => c.clearValidators());

    if (this.esCredito) {
      cuotas.setValidators([Validators.required, Validators.min(1)]);
      fechaCred.setValidators([Validators.required]);
    } else if (this.pagaAhora) {
      if (this.esBanco) {
        cb.setValidators([Validators.required]);
      } else {
        caja.setValidators([Validators.required]);
        fp.setValidators([Validators.required]);
        this.preseleccionarEfectivo();
      }
    }

    [cuotas, fechaCred, caja, fp, cb].forEach(c => c.updateValueAndValidity({ emitEvent: false }));
  }

  private preseleccionar(): void {
    const monedaCtrl = this.form.get('monedaId')!;
    if (!monedaCtrl.value) {
      const m = preselectSingleOrPrincipal(this.monedas);
      if (m) monedaCtrl.setValue(m.id, { emitEvent: true });
    }
    const cajaCtrl = this.form.get('cajaMayorId')!;
    if (!cajaCtrl.value && this.cajasMayor.length === 1) {
      cajaCtrl.setValue(this.cajasMayor[0].id, { emitEvent: false });
    }
    this.preseleccionarEfectivo();
  }

  private preseleccionarEfectivo(): void {
    const fpCtrl = this.form.get('formaPagoId')!;
    if (fpCtrl.value) return;
    const fp = preselectSingleOrPrincipal(this.formasPagoEfectivo);
    if (fp) fpCtrl.setValue(fp.id, { emitEvent: false });
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [proveedores, monedas, categorias, cajas, formasPago, cuentas] = await Promise.all([
        firstValueFrom(this.repositoryService.getProveedores()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getCompraCategorias()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.proveedores = ((proveedores as any[]) || []).filter((p: any) => p.activo !== false);
      this.monedas = monedas || [];
      this.categorias = categorias || [];
      this.cajasMayor = ((cajas as any[]) || []).filter((c: any) => c.estado === 'ABIERTA');
      this.formasPago = formasPago || [];
      this.formasPagoEfectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.preseleccionar();
      this.aplicarValidadoresPago();
    } catch (error) {
      console.error('Error cargando datos:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const f = this.form.value;
    const proveedor = this.proveedores.find(p => p.id === f.proveedorId);

    const payload: any = {
      proveedorId: f.proveedorId,
      proveedorNombre: proveedor?.nombre || '',
      monedaId: f.monedaId,
      total: Number(f.total),
      fechaCompra: f.fechaCompra,
      numeroNota: f.numeroNota || null,
      tipoBoleta: f.tipoBoleta || null,
      compraCategoriaId: f.compraCategoriaId || null,
      credito: !!f.credito,
    };

    if (f.credito) {
      payload.cantidadCuotas = Number(f.cantidadCuotas) || 1;
      payload.fechaCreditoInicio = f.fechaCreditoInicio;
    } else {
      payload.pagarAhora = !!f.pagarAhora;
      if (f.pagarAhora) {
        payload.fuente = f.fuente;
        if (f.fuente === 'CUENTA_BANCARIA') {
          payload.cuentaBancariaId = f.cuentaBancariaId;
        } else {
          payload.cajaMayorId = f.cajaMayorId;
          payload.formaPagoId = f.formaPagoId;
        }
      }
    }

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.crearCompraSimplificada(payload));
      this.snackBar.open('Compra simplificada registrada correctamente', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error: any) {
      console.error('Error registrando compra simplificada:', error);
      this.snackBar.open(error?.message || 'Error al registrar la compra', 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}
