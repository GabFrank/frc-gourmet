import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { PagarCppDialogComponent, PagarCppData } from './pagar-cpp-dialog.component';

interface CuotaVM {
  id: number;
  numero: number;
  vencimiento: string;
  monto: number;
  pagado: number;
  saldo: number;
  estado: string;
  estadoClase: string;
  pagable: boolean;
}

/** Detalle de una Cuenta por Pagar: cabecera + cuotas + pago (COMPRAS_GESTIONAR). */
@Component({
  selector: 'app-cxp-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, MatDialogModule,
  ],
  templateUrl: './cxp-detalle.page.html',
  styles: [
    `
      .cxp-saldo { margin: 4px 4px 12px; color: var(--text-primary); }
    `,
  ],
})
export class CxpDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);

  id = 0;
  titulo = '';
  simbolo = '';
  decimales = 0;
  monedaId = 0;
  saldoTotal = 0;
  cuotas: CuotaVM[] = [];
  loading = true;
  error: string | null = null;
  canPagar = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canPagar = this.perm.has('COMPRAS_GESTIONAR')));
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    Promise.all([
      firstValueFrom(this.repo.getCuentaPorPagar(this.id)),
      firstValueFrom(this.repo.getCuentaPorPagarCuotas(this.id)),
    ])
      .then(([cpp, cuotas]: [any, any[]]) => {
        if (cpp) {
          const prov = cpp.proveedor?.razonSocial || cpp.proveedor?.nombre || cpp.funcionario?.persona?.nombre || '';
          this.titulo = prov || cpp.descripcion || `CxP #${this.id}`;
          this.simbolo = cpp.moneda?.simbolo || '';
          this.decimales = cpp.moneda?.decimales ?? 0;
          this.monedaId = cpp.moneda?.id || 0;
          this.saldoTotal = (Number(cpp.montoTotal) || 0) - (Number(cpp.montoPagado) || 0);
        }
        this.cuotas = (cuotas || []).map((c) => this.toVM(c));
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudo cargar la cuenta por pagar';
        this.loading = false;
      });
  }

  private toVM(c: any): CuotaVM {
    const estado = (c.estado || '').toUpperCase();
    const monto = Number(c.monto) || 0;
    const pagado = Number(c.montoPagado) || 0;
    const saldo = +(monto - pagado).toFixed(2);
    const pagable = saldo > 0.005 && estado !== 'PAGADA' && estado !== 'CANCELADA';
    const estadoLabel =
      estado === 'PAGADA' ? 'Pagada' : estado === 'CANCELADA' ? 'Cancelada'
        : estado === 'PARCIAL' ? 'Parcial' : estado === 'VENCIDA' ? 'Vencida' : 'Pendiente';
    return {
      id: c.id,
      numero: c.numero,
      vencimiento: c.fechaVencimiento,
      monto,
      pagado,
      saldo,
      estado: estadoLabel,
      estadoClase: estado === 'PAGADA' ? 'ok' : estado === 'CANCELADA' ? 'off' : 'warn',
      pagable,
    };
  }

  volver(): void {
    this.location.back();
  }

  async pagar(c: CuotaVM): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog
        .open(PagarCppDialogComponent, {
          data: {
            cuotaId: c.id,
            titulo: `${this.titulo} · Cuota ${c.numero}`,
            saldo: c.saldo,
            monedaId: this.monedaId,
            simbolo: this.simbolo,
            decimales: this.decimales,
          } as PagarCppData,
          width: '360px',
        })
        .afterClosed(),
    );
    if (ok) this.cargar();
  }
}
