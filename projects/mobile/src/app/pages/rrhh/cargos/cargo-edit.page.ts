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

/**
 * Alta/edición de Cargo (RRHH) — form full-screen mobile con toolbar propia.
 * Reactive Forms. Parte EJEMPLAR del patrón de formularios CRUD.
 */
@Component({
  selector: 'app-cargo-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './cargo-edit.page.html',
  styleUrls: ['./cargo-edit.page.scss'],
})
export class CargoEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    salarioReferencia: [null as number | null],
    activo: [true],
  });

  loading = false;
  saving = false;

  get esNuevo(): boolean {
    return this.id == null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam && idParam !== 'nuevo') {
      const parsed = Number(idParam);
      if (Number.isFinite(parsed)) {
        this.id = parsed;
        this.cargar(parsed);
      }
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getCargo(id).subscribe({
      next: (c) => {
        if (c) {
          this.form.patchValue({
            nombre: c.nombre ?? '',
            descripcion: c.descripcion ?? '',
            salarioReferencia: c.salarioReferencia ?? null,
            activo: c.activo !== false,
          });
        }
        this.loading = false;
      },
      error: () => {
        this.snack.open('No se pudo cargar el cargo', 'OK', { duration: 3000 });
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
    const payload = {
      nombre: v.nombre,
      descripcion: v.descripcion || null,
      salarioReferencia: v.salarioReferencia,
      activo: v.activo,
    };
    const op$ = this.esNuevo ? this.repo.createCargo(payload) : this.repo.updateCargo(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Cargo guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const msg = /PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso para guardar' : 'No se pudo guardar';
      this.snack.open(msg, 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
