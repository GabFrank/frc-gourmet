import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { VacacionDetalleDialogComponent } from './vacacion-detalle-dialog/vacacion-detalle-dialog.component';

@Component({
  selector: 'app-list-vacaciones',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-vacaciones.component.html',
  styleUrls: ['./list-vacaciones.component.scss'],
})
export class ListVacacionesComponent implements OnInit {
  displayedColumns = ['anio', 'corte', 'generados', 'gozados', 'vendidos', 'disponibles', 'estado', 'acciones'];
  funcionarioControl = new FormControl<any | string | null>(null);
  funcionarios: any[] = [];
  filteredFuncionarios: any[] = [];
  funcionarioSel: any = null;

  vacaciones: any[] = [];
  loading = false;
  generando = false;

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.funcionarios = (await firstValueFrom(this.repo.getFuncionarios({ soloActivos: true }))) || [];
      this.filteredFuncionarios = this.funcionarios.slice(0, 50);
    } catch {
      this.snackBar.open('Error al cargar funcionarios', 'Cerrar', { duration: 4000 });
    }
    this.funcionarioControl.valueChanges.subscribe((v) => {
      if (typeof v === 'string') {
        const f = v.toUpperCase();
        this.filteredFuncionarios = this.funcionarios
          .filter((x) => this.nombreFunc(x).toUpperCase().includes(f))
          .slice(0, 50);
      } else {
        this.filteredFuncionarios = this.funcionarios.slice(0, 50);
      }
    });
  }

  nombreFunc(f: any): string {
    return [f?.persona?.nombre, f?.persona?.apellido].filter(Boolean).join(' ') || `FUNCIONARIO #${f?.id}`;
  }

  displayFunc = (f: any): string => (f && typeof f === 'object') ? this.nombreFunc(f) : '';

  onFuncionarioSel(f: any): void {
    this.funcionarioSel = f;
    this.cargar();
  }

  async cargar(): Promise<void> {
    if (!this.funcionarioSel?.id) return;
    this.loading = true;
    try {
      this.vacaciones = (await firstValueFrom(this.repo.getVacaciones({ funcionarioId: this.funcionarioSel.id }))) || [];
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  async generar(): Promise<void> {
    if (!this.funcionarioSel?.id) return;
    this.generando = true;
    try {
      await firstValueFrom(this.repo.generarVacacionesFuncionario(this.funcionarioSel.id));
      this.snackBar.open('Vacaciones generadas/actualizadas', 'Cerrar', { duration: 2500 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.generando = false;
    }
  }

  gestionar(vac: any): void {
    const ref = this.dialog.open(VacacionDetalleDialogComponent, {
      data: { vacacionId: vac.id },
      width: '860px',
      maxWidth: '96vw',
      disableClose: true,
    });
    ref.afterClosed().subscribe((r) => { if (r?.changed) this.cargar(); });
  }
}
