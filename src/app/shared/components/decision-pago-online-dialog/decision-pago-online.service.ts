import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { PermissionService } from '../../../services/permission.service';
import { DecisionPagoPayload } from '../../../database/decision-pago-online.types';
import { DecisionPagoOnlineDialogComponent, DecisionPagoOnlineDialogData } from './decision-pago-online-dialog.component';

/** Mismo código que `PERM_PAGO_NO_DEVOLVER` del servidor (decision-pago-online.utils.ts). */
export const PERM_PAGO_NO_DEVOLVER = 'PEDIDOS_ONLINE_PAGO_NO_DEVOLVER';

/** `seguir: false` = el usuario volvió atrás; no se cancela nada. */
export interface RespuestaDecisionPago {
  seguir: boolean;
  decision?: DecisionPagoPayload;
}

/**
 * Pregunta qué se hace con lo cobrado online antes de cancelar. Las tres puertas que cancelan un
 * pedido web pagado (bandeja, diálogo de delivery, historial/PdV) pasan por acá.
 */
@Injectable({ providedIn: 'root' })
export class DecisionPagoOnlineService {
  constructor(private dialog: MatDialog, private repo: RepositoryService, private permisos: PermissionService) {}

  async preguntar(datos: DecisionPagoOnlineDialogData): Promise<RespuestaDecisionPago> {
    const data: DecisionPagoOnlineDialogData = {
      ...datos,
      puedeNoDevolver: datos.puedeNoDevolver ?? this.permisos.has(PERM_PAGO_NO_DEVOLVER),
    };
    const ref = this.dialog.open<DecisionPagoOnlineDialogComponent, DecisionPagoOnlineDialogData, DecisionPagoPayload>(
      DecisionPagoOnlineDialogComponent, { data, width: '520px', maxWidth: '95vw' });
    const r = await firstValueFrom(ref.afterClosed());
    return r ? { seguir: true, decision: r } : { seguir: false };
  }

  /** Solo pregunta si la venta tiene un pedido web pagado online; si no, sigue sin decisión. */
  async preguntarParaVenta(ventaId: number): Promise<RespuestaDecisionPago> {
    let pedidos: { numero: string; monto: number; proveedor?: string | null }[] = [];
    try {
      const res: any = await firstValueFrom(this.repo.pedidosOnlinePagadosDeVenta(ventaId));
      pedidos = res?.success ? (res.pedidos || []) : [];
    } catch {
      // Sin la consulta (p. ej. modo cliente HTTP sin el canal) se cancela como antes: devolver.
      pedidos = [];
    }
    if (!pedidos.length) return { seguir: true };
    return this.preguntar({ modo: 'CANCELAR', pedidos });
  }
}

/** Texto del aviso al terminar, según lo decidido con el cobro. Mismo texto en las dos pantallas. */
export function textoResultadoPago(numero: string, monto: number, d?: DecisionPagoPayload, verbo = 'cancelado', proveedor?: string | null): string {
  const m = Number(monto || 0).toLocaleString('es-PY');
  switch (d?.decision ?? 'DEVOLVER') {
    case 'YA_DEVUELTO': return `${numero} ${verbo}. Pago de ₲ ${m} registrado como devuelto.`;
    case 'NO_ENTRO': return `${numero} ${verbo}. Registrado que el pago no entró.`;
    case 'NO_SE_DEVUELVE': return `${numero} ${verbo}. El pago de ₲ ${m} no se devuelve.`;
    default: return `${numero} ${verbo}. Estaba pagado online: devolvé ₲ ${m} desde ${proveedor || 'el proveedor'} y marcalo en la cola.`;
  }
}
