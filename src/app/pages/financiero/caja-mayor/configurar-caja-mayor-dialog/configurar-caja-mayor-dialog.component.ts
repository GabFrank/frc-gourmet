import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface OpcionCb {
  id: number;
  nombre: string;
  banco: string;
  numeroCuenta: string;
  monedaSimbolo: string;
  visible: boolean;
}

@Component({
  selector: 'app-configurar-caja-mayor-dialog',
  templateUrl: './configurar-caja-mayor-dialog.component.html',
  styleUrls: ['./configurar-caja-mayor-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    DragDropModule,
  ],
})
export class ConfigurarCajaMayorDialogComponent implements OnInit {
  loading = true;
  guardando = false;
  cuentasBancarias: OpcionCb[] = [];
  mostrarCuentasPorPagar = false;
  mostrarCuentasPorCobrar = false;
  /** Tope de descuento al cobrar CPC (%). null/vacío = sin tope. */
  descuentoCpcMaxPorcentaje: number | null = null;

  constructor(
    public dialogRef: MatDialogRef<ConfigurarCajaMayorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { cajaMayorId: number },
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [cbs, config] = await Promise.all([
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
        firstValueFrom(this.repositoryService.getCajaMayorConfiguracion(this.data.cajaMayorId)),
      ]);

      const cbVisibleIds = new Set<number>(
        (config?.cuentasBancariasVisibles || []).map((x: any) => x.id),
      );
      const tieneConfig = !!config;
      const orden = this.parseOrden(config?.cuentasBancariasOrden);

      const opciones: OpcionCb[] = (cbs || [])
        .filter((cb: any) => cb.activo)
        .map((cb: any) => ({
          id: cb.id,
          nombre: cb.nombre,
          banco: cb.banco,
          numeroCuenta: cb.numeroCuenta,
          monedaSimbolo: cb.moneda?.simbolo || '-',
          // Default: opt-in. Solo si la config previa lo marcaba.
          visible: tieneConfig ? cbVisibleIds.has(cb.id) : false,
        }));

      // Ordenar por el orden guardado (drag & drop): las que están en el array
      // primero, en esa secuencia; el resto al final por id ascendente.
      this.cuentasBancarias = this.ordenarPorOrdenGuardado(opciones, orden);

      this.mostrarCuentasPorPagar = !!config?.mostrarCuentasPorPagar;
      this.mostrarCuentasPorCobrar = !!config?.mostrarCuentasPorCobrar;
      const tope = config?.descuentoCpcMaxPorcentaje;
      this.descuentoCpcMaxPorcentaje = tope == null ? null : Number(tope);
    } catch (error: any) {
      console.error('Error cargando configuracion de caja mayor:', error);
      this.snackBar.open('Error al cargar configuracion', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private parseOrden(raw: string | null | undefined): number[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((x) => Number(x)).filter((x) => !isNaN(x)) : [];
    } catch {
      return [];
    }
  }

  private ordenarPorOrdenGuardado(opciones: OpcionCb[], orden: number[]): OpcionCb[] {
    if (!orden.length) return opciones;
    const pos = new Map<number, number>();
    orden.forEach((id, i) => pos.set(id, i));
    return [...opciones].sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(b.id) ? pos.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });
  }

  drop(event: CdkDragDrop<OpcionCb[]>): void {
    moveItemInArray(this.cuentasBancarias, event.previousIndex, event.currentIndex);
  }

  toggleTodasCb(check: boolean): void {
    this.cuentasBancarias.forEach((cb) => (cb.visible = check));
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }

  async guardar(): Promise<void> {
    if (this.guardando) return;
    this.guardando = true;
    try {
      // Se envían en el ORDEN de la lista (drag & drop). Solo las visibles.
      // No se manda formaPagoIds: la sección de formas de pago se quitó (en caja
      // mayor solo hay EFECTIVO); el backend preserva las FPs existentes.
      const cuentaBancariaIds = this.cuentasBancarias.filter((x) => x.visible).map((x) => x.id);
      await firstValueFrom(
        this.repositoryService.saveCajaMayorConfiguracion(this.data.cajaMayorId, {
          cuentaBancariaIds,
          mostrarCuentasPorPagar: this.mostrarCuentasPorPagar,
          mostrarCuentasPorCobrar: this.mostrarCuentasPorCobrar,
          descuentoCpcMaxPorcentaje: this.descuentoCpcMaxPorcentaje,
        }),
      );
      this.snackBar.open('Configuracion guardada', 'Cerrar', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (error: any) {
      console.error('Error guardando configuracion:', error);
      this.snackBar.open(`Error: ${error?.message || 'no se pudo guardar'}`, 'Cerrar', {
        duration: 4000,
        panelClass: ['error-snackbar'],
      });
    } finally {
      this.guardando = false;
    }
  }
}
