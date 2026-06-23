import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
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
  filteredFuncionarios: any[] = [];
  funcionarioControl = new FormControl<any | string | null>(null);
  reglasEquipo: any[] = [];

  miembrosColumns = ['funcionario', 'porcentaje', 'acciones'];
  reglasColumns = ['regla', 'fechaDesde', 'acciones'];

  // Nueva asignación de miembro
  newMiembroFuncionario: any | null = null;
  newMiembroPorcentajeControl = new FormControl<number>(0, { nonNullable: true });

  // Nueva asignación de regla
  newReglaIdControl = new FormControl<number | null>(null);
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

    this.repo.getFuncionarios({}).subscribe({
      next: (f) => {
        this.funcionarios = f;
        this.filteredFuncionarios = this.funcionarios.slice(0, 50);
      },
    });
    this.funcionarioControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredFuncionarios = this.funcionarios
          .filter(f => this.funcionarioLabel(f).toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.newMiembroFuncionario && this.funcionarioLabel(this.newMiembroFuncionario).toUpperCase() !== filter) {
          this.newMiembroFuncionario = null;
        }
      } else {
        this.filteredFuncionarios = this.funcionarios.slice(0, 50);
      }
    });
    // Solo las reglas de tipo EQUIPO_PORCENTAJE pueden asignarse a un equipo
    // (es lo que valida el handler asignar-regla-equipo). Filtrar por esEquipo
    // dejaba el selector vacio cuando la regla no tenia ese flag seteado.
    this.repo.getReglasComision({ activo: true }).subscribe({
      next: (r) => this.reglasEquipo = (r || []).filter((reg: any) => reg.tipo === 'EQUIPO_PORCENTAJE'),
    });

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

  funcionarioLabel(f: any): string {
    if (!f) return '';
    return `${f.persona?.nombre || ''} ${f.persona?.apellido || ''}`.trim();
  }

  displayFuncionario = (f: any): string => (f && typeof f === 'object') ? this.funcionarioLabel(f) : '';

  onMiembroFuncionarioSelected(funcionario: any): void {
    this.newMiembroFuncionario = funcionario;
  }

  async agregarMiembro(): Promise<void> {
    if (!this.newMiembroFuncionario || !this.data.equipo?.id) {
      this.snackBar.open('Primero guarda el equipo', 'OK', { duration: 3000 });
      return;
    }
    try {
      await firstValueFrom(this.repo.agregarMiembroEquipo({
        equipoId: this.data.equipo.id,
        funcionarioId: this.newMiembroFuncionario.id,
        porcentajeReparto: this.newMiembroPorcentajeControl.value,
      }));
      this.newMiembroFuncionario = null;
      this.funcionarioControl.setValue('');
      this.newMiembroPorcentajeControl.setValue(0);
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
    const reglaId = this.newReglaIdControl.value;
    if (!reglaId || !this.data.equipo?.id) return;
    try {
      await firstValueFrom(this.repo.asignarReglaEquipo({
        equipoId: this.data.equipo.id,
        reglaId: reglaId,
        fechaDesde: this.newReglaFechaDesde?.toISOString().slice(0, 10),
      }));
      this.newReglaIdControl.setValue(null);
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
