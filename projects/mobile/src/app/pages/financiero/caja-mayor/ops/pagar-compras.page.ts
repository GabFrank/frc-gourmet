import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
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

interface CuotaVM {
  id: number;
  proveedorId: number | null;
  proveedorNombre: string;
  compraNota: string;
  cuotaLabel: string;
  vencimiento: string;
  monedaId: number | null;
  simbolo: string;
  decimales: number;
  saldoPendiente: number;
  selected: boolean;
  montoAPagar: number | null;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pagar Compras / CPP desde la Caja Mayor — operación full-screen. Lista las
 * cuotas pendientes de compras, permite seleccionar varias y pagar en lote
 * (pagarCuotasComprasLote). Fuente CAJA_MAYOR (moneda + forma de pago) o
 * CUENTA_BANCARIA. Requiere COMPRAS_GESTIONAR.
 *
 * El lote usa una única moneda/forma de pago (como el escritorio); filtrá por
 * proveedor y pagá cuotas de la misma moneda juntas.
 */
@Component({
  selector: 'app-pagar-compras',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, MatToolbarModule, MatIconModule,
    MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCheckboxModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './pagar-compras.page.html',
  styleUrls: ['./pagar-compras.scss'],
})
export class PagarComprasPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;

  monedas: Opcion[] = [];
  /** Forma de pago fija para fuente Caja Mayor (siempre efectivo). */
  efectivoLabel = 'Efectivo';
  cuentasBancarias: CuentaOpcion[] = [];
  proveedoresFiltro: Opcion[] = [];
  filtroProveedorId: number | null = null;

  private todasCuotas: CuotaVM[] = [];
  cuotas: CuotaVM[] = [];

  loading = true;
  saving = false;

  // Precomputados (sin getters con lógica en el template).
  cantSeleccionadas = 0;
  subtotal = 0;
  puedePagar = false;

