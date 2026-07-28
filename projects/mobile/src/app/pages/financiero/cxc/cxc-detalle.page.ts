import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { CobrarCpcDialogComponent, CobrarCpcData } from './cobrar-cpc-dialog.component';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';

interface CuotaVM {
  id: number;
  numero: number;
  vencimiento: string;
  monto: number;
  cobrado: number;
  saldo: number;
  estado: string;
  estadoClase: string;
  cobrable: boolean;
  puedeAnularCobro: boolean;
}

/** Detalle de una Cuenta por Cobrar: cabecera + cuotas + cobro (CPC_COBRAR). */
@Component({
  selector: 'app-cxc-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './cxc-detalle.page.html',
  styles: [
    `
      .cxc-saldo { margin: 4px 4px 12px; color: var(--text-primary); }
    `,
  ],
})
export class CxcDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  id = 0;
  titulo = '';
  simbolo = '';
  decimales = 0;
  monedaId = 0;
  saldoTotal = 0;
  cuotas: CuotaVM[] = [];
  loading = true;
  error: string | null = null;
  canCobrar = false;
  canAnularCobro = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => {
      this.canCobrar = this.perm.has('CPC_COBRAR');
      this.canAnularCobro = this.perm.has('CPC_CANCELAR');
    });
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    Promise.all([
      firstValueFrom(this.repo.getCuentaPorCobrar(this.id)),
      firstValueFrom(this.repo.getCuentaPorCobrarCuotas(this.id)),
    ])
      .then(([cpc, cuotas]: [any, any[]]) => {
        if (cpc) {
          const cli = cpc.cliente?.persona?.nombre || cpc.cliente?.razonSocial || cpc.cliente?.razon_social || '';
          this.titulo = cli || cpc.descripcion || `CxC #${this.id}`;
          this.simbolo = cpc.moneda?.simbolo || '';
          this.decimales = cpc.moneda?.decimales ?? 0;
          this.monedaId = cpc.moneda?.id || 0;
          this.saldoTotal = (Number(cpc.montoTotal) || 0) - (Number(cpc.montoCobrado) || 0);
        }
        this.cuotas = (cuotas || []).map((c) => this.toVM(c));
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudo cargar la cuenta por cobrar';
        this.loading = false;
      });
  }

  private toVM(c: any): CuotaVM {
    const estado = (c.estado || '').toUpperCase();
    const monto = Number(c.monto) || 0;
    const cobrado = Number(c.montoCobrado) || 0;
    const saldo = +(monto - cobrado).toFixed(2);
    const cobrable = saldo > 0.005 && estado !== 'COBRADO' && estado !== 'CANCELADO';
    const estadoLabel =
      estado === 'COBRADO' ? 'Cobrada' : estado === 'CANCELADO' ? 'Cancelada'
        : estado === 'PARCIAL' ? 'Parcial' : estado === 'VENCIDA' ? 'Vencida' : 'Pendiente';
    return {
      id: c.id,
      numero: c.numero,
      vencimiento: c.fechaVencimiento,
      monto,
      cobrado,
      saldo,
      estado: estadoLabel,
      estadoClase: estado === 'COBRADO' ? 'ok' : estado === 'CANCELADO' ? 'off' : 'warn',
      cobrable,
      puedeAnularCobro: cobrado > 0.005 && estado !== 'CANCELADO',
    };
  }

  volver(): void {
    this.location.back();
  }

  async cobrar(c: CuotaVM): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog
        .open(CobrarCpcDialogComponent, {
          data: {
            cuotaId: c.id,
            titulo: `${this.titulo} · Cuota ${c.numero}`,
            saldo: c.saldo,
            monedaId: this.monedaId,
            simbolo: this.simbolo,
            decimales: this.decimales,
          } as CobrarCpcData,
          width: '360px',
        })
        .afterClosed(),
    );
    if (ok) this.cargar();
  }

  async anularCobro(c: CuotaVM): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular cobro',
            message: `${this.titulo} · Cuota ${c.numero} · cobrado ${this.simbolo} ${c.cobrado.toLocaleString()}`,
            label: 'Motivo de la anulación',
            confirmText: 'Anular cobro',
            danger: true,
          } as PromptData,
          width: '340px',
        })
        .afterClosed(),
    );
    if (!motivo) return;
    try {
      await firstValueFrom(this.repo.anularCobroCpcCuota({ cuotaId: c.id, motivo }));
      this.snack.open('Cobro anulado', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para anular' : raw.replace(/^Error:\s*/, '') || 'No se pudo anular';
      this.snack.open(msg, 'OK', { duration: 4000 });
    }
  }
}
