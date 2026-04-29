import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { confirmarSaldosNegativos, SaldoNegativoCheck } from 'src/app/shared/utils/saldo-negativo-confirm';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface DetalleRow {
  monedaId: number;
  monedaSimbolo: string;
  monedaDenominacion: string;
  formaPagoId: number;
  formaPagoNombre: string;
  monto: number;
}

@Component({
  selector: 'app-create-edit-gasto-dialog',
  templateUrl: './create-edit-gasto-dialog.component.html',
  styleUrls: ['./create-edit-gasto-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatTableModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatDividerModule,
  ]
})
export class CreateEditGastoDialogComponent implements OnInit {
  form!: FormGroup;
  detalleForm!: FormGroup;
  categoriaFilter = new FormControl('');
  proveedorFilter = new FormControl('');
  saving = false;

  gastoCategorias: any[] = [];
  categoriasFiltradas: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cajasMayor: any[] = [];
  proveedores: any[] = [];
  proveedoresFiltrados: any[] = [];
  tipoBoletaOptions = ['LEGAL', 'COMUN', 'OTRO', 'SIN_COMPROBANTE'];
  frecuenciaOptions = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];

  esRecurrente = false;
  cajaMayorFijo = false;
  isEditing = false;
  gastoId: number | null = null;

  // Tabla de detalles de pago
  detalles: DetalleRow[] = [];
  detallesColumns = ['moneda', 'formaPago', 'monto', 'actions'];
  totalesPorMoneda: { simbolo: string; denominacion: string; total: number }[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<CreateEditGastoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaMayorFijo = !!this.data?.cajaMayorId;
    this.gastoId = this.data?.gastoId || null;
    this.isEditing = !!this.gastoId;

    this.form = this.fb.group({
      gastoCategoriaId: [null, Validators.required],
      descripcion: ['', Validators.required],
      cajaMayorId: [this.data?.cajaMayorId || null, Validators.required],
      fecha: [new Date(), Validators.required],
      proveedorId: [null],
      numeroComprobante: [''],
      tipoBoleta: [null],
      esRecurrente: [false],
      frecuencia: [null],
      proximoVencimiento: [null],
    });

    this.detalleForm = this.fb.group({
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
    });

    this.categoriaFilter.valueChanges.subscribe(val => {
      this.filtrarCategorias(val || '');
    });

    this.proveedorFilter.valueChanges.subscribe(val => {
      this.filtrarProveedores(val || '');
    });

    this.loadLookups();
  }

  async loadLookups(): Promise<void> {
    try {
      const [categorias, monedas, formasPago, cajasMayor, proveedores] = await Promise.all([
        firstValueFrom(this.repositoryService.getGastoCategorias()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getProveedores()),
      ]);

      this.gastoCategorias = (categorias || []).filter((c: any) => c.activo !== false);
      this.categoriasFiltradas = [];
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA');
      this.proveedores = proveedores || [];
      this.proveedoresFiltrados = [];

      // Si estamos editando, cargar el gasto
      if (this.isEditing && this.gastoId) {
        await this.loadGasto(this.gastoId);
      }
    } catch (error) {
      console.error('Error loading lookups:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
    }
  }

  private async loadGasto(gastoId: number): Promise<void> {
    try {
      const gasto = await firstValueFrom(this.repositoryService.getGasto(gastoId));
      if (!gasto) return;

      this.form.patchValue({
        gastoCategoriaId: gasto.gastoCategoria?.id,
        descripcion: gasto.descripcion,
        cajaMayorId: gasto.cajaMayor?.id,
        fecha: gasto.fecha ? new Date(gasto.fecha) : new Date(),
        proveedorId: gasto.proveedor?.id || null,
        numeroComprobante: gasto.numeroComprobante || '',
        tipoBoleta: gasto.tipoBoleta || null,
        esRecurrente: gasto.esRecurrente || false,
        frecuencia: gasto.frecuencia || null,
        proximoVencimiento: gasto.proximoVencimiento ? new Date(gasto.proximoVencimiento) : null,
      });

      this.esRecurrente = gasto.esRecurrente || false;

      // Cargar categoría en el autocomplete
      const cat = this.gastoCategorias.find(c => c.id === gasto.gastoCategoria?.id);
      if (cat) {
        this.categoriaFilter.setValue(cat, { emitEvent: false });
      }

      // Cargar proveedor en el autocomplete
      const prov = this.proveedores.find(p => p.id === gasto.proveedor?.id);
      if (prov) {
        this.proveedorFilter.setValue(prov, { emitEvent: false });
      }

      // Cargar detalles
      if (gasto.detalles && gasto.detalles.length > 0) {
        this.detalles = gasto.detalles.map((d: any) => {
          const moneda = this.monedas.find(m => m.id === d.moneda?.id);
          const fp = this.formasPago.find(f => f.id === d.formaPago?.id);
          return {
            monedaId: d.moneda?.id,
            monedaSimbolo: moneda?.simbolo || d.moneda?.simbolo || '',
            monedaDenominacion: moneda?.denominacion || d.moneda?.denominacion || '',
            formaPagoId: d.formaPago?.id,
            formaPagoNombre: fp?.nombre || d.formaPago?.nombre || '',
            monto: Number(d.monto),
          };
        });
        this.recalcularTotales();
      }
    } catch (error) {
      console.error('Error loading gasto:', error);
    }
  }

  filtrarCategorias(val: any): void {
    if (val == null || val === '') {
      this.categoriasFiltradas = [];
      return;
    }
    if (typeof val !== 'string') {
      this.categoriasFiltradas = [];
      return;
    }
    const filtro = val.toUpperCase();
    this.categoriasFiltradas = this.gastoCategorias.filter(c =>
      (c.nombre || '').toUpperCase().includes(filtro) ||
      (c.padre?.nombre || '').toUpperCase().includes(filtro)
    );
  }

  displayCategoria = (cat: any): string => {
    if (!cat) return '';
    if (typeof cat === 'string') return cat;
    return cat.padre ? `${cat.padre.nombre} > ${cat.nombre}` : (cat.nombre || '');
  };

  onCategoriaSelected(cat: any): void {
    this.form.patchValue({ gastoCategoriaId: cat?.id || null });
  }

  filtrarProveedores(val: any): void {
    if (val == null || val === '') {
      this.proveedoresFiltrados = [];
      return;
    }
    if (typeof val !== 'string') {
      this.proveedoresFiltrados = [];
      return;
    }
    const filtro = val.toUpperCase();
    this.proveedoresFiltrados = this.proveedores.filter(p =>
      (p.nombre || '').toUpperCase().includes(filtro)
    );
  }

  displayProveedor = (prov: any): string => {
    if (!prov) return '';
    if (typeof prov === 'string') return prov;
    return prov.nombre || '';
  };

  onProveedorSelected(prov: any): void {
    this.form.patchValue({ proveedorId: prov?.id || null });
  }

  limpiarProveedor(): void {
    this.form.patchValue({ proveedorId: null });
    this.proveedorFilter.setValue(null as any, { emitEvent: false });
  }

  onRecurrenteChange(): void {
    this.esRecurrente = this.form.get('esRecurrente')?.value || false;
    if (!this.esRecurrente) {
      this.form.patchValue({ frecuencia: null, proximoVencimiento: null });
    }
  }

  // --- Detalles de pago ---

  agregarDetalle(): void {
    if (this.detalleForm.invalid) return;

    const val = this.detalleForm.value;
    const moneda = this.monedas.find(m => m.id === val.monedaId);
    const fp = this.formasPago.find(f => f.id === val.formaPagoId);

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
  }

  eliminarDetalle(index: number): void {
    this.detalles = this.detalles.filter((_, i) => i !== index);
    this.recalcularTotales();
  }

  private recalcularTotales(): void {
    const map = new Map<number, { simbolo: string; denominacion: string; total: number }>();
    for (const d of this.detalles) {
      const existing = map.get(d.monedaId);
      if (existing) {
        existing.total += Number(d.monto);
      } else {
        map.set(d.monedaId, { simbolo: d.monedaSimbolo, denominacion: d.monedaDenominacion, total: Number(d.monto) });
      }
    }
    this.totalesPorMoneda = Array.from(map.values());
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.detalles.length === 0) return;

    // Saldos negativos: validar tanto en create como en edit (en edit ya
    // factorizamos la reversion de los detalles previos del mismo gasto).
    const cajaMayorId = this.form.value.cajaMayorId;
    if (cajaMayorId) {
      const ok = await this.confirmarSaldoSiNegativo(cajaMayorId);
      if (!ok) return;
    }

    this.saving = true;
    try {
      const f = this.form.value;
      const gastoData = {
        gastoCategoria: { id: f.gastoCategoriaId },
        descripcion: f.descripcion?.toUpperCase(),
        cajaMayor: { id: f.cajaMayorId },
        fecha: f.fecha,
        proveedor: f.proveedorId ? { id: f.proveedorId } : null,
        numeroComprobante: f.numeroComprobante?.toUpperCase() || null,
        tipoBoleta: f.tipoBoleta || null,
        esRecurrente: f.esRecurrente || false,
        frecuencia: f.esRecurrente ? f.frecuencia : null,
        proximoVencimiento: f.esRecurrente ? f.proximoVencimiento : null,
        detalles: this.detalles.map(d => ({
          monedaId: d.monedaId,
          formaPagoId: d.formaPagoId,
          monto: d.monto,
        })),
      };

      if (this.isEditing && this.gastoId) {
        await firstValueFrom(this.repositoryService.editGasto(this.gastoId, gastoData));
        this.snackBar.open('Gasto actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createGasto(gastoData));
        this.snackBar.open('Gasto registrado correctamente', 'Cerrar', { duration: 3000 });
      }
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error saving gasto:', error);
      this.snackBar.open('Error al guardar gasto', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.dialogRef?.close(false);
  }

  // Verifica saldos previo a guardar el gasto. Para edit, descuenta los detalles
  // previos del mismo gasto (que serán reverteados por el handler) antes de
  // aplicar los detalles nuevos.
  private async confirmarSaldoSiNegativo(cajaMayorId: number): Promise<boolean> {
    try {
      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(cajaMayorId));

      // Net delta por (monedaId, formaPagoId): newMonto - oldMonto
      const deltas = new Map<string, number>();
      for (const d of this.detalles) {
        const key = `${d.monedaId}-${d.formaPagoId}`;
        deltas.set(key, (deltas.get(key) || 0) + Number(d.monto));
      }

      // En edit, restar los detalles previos (el handler los reverte)
      if (this.isEditing && this.gastoId) {
        const gasto: any = await firstValueFrom(this.repositoryService.getGasto(this.gastoId));
        for (const d of (gasto?.detalles || [])) {
          const monedaId = d.moneda?.id;
          const formaPagoId = d.formaPago?.id;
          if (!monedaId || !formaPagoId) continue;
          const key = `${monedaId}-${formaPagoId}`;
          deltas.set(key, (deltas.get(key) || 0) - Number(d.monto));
        }
      }

      const checks: SaldoNegativoCheck[] = [];
      for (const [key, monto] of deltas.entries()) {
        if (Math.abs(monto) < 0.005) continue;
        const [monedaIdStr, formaPagoIdStr] = key.split('-');
        const monedaId = Number(monedaIdStr);
        const formaPagoId = Number(formaPagoIdStr);
        const s = (saldos || []).find(x => x.moneda?.id === monedaId && x.formaPago?.id === formaPagoId);
        const saldoActual = s ? Number(s.saldo) : 0;
        const moneda = this.monedas.find(m => m.id === monedaId);
        const fp = this.formasPago.find(p => p.id === formaPagoId);
        checks.push({
          label: `${moneda?.denominacion || ''} / ${fp?.nombre || ''}`,
          saldoActual,
          monto,
          monedaSimbolo: moneda?.simbolo || '',
        });
      }

      return confirmarSaldosNegativos(this.dialog, checks);
    } catch (e) {
      console.error('Error verificando saldos:', e);
      return true; // fail-open
    }
  }
}
