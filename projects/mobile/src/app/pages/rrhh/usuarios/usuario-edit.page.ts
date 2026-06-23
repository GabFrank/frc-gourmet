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

interface Opt {
  id: number;
  label: string;
}

/**
 * Alta/edición de Usuario. nickname/password NUNCA se uppercasean.
 * Password solo al crear (el cambio de contraseña es flujo aparte).
 * Roles: multi-select con diff (assignRoleToUsuario / removeRoleFromUsuario).
 */
@Component({
  selector: 'app-usuario-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './usuario-edit.page.html',
})
export class UsuarioEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;
  /** roleId -> usuarioRoleId, para el diff en edición. */
  private currentRoles = new Map<number, number>();

  personas: Opt[] = [];
  roles: Opt[] = [];

  readonly form = this.fb.nonNullable.group({
    nickname: ['', Validators.required],
    personaId: [null as number | null],
    password: [''],
    activo: [true],
    roleIds: [[] as number[]],
  });

  loading = false;
  saving = false;

  get esNuevo(): boolean {
    return this.id == null;
  }

  ngOnInit(): void {
    this.repo.getPersonas().subscribe({
      next: (data) =>
        (this.personas = (data || []).map((p: any) => ({ id: p.id, label: `${p.nombre} ${p.apellido || ''}`.trim() }))),
    });
    this.repo.getRoles().subscribe({
      next: (data) => (this.roles = (data || []).map((r: any) => ({ id: r.id, label: r.descripcion }))),
    });
    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.cargar(this.id);
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getUsuario(id).subscribe({
      next: (u: any) => {
        if (u) {
          this.form.patchValue({
            nickname: u.nickname ?? '',
            personaId: u.persona?.id ?? null,
            activo: u.activo !== false,
          });
        }
        this.repo.getUsuarioRoles(id).subscribe({
          next: (urs: any[]) => {
            this.currentRoles.clear();
            const ids: number[] = [];
            (urs || []).forEach((ur: any) => {
              const roleId = ur.role?.id;
              if (roleId != null) {
                this.currentRoles.set(roleId, ur.id);
                ids.push(roleId);
              }
            });
            this.form.patchValue({ roleIds: ids });
            this.loading = false;
          },
          error: () => (this.loading = false),
        });
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
    const v = this.form.getRawValue();
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.esNuevo && !v.password) {
      this.snack.open('La contraseña es obligatoria al crear', 'OK', { duration: 3000 });
      return;
    }
    this.saving = true;
    try {
      const selected = v.roleIds || [];
      if (this.esNuevo) {
        const res: any = await firstValueFrom(
          this.repo.createUsuario({ nickname: v.nickname, persona_id: v.personaId, password: v.password, activo: v.activo } as any),
        );
        if (res?.success === false) throw new Error(res.message || 'No se pudo crear');
        const newId = res?.id;
        if (newId) {
          await Promise.all(selected.map((r) => firstValueFrom(this.repo.assignRoleToUsuario(newId, r))));
        }
      } else {
        await firstValueFrom(
          this.repo.updateUsuario(this.id!, { nickname: v.nickname, persona_id: v.personaId, activo: v.activo } as any),
        );
        const added = selected.filter((r) => !this.currentRoles.has(r));
        const removed = [...this.currentRoles.entries()].filter(([roleId]) => !selected.includes(roleId));
        await Promise.all([
          ...added.map((r) => firstValueFrom(this.repo.assignRoleToUsuario(this.id!, r))),
          ...removed.map(([, usuarioRoleId]) => firstValueFrom(this.repo.removeRoleFromUsuario(usuarioRoleId))),
        ]);
      }
      this.snack.open('Usuario guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const msg = (e as Error)?.message || '';
      this.snack.open(/PERMISO/.test(msg) ? 'Sin permiso' : msg || 'No se pudo guardar', 'OK', { duration: 3500 });
      this.saving = false;
    }
  }
}
