import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { PermissionService } from '../../../services/permission.service';
import { CreateGastoCajaDialogComponent } from 'src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component';
import { PromptDialogComponent } from '../prompt-dialog/prompt-dialog.component';
import { esEstadoCajaNoOperable } from '../../utils/caja-error.util';

export interface ResumenCajaDialogData {
  cajaId: number;
}

@Component({
  selector: 'app-resumen-caja-dialog',
  templateUrl: './resumen-caja-dialog.component.html',
  styleUrls: ['./resumen-caja-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
  ],
})
export class ResumenCajaDialogComponent implements OnInit {
  loading = true;
  resumen: any = null;
  /** Sin repartos la card no se muestra: cinco ceros no le dicen nada al cajero. */
  hayDelivery = false;
  duracion = '-';
  /** La caja de este resumen ya está cerrada: editar un gasto es un ajuste (D6). */
  cajaCerrada = false;
  /**
   * B19: editar un gasto pide `FINANCIERO_CAJA_GESTIONAR` **y**, sobre una caja
   * cerrada, también `FINANCIERO_CAJA_AJUSTAR` — que es lo que exige el
   * backend. Sin esto, un rol custom con GESTIONAR y sin AJUSTAR veía el botón
   * y se comía un rechazo después de completar el formulario.
   *
   * Pre-computado: la vista no llama funciones ni usa getters (regla 4).
   */
  puedeEditarGastos = false;
  tooltipEditarGasto = 'Editar gasto';

  // Umbrales
  umbralBaja = 5;
  umbralAlta = 15;

  constructor(
    public dialogRef: MatDialogRef<ResumenCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ResumenCajaDialogData,
    private repositoryService: RepositoryService,
    private permissionService: PermissionService,
    private dialog: MatDialog
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // Load umbrales
      const config = await firstValueFrom(this.repositoryService.getPdvConfig());
      if (config) {
        this.umbralBaja = config.umbralDiferenciaBaja || 5;
        this.umbralAlta = config.umbralDiferenciaAlta || 15;
      }

      this.resumen = await firstValueFrom(this.repositoryService.getResumenCaja(this.data.cajaId));
      const dv = this.resumen?.delivery;
      this.hayDelivery = !!dv && (dv.envios > 0 || dv.retiros > 0 || dv.cancelados > 0);
      this.duracion = this.calcDuracion();
      this.recomputarGateGastos();
    } catch (error) {
      console.error('Error loading resumen caja:', error);
    } finally {
      this.loading = false;
    }
  }

  private calcDuracion(): string {
    const caja = this.resumen?.caja;
    if (!caja?.fechaCierre || !caja?.fechaApertura) return '-';
    const ms = new Date(caja.fechaCierre).getTime() - new Date(caja.fechaApertura).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const restMins = mins % 60;
    return `${hrs}h ${restMins}m`;
  }

  getDiferenciaClass(monedaId: number): string {
    const esperado = this.resumen?.esperadoPorMoneda[monedaId] || 0;
    const diferencia = this.resumen?.diferenciaPorMoneda[monedaId] || 0;
    if (esperado === 0) return 'neutral';
    const pct = Math.abs(diferencia / esperado * 100);
    if (pct <= this.umbralBaja) return 'positive';
    if (pct <= this.umbralAlta) return 'warning';
    return 'negative';
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  private recomputarGateGastos(): void {
    // M8: cualquier estado distinto de `ABIERTO` (también `CANCELADO`) exige la
    // llave de ajuste, que es el criterio del guard del backend. Con el estado
    // ausente `esEstadoCajaNoOperable` devuelve `false` y no se bloquea nada.
    this.cajaCerrada = esEstadoCajaNoOperable(this.resumen?.caja?.estado);
    const gestiona = this.permissionService.has('FINANCIERO_CAJA_GESTIONAR');
    const ajusta = this.permissionService.has('FINANCIERO_CAJA_AJUSTAR');
    this.puedeEditarGastos = gestiona && (!this.cajaCerrada || ajusta);
    this.tooltipEditarGasto = this.cajaCerrada
      ? 'Editar gasto (ajuste de caja cerrada: pide motivo)'
      : 'Editar gasto';
  }

  async editarGasto(gasto: any): Promise<void> {
    if (!this.puedeEditarGastos) return;
    if (gasto.estado !== 'ACTIVO') return;

    // D6: sobre una caja cerrada el backend exige `ajuste: { motivo }`. El
    // motivo se pide acá, en el llamador del diálogo, igual que en
    // Financiero › Cajas.
    let ajuste: { motivo: string } | null = null;
    if (this.cajaCerrada) {
      const motivo = await firstValueFrom(
        this.dialog.open(PromptDialogComponent, {
          width: '460px',
          data: {
            title: 'Ajustar caja cerrada',
            message: `La caja #${this.data.cajaId} ya está cerrada. Editar este gasto queda registrado `
              + 'como ajuste: indicá el motivo (se guarda en la caja junto a tu usuario).',
            label: 'Motivo del ajuste',
            required: true,
            confirmText: 'Continuar',
          },
        }).afterClosed(),
      );
      const limpio = String(motivo || '').trim();
      if (!limpio) return;
      ajuste = { motivo: limpio };
    }

    const ref = this.dialog.open(CreateGastoCajaDialogComponent, {
      width: '560px',
      disableClose: true,
      data: {
        cajaId: this.data.cajaId,
        cajaNombre: this.resumen?.caja?.dispositivo?.nombre || `Caja #${this.data.cajaId}`,
        gastoId: gasto.id,
        ...(ajuste ? { ajuste } : {}),
      },
    });

    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        this.ngOnInit();
      }
    });
  }
}
