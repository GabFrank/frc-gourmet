import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
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
    MatDialogModule,
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
  asignaciones: any[] = [];
  displayedColumns = ['funcionario', 'fechaDesde', 'fechaHasta', 'activo', 'acciones'];

  // Para nueva asignación
  selectedFuncionarioId: number | null = null;
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
    this.repo.getFuncionarios({}).subscribe({ next: (f) => this.funcionarios = f });
  }

  cargarAsignaciones(): void {
    this.loading = true;
    this.repo.getFuncionariosRegla(this.data.regla.id).subscribe({
      next: (a) => { this.asignaciones = a; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  async asignar(): Promise<void> {
    if (!this.selectedFuncionarioId) return;
    try {
      await firstValueFrom(this.repo.asignarFuncionarioRegla({
        funcionarioId: this.selectedFuncionarioId,
        reglaId: this.data.regla.id,
        fechaDesde: this.fechaDesde?.toISOString().slice(0, 10),
        fechaHasta: this.fechaHasta?.toISOString().slice(0, 10),
      }));
      this.snackBar.open('Funcionario asignado', 'OK', { duration: 3000 });
      this.selectedFuncionarioId = null;
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
