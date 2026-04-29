import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-equipo-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTableModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './create-edit-equipo-dialog.component.html',
  styleUrls: ['./create-edit-equipo-dialog.component.scss'],
})
export class CreateEditEquipoDialogComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  isEdit = false;

  miembros: any[] = [];
  reglas: any[] = [];
  funcionarios: any[] = [];
  reglasEquipo: any[] = [];

  miembrosColumns = ['funcionario', 'porcentaje', 'acciones'];
  reglasColumns = ['regla', 'fechaDesde', 'acciones'];

  // Nueva asignación de miembro
  newMiembroFuncionarioId: number | null = null;
  newMiembroPorcentaje = 0;

  // Nueva asignación de regla
  newReglaId: number | null = null;
  newReglaFechaDesde: Date = new Date();

  // Suma porcentajes
  sumaPorcentajes = 0;

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<CreateEditEquipoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { equipo: any },
  ) {}

  ngOnInit(): void {
    this.isEdit = !!this.data.equipo;
    const eq = this.data.equipo;
    this.form = this.fb.group({
      nombre: [eq?.nombre || '', Validators.required],
      descripcion: [eq?.descripcion || ''],
      activo: [eq?.activo !== undefined ? eq.activo : true],
    });

    this.repo.getFuncionarios({}).subscribe({ next: (f) => this.funcionarios = f });
    this.repo.getReglasComision({ activo: true }).subscribe({ next: (r) => this.reglasEquipo = r.filter((reg: any) => reg.esEquipo) });

    if (this.isEdit && eq?.id) {
      this.cargarDetalleEquipo(eq.id);
    }
  }

  cargarDetalleEquipo(id: number): void {
    this.repo.getEquipoComision(id).subscribe({
      next: (eq) => {
        if (eq) {
          this.miembros = eq.miembros || [];
          this.reglas = eq.reglas || [];
          this.calcularSumaPorcentajes();
        }
      },
    });
  }

  calcularSumaPorcentajes(): void {
    this.sumaPorcentajes = this.miembros.reduce((s: number, m: any) => s + Number(m.porcentajeReparto), 0);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    try {
      const payload = this.form.value;
      if (this.isEdit) {
        await firstValueFrom(this.repo.updateEquipoComision(this.data.equipo.id, payload));
      } else {
        const created = await firstValueFrom(this.repo.createEquipoComision(payload));
        this.data.equipo = created;
        this.isEdit = true;
      }
      this.snackBar.open('Equipo guardado', 'OK', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  async agregarMiembro(): Promise<void> {
    if (!this.newMiembroFuncionarioId || !this.data.equipo?.id) {
      this.snackBar.open('Primero guarda el equipo', 'OK', { duration: 3000 });
      return;
    }
    try {
      await firstValueFrom(this.repo.agregarMiembroEquipo({
        equipoId: this.data.equipo.id,
        funcionarioId: this.newMiembroFuncionarioId,
        porcentajeReparto: this.newMiembroPorcentaje,
      }));
      this.newMiembroFuncionarioId = null;
      this.newMiembroPorcentaje = 0;
      this.cargarDetalleEquipo(this.data.equipo.id);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  async eliminarMiembro(miembro: any): Promise<void> {
    try {
      await firstValueFrom(this.repo.eliminarMiembroEquipo(miembro.id));
      this.cargarDetalleEquipo(this.data.equipo.id);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  async agregarRegla(): Promise<void> {
    if (!this.newReglaId || !this.data.equipo?.id) return;
    try {
      await firstValueFrom(this.repo.asignarReglaEquipo({
        equipoId: this.data.equipo.id,
        reglaId: this.newReglaId,
        fechaDesde: this.newReglaFechaDesde?.toISOString().slice(0, 10),
      }));
      this.newReglaId = null;
      this.cargarDetalleEquipo(this.data.equipo.id);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  async eliminarRegla(regla: any): Promise<void> {
    try {
      await firstValueFrom(this.repo.desasignarReglaEquipo(regla.id));
      this.cargarDetalleEquipo(this.data.equipo.id);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  cancelar(): void { this.dialogRef.close(this.isEdit); }
}
