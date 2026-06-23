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

/** Alta/edición de Persona (RRHH). El handler NO uppercasea → nombre/apellido/dirección en componente. */
@Component({
  selector: 'app-persona-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './persona-edit.page.html',
})
export class PersonaEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly tiposPersona = ['FISICA', 'JURIDICA'];
  readonly tiposDocumento = ['CI', 'RUC', 'CPF', 'PASAPORTE'];

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: [''],
    tipoPersona: ['FISICA', Validators.required],
    tipoDocumento: ['CI', Validators.required],
    documento: [''],
    telefono: [''],
    email: [''],
    direccion: [''],
    fechaNacimiento: [''],
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
    this.repo.getPersona(id).subscribe({
      next: (p) => {
        if (p) {
          this.form.patchValue({
            nombre: p.nombre ?? '',
            apellido: p.apellido ?? '',
            tipoPersona: p.tipoPersona ?? 'FISICA',
            tipoDocumento: p.tipoDocumento ?? 'CI',
            documento: p.documento ?? '',
            telefono: p.telefono ?? '',
            email: p.email ?? '',
            direccion: p.direccion ?? '',
            fechaNacimiento: p.fechaNacimiento ? String(p.fechaNacimiento).slice(0, 10) : '',
            activo: p.activo !== false,
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
      nombre: v.nombre.toUpperCase(),
      apellido: v.apellido ? v.apellido.toUpperCase() : null,
      tipoPersona: v.tipoPersona,
      tipoDocumento: v.tipoDocumento,
      documento: v.documento || null,
      telefono: v.telefono || null,
      email: v.email || null,
      direccion: v.direccion ? v.direccion.toUpperCase() : null,
      fechaNacimiento: v.fechaNacimiento || null,
      activo: v.activo,
    };
    const data = payload as any;
    const op$ = this.esNuevo ? this.repo.createPersona(data) : this.repo.updatePersona(this.id!, data);
    try {
      await firstValueFrom(op$);
      this.snack.open('Persona guardada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
