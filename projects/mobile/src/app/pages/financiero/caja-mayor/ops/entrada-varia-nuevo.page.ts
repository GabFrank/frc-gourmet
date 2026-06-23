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
 * Registrar Entrada Varia (ingreso misceláneo) hacia la Caja Mayor —
 * operación full-screen. destinoTipo fijo en CAJA_MAYOR (las cuentas bancarias
 * quedan para el escritorio).
 */
@Component({
  selector: 'app-entrada-varia-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './entrada-varia-nuevo.page.html',
})
export class EntradaVariaNuevoPage implements OnInit {
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

  readonly categoriaInput = new FormControl<Opcion | string>('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    entradaVariaCategoriaId: [null as number | null, Validators.required],
    descripcion: ['', Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    monedaId: [null as number | null, Validators.required],
    formaPagoId: [null as number | null, Validators.required],
    observacion: [''],
  });

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarCatalogos();
    this.categoriaInput.valueChanges.subscribe((v) => {
      const text = typeof v === 'string' ? v : v?.label || '';
      const q = text.toLowerCase().trim();
      this.categoriasFiltradas = q
        ? this.categorias.filter((c) => c.label.toLowerCase().includes(q))
        : [...this.categorias];
      if (typeof v === 'string') this.form.controls.entradaVariaCategoriaId.setValue(null);
    });
  }

  displayCategoria = (c: Opcion | null): string => (c?.label || '');

  onCategoriaSelected(opt: Opcion): void {
    this.form.controls.entradaVariaCategoriaId.setValue(opt.id);
  }

  private cargarCatalogos(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getEntradaVariaCategorias()),
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
          this.form.controls.entradaVariaCategoriaId.setValue(c.id);
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
      destinoTipo: 'CAJA_MAYOR',
      cajaMayorId: this.cajaMayorId,
      entradaVariaCategoriaId: v.entradaVariaCategoriaId,
      descripcion: (v.descripcion || '').toUpperCase(),
      monto: v.monto,
      monedaId: v.monedaId,
      formaPagoId: v.formaPagoId,
      observacion: v.observacion ? v.observacion.toUpperCase() : null,
      fecha: new Date(),
    };
    try {
      await firstValueFrom(this.repo.createEntradaVaria(payload));
      this.snack.open('Entrada varia registrada', 'OK', { duration: 2500 });
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
