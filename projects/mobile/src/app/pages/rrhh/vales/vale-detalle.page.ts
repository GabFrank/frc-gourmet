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

const ESTADO_CLASE: Record<string, string> = {
  SOLICITADO: 'pend',
  CONFIRMADO: 'ok',
  DESCONTADO: 'desc',
  ANULADO: 'anul',
};

const ESTADO_LABEL: Record<string, string> = {
  SOLICITADO: 'Solicitado',
  CONFIRMADO: 'Confirmado',
  DESCONTADO: 'Descontado',
  ANULADO: 'Anulado',
};

/**
 * Detalle de vale (readonly) para deep links mobile.
 * 
 * P5: 404 → snackbar + back (no pantalla rota).
 * Acciones: NO hay confirmar/anular (readonly puro).
 * 
 * Handler: get-vale (dual-check permisos RRHH_VALE_VER | RRHH_VALE_CONFIRMAR)
 */
@Component({
  selector: 'app-vale-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatCardModule, MatChipsModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './vale-detalle.page.html',
  styleUrls: ['./vale-detalle.page.scss'],
})
export class ValeDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  id = 0;
  loading = true;
  error: string | null = null;

  funcionario = '';
  motivo = '';
  descripcion = '';
  fecha = '';
  simbolo = '';
  decimales = 0;
  monto = 0;
  estado = '';
  estadoClase = '';
  estadoLabel = '';
  esAdelanto = false;

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.params['id']);
    if (!this.id || this.id <= 0) {
      this.error = 'ID inválido';
      this.loading = false;
      this.snack.open('ID de vale inválido', 'Cerrar', { duration: 5000 });
      return;
    }
    this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const vale: any = await firstValueFrom(this.repo.getVale(this.id));
      
      if (!vale) {
        // P5: 404 → snackbar + no romper UI
        this.error = 'Vale no encontrado';
        this.snack.open(`Vale #${this.id} no encontrado`, 'Cerrar', { duration: 5000 });
        this.loading = false;
        return;
      }

      // Mapear a VM
      this.funcionario = vale.funcionario?.persona?.nombre || 'Sin funcionario';
      this.motivo = vale.motivoVale?.nombre || 'Sin motivo';
      this.descripcion = vale.descripcion || '';
      this.fecha = new Date(vale.fecha).toLocaleDateString('es-PY');
      this.simbolo = vale.moneda?.simbolo || '';
      this.decimales = vale.moneda?.decimales ?? 0;
      this.monto = Number(vale.monto) || 0;
      this.estado = vale.estado || 'SOLICITADO';
      this.estadoClase = ESTADO_CLASE[this.estado] || 'info';
      this.estadoLabel = ESTADO_LABEL[this.estado] || this.estado;
      this.esAdelanto = vale.esAdelanto === true || vale.esAdelanto === 1;

    } catch (err: any) {
      console.error('[ValeDetalle] Error cargando:', err);
      // P5: error graceful
      this.error = err?.message || 'Error al cargar el vale';
      this.snack.open('No se pudo cargar el vale', 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.location.back();
  }
}
