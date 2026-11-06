import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { DecisionPagoOnlineTipo, DecisionPagoPayload } from '../../../database/decision-pago-online.types';

/**
 * Qué se hace con lo cobrado online (uPay, Bancard…) de un pedido web.
 *
 * - `CANCELAR`: se está cancelando o rechazando un pedido pagado (bandeja, diálogo de delivery,
 *   historial de ventas, PdV). Ofrece las cuatro salidas; «Hay que devolverlo» es la de siempre.
 * - `RESOLVER`: el pago ya está «a devolver» y se cierra (ya se devolvió, no entró, no se devuelve).
 *
 * Cierra con un `DecisionPagoPayload`, o sin nada si se vuelve atrás (no se cancela).
 * ⚠️ Lo usan las dos pantallas del pedido web: un cambio acá vale para las dos.
 */
export interface DecisionPagoOnlineDialogData {
  modo: 'CANCELAR' | 'RESOLVER';
  /** Pedidos web pagados afectados (normalmente uno), con el nombre de su proveedor de pago. */
  pedidos: { numero: string; monto: number; proveedor?: string | null }[];
}

interface OpcionPago {
  valor: DecisionPagoOnlineTipo;
  titulo: string;
  detalle: string;
  pideMotivo: boolean;
}

/** Las opciones, con el nombre del proveedor del pedido en los textos. */
function opciones(prov: string): OpcionPago[] {
  return [
    { valor: 'DEVOLVER', titulo: 'Hay que devolverlo', detalle: `Queda en la cola DEVOLVER y se avisa al personal para hacerlo desde ${prov}.`, pideMotivo: false },
    { valor: 'YA_DEVUELTO', titulo: `Ya lo devolví en ${prov}`, detalle: 'Queda como devuelto; no entra en la cola.', pideMotivo: false },
    { valor: 'NO_ENTRO', titulo: 'El pago no entró', detalle: `${prov} no lo acreditó o se anuló allá: no hay nada que devolver.`, pideMotivo: true },
    { valor: 'NO_SE_DEVUELVE', titulo: 'No se devuelve', detalle: 'El local se queda con el cobro (por ejemplo, el cliente no retiró).', pideMotivo: true },
  ];
}

@Component({
  selector: 'app-decision-pago-online-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatIconModule],
  templateUrl: './decision-pago-online-dialog.component.html',
  styleUrls: ['./decision-pago-online-dialog.component.scss'],
})
export class DecisionPagoOnlineDialogComponent {
  readonly opciones: OpcionPago[];
  readonly titulo: string;
  readonly resumen: string;
  readonly montoTotal: number;

  seleccion: DecisionPagoOnlineTipo | null;
  motivo = '';
  pideMotivo = false;
  puedeConfirmar = false;

  constructor(
    private dialogRef: MatDialogRef<DecisionPagoOnlineDialogComponent, DecisionPagoPayload>,
    @Inject(MAT_DIALOG_DATA) public data: DecisionPagoOnlineDialogData,
  ) {
    const resolver = data.modo === 'RESOLVER';
    const prov = (data.pedidos || []).find((p) => p.proveedor)?.proveedor || 'el proveedor';
    const todas = opciones(prov);
    this.opciones = resolver ? todas.filter((o) => o.valor !== 'DEVOLVER') : todas;
    this.titulo = resolver ? 'Cerrar la devolución' : '¿Qué pasa con el pago con tarjeta?';
    const numeros = (data.pedidos || []).map((p) => p.numero).join(', ');
    this.montoTotal = (data.pedidos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    this.resumen = resolver
      ? `${numeros}: el pago está marcado para devolver. ¿Cómo se resolvió?`
      : `${numeros} se pagó online con tarjeta (${prov}). Al cancelarlo, ¿qué se hace con ese cobro?`;
    // Al cancelar, lo de siempre queda marcado; al resolver, se elige a conciencia.
    this.seleccion = resolver ? null : 'DEVOLVER';
    this.recalcular();
  }

  recalcular(): void {
    const op = this.opciones.find((o) => o.valor === this.seleccion);
    this.pideMotivo = !!op?.pideMotivo;
    this.puedeConfirmar = !!op && (!op.pideMotivo || this.motivo.trim().length > 0);
  }

  confirmar(): void {
    if (!this.puedeConfirmar || !this.seleccion) return;
    this.dialogRef.close({
      decision: this.seleccion,
      motivo: this.pideMotivo ? this.motivo.trim().toUpperCase() : null,
    });
  }
}
