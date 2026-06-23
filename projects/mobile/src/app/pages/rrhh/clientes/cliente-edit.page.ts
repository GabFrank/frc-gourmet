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

/** Alta/edición de Cliente. Doble FK-select: Persona (existente) + Tipo de cliente. */
@Component({
  selector: 'app-cliente-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './cliente-edit.page.html',
})
export class ClienteEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  personas: Opt[] = [];
  tiposCliente: Opt[] = [];

  readonly form = this.fb.nonNullable.group({
    personaId: [null as number | null, Validators.required],
    tipoClienteId: [null as number | null, Validators.required],
    ruc: [''],
    razon_social: [''],
    tributa: [false],
    credito: [false],
    limite_credito: [0 as number | null],
    activo: [true],
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
    this.repo.getTipoClientes().subscribe({
      next: (data) => (this.tiposCliente = (data || []).map((t: any) => ({ id: t.id, label: t.descripcion }))),
    });
    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.cargar(this.id);
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getCliente(id).subscribe({
      next: (c: any) => {
        if (c) {
          this.form.patchValue({
            personaId: c.persona?.id ?? null,
            tipoClienteId: c.tipo_cliente?.id ?? null,
            ruc: c.ruc ?? '',
            razon_social: c.razon_social ?? '',
            tributa: c.tributa === true,
            credito: c.credito === true,
            limite_credito: c.limite_credito ?? 0,
            activo: c.activo !== false,
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
      persona: { id: v.personaId },
      tipo_cliente: { id: v.tipoClienteId },
      ruc: v.ruc || null,
      razon_social: v.razon_social ? v.razon_social.toUpperCase() : null,
      tributa: v.tributa,
      credito: v.credito,
      limite_credito: v.limite_credito ?? 0,
      activo: v.activo,
    } as any;
    const op$ = this.esNuevo ? this.repo.createCliente(payload) : this.repo.updateCliente(this.id!, payload);
    try {
      await firstValueFrom(op$);
      this.snack.open('Cliente guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
