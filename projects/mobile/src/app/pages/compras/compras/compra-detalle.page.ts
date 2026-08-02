import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';
import { FinalizarCompraDialogComponent, FinalizarCompraData, FinalizarCompraResult } from './finalizar-compra-dialog.component';

interface ItemVM {
  producto: string;
  presentacion: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

interface CuotaVM {
  numero: number;
  vencimiento: string;
  monto: number;
  saldo: number;
  estado: string;
  estadoClase: string;
}

const ESTADO_CLASE: Record<string, string> = {
  ABIERTO: 'info',
  FINALIZADO: 'ok',
  CANCELADO: 'anul',
};

// Etiquetas alineadas con el desktop (list-compras): Borrador/Finalizada/Anulada.
const ESTADO_LABEL: Record<string, string> = {
  ABIERTO: 'Borrador',
  FINALIZADO: 'Finalizada',
  CANCELADO: 'Anulada',
};

/**
 * Detalle de una compra: cabecera + ítems + cuotas del CPP. Acciones (gate
 * COMPRAS_GESTIONAR): Finalizar (solo ABIERTO) y Anular (solo no CANCELADO).
 * Enlaza al detalle de CxP para pagar.
 */
@Component({
  selector: 'app-compra-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './compra-detalle.page.html',
  styleUrls: ['./compra-detalle.page.scss'],
})
export class CompraDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  id = 0;
  loading = true;
  error: string | null = null;
  canGestionar = false;

  proveedor = '';
  numeroNota = '';
  fechaCompra = '';
  simbolo = '';
  decimales = 0;
  total = 0;
  estado = '';
  estadoLabel = '';
  estadoClase = 'off';
  credito = false;
  simplificada = false;
  categoria = '';
  cppId: number | null = null;

  items: ItemVM[] = [];
  cuotas: CuotaVM[] = [];

  get esAbierto(): boolean {
    return this.estado === 'ABIERTO';
  }

  get esCancelado(): boolean {
    return this.estado === 'CANCELADO';
  }

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canGestionar = this.perm.has('COMPRAS_GESTIONAR')));
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    firstValueFrom(this.repo.getCompra(this.id))
      .then(async (c: any) => {
        if (!c) {
          this.error = 'Compra no encontrada';
          this.loading = false;
          return;
        }
        this.estado = (c.estado || '').toUpperCase();
        this.estadoLabel = ESTADO_LABEL[this.estado] || this.estado;
        this.estadoClase = ESTADO_CLASE[this.estado] || 'off';
        this.proveedor = c.proveedor?.nombre || c.proveedor?.razonSocial || `Compra #${c.id}`;
        this.numeroNota = c.numeroNota || '';
        this.fechaCompra = c.fechaCompra || '';
        this.simbolo = c.moneda?.simbolo || '';
        this.decimales = c.moneda?.decimales ?? 0;
        this.total = Number(c.total) || 0;
        this.credito = !!c.credito;
        this.simplificada = !!c.simplificada;
        this.categoria = c.compraCategoria?.nombre || '';
        this.cppId = c.cuentaPorPagar?.id ?? null;
        this.items = (c.detalles || []).map((d: any) => this.toItemVM(d));

        if (this.cppId) {
          try {
            const cuotas: any[] = await firstValueFrom(this.repo.getCuentaPorPagarCuotas(this.cppId));
            this.cuotas = (cuotas || []).map((q) => this.toCuotaVM(q));
          } catch {
            this.cuotas = [];
          }
        }
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudo cargar la compra';
        this.loading = false;
      });
  }

  private toItemVM(d: any): ItemVM {
    return {
      producto: d.producto?.nombre || 'Producto',
      presentacion: d.presentacion?.nombre || '',
      cantidad: Number(d.cantidad) || 0,
      costoUnitario: Number(d.costoUnitarioPresentacion) || 0,
      subtotal: Number(d.subtotal) || 0,
    };
  }

  private toCuotaVM(q: any): CuotaVM {
    const estado = (q.estado || '').toUpperCase();
    const monto = Number(q.monto) || 0;
    const saldo = +(monto - (Number(q.montoPagado) || 0)).toFixed(2);
    return {
      numero: q.numero,
      vencimiento: q.fechaVencimiento,
      monto,
      saldo,
      estado: estado === 'PAGADA' ? 'Pagada' : estado === 'CANCELADA' ? 'Cancelada'
        : estado === 'PARCIAL' ? 'Parcial' : estado === 'VENCIDA' ? 'Vencida' : 'Pendiente',
      estadoClase: estado === 'PAGADA' ? 'ok' : estado === 'CANCELADA' ? 'off' : 'warn',
    };
  }

  volver(): void {
    this.location.back();
  }

  irACxp(): void {
    if (this.cppId) this.router.navigate(['/financiero/cxp', this.cppId]);
  }

  async finalizar(): Promise<void> {
    const res = await firstValueFrom(
      this.dialog
        .open(FinalizarCompraDialogComponent, {
          data: {
            compraId: this.id,
            titulo: this.proveedor,
            total: this.total,
            simbolo: this.simbolo,
            decimales: this.decimales,
            credito: this.credito,
          } as FinalizarCompraData,
          width: '360px',
        })
        .afterClosed(),
    ) as FinalizarCompraResult | undefined;
    if (!res?.ok) return;
    this.snack.open('Compra finalizada', 'OK', { duration: 2500 });
    if (res.pagarAhora && res.cppId) {
      this.router.navigate(['/financiero/cxp', res.cppId]);
      return;
    }
    this.cargar();
  }

  async anular(): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular compra',
            message: `${this.proveedor} · ${this.simbolo} ${this.total.toLocaleString('es-PY', { maximumFractionDigits: this.decimales })}`,
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
      await firstValueFrom(this.repo.anularCompra(this.id, motivo));
      this.snack.open('Compra anulada', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo anular', 'OK', { duration: 4000 });
    }
  }
}
