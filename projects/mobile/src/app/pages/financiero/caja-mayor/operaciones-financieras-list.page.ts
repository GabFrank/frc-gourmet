import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';

const TIPO_LABELS: Record<string, string> = {
  CAMBIO_DIVISA: 'Cambio de divisa',
  DEPOSITO_BANCARIO: 'Depósito bancario',
  RETIRO_BANCARIO: 'Retiro bancario',
  TRANSFERENCIA_ENTRE_CAJAS: 'Transferencia entre cajas',
  TRANSFERENCIA_BANCARIA: 'Transferencia bancaria',
};

interface OpVM {
  id: number;
  tipoLabel: string;
  descripcion?: string;
  origen: string;
  destino: string;
  fecha: string;
  responsable?: string;
  anulado: boolean;
}

/** Lista de Operaciones Financieras. Anular requiere CAJA_MAYOR_OPERAR. */
@Component({
  selector: 'app-operaciones-financieras-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatIconModule, MatButtonModule,
    MatMenuModule, MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './operaciones-financieras-list.page.html',
})
export class OperacionesFinancierasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  items: OpVM[] = [];
  loading = true;
  error: string | null = null;
  canOperar = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canOperar = this.perm.has('CAJA_MAYOR_OPERAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getOperacionesFinancieras({}).subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.items || [];
        this.items = arr.map((o) => this.toVM(o));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las operaciones';
        this.loading = false;
      },
    });
  }

  private toVM(o: any): OpVM {
    const tipo = (o.tipoOperacion || '').toUpperCase();
    const simO = o.monedaOrigen?.simbolo || o.cuentaBancariaOrigen?.moneda?.simbolo || '';
    const simD = o.monedaDestino?.simbolo || o.cuentaBancariaDestino?.moneda?.simbolo || '';
    const montoO = Number(o.montoOrigen) || 0;
    const montoD = Number(o.montoDestino) || 0;
    return {
      id: o.id,
      tipoLabel: TIPO_LABELS[tipo] || tipo,
      descripcion: o.descripcion || undefined,
      origen: `${simO} ${montoO.toLocaleString()}`,
      destino: `${simD} ${montoD.toLocaleString()}`,
      fecha: o.fecha,
      responsable: o.createdBy?.persona?.nombre || o.createdBy?.nickname || undefined,
      anulado: !!o.anulado,
    };
  }

  async anular(o: OpVM): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular operación',
            message: `${o.tipoLabel} · ${o.origen} → ${o.destino}`,
            label: 'Motivo de la anulación',
            confirmText: 'Anular',
            danger: true,
          } as PromptData,
          width: '340px',
        })
        .afterClosed(),
    );
    if (!motivo) return;
    try {
      await firstValueFrom(this.repo.anularOperacionFinanciera(o.id, motivo));
      this.snack.open('Operación anulada', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para anular' : raw.replace(/^Error:\s*/, '') || 'No se pudo anular';
      this.snack.open(msg, 'OK', { duration: 4000 });
    }
  }
}
