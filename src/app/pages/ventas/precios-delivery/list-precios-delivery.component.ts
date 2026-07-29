import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { PrecioDelivery } from '../../../database/entities/ventas/precio-delivery.entity';
import { CreateEditPrecioDeliveryDialogComponent } from './create-edit-precio-delivery-dialog.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';

@Component({
  selector: 'app-list-precios-delivery',
  templateUrl: './list-precios-delivery.component.html',
  styleUrls: ['./list-precios-delivery.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDialogModule,
    MatChipsModule,
    HasPermissionDirective,
  ],
})
export class ListPreciosDeliveryComponent implements OnInit {
  preciosDelivery: PrecioDelivery[] = [];
  displayedColumns = ['descripcion', 'valor', 'activo', 'acciones'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.preciosDelivery = await firstValueFrom(this.repositoryService.getPreciosDelivery());
  }

  crear(): void {
    const dialogRef = this.dialog.open(CreateEditPrecioDeliveryDialogComponent, {
      width: '400px',
      data: { precioDelivery: null },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  editar(precio: PrecioDelivery): void {
    const dialogRef = this.dialog.open(CreateEditPrecioDeliveryDialogComponent, {
      width: '400px',
      data: { precioDelivery: precio },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  eliminar(precio: PrecioDelivery): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'ELIMINAR PRECIO DE DELIVERY',
        message: `¿Está seguro que desea eliminar "${precio.descripcion}"?`,
      },
    });
    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await firstValueFrom(this.repositoryService.deletePrecioDelivery(precio.id));
        await this.loadData();
      }
    });
  }
}
