import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface Opcion {
  id: number;
  label: string;
}

/**
 * Registrar Gasto (egreso categorizado) desde la Caja Mayor — operación
 * full-screen. Envía un único detalle (moneda + forma de pago + monto); el
 * split multi-moneda queda para el escritorio. La fecha es la del día.
 */
@Component({
  selector: 'app-gasto-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './gasto-nuevo.page.html',
})
export class GastoNuevoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;

  categorias: Opcion[] = [];
  categoriasFiltradas: Opcion[] = [];
  monedas: Opcion[] = [];
  formasPago: Opcion[] = [];
  loading = true;
  saving = false;

  /** Input texto del autocomplete de categoría (separado del id en el form). */
  readonly categoriaInput = new FormControl<Opcion | string>('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    gastoCategoriaId: [null as number | null, Validators.required],
    descripcion: ['', Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    monedaId: [null as number | null, Validators.required],
    formaPagoId: [null as number | null, Validators.required],
  });

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarCatalogos();
    // Filtrar categorías a medida que el usuario tipea; si limpia o reescribe,
    // se desvincula la selección (se exige elegir una opción de la lista).
    this.categoriaInput.valueChanges.subscribe((v) => {
      const text = typeof v === 'string' ? v : v?.label || '';
      const q = text.toLowerCase().trim();
      this.categoriasFiltradas = q
        ? this.categorias.filter((c) => c.label.toLowerCase().includes(q))
        : [...this.categorias];
      if (typeof v === 'string') this.form.controls.gastoCategoriaId.setValue(null);
    });
  }

  /** Para que el input muestre el label de la opción seleccionada. */
  displayCategoria = (c: Opcion | null): string => (c?.label || '');

  onCategoriaSelected(opt: Opcion): void {
    this.form.controls.gastoCategoriaId.setValue(opt.id);
  }

  private cargarCatalogos(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getGastoCategorias()),
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
    ])
      .then(([cats, monedas, formas]: [any[], any[], any[]]) => {
        this.categorias = (cats || [])
          .filter((c) => c.activo !== false)
          .map((c) => ({ id: c.id, label: c.nombre }));
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        const principal = (monedas || []).find((m) => m.principal);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.formasPago.length === 1) this.form.controls.formaPagoId.setValue(this.formasPago[0].id);
        this.categoriasFiltradas = [...this.categorias];
        if (this.categorias.length === 1) {
          const c = this.categorias[0];
          this.form.controls.gastoCategoriaId.setValue(c.id);
          this.categoriaInput.setValue(c, { emitEvent: false });
        }
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
      gastoCategoria: { id: v.gastoCategoriaId },
      descripcion: (v.descripcion || '').toUpperCase(),
      fecha: new Date(),
      detalles: [{ monedaId: v.monedaId, formaPagoId: v.formaPagoId, monto: v.monto }],
    };
    try {
      await firstValueFrom(this.repo.createGasto(payload));
      this.snack.open('Gasto registrado', 'OK', { duration: 2500 });
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
