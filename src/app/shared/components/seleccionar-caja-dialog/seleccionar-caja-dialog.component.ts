import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Caja } from '../../../database/entities/financiero/caja.entity';

export interface SeleccionarCajaDialogData {
  cajas: Caja[];
  currentDeviceId: number | null;
  /**
   * Aviso de que la única caja abierta viene de una jornada anterior (D13).
   * Con esto el diálogo deja de ser "elegí entre varias" y pasa a ser "decidí
   * qué hacer con esta": unirse en silencio a la caja de ayer es lo que hizo
   * que el almuerzo del viernes cayera dentro de la caja del jueves.
   */
  avisoJornadaAnterior?: string;
  /** La caja del aviso, para el botón *Ir a cerrarla*. */
  cajaParaCerrar?: Caja;
}

/**
 * Salidas del diálogo. Es aditivo: `cerrar` se agregó en el PR del guard de
 * caja cerrada y ningún consumidor viejo se rompe por ignorarlo.
 */
export interface SeleccionarCajaDialogResult {
  caja?: Caja;
  abrirNueva?: boolean;
  /** Ir a cerrar esta caja antes de seguir vendiendo. */
  cerrar?: Caja;
}

interface CajaVm {
  caja: Caja;
  titulo: string;
  dispositivo: string;
  usuario: string;
  apertura: string;
  esEsteDispositivo: boolean;
}

@Component({
  selector: 'app-seleccionar-caja-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatListModule],
  templateUrl: './seleccionar-caja-dialog.component.html',
  styleUrls: ['./seleccionar-caja-dialog.component.scss'],
})
export class SeleccionarCajaDialogComponent implements OnInit {
  cajasVm: CajaVm[] = [];
  /** Texto del aviso de jornada anterior. Vacío = no se muestra (D13). */
  avisoJornadaAnterior = '';
  /** Pre-computados: la vista no llama funciones (regla 4). */
  hayAviso = false;
  textoIntro = 'Hay varias cajas abiertas. Elegí a cuál querés unirte.';

  constructor(
    public dialogRef: MatDialogRef<SeleccionarCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarCajaDialogData
  ) {}

  ngOnInit(): void {
    const deviceId = this.data?.currentDeviceId ?? null;
    this.avisoJornadaAnterior = this.data?.avisoJornadaAnterior || '';
    this.hayAviso = !!this.avisoJornadaAnterior && !!this.data?.cajaParaCerrar;
    if (this.hayAviso) {
      this.textoIntro = 'Revisá la caja antes de seguir vendiendo.';
    }
    this.cajasVm = (this.data?.cajas || []).map((caja) => {
      const disp: any = (caja as any).dispositivo;
      const persona: any = (caja as any).createdBy?.persona;
      const usuario = persona
        ? `${persona.nombre ?? ''} ${persona.apellido ?? ''}`.trim()
        : ((caja as any).createdBy?.nickname || '');
      return {
        caja,
        titulo: `Caja #${caja.id}`,
        dispositivo: disp?.nombre || (disp?.id ? `Dispositivo #${disp.id}` : 'Sin dispositivo'),
        usuario: usuario || 'Sin usuario',
        apertura: caja.fechaApertura ? new Date(caja.fechaApertura).toLocaleString() : '',
        esEsteDispositivo: deviceId != null && disp?.id != null && disp.id === deviceId,
      };
    });
  }

  seleccionar(caja: Caja): void {
    this.dialogRef.close({ caja });
  }

  abrirNueva(): void {
    this.dialogRef.close({ abrirNueva: true });
  }

  /** *Usar igual*: seguir en la caja de la jornada anterior. */
  usarIgual(): void {
    const caja = this.data?.cajaParaCerrar;
    if (caja) this.dialogRef.close({ caja });
  }

  /** *Ir a cerrarla*: el PdV abre el diálogo de conteo sobre esa caja (A10). */
  irACerrarla(): void {
    const caja = this.data?.cajaParaCerrar;
    if (caja) this.dialogRef.close({ cerrar: caja });
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
