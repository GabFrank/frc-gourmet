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

  constructor(
    public dialogRef: MatDialogRef<SeleccionarCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarCajaDialogData
  ) {}

  ngOnInit(): void {
    const deviceId = this.data?.currentDeviceId ?? null;
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

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
