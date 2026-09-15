import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface DetalleVM {
  moneda: string;
  simbolo: string;
  formaPago: string;
  monto: number;
  observacion?: string;
}

const ESTADO_CLASE: Record<string, string> = {
  CONFIRMADO: 'ok',
  ANULADO: 'anul',
};

/**
 * Detalle de gasto (readonly) para deep links mobile.
 * 
 * P5: 404 → snackbar + back (no pantalla rota).
 * Acciones: NO hay editar/anular (readonly puro).
 * NO muestra adjuntos (mobile no tiene <app-file-upload>).
 * 
 * Handler: get-gasto (dual-check permisos FINANCIERO_GASTO_VER | CAJA_MAYOR_OPERAR)
 */
@Component({
  selector: 'app-gasto-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatCardModule, MatChipsModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './gasto-detalle.page.html',
  styleUrls: ['./gasto-detalle.page.scss'],
})
export class GastoDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  id = 0;
  loading = true;
  error: string | null = null;

  categoria = '';
  fecha = '';
  descripcion = '';
  proveedor = '';
  numeroComprobante = '';
  simbolo = '';
  decimales = 0;
  cajaMayor = '';
  total = 0;
  estado = '';
  estadoClase = '';

  detalles: DetalleVM[] = [];

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.params['id']);
    if (!this.id || this.id <= 0) {
      this.error = 'ID inválido';
      this.loading = false;
      this.snack.open('ID de gasto inválido', 'Cerrar', { duration: 5000 });
      return;
    }
    this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const gasto: any = await firstValueFrom(this.repo.getGasto(this.id));
      
      if (!gasto) {
        // P5: 404 → snackbar + no romper UI
        this.error = 'Gasto no encontrado';
        this.snack.open(`Gasto #${this.id} no encontrado`, 'Cerrar', { duration: 5000 });
        this.loading = false;
        return;
      }

      // Mapear a VM
      this.categoria = gasto.gastoCategoria?.nombre || 'Sin categoría';
      this.fecha = new Date(gasto.fecha).toLocaleDateString('es-PY');
      this.descripcion = gasto.descripcion || '';
      this.proveedor = gasto.proveedor?.persona?.nombre || 'N/A';
      this.numeroComprobante = gasto.numeroComprobante || '';
      this.simbolo = gasto.moneda?.simbolo || '';
      this.decimales = gasto.moneda?.decimales ?? 0;
      this.cajaMayor = gasto.cajaMayor?.nombre || '';
      this.estado = gasto.estado || 'CONFIRMADO';
      this.estadoClase = ESTADO_CLASE[this.estado] || 'info';

      // Calcular total de detalles
      this.total = 0;
      this.detalles = (gasto.detalles || []).map((d: any) => {
        const monto = Number(d.monto) || 0;
        this.total += monto;
        return {
          moneda: d.moneda?.nombre || '',
          simbolo: d.moneda?.simbolo || '',
          formaPago: d.formaPago?.nombre || '',
          monto,
          observacion: d.observacion,
        };
      });

    } catch (err: any) {
      console.error('[GastoDetalle] Error cargando:', err);
      // P5: error graceful
      this.error = err?.message || 'Error al cargar el gasto';
      this.snack.open('No se pudo cargar el gasto', 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.location.back();
  }
}
