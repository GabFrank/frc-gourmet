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
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditEquipoDialogComponent } from '../create-edit-equipo-dialog/create-edit-equipo-dialog.component';

@Component({
  selector: 'app-list-equipos-comision',
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
  ],
  templateUrl: './list-equipos-comision.component.html',
  styleUrls: ['./list-equipos-comision.component.scss'],
})
export class ListEquiposComisionComponent implements OnInit {
  equipos: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'descripcion', 'activo', 'acciones'];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.loading = true;
    this.repo.getEquiposComision().subscribe({
      next: (d) => { this.equipos = d; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  abrirCreate(): void {
    const ref = this.dialog.open(CreateEditEquipoDialogComponent, { width: '700px', data: { equipo: null } });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  abrirEdit(equipo: any): void {
    const ref = this.dialog.open(CreateEditEquipoDialogComponent, { width: '700px', data: { equipo } });
    ref.afterClosed().subscribe((r) => { if (r) this.cargar(); });
  }

  async eliminar(equipo: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar equipo', message: `¿Eliminar el equipo "${equipo.nombre}"?` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteEquipoComision(equipo.id));
      this.snackBar.open('Equipo eliminado', 'OK', { duration: 3000 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 4000 });
    }
  }
}
