import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditReglaDialogComponent } from '../create-edit-regla-dialog/create-edit-regla-dialog.component';
import { AsignarFuncionariosDialogComponent } from '../asignar-funcionarios-dialog/asignar-funcionarios-dialog.component';

@Component({
  selector: 'app-list-reglas-comision',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatChipsModule,
  ],
  templateUrl: './list-reglas-comision.component.html',
  styleUrls: ['./list-reglas-comision.component.scss'],
})
export class ListReglasComisionComponent implements OnInit {
  reglas: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'tipo', 'modoValidacion', 'esEquipo', 'activo', 'acciones'];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.repo.getReglasComision().subscribe({
      next: (data) => { this.reglas = data; this.loading = false; },
      error: (e) => { console.error(e); this.loading = false; },
    });
  }

  abrirCreate(): void {
    const ref = this.dialog.open(CreateEditReglaDialogComponent, { width: '800px', data: { regla: null } });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  abrirEdit(regla: any): void {
    const ref = this.dialog.open(CreateEditReglaDialogComponent, { width: '800px', data: { regla } });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  abrirAsignarFuncionarios(regla: any): void {
    this.dialog.open(AsignarFuncionariosDialogComponent, { width: '700px', data: { regla } });
  }

  async eliminar(regla: any): Promise<void> {
    const confirmRef = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar regla', message: `¿Eliminar la regla "${regla.nombre}"?` },
    });
    const ok = await firstValueFrom(confirmRef.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteReglaComision(regla.id));
      this.snackBar.open('Regla eliminada', 'OK', { duration: 3000 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 4000 });
    }
  }
}
