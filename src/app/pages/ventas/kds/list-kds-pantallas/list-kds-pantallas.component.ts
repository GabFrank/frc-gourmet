import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditKdsPantallaDialogComponent } from '../create-edit-kds-pantalla-dialog/create-edit-kds-pantalla-dialog.component';

@Component({
  selector: 'app-list-kds-pantallas',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-kds-pantallas.component.html',
  styleUrls: ['./list-kds-pantallas.component.scss'],
})
export class ListKdsPantallasComponent implements OnInit {
  pantallas: any[] = [];
  sectores: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'sectores', 'umbrales', 'activo', 'acciones'];

  constructor(
    private repo: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.sectores = (await firstValueFrom(this.repo.getSectoresActivos())) || [];
    } catch { this.sectores = []; }
    await this.cargar();
  }

  setData(_d: any): void { /* hook tab */ }

  async cargar(): Promise<void> {
    const api: any = (window as any).api;
    if (!api?.callIpc) return;
    this.loading = true;
    try {
      const rows: any[] = (await api.callIpc('get-kds-pantallas')) || [];
      const mapSector = new Map<number, string>(this.sectores.map(s => [s.id, (s.nombre || '').toUpperCase()]));
      this.pantallas = rows.map(p => {
        let ids: number[] = [];
        try { ids = p.sectores ? JSON.parse(p.sectores) : []; } catch { ids = []; }
        const nombres = ids.map(id => mapSector.get(id) || `#${id}`);
        return { ...p, sectoresResumen: nombres.length ? nombres.join(', ') : 'Todos' };
      });
    } catch (e: any) {
      this.snackBar.open('No se pudieron cargar las pantallas', 'CERRAR', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  nueva(): void { this.abrirDialog(null); }
  editar(p: any): void { this.abrirDialog(p); }

  private abrirDialog(pantalla: any | null): void {
    const ref = this.dialog.open(CreateEditKdsPantallaDialogComponent, {
      width: '520px',
      data: { pantalla, sectores: this.sectores.map(s => ({ id: s.id, nombre: (s.nombre || '').toUpperCase() })) },
    });
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      const api: any = (window as any).api;
      try {
        if (pantalla?.id) await api.callIpc('update-kds-pantalla', pantalla.id, result);
        else await api.callIpc('create-kds-pantalla', result);
        this.snackBar.open('Pantalla guardada', 'CERRAR', { duration: 2500 });
        this.cargar();
      } catch (e: any) {
        this.snackBar.open(this.extraerError(e), 'CERRAR', { duration: 6000, panelClass: 'error-snackbar' });
      }
    });
  }

  async eliminar(p: any): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: { title: 'Eliminar pantalla', message: `¿Eliminar la pantalla "${p.nombre}"?` },
      }).afterClosed()
    );
    if (!ok) return;
    const api: any = (window as any).api;
    try {
      await api.callIpc('delete-kds-pantalla', p.id);
      this.snackBar.open('Pantalla eliminada', 'CERRAR', { duration: 2500 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'CERRAR', { duration: 6000, panelClass: 'error-snackbar' });
    }
  }

  private extraerError(e: any): string {
    const msg = e?.message || String(e);
    return msg.replace(/^Error invoking remote method '[^']+': Error: /, '');
  }
}
