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
 * Alta / edición de Proveedor. UPPERCASE se aplica en el componente (el handler
 * no lo hace). Requiere PROVEEDORES_GESTIONAR.
 */
@Component({
  selector: 'app-proveedor-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './proveedor-edit.page.html',
})
export class ProveedorEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    razon_social: [''],
    ruc: [''],
    telefono: [''],
    direccion: [''],
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
    firstValueFrom(this.repo.getProveedor(id))
      .then((p: any) => {
        if (p) {
          this.form.patchValue({
            nombre: p.nombre ?? '',
            razon_social: p.razon_social ?? '',
            ruc: p.ruc ?? '',
            telefono: p.telefono ?? '',
            direccion: p.direccion ?? '',
            activo: p.activo !== false,
          });
        }
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudo cargar el proveedor', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  volver(): void {
    this.location.back();
  }

  private up(v: string): string | null {
    const t = (v || '').trim();
    return t ? t.toUpperCase() : null;
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload: any = {
      nombre: this.up(v.nombre),
      razon_social: this.up(v.razon_social),
      ruc: this.up(v.ruc),
      telefono: (v.telefono || '').trim() || null,
      direccion: this.up(v.direccion),
      activo: v.activo,
    };
    const op$ = this.esNuevo ? this.repo.createProveedor(payload) : this.repo.updateProveedor(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Proveedor guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo guardar', 'OK', { duration: 3500 });
      this.saving = false;
    }
  }
}
