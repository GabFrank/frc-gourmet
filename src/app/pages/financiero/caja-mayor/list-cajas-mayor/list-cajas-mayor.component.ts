import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditCajaMayorDialogComponent } from '../create-edit-caja-mayor/create-edit-caja-mayor-dialog.component';
import { CajaMayorDetalleComponent } from '../caja-mayor-detalle/caja-mayor-detalle.component';
import { CrearAccesoDirectoDialogComponent } from 'src/app/shared/components/crear-acceso-directo-dialog/crear-acceso-directo-dialog.component';

@Component({
  selector: 'app-list-cajas-mayor',
  templateUrl: './list-cajas-mayor.component.html',
  styleUrls: ['./list-cajas-mayor.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    DatePipe,
  ]
})
export class ListCajasMayorComponent implements OnInit {
  cajasMayor: any[] = [];
  loading = false;
  displayedColumns = ['id', 'nombre', 'estado', 'fechaApertura', 'fechaCierre', 'responsable', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  setData(data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.cajasMayor = await firstValueFrom(this.repositoryService.getCajasMayor());
    } catch (error) {
      console.error('Error loading cajas mayor:', error);
      this.snackBar.open('Error al cargar cajas mayor', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditCajaMayorDialogComponent, {
      width: '500px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      }
    });
  }

  verDetalle(cajaMayor: any): void {
    this.tabsService.openTab('Caja Mayor: ' + cajaMayor.nombre, CajaMayorDetalleComponent, { cajaMayor });
  }

  crearAccesoDirecto(cajaMayor: any, dashboardKey: string): void {
    this.dialog.open(CrearAccesoDirectoDialogComponent, {
      width: '550px',
      data: {
        dashboardsDisponibles: [{ key: dashboardKey, label: this.dashboardLabel(dashboardKey) }],
        tituloSugerido: cajaMayor.nombre,
        iconoSugerido: 'account_balance',
        colorSugerido: '#1b5e20',
        targetType: 'CAJA_MAYOR_DETALLE',
        targetData: { cajaMayorId: cajaMayor.id },
      },
    });
  }

  private dashboardLabel(key: string): string {
    switch (key) {
      case 'HOME': return 'Inicio';
      case 'FINANCIERO': return 'Dashboard Financiero';
      case 'VENTAS': return 'Dashboard de Ventas';
      case 'COMPRAS': return 'Dashboard de Compras';
      case 'CAJA_MAYOR': return 'Dashboard de Caja Mayor';
      default: return key;
    }
  }

  async cerrarCaja(cajaMayor: any): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cerrar Caja Mayor',
        message: '¿Esta seguro que desea cerrar la caja mayor "' + cajaMayor.nombre + '"?',
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await firstValueFrom(this.repositoryService.updateCajaMayor(cajaMayor.id, { estado: 'CERRADA', fechaCierre: new Date() }));
        this.snackBar.open('Caja mayor cerrada correctamente', 'Cerrar', { duration: 3000 });
        this.loadData();
      } catch (error) {
        console.error('Error closing caja mayor:', error);
        this.snackBar.open('Error al cerrar caja mayor', 'Cerrar', { duration: 3000 });
      }
    }
  }
}
