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

interface FamiliaOpt {
  id: number;
  nombre: string;
}

/** Alta/edición de Subfamilia (Productos). Patrón FK-select hacia Familia. */
@Component({
  selector: 'app-subfamilia-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './subfamilia-edit.page.html',
})
export class SubfamiliaEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    familiaId: [null as number | null, Validators.required],
    activo: [true],
  });

  familias: FamiliaOpt[] = [];
  loading = false;
  saving = false;

  get esNuevo(): boolean {
    return this.id == null;
  }

  ngOnInit(): void {
    this.repo.getFamilias().subscribe({
      next: (data) => (this.familias = (data || []) as FamiliaOpt[]),
    });
    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.cargar(this.id);
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getSubfamilia(id).subscribe({
      next: (s) => {
        if (s) {
          this.form.patchValue({
            nombre: s.nombre ?? '',
            familiaId: s.familia?.id ?? null,
            activo: s.activo !== false,
          });
        }
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
    const payload = { nombre: v.nombre.toUpperCase(), familiaId: v.familiaId, activo: v.activo };
    const op$ = this.esNuevo ? this.repo.createSubfamilia(payload) : this.repo.updateSubfamilia(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Subfamilia guardada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
