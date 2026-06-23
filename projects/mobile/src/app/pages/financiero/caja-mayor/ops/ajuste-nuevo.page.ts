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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface Opcion {
  id: number;
  label: string;
}

/**
 * Ajuste de saldo de Caja Mayor (positivo o negativo) — operación full-screen.
 * El signo viene en la ruta (:signo = ingreso|egreso). Mapea a AJUSTE_POSITIVO
 * / AJUSTE_NEGATIVO sobre create-caja-mayor-movimiento.
 */
@Component({
  selector: 'app-ajuste-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './ajuste-nuevo.page.html',
})
export class AjusteNuevoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;
  esIngreso = true;

  monedas: Opcion[] = [];
  formasPago: Opcion[] = [];
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    monedaId: [null as number | null, Validators.required],
    formaPagoId: [null as number | null, Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    motivo: ['', Validators.required],
  });

  get titulo(): string {
    return this.esIngreso ? 'Ajuste positivo' : 'Ajuste negativo';
  }

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.esIngreso = this.route.snapshot.paramMap.get('signo') === 'ingreso';
    this.cargarCatalogos();
  }

  private cargarCatalogos(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
    ])
      .then(([monedas, formas]: [any[], any[]]) => {
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        // Preselección: moneda principal y forma de pago única.
        const principal = (monedas || []).find((m) => m.principal);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.formasPago.length === 1) this.form.controls.formaPagoId.setValue(this.formasPago[0].id);
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
    const payload = {
      cajaMayor: { id: this.cajaMayorId },
      moneda: { id: v.monedaId },
      formaPago: { id: v.formaPagoId },
      monto: v.monto,
      tipoMovimiento: this.esIngreso ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
      observacion: (v.motivo || '').toUpperCase(),
    };
    try {
      await firstValueFrom(this.repo.createCajaMayorMovimiento(payload));
      this.snack.open('Ajuste registrado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(
        /PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso para operar' : 'No se pudo registrar',
        'OK',
        { duration: 3500 },
      );
      this.saving = false;
    }
  }
}
