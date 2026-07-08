import { Component, OnInit, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface DispositivoVM {
  id: number;
  nombre: string;
}

/**
 * Abre una caja reutilizando el Conteo de un EGRESO_CAJA_INICIAL como conteo de
 * apertura. Solo pide el dispositivo (de caja, sin caja abierta).
 */
@Component({
  selector: 'app-abrir-caja-desde-conteo-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './abrir-caja-desde-conteo-dialog.component.html',
  styleUrls: ['./abrir-caja-desde-conteo-dialog.component.scss'],
})
export class AbrirCajaDesdeConteoDialogComponent implements OnInit {
  conteoId = 0;
  dispositivoId: number | null = null;
  dispositivos: DispositivoVM[] = [];

  loading = true;
  saving = false;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<AbrirCajaDesdeConteoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.conteoId = this.data?.conteoId || 0;
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [dispositivos, cajas] = await Promise.all([
        firstValueFrom(this.repositoryService.getDispositivos()),
        firstValueFrom(this.repositoryService.getCajas()),
      ]);
      const conDispositivoAbierto = new Set<number>(
        (cajas || [])
          .filter((c: any) => c.estado === 'ABIERTO')
          .map((c: any) => c.dispositivo?.id)
          .filter((id: any) => id != null),
      );
      this.dispositivos = (dispositivos || [])
        .filter((d: any) => d.activo && d.isCaja && !conDispositivoAbierto.has(d.id))
        .map((d: any) => ({ id: d.id, nombre: d.nombre }));
      if (this.dispositivos.length === 1) {
        this.dispositivoId = this.dispositivos[0].id;
      }
    } catch (error) {
      console.error('Error cargando dispositivos:', error);
      this.snackBar.open('Error al cargar dispositivos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.dispositivoId) {
      this.snackBar.open('Seleccione un dispositivo', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    try {
      const caja: any = await firstValueFrom(
        this.repositoryService.abrirCajaDesdeConteo(this.conteoId, this.dispositivoId),
      );
      this.snackBar.open(`Caja #${caja?.id} abierta correctamente`, 'Cerrar', { duration: 3000 });
      this.dialogRef?.close({ success: true, caja });
    } catch (error: any) {
      console.error('Error abriendo caja desde conteo:', error);
      const msg = (error?.message || '').match(/Error:\s*([^]*)$/)?.[1]?.trim() || 'Error al abrir la caja';
      this.snackBar.open(msg, 'Cerrar', { duration: 6000, panelClass: ['error-snackbar'] });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.dialogRef?.close();
  }
}
