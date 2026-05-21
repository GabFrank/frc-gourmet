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

/** Alta/edición de Tipo de cliente. El handler NO uppercasea → descripción en componente. */
@Component({
  selector: 'app-tipo-cliente-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './tipo-cliente-edit.page.html',
})
export class TipoClienteEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    descripcion: ['', Validators.required],
    credito: [false],
    descuento: [false],
    porcentaje_descuento: [0 as number | null],
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
    this.repo.getTipoCliente(id).subscribe({
      next: (t: any) => {
        if (t) {
          this.form.patchValue({
            descripcion: t.descripcion ?? '',
            credito: t.credito === true,
            descuento: t.descuento === true,
            porcentaje_descuento: t.porcentaje_descuento ?? 0,
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
      descripcion: v.descripcion.toUpperCase(),
      credito: v.credito,
      descuento: v.descuento,
      porcentaje_descuento: v.porcentaje_descuento ?? 0,
      activo: v.activo,
    } as any;
    const op$ = this.esNuevo ? this.repo.createTipoCliente(payload) : this.repo.updateTipoCliente(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Tipo de cliente guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
