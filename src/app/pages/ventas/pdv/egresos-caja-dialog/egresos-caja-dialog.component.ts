import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { PermissionService } from 'src/app/services/permission.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

/**
 * Lista los egresos de caja (vales/compras pagados del cajón) de la caja abierta,
 * con opción de anular (revierte el vale/cuota y el descuento del cierre).
 */
@Component({
  selector: 'app-egresos-caja-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './egresos-caja-dialog.component.html',
  styleUrls: ['./egresos-caja-dialog.component.scss'],
})
export class EgresosCajaDialogComponent implements OnInit {
  cajaId = 0;
  cajaNombre = '';
  loading = true;
  egresos: any[] = [];
  puedeAnular = false;
  columnas = ['tipo', 'descripcion', 'monto', 'estado', 'acciones'];

  constructor(
    private repositoryService: RepositoryService,
    private permissionService: PermissionService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<EgresosCajaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';
    this.puedeAnular = this.permissionService.has('PDV_ANULAR_EGRESO');
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.egresos = await firstValueFrom(this.repositoryService.getEgresosCaja(this.cajaId, true)) || [];
    } catch (e) {
      console.error('Error cargando egresos:', e);
      this.snackBar.open('Error al cargar egresos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  anular(egreso: any): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'ANULAR EGRESO',
        message: `¿Anular el egreso de ${egreso.tipo} por ${egreso.moneda?.simbolo || ''} ${Number(egreso.monto).toLocaleString()}? Se revertirá el vale/cuota y el descuento del cierre.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await firstValueFrom(this.repositoryService.anularEgresoCaja(egreso.id, 'ANULADO DESDE PDV'));
        this.snackBar.open('Egreso anulado', 'Cerrar', { duration: 2500 });
        await this.cargar();
      } catch (e: any) {
        console.error('Error anulando egreso:', e);
        this.snackBar.open(e?.message || 'Error al anular el egreso', 'Cerrar', { duration: 4000 });
      }
    });
  }

  cerrar(): void {
    this.dialogRef?.close();
  }
}
