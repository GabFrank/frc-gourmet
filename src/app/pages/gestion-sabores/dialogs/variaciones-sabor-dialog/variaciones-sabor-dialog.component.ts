import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';

import { RepositoryService } from '../../../../database/repository.service';
import { TabsService } from '../../../../services/tabs.service';
import { GestionRecetasComponent } from '../../../gestion-recetas/gestion-recetas.component';
import { VariacionDialogComponent, VariacionDialogData } from '../../../productos/gestionar-producto/dialogs/variacion-dialog/variacion-dialog.component';
import { PrecioVentaDialogComponent, PrecioVentaDialogData } from '../../../productos/gestionar-producto/components/precio-venta-dialog/precio-venta-dialog.component';

export interface VariacionesSaborDialogData {
  saborId: number;
  saborNombre: string;
  productoId: number;
  productoNombre: string;
}

@Component({
  selector: 'app-variaciones-sabor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatProgressBarModule,
  ],
  templateUrl: './variaciones-sabor-dialog.component.html',
  styleUrls: ['./variaciones-sabor-dialog.component.scss'],
})
export class VariacionesSaborDialogComponent implements OnInit {
  displayedColumns = ['variacion', 'precio', 'costo', 'estado', 'acciones'];
  variaciones: any[] = [];
  loading = false;

  constructor(
    public dialogRef: MatDialogRef<VariacionesSaborDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VariacionesSaborDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.repositoryService.getVariacionesByProducto(this.data.productoId).subscribe({
      next: (data) => {
        this.variaciones = (data || [])
          .filter((v: any) => v.sabor?.id === this.data.saborId)
          .sort((a: any, b: any) => (Number(a.presentacion?.cantidad) || 0) - (Number(b.presentacion?.cantidad) || 0));
        this.loading = false;
      },
      error: () => {
        this.variaciones = [];
        this.loading = false;
        this.snackBar.open('No se pudieron cargar las variaciones', 'Cerrar', { duration: 3000 });
      },
    });
  }

  precioDe(v: any): number | null {
    return v.precioPrincipal?.valor != null ? Number(v.precioPrincipal.valor) : null;
  }

  gestionarPrecio(v: any): void {
    const dialogData: PrecioVentaDialogData = {
      entityId: v.id,
      entityName: v.nombre_generado,
      entityType: 'variacion',
      recetaPresentacionId: v.id,
      relationField: 'recetaPresentacionId',
      preciosExistentes: v.preciosVenta || [],
    };
    this.dialog.open(PrecioVentaDialogComponent, { width: '900px', maxWidth: '95vw', maxHeight: '80vh', data: dialogData })
      .afterClosed().subscribe(() => this.cargar());
  }

  editarVariacion(v: any): void {
    const dialogData: VariacionDialogData = { variacion: v, modo: 'editar', productoNombre: this.data.productoNombre };
    this.dialog.open(VariacionDialogComponent, { width: '600px', maxWidth: '95vw', disableClose: true, data: dialogData })
      .afterClosed().subscribe((result) => { if (result && result.action === 'updated') this.cargar(); });
  }

  gestionarReceta(v: any): void {
    if (!v.receta?.id) {
      this.snackBar.open('Esta variación no tiene receta asociada.', 'Cerrar', { duration: 4000 });
      return;
    }
    const tabData = {
      recetaId: v.receta.id,
      contexto: 'variacion',
      productoId: this.data.productoId,
      saborId: this.data.saborId,
      variacionId: v.id,
    };
    this.tabsService.openTab(`Receta - ${v.nombre_generado}`, GestionRecetasComponent, tabData);
    this.dialogRef.close();
  }

  toggleActivo(v: any): void {
    const nuevo = !v.activo;
    this.repositoryService.updateRecetaPresentacion(v.id, { activo: nuevo }).subscribe({
      next: () => { v.activo = nuevo; },
      error: () => this.snackBar.open('No se pudo cambiar el estado', 'Cerrar', { duration: 3000 }),
    });
  }

  generarFaltantes(): void {
    this.loading = true;
    this.repositoryService.generateVariacionesFaltantes(this.data.productoId).subscribe({
      next: (res) => {
        this.snackBar.open(
          res.variacionesGeneradas > 0 ? `${res.variacionesGeneradas} variación(es) generada(s)` : 'No faltaban variaciones',
          'Cerrar', { duration: 3000 },
        );
        this.cargar();
      },
      error: () => { this.loading = false; this.snackBar.open('No se pudieron generar variaciones', 'Cerrar', { duration: 3000 }); },
    });
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
