import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmationDialogComponent } from '../components/confirmation-dialog/confirmation-dialog.component';

export interface SaldoNegativoCheck {
  label: string;
  saldoActual: number;
  /** Monto a debitar (positivo). Si es negativo, se considera ingreso/abono. */
  monto: number;
  monedaSimbolo: string;
}

/**
 * Recibe una lista de saldos a verificar. Si alguno quedaría negativo después
 * de aplicar el delta, abre un diálogo de confirmación con el detalle.
 * Devuelve `true` si el usuario acepta o si ningún saldo quedaría negativo.
 */
export async function confirmarSaldosNegativos(
  dialog: MatDialog,
  checks: SaldoNegativoCheck[],
): Promise<boolean> {
  const negativos = checks
    .map(c => ({
      ...c,
      nuevoSaldo: +(c.saldoActual - c.monto).toFixed(2),
    }))
    .filter(c => c.nuevoSaldo < 0);

  if (negativos.length === 0) return true;

  const fmt = (n: number) =>
    n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const lineas = negativos.map(n =>
    `${n.label}\n` +
    `  Actual: ${n.monedaSimbolo} ${fmt(n.saldoActual)}\n` +
    `  Debitar: ${n.monedaSimbolo} ${fmt(n.monto)}\n` +
    `  Resultante: ${n.monedaSimbolo} ${fmt(n.nuevoSaldo)}`,
  ).join('\n\n');

  const ref = dialog.open(ConfirmationDialogComponent, {
    data: {
      title: 'Saldo insuficiente',
      message:
        `Esta operación dejará saldos negativos:\n\n${lineas}\n\n¿Continuar?`,
    },
  });
  return !!(await firstValueFrom(ref.afterClosed()));
}
