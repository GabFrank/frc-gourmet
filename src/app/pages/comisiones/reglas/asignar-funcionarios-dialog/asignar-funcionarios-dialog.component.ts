import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-asignar-funcionarios-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './asignar-funcionarios-dialog.component.html',
  styleUrls: ['./asignar-funcionarios-dialog.component.scss'],
})
export class AsignarFuncionariosDialogComponent implements OnInit {
  loading = false;
  funcionarios: any[] = [];
  filteredFuncionarios: any[] = [];
  funcionarioControl = new FormControl<any | string | null>(null);
  asignaciones: any[] = [];
  displayedColumns = ['funcionario', 'fechaDesde', 'fechaHasta', 'activo', 'acciones'];

  // Para nueva asignación
  selectedFuncionario: any | null = null;
  fechaDesde: Date = new Date();
  fechaHasta: Date | null = null;

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<AsignarFuncionariosDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { regla: any },
  ) {}

  ngOnInit(): void {
    this.cargarFuncionarios();
    this.cargarAsignaciones();
  }

  cargarFuncionarios(): void {
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
        if (this.selectedFuncionario && this.funcionarioLabel(this.selectedFuncionario).toUpperCase() !== filter) {
          this.selectedFuncionario = null;
        }
      } else {
        this.filteredFuncionarios = this.funcionarios.slice(0, 50);
      }
    });
  }

  funcionarioLabel(f: any): string {
    if (!f) return '';
    return `${f.persona?.nombre || ''} ${f.persona?.apellido || ''}`.trim();
  }

  displayFuncionario = (f: any): string => (f && typeof f === 'object') ? this.funcionarioLabel(f) : '';

  onFuncionarioSelected(funcionario: any): void {
    this.selectedFuncionario = funcionario;
  }

  cargarAsignaciones(): void {
    this.loading = true;
    this.repo.getFuncionariosRegla(this.data.regla.id).subscribe({
      next: (a) => { this.asignaciones = a; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  async asignar(): Promise<void> {
    if (!this.selectedFuncionario) return;
    try {
      await firstValueFrom(this.repo.asignarFuncionarioRegla({
        funcionarioId: this.selectedFuncionario.id,
        reglaId: this.data.regla.id,
        fechaDesde: this.fechaDesde?.toISOString().slice(0, 10),
        fechaHasta: this.fechaHasta?.toISOString().slice(0, 10),
      }));
      this.snackBar.open('Funcionario asignado', 'OK', { duration: 3000 });
      this.selectedFuncionario = null;
      this.funcionarioControl.setValue('');
      this.cargarAsignaciones();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  async desasignar(asig: any): Promise<void> {
    try {
      await firstValueFrom(this.repo.desasignarFuncionarioRegla(asig.id));
      this.snackBar.open('Asignación eliminada', 'OK', { duration: 3000 });
      this.cargarAsignaciones();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  cerrar(): void { this.dialogRef.close(); }
}
