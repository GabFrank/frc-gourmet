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

/** Alta/edición de Turno (RRHH). */
@Component({
  selector: 'app-turno-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './turno-edit.page.html',
})
export class TurnoEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    horaEntrada: ['08:00', Validators.required],
    horaSalida: ['17:00', Validators.required],
    toleranciaTardanzaMinutos: [5],
    descripcion: [''],
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
    this.repo.getTurno(id).subscribe({
      next: (t) => {
        if (t) {
          this.form.patchValue({
            nombre: t.nombre ?? '',
            horaEntrada: t.horaEntrada ?? '08:00',
            horaSalida: t.horaSalida ?? '17:00',
            toleranciaTardanzaMinutos: t.toleranciaTardanzaMinutos ?? 5,
            descripcion: t.descripcion ?? '',
            activo: t.activo !== false,
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
    const payload = {
      nombre: v.nombre,
      horaEntrada: v.horaEntrada,
      horaSalida: v.horaSalida,
      toleranciaTardanzaMinutos: v.toleranciaTardanzaMinutos,
      descripcion: v.descripcion || null,
      activo: v.activo,
    };
    const op$ = this.esNuevo ? this.repo.createTurno(payload) : this.repo.updateTurno(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Turno guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
