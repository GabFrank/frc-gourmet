import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';

interface DetalleRow {
  monedaId: number;
  monedaSimbolo: string;
  monedaDenominacion: string;
  formaPagoId: number;
  formaPagoNombre: string;
  monto: number;
}

@Component({
  selector: 'app-create-retiro-caja-dialog',
  templateUrl: './create-retiro-caja-dialog.component.html',
  styleUrls: ['./create-retiro-caja-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    CurrencyInputDirective,
  ]
})
export class CreateRetiroCajaDialogComponent implements OnInit {
  form!: FormGroup;
  detalleForm!: FormGroup;
  saving = false;
  loading = true;
  decimalesMoneda = 0;

  cajaId: number = 0;
  cajaNombre: string = '';

  monedas: any[] = [];
  formasPagoEfectivo: any[] = [];
  cajasMayor: any[] = [];

  detalles: DetalleRow[] = [];
  detallesColumns = ['moneda', 'formaPago', 'monto', 'actions'];
  totalesPorMoneda: { simbolo: string; total: number }[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateRetiroCajaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';

    this.form = this.fb.group({
      cajaMayorId: [null],
      observacion: [''],
    });

    this.detalleForm = this.fb.group({
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
    });

    this.detalleForm.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());

    this.loadData();
  }

  private recalcDecimalesMoneda(): void {
    const id = this.detalleForm?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [monedas, formasPago, cajasMayor] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
      ]);
      this.monedas = monedas || [];
      this.formasPagoEfectivo = (formasPago || []).filter((fp: any) => fp.movimentaCaja === true);
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA');
      this.preseleccionarDetalle();
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  agregarDetalle(): void {
    if (this.detalleForm.invalid) return;

    const val = this.detalleForm.value;
    const moneda = this.monedas.find(m => m.id === val.monedaId);
    const fp = this.formasPagoEfectivo.find(f => f.id === val.formaPagoId);

    this.detalles = [...this.detalles, {
      monedaId: val.monedaId,
      monedaSimbolo: moneda?.simbolo || '',
      monedaDenominacion: moneda?.denominacion || '',
      formaPagoId: val.formaPagoId,
      formaPagoNombre: fp?.nombre || '',
      monto: val.monto,
    }];

    this.recalcularTotales();
    this.detalleForm.reset();
    this.preseleccionarDetalle();
  }

  /** Pre-selecciona moneda principal/única y forma de pago única en la línea de detalle. */
  private preseleccionarDetalle(): void {
    if (!this.detalleForm.get('monedaId')?.value) {
      const m = preselectSingleOrPrincipal(this.monedas);
      if (m) this.detalleForm.get('monedaId')?.setValue(m.id, { emitEvent: false });
    }
    if (!this.detalleForm.get('formaPagoId')?.value) {
      const fp = preselectSingleOrPrincipal(this.formasPagoEfectivo);
      if (fp) this.detalleForm.get('formaPagoId')?.setValue(fp.id, { emitEvent: false });
    }
    this.recalcDecimalesMoneda();
  }

  eliminarDetalle(index: number): void {
    this.detalles = this.detalles.filter((_, i) => i !== index);
    this.recalcularTotales();
  }

  private recalcularTotales(): void {
    const map = new Map<number, { simbolo: string; total: number }>();
    for (const d of this.detalles) {
      const existing = map.get(d.monedaId);
      if (existing) {
        existing.total += Number(d.monto);
      } else {
        map.set(d.monedaId, { simbolo: d.monedaSimbolo, total: Number(d.monto) });
      }
    }
    this.totalesPorMoneda = Array.from(map.values());
  }

  async onSubmit(): Promise<void> {
    if (this.detalles.length === 0) {
      this.snackBar.open('Agregue al menos un detalle', 'Cerrar', { duration: 3000 });
      return;
    }
    if (!this.cajaId) {
      this.snackBar.open('Caja de origen no especificada', 'Cerrar', { duration: 3000 });
      return;
    }

    this.saving = true;
    try {
      const f = this.form.value;
      const data: any = {
        caja: { id: this.cajaId },
        observacion: f.observacion?.toUpperCase() || null,
        detalles: this.detalles.map(d => ({
          moneda: { id: d.monedaId },
          formaPago: { id: d.formaPagoId },
          monto: d.monto,
        })),
      };
      if (f.cajaMayorId) {
        data.cajaMayor = { id: f.cajaMayorId };
      }

      await firstValueFrom(this.repositoryService.createRetiroCaja(data));
      const msg = f.cajaMayorId
        ? 'Retiro registrado e ingresado a caja mayor'
        : 'Retiro registrado como FLOTANTE';
      this.snackBar.open(msg, 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error creando retiro:', error);
      this.snackBar.open('Error al registrar retiro', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.dialogRef?.close(false);
  }
}
