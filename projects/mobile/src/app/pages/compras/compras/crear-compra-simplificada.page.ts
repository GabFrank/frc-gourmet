import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { formaPagoEfectivo } from '../../financiero/forma-pago-efectivo.util';

interface Opcion {
  id: number;
  label: string;
}

interface CuentaOpcion extends Opcion {
  monedaId: number;
}

const TIPOS_BOLETA = ['LEGAL', 'COMUN', 'OTRO', 'SIN_COMPROBANTE'];

/**
 * Alta de compra SIMPLIFICADA (sin ítems): genera la deuda (CPP tipo COMPRA) y,
 * en contado + pagar-ahora, registra el pago en Caja Mayor o cuenta bancaria.
 * Nace FINALIZADA. Requiere COMPRAS_GESTIONAR. Modela el flujo de gasto-form.
 */
@Component({
  selector: 'app-crear-compra-simplificada',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './crear-compra-simplificada.page.html',
  styleUrls: ['./crear-compra-simplificada.page.scss'],
})
export class CrearCompraSimplificadaPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  readonly tiposBoleta = TIPOS_BOLETA;

  proveedores: Opcion[] = [];
  proveedoresFiltrados: Opcion[] = [];
  monedas: Opcion[] = [];
  categorias: Opcion[] = [];
  cajasMayor: Opcion[] = [];
  cuentasBancarias: CuentaOpcion[] = [];
  cuentasFiltradas: CuentaOpcion[] = [];

  efectivoLabel = 'Efectivo';
  private efectivoFormaId: number | null = null;

  loading = true;
  saving = false;
  error: string | null = null;

  readonly proveedorInput = new FormControl<Opcion | string>('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    proveedorId: [null as number | null, Validators.required],
    monedaId: [null as number | null, Validators.required],
    total: [null as number | null, [Validators.required, Validators.min(0.01)]],
    compraCategoriaId: [null as number | null],
    numeroNota: [''],
    tipoBoleta: [null as string | null],
    fechaCompra: [this.hoy(), Validators.required],
    credito: [false],
    cantidadCuotas: [1],
    fechaCreditoInicio: [this.hoy()],
    pagarAhora: [false],
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA'],
    cajaMayorId: [null as number | null],
    formaPagoId: [null as number | null],
    cuentaBancariaId: [null as number | null],
    observacionPago: [''],
  });

  get esCredito(): boolean {
    return this.form.controls.credito.value === true;
  }

  get esPagarAhora(): boolean {
    return !this.esCredito && this.form.controls.pagarAhora.value === true;
  }

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  private hoy(): string {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    this.proveedorInput.valueChanges.subscribe((v) => {
      const q = (typeof v === 'string' ? v : v?.label || '').toLowerCase().trim();
      this.proveedoresFiltrados = q ? this.proveedores.filter((p) => p.label.toLowerCase().includes(q)) : [...this.proveedores];
      if (typeof v === 'string') this.form.controls.proveedorId.setValue(null);
    });
    this.form.controls.credito.valueChanges.subscribe(() => this.aplicarValidadores());
    this.form.controls.pagarAhora.valueChanges.subscribe(() => this.aplicarValidadores());
    this.form.controls.fuente.valueChanges.subscribe(() => this.aplicarValidadores());
    // Al cambiar la moneda, filtrar cuentas bancarias compatibles (evita pagar
    // una compra en una moneda con una cuenta de otra moneda, que el backend
    // descontaría sin convertir).
    this.form.controls.monedaId.valueChanges.subscribe(() => this.filtrarCuentas());
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    Promise.all([
      firstValueFrom(this.repo.getProveedores()),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getCompraCategorias()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([provs, monedas, cats, formas, cajas, cuentas]: [any[], any[], any[], any[], any[], any[]]) => {
        this.proveedores = (provs || [])
          .filter((p) => p.activo !== false)
          .map((p) => ({ id: p.id, label: p.nombre || p.razon_social || `Proveedor #${p.id}` }));
        this.proveedoresFiltrados = [...this.proveedores];
        this.monedas = (monedas || []).filter((m) => m.activo !== false).map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.categorias = (cats || []).filter((c) => c.activo !== false).map((c) => ({ id: c.id, label: c.nombre }));
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoFormaId = efectivo?.id ?? null;
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        this.cajasMayor = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`, monedaId: c.moneda.id }));

        const principal = (monedas || []).find((m) => m.principal && m.activo !== false);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.cajasMayor.length === 1) this.form.controls.cajaMayorId.setValue(this.cajasMayor[0].id);
        this.filtrarCuentas();
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudieron cargar los catálogos. Verificá la conexión y reintentá.';
        this.loading = false;
      });
  }

  /** Cuentas bancarias compatibles con la moneda elegida (misma moneda). */
  private filtrarCuentas(): void {
    const monedaId = this.form.controls.monedaId.value;
    this.cuentasFiltradas = this.cuentasBancarias.filter((c) => c.monedaId === monedaId);
    const sel = this.form.controls.cuentaBancariaId.value;
    if (sel != null && !this.cuentasFiltradas.some((c) => c.id === sel)) {
      this.form.controls.cuentaBancariaId.setValue(null);
    }
  }

  private aplicarValidadores(): void {
    const cuotas = this.form.controls.cantidadCuotas;
    const caja = this.form.controls.cajaMayorId;
    const cuenta = this.form.controls.cuentaBancariaId;
    // Crédito exige cantidad de cuotas.
    if (this.esCredito) {
      cuotas.setValidators([Validators.required, Validators.min(1)]);
    } else {
      cuotas.clearValidators();
    }
    // Pago ahora (contado) exige caja o cuenta según la fuente.
    if (this.esPagarAhora && !this.esBanco) caja.setValidators([Validators.required]);
    else caja.clearValidators();
    if (this.esPagarAhora && this.esBanco) cuenta.setValidators([Validators.required]);
    else cuenta.clearValidators();
    cuotas.updateValueAndValidity({ emitEvent: false });
    caja.updateValueAndValidity({ emitEvent: false });
    cuenta.updateValueAndValidity({ emitEvent: false });
  }

  displayProveedor = (p: Opcion | null): string => (typeof p === 'string' ? p : p?.label || '');

  onProveedorSelected(opt: Opcion): void {
    this.form.controls.proveedorId.setValue(opt.id);
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.esPagarAhora && !this.esBanco && this.efectivoFormaId == null) {
      this.snack.open('No hay una forma de pago EFECTIVO configurada. Creala en el escritorio.', 'OK', { duration: 4000 });
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const provNombre = this.proveedores.find((p) => p.id === v.proveedorId)?.label;
    const payload: any = {
      proveedorId: v.proveedorId,
      proveedorNombre: provNombre,
      monedaId: v.monedaId,
      total: Number(v.total),
      fechaCompra: v.fechaCompra,
      numeroNota: v.numeroNota ? v.numeroNota.toUpperCase() : null,
      tipoBoleta: v.tipoBoleta || null,
      compraCategoriaId: v.compraCategoriaId || null,
      credito: this.esCredito,
    };
    if (this.esCredito) {
      payload.cantidadCuotas = Number(v.cantidadCuotas) || 1;
      payload.fechaCreditoInicio = v.fechaCreditoInicio || this.hoy();
    } else if (this.esPagarAhora) {
      payload.pagarAhora = true;
      payload.fuente = v.fuente;
      payload.observacionPago = v.observacionPago || null;
      if (this.esBanco) {
        payload.cuentaBancariaId = v.cuentaBancariaId;
      } else {
        payload.cajaMayorId = v.cajaMayorId;
        payload.formaPagoId = this.efectivoFormaId;
      }
    }

    try {
      const compra: any = await firstValueFrom(this.repo.crearCompraSimplificada(payload));
      this.snack.open('Compra registrada', 'OK', { duration: 2500 });
      if (compra?.id) this.router.navigate(['/compras/lista', compra.id], { replaceUrl: true });
      else this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso para operar' : raw.replace(/^Error:\s*/, '') || 'No se pudo guardar', 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
