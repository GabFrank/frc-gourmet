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
 * Alta/edición de Funcionario. En CREAR se eligen Persona/Cargo/Moneda/fecha/salario
 * (el handler crea HistoricoCargo+HistoricoSalario atómicamente). En EDITAR esos
 * campos son inmutables (cambios de cargo/salario van por flujos aparte) → se
 * muestran deshabilitados y solo se envían los campos mutables.
 */
@Component({
  selector: 'app-funcionario-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './funcionario-edit.page.html',
})
export class FuncionarioEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  private id: number | null = null;

  personas: Opt[] = [];
  cargos: Opt[] = [];
  monedas: Opt[] = [];

  readonly form = this.fb.nonNullable.group({
    personaId: [null as number | null, Validators.required],
    cargoId: [null as number | null, Validators.required],
    monedaSalarioId: [null as number | null, Validators.required],
    fechaIngreso: ['', Validators.required],
    salarioBase: [0 as number | null, Validators.required],
    codigoInterno: [''],
    esJornalero: [false],
    valorJornal: [0 as number | null],
    observacion: [''],
    activo: [true],
  });

  loading = false;
  saving = false;

  get esNuevo(): boolean {
    return this.id == null;
  }

  ngOnInit(): void {
    this.repo.getPersonas().subscribe({
      next: (d) => (this.personas = (d || []).map((p: any) => ({ id: p.id, label: `${p.nombre} ${p.apellido || ''}`.trim() }))),
    });
    this.repo.getCargos().subscribe({
      next: (d) => (this.cargos = (d || []).map((c: any) => ({ id: c.id, label: c.nombre }))),
    });
    this.repo.getMonedas().subscribe({
      next: (d) => {
        this.monedas = (d || []).map((m: any) => ({ id: m.id, label: m.denominacion }));
        if (this.esNuevo && !this.form.controls.monedaSalarioId.value) {
          const principal = (d || []).find((m: any) => m.principal);
          if (principal) this.form.patchValue({ monedaSalarioId: principal.id });
        }
      },
    });

    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.cargar(this.id);
    }
  }

  private cargar(id: number): void {
    this.loading = true;
    this.repo.getFuncionario(id).subscribe({
      next: (f: any) => {
        if (f) {
          this.form.patchValue({
            personaId: f.persona?.id ?? null,
            cargoId: f.cargo?.id ?? null,
            monedaSalarioId: f.monedaSalario?.id ?? null,
            fechaIngreso: f.fechaIngreso ? String(f.fechaIngreso).slice(0, 10) : '',
            salarioBase: f.salarioBase ?? 0,
            codigoInterno: f.codigoInterno ?? '',
            esJornalero: f.esJornalero === true,
            valorJornal: f.valorJornal ?? 0,
            observacion: f.observacion ?? '',
            activo: f.activo !== false,
          });
        }
        // Campos inmutables vía update-funcionario.
        ['personaId', 'cargoId', 'monedaSalarioId', 'fechaIngreso', 'salarioBase'].forEach((k) =>
          this.form.get(k)?.disable(),
        );
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
    try {
      if (this.esNuevo) {
        await firstValueFrom(
          this.repo.createFuncionario({
            personaId: v.personaId,
            cargoId: v.cargoId,
            monedaSalarioId: v.monedaSalarioId,
            fechaIngreso: v.fechaIngreso,
            salarioBase: v.salarioBase,
            codigoInterno: v.codigoInterno || null,
            esJornalero: v.esJornalero,
            valorJornal: v.valorJornal ?? 0,
            observacion: v.observacion || null,
            activo: v.activo,
          }),
        );
      } else {
        await firstValueFrom(
          this.repo.updateFuncionario(this.id!, {
            codigoInterno: v.codigoInterno || null,
            esJornalero: v.esJornalero,
            valorJornal: v.valorJornal ?? 0,
            observacion: v.observacion || null,
            activo: v.activo,
          }),
        );
      }
      this.snack.open('Funcionario guardado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      const msg = (e as Error)?.message || '';
      this.snack.open(/PERMISO/.test(msg) ? 'Sin permiso' : msg || 'No se pudo guardar', 'OK', { duration: 3500 });
      this.saving = false;
    }
  }
}
