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
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditMaquinaPosDialogComponent } from '../create-edit-maquina-pos/create-edit-maquina-pos-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';

@Component({
  selector: 'app-list-maquinas-pos',
  templateUrl: './list-maquinas-pos.component.html',
  styleUrls: ['./list-maquinas-pos.component.scss'],
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
    MatTooltipModule,
    HasPermissionDirective,
  ]
})
export class ListMaquinasPosComponent implements OnInit {
  maquinas: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'cuenta', 'proveedor', 'comision', 'minutos', 'activo', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void { this.loadData(); }
  setData(_d: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.maquinas = await firstValueFrom(this.repositoryService.getMaquinasPos());
    } catch (error) {
      console.error(error);
      this.snackBar.open('Error al cargar máquinas POS', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  crear(): void {
    const ref = this.dialog.open(CreateEditMaquinaPosDialogComponent, { width: '600px' });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  editar(m: any): void {
    const ref = this.dialog.open(CreateEditMaquinaPosDialogComponent, {
      width: '600px',
      data: { maquinaPosId: m.id },
    });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  async desactivar(m: any): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Desactivar', message: `¿Desactivar máquina "${m.nombre}"?` },
    });
    const ok = await firstValueFrom(dialogRef.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteMaquinaPos(m.id));
      this.snackBar.open('Máquina desactivada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al desactivar', 'Cerrar', { duration: 3000 });
    }
  }
}
