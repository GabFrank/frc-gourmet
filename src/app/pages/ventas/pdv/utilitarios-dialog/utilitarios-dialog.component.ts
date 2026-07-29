import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CreateRetiroCajaDialogComponent } from 'src/app/pages/financiero/caja-mayor/retiros/create-retiro-caja-dialog/create-retiro-caja-dialog.component';
import { UltimasVentasDialogComponent } from '../ultimas-ventas-dialog/ultimas-ventas-dialog.component';
import { CreateGastoCajaDialogComponent } from '../gasto-caja-dialog/gasto-caja-dialog.component';
import { PagarValeCajaDialogComponent } from '../pagar-vale-caja-dialog/pagar-vale-caja-dialog.component';
import { PagarCompraCajaDialogComponent } from '../pagar-compra-caja-dialog/pagar-compra-caja-dialog.component';
import { EgresosCajaDialogComponent } from '../egresos-caja-dialog/egresos-caja-dialog.component';
import { PermissionService } from 'src/app/services/permission.service';

interface UtilitarioOption {
  key: string;
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  disabled?: boolean;
  permiso?: string;
  permisoAny?: string[];
}

@Component({
  selector: 'app-utilitarios-dialog',
  templateUrl: './utilitarios-dialog.component.html',
  styleUrls: ['./utilitarios-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
  ]
})
export class UtilitariosDialogComponent implements OnInit {
  cajaId: number = 0;
  cajaNombre: string = '';

  opciones: UtilitarioOption[] = [
    {
      key: 'RETIRO',
      titulo: 'Retiro de Caja',
      descripcion: 'Registrar retiro de efectivo de la caja de venta',
      icono: 'output',
      color: '#e65100',
      // El retiro crea un movimiento en Caja Mayor (backend exige
      // CAJA_MAYOR_OPERAR); ocultamos la tarjeta a roles sin ese permiso
      // para no mostrar una acción que fallará al guardar.
      permiso: 'CAJA_MAYOR_OPERAR',
    },
    {
      key: 'GASTOS',
      titulo: 'Gastos',
      descripcion: 'Registrar un gasto pagado con el efectivo de la caja de venta',
      icono: 'receipt_long',
      color: '#c62828',
    },
    {
      key: 'VALE',
      titulo: 'Vale',
      descripcion: 'Crear o pagar un vale de funcionario con el efectivo de la caja',
      icono: 'badge',
      color: '#2e7d32',
      permiso: 'PDV_PAGAR_VALE',
    },
    {
      key: 'COMPRA',
      titulo: 'Compra',
      descripcion: 'Crear o pagar una compra con el efectivo de la caja',
      icono: 'shopping_bag',
      color: '#00838f',
      permiso: 'PDV_PAGAR_COMPRA',
    },
    {
      key: 'EGRESOS',
      titulo: 'Egresos de caja',
      descripcion: 'Ver y anular vales/compras pagados desde el cajón',
      icono: 'list_alt',
      color: '#5c6bc0',
      permisoAny: ['PDV_PAGAR_VALE', 'PDV_PAGAR_COMPRA', 'PDV_ANULAR_EGRESO'],
    },
    {
      key: 'ULTIMAS_VENTAS',
      titulo: 'Ultimas Ventas',
      descripcion: 'Ver las últimas ventas de esta caja',
      icono: 'history',
      color: '#1565c0',
    },
    {
      key: 'CIERRE_PARCIAL',
      titulo: 'Cierre Parcial',
      descripcion: 'Proximamente',
      icono: 'fact_check',
      color: '#9e9e9e',
      disabled: true,
    },
  ];

  opcionesVisibles: UtilitarioOption[] = [];

  constructor(
    private dialog: MatDialog,
    private permissionService: PermissionService,
    @Optional() public dialogRef: MatDialogRef<UtilitariosDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';
    // Oculta las tarjetas gated cuyo permiso el usuario no tiene.
    this.opcionesVisibles = this.opciones.filter(o => {
      if (o.permiso && !this.permissionService.has(o.permiso)) return false;
      if (o.permisoAny && !o.permisoAny.some(p => this.permissionService.has(p))) return false;
      return true;
    });
  }

  seleccionar(opt: UtilitarioOption): void {
    if (opt.disabled) return;

    if (opt.key === 'RETIRO') {
      this.dialogRef?.close();
      this.dialog.open(CreateRetiroCajaDialogComponent, {
        width: '700px',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    } else if (opt.key === 'GASTOS') {
      this.dialogRef?.close();
      this.dialog.open(CreateGastoCajaDialogComponent, {
        width: '560px',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    } else if (opt.key === 'ULTIMAS_VENTAS') {
      this.dialogRef?.close();
      this.dialog.open(UltimasVentasDialogComponent, {
        width: '560px',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    } else if (opt.key === 'VALE') {
      this.dialogRef?.close();
      this.dialog.open(PagarValeCajaDialogComponent, {
        width: '600px',
        maxWidth: '95vw',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    } else if (opt.key === 'COMPRA') {
      this.dialogRef?.close();
      this.dialog.open(PagarCompraCajaDialogComponent, {
        width: '600px',
        maxWidth: '95vw',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    } else if (opt.key === 'EGRESOS') {
      this.dialogRef?.close();
      this.dialog.open(EgresosCajaDialogComponent, {
        width: '640px',
        maxWidth: '95vw',
        data: { cajaId: this.cajaId, cajaNombre: this.cajaNombre },
      });
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}
