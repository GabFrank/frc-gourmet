import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

interface PagarComprasDialogData {
  cajaMayorId?: number;
  cuotaIdsPreseleccionadas?: number[];
}

interface CuotaRow {
  id: number;
  cppId: number;
  compraId: number | null;
  compraNumeroNota: string | null;
  compraFechaCompra: string | Date | null;
  compraCredito: boolean;
  numero: number;
  cantidadCuotas: number;
  fechaVencimiento: string | Date;
  monto: number;
  montoPagado: number;
  saldoPendiente: number;
  estado: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  monedaId: number | null;
  monedaSimbolo: string | null;
  monedaDenominacion: string | null;
  selected: boolean;
  montoAPagar: number;
  /** Decimales segun la moneda de la cuota (PYG=0, USD/BRL=2). Para appCurrencyInput. */
  decimales: number;
}

@Component({
  selector: 'app-pagar-compras-dialog',
  standalone: true,
  templateUrl: './pagar-compras-dialog.component.html',
  styleUrls: ['./pagar-compras-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatTableModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    DecimalPipe,
    DatePipe,
    CurrencyInputDirective,
  ],
})
export class PagarComprasDialogComponent implements OnInit {
  readonly displayedColumns = ['select', 'proveedor', 'compra', 'cuota', 'vencimiento', 'saldo', 'monto'];

  loading = true;
  saving = false;

  cuotas: CuotaRow[] = [];
  cuotasFiltradas: CuotaRow[] = [];

  proveedores: { id: number; nombre: string }[] = [];
  filtroProveedorId: number | null = null;

