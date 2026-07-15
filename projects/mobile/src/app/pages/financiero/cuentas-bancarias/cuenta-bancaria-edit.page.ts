import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface Opcion {
  id: number;
  label: string;
}

const TIPOS_CUENTA = ['CORRIENTE', 'AHORRO'];

/**
 * Alta / edición de una Cuenta Bancaria (PWA). El saldo es editable (en update el
 * backend lo pisa, no es delta — los movimientos ajustan el saldo aparte).
 * Requiere BANCOS_GESTIONAR.
 */
@Component({
  selector: 'app-cuenta-bancaria-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './cuenta-bancaria-edit.page.html',
})
export class CuentaBancariaEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  readonly tiposCuenta = TIPOS_CUENTA;
  monedas: Opcion[] = [];
  id: number | null = null;
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    banco: ['', Validators.required],
    numeroCuenta: ['', Validators.required],
    tipoCuenta: ['CORRIENTE', Validators.required],
    monedaId: [null as number | null, Validators.required],
    titular: [''],
    alias: [''],
    saldo: [0, [Validators.required, Validators.min(0)]],
    activo: [true],
  });

  get titulo(): string {
    return this.id ? 'Editar cuenta' : 'Nueva cuenta';
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.id = idParam ? Number(idParam) : null;
    this.cargar();
  }

  private cargar(): void {
    this.loading = true;
    firstValueFrom(this.repo.getMonedas())
      .then((monedas: any[]) => {
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        if (!this.id) {
          const principal = (monedas || []).find((m) => m.principal);
          if (principal) this.form.controls.monedaId.setValue(principal.id);
          else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
          this.loading = false;
          return;
        }
        return firstValueFrom(this.repo.getCuentaBancaria(this.id)).then((c: any) => {
          if (c) {
            this.form.patchValue({
              nombre: c.nombre || '',
              banco: c.banco || '',
              numeroCuenta: c.numeroCuenta || '',
              tipoCuenta: c.tipoCuenta || 'CORRIENTE',
              monedaId: c.moneda?.id ?? null,
              titular: c.titular || '',
              alias: c.alias || '',
              saldo: Number(c.saldo) || 0,
              activo: c.activo !== false,
            });
          }
          this.loading = false;
        });
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los datos', 'OK', { duration: 3000 });
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
    // El handler uppercasea nombre/banco/numeroCuenta/titular/alias.
    const payload = {
      nombre: v.nombre,
      banco: v.banco,
      numeroCuenta: v.numeroCuenta,
      tipoCuenta: v.tipoCuenta,
      moneda: { id: v.monedaId },
      titular: v.titular || null,
      alias: v.alias || null,
      saldo: v.saldo,
      activo: v.activo,
    };
    const op$ = this.id ? this.repo.updateCuentaBancaria(this.id, payload) : this.repo.createCuentaBancaria(payload);
    try {
      await firstValueFrom(op$);
      this.snack.open(this.id ? 'Cuenta actualizada' : 'Cuenta creada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo guardar';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
