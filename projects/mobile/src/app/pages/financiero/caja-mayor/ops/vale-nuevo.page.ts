import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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

interface Opcion {
  id: number;
  label: string;
}

interface CuentaOpcion extends Opcion {
  monedaId: number;
}

/**
 * Registrar Vale confirmado (egreso a funcionario) desde la Caja Mayor —
 * operación full-screen. Replica el "Registrar Vale" del escritorio
 * (create-edit-vale-dialog en modo confirmar): crea el vale ya CONFIRMADO y
 * egresa de caja (EGRESO_VALE) o debita una cuenta bancaria, en un handler
 * atómico. Requiere RRHH_VALE_CREAR + RRHH_VALE_CONFIRMAR.
 *
 * En modo banco la moneda la dicta la cuenta (sin cotización) — el split
 * multi-moneda con cotización queda para el escritorio.
 */
@Component({
  selector: 'app-vale-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatAutocompleteModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './vale-nuevo.page.html',
  styles: [
    `
      .vn-destino {
        align-self: stretch;
        margin-bottom: 4px;
      }
      .vn-destino mat-button-toggle {
        flex: 1;
      }
      .vn-hint {
        margin: 0 4px 8px;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      .vn-toggle {
        margin: 4px 4px 8px;
      }
    `,
  ],
})
export class ValeNuevoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;

  funcionarios: Opcion[] = [];
  funcionariosFiltrados: Opcion[] = [];
  motivos: Opcion[] = [];
  monedas: Opcion[] = [];
  formasPago: Opcion[] = [];
  cuentasBancarias: CuentaOpcion[] = [];
  loading = true;
  saving = false;

  /** Input texto del autocomplete de funcionario (separado del id en el form). */
  readonly funcionarioInput = new FormControl<Opcion | string>('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA', Validators.required],
    funcionarioId: [null as number | null, Validators.required],
    motivoId: [null as number | null],
    descripcion: [''],
    esAdelanto: [true],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    monedaId: [null as number | null, Validators.required],
    // Validadores condicionales según fuente (setup en ngOnInit).
    formaPagoId: [null as number | null],
    cuentaBancariaId: [null as number | null],
  });

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarCatalogos();
    // Filtrar funcionarios a medida que el usuario tipea; si limpia o reescribe,
    // se desvincula la selección (se exige elegir uno de la lista).
    this.funcionarioInput.valueChanges.subscribe((v) => {
      const text = typeof v === 'string' ? v : v?.label || '';
      const q = text.toLowerCase().trim();
      this.funcionariosFiltrados = q
        ? this.funcionarios.filter((f) => f.label.toLowerCase().includes(q))
        : [...this.funcionarios];
      if (typeof v === 'string') this.form.controls.funcionarioId.setValue(null);
    });
    // Validadores condicionales por fuente.
    this.form.controls.fuente.valueChanges.subscribe((v) => this.aplicarValidadoresFuente(v));
    this.aplicarValidadoresFuente(this.form.controls.fuente.value);
  }

  private aplicarValidadoresFuente(fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const fp = this.form.controls.formaPagoId;
    const cb = this.form.controls.cuentaBancariaId;
    const mon = this.form.controls.monedaId;
    if (fuente === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      fp.clearValidators();
      fp.setValue(null, { emitEvent: false });
      // En modo banco la moneda la dicta la cuenta -> deshabilitar el select.
      if (cb.value) this.alinearMonedaConCuenta(cb.value);
      mon.disable({ emitEvent: false });
    } else {
      fp.setValidators([Validators.required]);
      cb.clearValidators();
      cb.setValue(null, { emitEvent: false });
      mon.enable({ emitEvent: false });
    }
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  onCuentaBancariaSelected(cuentaId: number): void {
    this.alinearMonedaConCuenta(cuentaId);
  }

  private alinearMonedaConCuenta(cuentaId: number): void {
    const c = this.cuentasBancarias.find((x) => x.id === cuentaId);
    if (c) this.form.controls.monedaId.setValue(c.monedaId, { emitEvent: false });
  }

  displayFuncionario = (f: Opcion | null): string => (f?.label || '');

  onFuncionarioSelected(opt: Opcion): void {
    this.form.controls.funcionarioId.setValue(opt.id);
  }

  private cargarCatalogos(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getFuncionarios({ soloActivos: true })),
      firstValueFrom(this.repo.getMotivosVale()),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([funcs, motivos, monedas, formas, cuentas]: [any[], any[], any[], any[], any[]]) => {
        this.funcionarios = (funcs || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({
            id: f.id,
            label: `${f.persona?.nombre || ''} ${f.persona?.apellido || ''}`.trim() || `Funcionario #${f.id}`,
          }));
        this.motivos = (motivos || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: m.nombre }));
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({
            id: c.id,
            label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`,
            monedaId: c.moneda.id,
          }));
        this.funcionariosFiltrados = [...this.funcionarios];
        // Preselección: moneda principal, forma de pago / cuenta única.
        const principal = (monedas || []).find((m) => m.principal);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.formasPago.length === 1) this.form.controls.formaPagoId.setValue(this.formasPago[0].id);
        if (this.cuentasBancarias.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentasBancarias[0].id);
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los catálogos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const base = {
      funcionarioId: v.funcionarioId,
      monedaId: v.monedaId,
      monto: v.monto,
      motivoId: v.motivoId || null,
      descripcion: v.descripcion ? v.descripcion.toUpperCase() : null,
      esAdelanto: !!v.esAdelanto,
      fecha: new Date(),
      cajaMayorId: this.cajaMayorId, // informativo en banco; obligatorio en caja
    };
    const payload = v.fuente === 'CUENTA_BANCARIA'
      ? {
          ...base,
          fuente: 'CUENTA_BANCARIA',
          cuentaBancariaId: v.cuentaBancariaId,
          // moneda == moneda de la cuenta -> sin conversión (montoCuentaBancaria = monto).
          montoCuentaBancaria: null,
          cotizacion: null,
        }
      : {
          ...base,
          fuente: 'CAJA_MAYOR',
          formaPagoId: v.formaPagoId,
        };
    try {
      await firstValueFrom(this.repo.crearValeConfirmado(payload));
      this.snack.open('Vale registrado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw)
        ? 'Sin permiso para registrar vales'
        : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar el vale';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
