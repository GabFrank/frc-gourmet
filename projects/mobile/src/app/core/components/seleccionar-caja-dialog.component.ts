import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

export interface SeleccionarCajaData {
  cajas: any[];
  currentDeviceId: number | null;
}

interface CajaVm {
  caja: any;
  titulo: string;
  sub: string;
}

/**
 * Selector de caja abierta para la PWA: cuando hay varias cajas abiertas, el
 * usuario elige a cuál unirse para lanzar items. Devuelve la caja elegida o
 * `undefined` si se cancela.
 */
@Component({
  selector: 'app-seleccionar-caja-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatListModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Seleccionar caja</h2>
    <mat-dialog-content>
      <p class="msg">Hay varias cajas abiertas. Elegí a cuál unirte.</p>
      <mat-list>
        <button
          mat-list-item
          class="caja-item"
          *ngFor="let vm of cajasVm"
          (click)="ref.close(vm.caja)"
        >
          <mat-icon matListItemIcon>point_of_sale</mat-icon>
          <div matListItemTitle>{{ vm.titulo }}</div>
          <div matListItemLine class="sub">{{ vm.sub }}</div>
        </button>
      </mat-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .msg {
        margin: 0 0 8px;
        font-size: 13px;
        opacity: 0.7;
      }
      .caja-item {
        border: 1px solid rgba(128, 128, 128, 0.25);
        border-radius: 8px;
        margin-bottom: 8px;
      }
      .sub {
        font-size: 12px;
        opacity: 0.7;
      }
    `,
  ],
})
export class SeleccionarCajaDialogComponent implements OnInit {
  cajasVm: CajaVm[] = [];

  constructor(
    public ref: MatDialogRef<SeleccionarCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarCajaData
  ) {}

  ngOnInit(): void {
    this.cajasVm = (this.data?.cajas || []).map((caja: any) => {
      const disp = caja?.dispositivo;
      const persona = caja?.createdBy?.persona;
      const usuario = persona
        ? `${persona.nombre ?? ''} ${persona.apellido ?? ''}`.trim()
        : caja?.createdBy?.nickname || 'Sin usuario';
      const dispNombre = disp?.nombre || (disp?.id ? `Dispositivo #${disp.id}` : 'Sin dispositivo');
      return {
        caja,
        titulo: `Caja #${caja?.id}`,
        sub: `${dispNombre} · ${usuario}`,
      };
    });
  }
}
