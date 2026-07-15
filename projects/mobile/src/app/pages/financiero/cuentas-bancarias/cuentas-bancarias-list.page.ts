import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../core/components/confirm-dialog.component';

interface CuentaVM {
  id: number;
  nombre: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  simbolo: string;
  decimales: number;
  saldo: number;
  activo: boolean;
}

/**
 * Lista de Cuentas Bancarias (Financiero). Tarjetas con banco/tipo/saldo, filtro
 * por nombre o banco, y acciones (editar, ver movimientos, desactivar). Las
 * mutaciones requieren BANCOS_GESTIONAR.
 */
@Component({
  selector: 'app-cuentas-bancarias-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './cuentas-bancarias-list.page.html',
})
export class CuentasBancariasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todas: CuentaVM[] = [];
  items: CuentaVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('BANCOS_GESTIONAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getCuentasBancarias().subscribe({
      next: (data: any[]) => {
        this.todas = (data || []).map((c) => ({
          id: c.id,
          nombre: c.nombre || `Cuenta #${c.id}`,
          banco: c.banco || '',
          tipoCuenta: c.tipoCuenta || '',
          numeroCuenta: c.numeroCuenta || '',
          simbolo: c.moneda?.simbolo || '',
          decimales: c.moneda?.decimales ?? 0,
          saldo: Number(c.saldo) || 0,
          activo: c.activo !== false,
        }));
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cuentas bancarias';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todas.filter((c) => c.nombre.toLowerCase().includes(q) || c.banco.toLowerCase().includes(q))
      : [...this.todas];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  async desactivar(c: CuentaVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Desactivar cuenta',
      message: `¿Desactivar la cuenta "${c.nombre}"? Dejará de estar disponible como destino.`,
      confirmText: 'Desactivar',
      danger: true,
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, width: '340px' }).afterClosed());
    if (!ok) return;
    this.repo.deleteCuentaBancaria(c.id).subscribe({
      next: () => {
        this.snack.open('Cuenta desactivada', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => this.snack.open(/PERMISO/.test(String(e?.message)) ? 'Sin permiso' : 'No se pudo desactivar', 'OK', { duration: 3000 }),
    });
  }
}