  cajasMayor: any[] = [];
  cuentasBancarias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() private dialogRef: MatDialogRef<PagarComprasDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: PagarComprasDialogData,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      fuente: ['CAJA_MAYOR', Validators.required],
      cajaMayorId: [this.data?.cajaMayorId || null],
      monedaId: [null],
      formaPagoId: [null],
      cuentaBancariaId: [null],
      observacion: [''],
    });
    this.form.get('fuente')!.valueChanges.subscribe(() => this.applyValidators());
    this.applyValidators();

    this.loadAll();
  }

  applyValidators(): void {
    const fuente = this.form.get('fuente')!.value;
    const cm = this.form.get('cajaMayorId')!;
    const mon = this.form.get('monedaId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;

    if (fuente === 'CAJA_MAYOR') {
      cm.setValidators([Validators.required]);
      mon.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    } else {
      cm.clearValidators();
      mon.clearValidators();
      fp.clearValidators();
      cb.setValidators([Validators.required]);
    }
    cm.updateValueAndValidity({ emitEvent: false });
    mon.updateValueAndValidity({ emitEvent: false });
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  async loadAll(): Promise<void> {
    this.loading = true;
    try {
      const [items, cajas, cuentas, monedas, formas] = await Promise.all([
        firstValueFrom(this.repo.getCuotasPendientesCompras({})),
        firstValueFrom(this.repo.getCajasMayor()),
        firstValueFrom(this.repo.getCuentasBancarias()),
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getFormasPago()),
      ]);
      this.cajasMayor = ((cajas as any[]) || []).filter((c: any) => c.estado === 'ABIERTA');
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.monedas = (monedas as any[]) || [];
      this.formasPago = ((formas as any[]) || []).filter((f: any) => f.movimentaCaja);

      const preIds = new Set<number>(this.data?.cuotaIdsPreseleccionadas || []);

      // Mapa moneda(id)→decimales para configurar appCurrencyInput por fila (cada cuota
      // puede estar en una moneda distinta: PYG=0, USD/BRL=2).
      const decimalesPorMonedaId = new Map<number, number>();
      for (const m of this.monedas) {
        const dec = Number(m?.decimales);
        decimalesPorMonedaId.set(m.id, Number.isFinite(dec) ? dec : 0);
      }

      this.cuotas = ((items as any[]) || []).map((it: any): CuotaRow => ({
        ...it,
        selected: preIds.has(Number(it.id)),
        montoAPagar: Number(it.saldoPendiente) || 0,
        decimales: decimalesPorMonedaId.get(Number(it.monedaId)) ?? 0,
      }));

      // Build proveedores list (unique)
      const provMap = new Map<number, string>();
      for (const c of this.cuotas) {
        if (c.proveedorId != null && !provMap.has(c.proveedorId)) {
          provMap.set(c.proveedorId, c.proveedorNombre || '—');
        }
      }
      this.proveedores = Array.from(provMap.entries()).map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      this.aplicarFiltro();
      this.applyDefaultFuente();
    } catch (e: any) {
      console.error('Error cargando cuotas pendientes', e);
      this.snackBar.open('Error al cargar cuotas', 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  // Defaults sensatos: única caja abierta, moneda principal/única, forma pago principal/efectivo/única.
  private applyDefaultFuente(): void {
    if (this.cajasMayor.length === 1 && !this.form.value.cajaMayorId) {
      this.form.patchValue({ cajaMayorId: this.cajasMayor[0].id });
    }
    if (!this.form.value.monedaId) {
      const m = preselectSingleOrPrincipal(this.monedas) || this.monedas[0];
      if (m) this.form.patchValue({ monedaId: m.id });
    }
    if (!this.form.value.formaPagoId) {
      const fp = preselectSingleOrPrincipal(this.formasPago)
        || this.formasPago.find((f: any) => /EFECTIVO/i.test(f.nombre || ''))
        || this.formasPago[0];
      if (fp) this.form.patchValue({ formaPagoId: fp.id });
    }
  }

  aplicarFiltro(): void {
    if (this.filtroProveedorId == null) {
      this.cuotasFiltradas = [...this.cuotas];
    } else {
      this.cuotasFiltradas = this.cuotas.filter(c => c.proveedorId === this.filtroProveedorId);
    }
  }

  marcarTodo(checked: boolean): void {
    for (const c of this.cuotasFiltradas) {
      c.selected = checked;
      if (checked && (!c.montoAPagar || c.montoAPagar <= 0)) {
        c.montoAPagar = c.saldoPendiente;
      }
    }
  }

  toggleSeleccion(row: CuotaRow): void {
    row.selected = !row.selected;
    if (row.selected && (!row.montoAPagar || row.montoAPagar <= 0)) {
      row.montoAPagar = row.saldoPendiente;
    }
  }

  onMontoChange(row: CuotaRow, value: any): void {
    const n = Number(value || 0);
    row.montoAPagar = isNaN(n) ? 0 : n;
    if (row.montoAPagar > 0 && !row.selected) row.selected = true;
  }

  get seleccionadas(): CuotaRow[] {
    return this.cuotas.filter(c => c.selected && Number(c.montoAPagar) > 0);
  }

  get subtotal(): number {
    return +this.seleccionadas
      .reduce((sum, c) => sum + Number(c.montoAPagar || 0), 0)
      .toFixed(2);
  }

  get cantidadSeleccionada(): number {
    return this.seleccionadas.length;
  }

  get todasFiltradasMarcadas(): boolean {
    return this.cuotasFiltradas.length > 0 && this.cuotasFiltradas.every(c => c.selected);
  }

  get algunaFiltradaMarcada(): boolean {
    return this.cuotasFiltradas.some(c => c.selected) && !this.todasFiltradasMarcadas;
  }

  isValido(): boolean {
    if (this.form.invalid) return false;
    if (this.seleccionadas.length === 0) return false;
    for (const c of this.seleccionadas) {
      if (Number(c.montoAPagar) <= 0) return false;
      if (Number(c.montoAPagar) > Number(c.saldoPendiente) + 0.005) return false;
    }
    return true;
  }

  async confirmar(): Promise<void> {
    if (!this.isValido()) return;
    const f = this.form.value;
    const pagos = this.seleccionadas.map(c => ({
      cuotaId: c.id,
      monto: +Number(c.montoAPagar).toFixed(2),
    }));
    const total = this.subtotal;

    // Validar saldo solo si es CAJA_MAYOR
    if (f.fuente === 'CAJA_MAYOR') {
      const ok = await this.confirmarSaldoSiNegativo(f, total);
      if (!ok) return;
    }

    this.saving = true;
    try {
      const payload: any = { pagos, fuente: f.fuente };
      if (f.fuente === 'CAJA_MAYOR') {
        payload.cajaMayorId = f.cajaMayorId;
        payload.monedaId = f.monedaId;
        payload.formaPagoId = f.formaPagoId;
      } else {
        payload.cuentaBancariaId = f.cuentaBancariaId;
      }

      const res: any = await firstValueFrom(this.repo.pagarCuotasComprasLote(payload));
      this.snackBar.open(`Pago registrado: ${res?.cuotasActualizadas || 0} cuota(s)`, 'Cerrar', { duration: 3500 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      console.error('Error pagando lote', e);
      const msg = (e?.message || String(e)).replace(/^Error invoking remote method '[^']+': Error: /, '');
      this.snackBar.open(msg, 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef?.close(false);
  }

  private async confirmarSaldoSiNegativo(f: any, monto: number): Promise<boolean> {
    let saldoActual = 0;
    let label = '';
    let monedaSimbolo = '';
    if (f.fuente === 'CAJA_MAYOR') {
      const saldos: any[] = await firstValueFrom(this.repo.getCajaMayorSaldos(f.cajaMayorId));
      const s = (saldos || []).find(x => x.moneda?.id === f.monedaId && x.formaPago?.id === f.formaPagoId);
      saldoActual = s ? Number(s.saldo) : 0;
      const cm = this.cajasMayor.find(c => c.id === f.cajaMayorId);
      const fp = this.formasPago.find(p => p.id === f.formaPagoId);
      const moneda = this.monedas.find(m => m.id === f.monedaId);
      monedaSimbolo = moneda?.simbolo || '';
      label = `${cm?.nombre || 'Caja Mayor'} (${moneda?.denominacion || ''} / ${fp?.nombre || ''})`;
    }
    return confirmarSaldosNegativos(this.dialog, [{ label, saldoActual, monto, monedaSimbolo }]);
  }
}
