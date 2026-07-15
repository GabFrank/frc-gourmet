import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { formaPagoEfectivo } from '../../forma-pago-efectivo.util';

interface Opcion {
  id: number;
  label: string;
}

interface CuentaOpcion extends Opcion {
  monedaId: number;
}

interface TotalMoneda {
  simbolo: string;
  monto: number;
  decimales: number;
}

const FRECUENCIAS = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
const TIPOS_BOLETA = ['LEGAL', 'COMUN', 'OTRO', 'SIN_COMPROBANTE'];

/**
 * Alta / edición de un Gasto (egreso categorizado). Se abre desde Caja Mayor
 * (caja preseleccionada), desde la lista de gastos (elige caja mayor) o en modo
 * edición (financiero/gastos/:gastoId/editar).
 *
 * Fuente CAJA_MAYOR = siempre efectivo, y admite MULTI-DETALLE (varias líneas
 * moneda + monto). Fuente CUENTA_BANCARIA = una sola línea, moneda de la cuenta.
 * La edición de gastos bancarios se bloquea (el backend la rechaza).
 * Escritura requiere CAJA_MAYOR_OPERAR.
 */
@Component({
  selector: 'app-gasto-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './gasto-form.page.html',
  styleUrls: ['./gasto-form.scss'],
})
export class GastoFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  readonly frecuencias = FRECUENCIAS;
  readonly tiposBoleta = TIPOS_BOLETA;

  gastoId: number | null = null;
  cajaPreseleccionada = false;
  bloqueadoBanco = false;
  efectivoLabel = 'Efectivo';
  private efectivoFormaId: number | null = null;

  categorias: Opcion[] = [];
  categoriasFiltradas: Opcion[] = [];
  monedas: Opcion[] = [];
  private monedaInfo = new Map<number, { simbolo: string; decimales: number }>();
  cuentasBancarias: CuentaOpcion[] = [];
  cajasMayor: Opcion[] = [];
  proveedores: Opcion[] = [];
  proveedoresFiltrados: Opcion[] = [];
  totales: TotalMoneda[] = [];

  loading = true;
  saving = false;

  readonly categoriaInput = new FormControl<Opcion | string>('', { nonNullable: true });
  readonly proveedorInput = new FormControl<Opcion | string>('', { nonNullable: true });

  /** Líneas del gasto (moneda + monto). En banco queda una sola. */
  readonly detalles = this.fb.array<FormGroup>([]);

  readonly form = this.fb.nonNullable.group({
    destinoTipo: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA', Validators.required],
    cajaMayorId: [null as number | null, Validators.required],
    gastoCategoriaId: [null as number | null, Validators.required],
    descripcion: ['', Validators.required],
    cuentaBancariaId: [null as number | null],
    fecha: [this.hoy(), Validators.required],
    proveedorId: [null as number | null],
    numeroComprobante: [''],
    tipoBoleta: [null as string | null],
    esRecurrente: [false],
    frecuencia: [null as string | null],
    proximoVencimiento: [''],
  });

  get esBanco(): boolean {
    return this.form.controls.destinoTipo.value === 'CUENTA_BANCARIA';
  }

  get titulo(): string {
    return this.gastoId ? 'Editar gasto' : 'Nuevo gasto';
  }

  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private nuevaLinea(monedaId: number | null = null, monto: number | null = null): FormGroup {
    return this.fb.group({
      monedaId: this.fb.control(monedaId, Validators.required),
      monto: this.fb.control(monto, [Validators.required, Validators.min(0.01)]),
    });
  }

  ngOnInit(): void {
    const gastoIdParam = this.route.snapshot.paramMap.get('gastoId');
    const cajaIdParam = this.route.snapshot.paramMap.get('id');
    this.gastoId = gastoIdParam ? Number(gastoIdParam) : null;
    if (cajaIdParam && !this.gastoId) {
      this.form.controls.cajaMayorId.setValue(Number(cajaIdParam));
      this.cajaPreseleccionada = true;
    }

    this.detalles.push(this.nuevaLinea());
    this.detalles.valueChanges.subscribe(() => this.recomputeTotales());

    this.categoriaInput.valueChanges.subscribe((v) => {
      const q = (typeof v === 'string' ? v : v?.label || '').toLowerCase().trim();
      this.categoriasFiltradas = q ? this.categorias.filter((c) => c.label.toLowerCase().includes(q)) : [...this.categorias];
      if (typeof v === 'string') this.form.controls.gastoCategoriaId.setValue(null);
    });
    this.proveedorInput.valueChanges.subscribe((v) => {
      const q = (typeof v === 'string' ? v : v?.label || '').toLowerCase().trim();
      this.proveedoresFiltrados = q ? this.proveedores.filter((p) => p.label.toLowerCase().includes(q)) : [...this.proveedores];
      if (typeof v === 'string') this.form.controls.proveedorId.setValue(null);
    });
    this.form.controls.destinoTipo.valueChanges.subscribe((v) => this.aplicarValidadoresDestino(v));
    this.form.controls.esRecurrente.valueChanges.subscribe((v) => this.aplicarValidadoresRecurrencia(!!v));
    this.aplicarValidadoresRecurrencia(false);

    this.cargar();
  }

  // --- Detalles (multi-línea) ---
  addDetalle(): void {
    if (this.esBanco) return;
    this.detalles.push(this.nuevaLinea());
  }

  removeDetalle(i: number): void {
    if (this.detalles.length <= 1) return;
    this.detalles.removeAt(i);
  }

  private recomputeTotales(): void {
    const map = new Map<number, TotalMoneda>();
    for (const g of this.detalles.controls) {
      const monedaId = g.get('monedaId')?.value as number | null;
      const monto = Number(g.get('monto')?.value) || 0;
      if (monedaId == null || !monto) continue;
      const info = this.monedaInfo.get(monedaId);
      const acc = map.get(monedaId) ?? { simbolo: info?.simbolo || '', monto: 0, decimales: info?.decimales ?? 0 };
      acc.monto += monto;
      map.set(monedaId, acc);
    }
    this.totales = [...map.values()];
  }

  private aplicarValidadoresDestino(destino: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const cb = this.form.controls.cuentaBancariaId;
    if (destino === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      // Banco: una sola línea, moneda de la cuenta (bloqueada).
      while (this.detalles.length > 1) this.detalles.removeAt(1);
      const monedaCtrl = this.detalles.at(0).get('monedaId');
      monedaCtrl?.disable({ emitEvent: false });
      if (cb.value) this.alinearMonedaConCuenta(cb.value);
    } else {
      cb.clearValidators();
      cb.setValue(null, { emitEvent: false });
      this.detalles.at(0).get('monedaId')?.enable({ emitEvent: false });
    }
    cb.updateValueAndValidity({ emitEvent: false });
  }

  private aplicarValidadoresRecurrencia(recurrente: boolean): void {
    const f = this.form.controls.frecuencia;
    const pv = this.form.controls.proximoVencimiento;
    if (recurrente) {
      f.setValidators([Validators.required]);
      pv.setValidators([Validators.required]);
    } else {
      f.clearValidators();
      f.setValue(null, { emitEvent: false });
      pv.clearValidators();
      pv.setValue('', { emitEvent: false });
    }
    f.updateValueAndValidity({ emitEvent: false });
    pv.updateValueAndValidity({ emitEvent: false });
  }

  onCuentaBancariaSelected(cuentaId: number): void {
    this.alinearMonedaConCuenta(cuentaId);
  }

  private alinearMonedaConCuenta(cuentaId: number): void {
    const c = this.cuentasBancarias.find((x) => x.id === cuentaId);
    if (c) this.detalles.at(0).get('monedaId')?.setValue(c.monedaId, { emitEvent: false });
    this.recomputeTotales();
  }

  displayCategoria = (c: Opcion | null): string => c?.label || '';
  displayProveedor = (p: Opcion | null): string => p?.label || '';

  onCategoriaSelected(opt: Opcion): void {
    this.form.controls.gastoCategoriaId.setValue(opt.id);
  }
  onProveedorSelected(opt: Opcion): void {
    this.form.controls.proveedorId.setValue(opt.id);
  }

  private cargar(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getGastoCategorias()),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getProveedores()),
    ])
      .then(([cats, monedas, formas, cuentas, cajas, provs]: [any[], any[], any[], any[], any[], any[]]) => {
        this.categorias = (cats || []).filter((c) => c.activo !== false).map((c) => ({ id: c.id, label: c.nombre }));
        this.categoriasFiltradas = [...this.categorias];
        this.monedas = (monedas || []).filter((m) => m.activo !== false).map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        (monedas || []).forEach((m) => this.monedaInfo.set(m.id, { simbolo: m.simbolo || '', decimales: m.decimales ?? 0 }));
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoFormaId = efectivo?.id ?? null;
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`, monedaId: c.moneda.id }));
        this.cajasMayor = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.proveedores = (provs || []).map((p) => ({ id: p.id, label: p.nombre || p.razonSocial || p.persona?.nombre || `Proveedor #${p.id}` }));
        this.proveedoresFiltrados = [...this.proveedores];

        const principal = (monedas || []).find((m) => m.principal);
        if (!this.gastoId) {
          const monedaDefault = principal?.id ?? (this.monedas.length === 1 ? this.monedas[0].id : null);
          if (monedaDefault) this.detalles.at(0).get('monedaId')?.setValue(monedaDefault);
          if (!this.cajaPreseleccionada && this.cajasMayor.length === 1) this.form.controls.cajaMayorId.setValue(this.cajasMayor[0].id);
          if (this.cuentasBancarias.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentasBancarias[0].id);
          if (this.categorias.length === 1) {
            this.form.controls.gastoCategoriaId.setValue(this.categorias[0].id);
            this.categoriaInput.setValue(this.categorias[0], { emitEvent: false });
          }
          this.loading = false;
          return;
        }
        this.prefillGasto();
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los catálogos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  private prefillGasto(): void {
    firstValueFrom(this.repo.getGasto(this.gastoId as number))
      .then((g: any) => {
        if (!g) {
          this.snack.open('Gasto no encontrado', 'OK', { duration: 3000 });
          this.loading = false;
          return;
        }
        const destino = (g.destinoTipo || 'CAJA_MAYOR').toUpperCase();
        if (destino === 'CUENTA_BANCARIA') {
          this.bloqueadoBanco = true; // el backend rechaza editar gastos bancarios
        }
        // Reconstruir las líneas desde los detalles (o una sola con moneda/monto).
        this.detalles.clear();
        const lineas = (g.detalles && g.detalles.length)
          ? g.detalles.map((d: any) => ({ monedaId: d.moneda?.id ?? null, monto: Number(d.monto) || null }))
          : [{ monedaId: g.moneda?.id ?? null, monto: Number(g.monto) || null }];
        lineas.forEach((l: any) => this.detalles.push(this.nuevaLinea(l.monedaId, l.monto)));

        const cat = this.categorias.find((c) => c.id === g.gastoCategoria?.id);
        const prov = this.proveedores.find((p) => p.id === g.proveedor?.id);
        this.form.patchValue({
          destinoTipo: 'CAJA_MAYOR',
          cajaMayorId: g.cajaMayor?.id ?? null,
          gastoCategoriaId: g.gastoCategoria?.id ?? null,
          descripcion: g.descripcion || '',
          fecha: g.fecha ? String(g.fecha).slice(0, 10) : this.hoy(),
          proveedorId: g.proveedor?.id ?? null,
          numeroComprobante: g.numeroComprobante || '',
          tipoBoleta: g.tipoBoleta || null,
          esRecurrente: !!g.esRecurrente,
          frecuencia: g.frecuencia || null,
          proximoVencimiento: g.proximoVencimiento ? String(g.proximoVencimiento).slice(0, 10) : '',
        });
        if (cat) this.categoriaInput.setValue(cat, { emitEvent: false });
        if (prov) this.proveedorInput.setValue(prov, { emitEvent: false });
        this.recomputeTotales();
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudo cargar el gasto', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.bloqueadoBanco) {
      this.snack.open('Los gastos bancarios se editan en el escritorio.', 'OK', { duration: 4000 });
      return;
    }
    if (this.form.invalid || this.detalles.invalid || this.detalles.length === 0 || this.saving) {
      this.form.markAllAsTouched();
      this.detalles.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const lineas = this.detalles.controls.map((g) => ({
      monedaId: g.get('monedaId')?.value as number,
      monto: Number(g.get('monto')?.value),
    }));
    const base: any = {
      gastoCategoria: { id: v.gastoCategoriaId },
      descripcion: (v.descripcion || '').toUpperCase(),
      cajaMayor: { id: v.cajaMayorId },
      destinoTipo: v.destinoTipo,
      fecha: v.fecha || this.hoy(),
      proveedor: v.proveedorId ? { id: v.proveedorId } : null,
      numeroComprobante: v.numeroComprobante ? v.numeroComprobante.toUpperCase() : null,
      tipoBoleta: v.tipoBoleta || null,
      esRecurrente: !!v.esRecurrente,
      frecuencia: v.esRecurrente ? v.frecuencia : null,
      proximoVencimiento: v.esRecurrente ? v.proximoVencimiento : null,
    };
    const payload = v.destinoTipo === 'CUENTA_BANCARIA'
      ? { ...base, cuentaBancariaId: v.cuentaBancariaId, monto: lineas[0].monto, monedaId: lineas[0].monedaId, montoCuentaBancaria: null, cotizacion: null }
      : { ...base, detalles: lineas.map((l) => ({ monedaId: l.monedaId, formaPagoId: this.efectivoFormaId, monto: l.monto })) };

    const op$ = this.gastoId ? this.repo.editGasto(this.gastoId, payload) : this.repo.createGasto(payload);
    try {
      await firstValueFrom(op$);
      this.snack.open(this.gastoId ? 'Gasto actualizado' : 'Gasto registrado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para operar' : raw.replace(/^Error:\s*/, '') || 'No se pudo guardar';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
