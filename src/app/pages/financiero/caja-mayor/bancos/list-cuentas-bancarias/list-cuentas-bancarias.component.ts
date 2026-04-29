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
import { CreateEditCuentaBancariaDialogComponent } from '../create-edit-cuenta-bancaria/create-edit-cuenta-bancaria-dialog.component';
import { MovimientosCuentaBancariaDialogComponent } from '../movimientos-cuenta-bancaria-dialog/movimientos-cuenta-bancaria-dialog.component';

@Component({
  selector: 'app-list-cuentas-bancarias',
  templateUrl: './list-cuentas-bancarias.component.html',
  styleUrls: ['./list-cuentas-bancarias.component.scss'],
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
  ]
})
export class ListCuentasBancariasComponent implements OnInit {
  cuentas: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'banco', 'numeroCuenta', 'tipoCuenta', 'moneda', 'saldo', 'saldoReservado', 'activo', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    // Lazy-on-access: procesar acreditaciones pendientes vencidas antes de
    // mostrar saldos bancarios — asi el saldo refleja todo lo ya acreditable.
    firstValueFrom(this.repositoryService.procesarAcreditacionesAuto())
      .catch(e => console.error('Error en procesar auto on open:', e))
      .finally(() => this.loadData());
  }

  setData(_data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.cuentas = await firstValueFrom(this.repositoryService.getCuentasBancarias());
    } catch (error) {
      console.error('Error loading cuentas bancarias:', error);
      this.snackBar.open('Error al cargar cuentas bancarias', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  crear(): void {
    const dialogRef = this.dialog.open(CreateEditCuentaBancariaDialogComponent, { width: '600px' });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadData(); });
  }

  verHistorico(cuenta: any): void {
    const ref = this.dialog.open(MovimientosCuentaBancariaDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      data: { cuentaBancaria: cuenta },
    });
    ref.afterClosed().subscribe(() => this.loadData());
  }

  editar(cuenta: any): void {
    const dialogRef = this.dialog.open(CreateEditCuentaBancariaDialogComponent, {
      width: '600px',
      data: { cuentaBancariaId: cuenta.id },
    });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadData(); });
  }

  async desactivar(cuenta: any): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Desactivar Cuenta', message: `¿Desactivar cuenta "${cuenta.nombre}"?` },
    });
    const ok = await firstValueFrom(dialogRef.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteCuentaBancaria(cuenta.id));
      this.snackBar.open('Cuenta desactivada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Error desactivando cuenta:', error);
      this.snackBar.open('Error al desactivar cuenta', 'Cerrar', { duration: 3000 });
    }
  }
}