  readonly form = this.fb.nonNullable.group({
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA', Validators.required],
    monedaId: [null as number | null],
    formaPagoId: [null as number | null],
    cuentaBancariaId: [null as number | null],
    observacion: [''],
  });

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.form.controls.fuente.valueChanges.subscribe((v) => this.aplicarValidadores(v));
    // Recalcular validez del botón cuando cambian moneda/forma/cuenta de pago.
    this.form.valueChanges.subscribe(() => this.recalcular());
    // La moneda del lote es única: al cambiarla (o la cuenta/fuente) re-filtramos
    // las cuotas a esa moneda y deseleccionamos las que ya no aplican.
    this.form.controls.monedaId.valueChanges.subscribe(() => this.aplicarFiltro());
    this.form.controls.cuentaBancariaId.valueChanges.subscribe(() => this.aplicarFiltro());
    this.form.controls.fuente.valueChanges.subscribe(() => this.aplicarFiltro());
    this.aplicarValidadores('CAJA_MAYOR');
    this.cargar();
  }

  private aplicarValidadores(fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const mon = this.form.controls.monedaId;
    const fp = this.form.controls.formaPagoId;
    const cb = this.form.controls.cuentaBancariaId;
    if (fuente === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      mon.clearValidators();
      fp.clearValidators();
    } else {
      mon.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    }
    [mon, fp, cb].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
    this.recalcular();
  }

  private cargar(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getCuotasPendientesCompras({})),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([cuotas, monedas, formas, cuentas]: [any[], any[], any[], any[]]) => {
        const decimalesPorMoneda = new Map<number, number>();
        (monedas || []).forEach((m) => decimalesPorMoneda.set(m.id, m.decimales ?? 0));
        this.todasCuotas = (cuotas || []).map((c) => ({
          id: c.id,
          proveedorId: c.proveedorId ?? null,
          proveedorNombre: c.proveedorNombre || 'Sin proveedor',
          compraNota: c.compraNumeroNota ? `Nota ${c.compraNumeroNota}` : `Compra #${c.compraId ?? ''}`,
          cuotaLabel: `Cuota ${c.numero || 1}/${c.cantidadCuotas || 1}`,
          vencimiento: c.fechaVencimiento,
          monedaId: c.monedaId ?? null,
          simbolo: c.monedaSimbolo || '',
          decimales: decimalesPorMoneda.get(c.monedaId) ?? 0,
          saldoPendiente: Number(c.saldoPendiente) || 0,
          selected: false,
          montoAPagar: null,
        }));
        // Filtro de proveedores construido de las cuotas cargadas.
        const provMap = new Map<number, string>();
        this.todasCuotas.forEach((c) => {
          if (c.proveedorId != null) provMap.set(c.proveedorId, c.proveedorNombre);
        });
        this.proveedoresFiltro = [...provMap.entries()].map(([id, label]) => ({ id, label }));

        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        // Fuente Caja Mayor = siempre efectivo (no se elige forma de pago).
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        if (efectivo) this.form.controls.formaPagoId.setValue(efectivo.id);
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`, monedaId: c.moneda.id }));

        const principal = (monedas || []).find((m) => m.principal);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.cuentasBancarias.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentasBancarias[0].id);

        this.aplicarFiltro();
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar las cuotas pendientes', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  /** Moneda con la que se pagará el lote: la del form (caja) o la de la cuenta (banco). */
  private monedaActual(): number | null {
    if (this.esBanco) {
      const c = this.cuentasBancarias.find((x) => x.id === this.form.controls.cuentaBancariaId.value);
      return c?.monedaId ?? null;
    }
    return this.form.controls.monedaId.value ?? null;
  }

  aplicarFiltro(): void {
    const moneda = this.monedaActual();
    this.cuotas = this.todasCuotas.filter(
      (c) =>
        (this.filtroProveedorId == null || c.proveedorId === this.filtroProveedorId) &&
        (moneda == null || c.monedaId === moneda),
    );
    // Deseleccionar cuotas que ya no están visibles (evita pagar en otra moneda).
    const visibles = new Set(this.cuotas.map((c) => c.id));
    this.todasCuotas.forEach((c) => {
      if (!visibles.has(c.id)) c.selected = false;
    });
    this.recalcular();
  }

  onToggleCuota(c: CuotaVM): void {
    c.selected = !c.selected;
    if (c.selected && (c.montoAPagar == null || c.montoAPagar <= 0)) {
      c.montoAPagar = c.saldoPendiente;
    }
    this.recalcular();
  }

  recalcular(): void {
    const sel = this.todasCuotas.filter((c) => c.selected && (c.montoAPagar || 0) > 0);
    this.cantSeleccionadas = sel.length;
    this.subtotal = sel.reduce((a, c) => a + (c.montoAPagar || 0), 0);
    const montosOk = sel.every((c) => (c.montoAPagar || 0) > 0 && (c.montoAPagar || 0) <= c.saldoPendiente + 0.005);
    this.puedePagar = sel.length > 0 && montosOk && this.form.valid;
  }

  volver(): void {
    this.location.back();
  }

  async pagar(): Promise<void> {
    this.recalcular();
    if (!this.puedePagar || this.saving) return;
    this.saving = true;
    const v = this.form.getRawValue();
    const obs = v.observacion ? v.observacion.toUpperCase() : undefined;
    const pagos = this.todasCuotas
      .filter((c) => c.selected && (c.montoAPagar || 0) > 0)
      .map((c) => ({ cuotaId: c.id, monto: round2(c.montoAPagar || 0), observacion: obs }));

    const payload = v.fuente === 'CUENTA_BANCARIA'
      ? { pagos, fuente: 'CUENTA_BANCARIA', cuentaBancariaId: v.cuentaBancariaId }
      : { pagos, fuente: 'CAJA_MAYOR', cajaMayorId: this.cajaMayorId, monedaId: v.monedaId, formaPagoId: v.formaPagoId };

    try {
      const res: any = await firstValueFrom(this.repo.pagarCuotasComprasLote(payload));
      const n = res?.cuotasActualizadas ?? pagos.length;
      this.snack.open(`${n} cuota(s) pagada(s)`, 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw)
        ? 'Sin permiso para pagar compras'
        : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar el pago';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
