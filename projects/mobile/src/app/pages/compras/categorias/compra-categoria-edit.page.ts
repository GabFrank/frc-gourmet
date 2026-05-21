import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

/** Alta/edición de Categoría de compra. El handler uppercasea nombre/icono. */
@Component({
  selector: 'app-compra-categoria-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './compra-categoria-edit.page.html',
})
export class CompraCategoriaEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    icono: [''],
    activo: [true],
  });

  loading = false;
  saving = false;

  get esNuevo(): boolean {
    return this.id == null;
  }

  ngOnInit(): void {
    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.cargar(this.id);
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getCompraCategorias().subscribe({
      next: (data) => {
        const c = (data || []).find((x: any) => x.id === id);
        if (c) this.form.patchValue({ nombre: c.nombre ?? '', icono: c.icono ?? '', activo: c.activo !== false });
        this.loading = false;
      },
      error: () => {
        this.snack.open('No se pudo cargar', 'OK', { duration: 3000 });
        this.loading = false;
      },
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
    const payload = { nombre: v.nombre, icono: v.icono || null, activo: v.activo };
    const op$ = this.esNuevo ? this.repo.createCompraCategoria(payload) : this.repo.updateCompraCategoria(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Categoría guardada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
