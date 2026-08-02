import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';

interface Opcion {
  id: number;
  label: string;
}

interface CompraVM {
  id: number;
  proveedor: string;
  numeroNota?: string;
  fechaCompra?: string;
  simbolo: string;
  decimales: number;
  total: number;
  estado: string;
  estadoLabel: string;
  estadoClase: string;
  estadoPago: string | null;
  estadoPagoClase: string;
  cuotasPagadas: number | null;
  cuotasTotal: number | null;
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

const ESTADO_PAGO_CLASE: Record<string, string> = {
  PAGADO: 'ok',
  PARCIAL: 'warn',
  PENDIENTE: 'pend',
};

const ESTADOS = ['ABIERTO', 'FINALIZADO', 'CANCELADO'];
const PAGE_SIZE = 20;

/**
 * Lista de Compras con filtros (búsqueda, proveedor, estado, crédito, fechas),
 * paginación "Cargar más" y chips de estado + estado de pago (derivado del CPP).
 * Cada card enlaza al detalle. El alta se hace con el FAB (compra simplificada).
 */
@Component({
  selector: 'app-compras-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressBarModule, MatRippleModule, MatSnackBarModule,
  ],
  templateUrl: './compras-list.page.html',
  styleUrls: ['./compras-list.page.scss'],
})
export class ComprasListPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly snack = inject(MatSnackBar);

  readonly estados = ESTADOS;
  proveedores: Opcion[] = [];
  items: CompraVM[] = [];
  loading = true;
  loadingMore = false;
  error: string | null = null;
  canGestionar = false;

  private page = 1;
  total = 0;

  readonly filtros = this.fb.nonNullable.group({
    search: [''],
    proveedorId: [null as number | null],
    estado: [null as string | null],
    credito: [null as boolean | null],
    fechaDesde: [''],
    fechaHasta: [''],
  });

  get hayMas(): boolean {
    return this.items.length < this.total;
  }

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canGestionar = this.perm.has('COMPRAS_GESTIONAR')));
    firstValueFrom(this.repo.getProveedores())
      .then((provs: any[]) => {
        this.proveedores = (provs || []).map((p) => ({ id: p.id, label: p.nombre || p.razonSocial || `Proveedor #${p.id}` }));
      })
      .catch(() => undefined);
    this.buscar();
  }

  private params(): any {
    const v = this.filtros.getRawValue();
    return {
      search: v.search?.trim() || undefined,
      proveedorId: v.proveedorId || undefined,
      estado: v.estado || undefined,
      credito: v.credito === null ? undefined : v.credito,
      fechaDesde: v.fechaDesde || undefined,
      fechaHasta: v.fechaHasta || undefined,
      page: this.page,
      pageSize: PAGE_SIZE,
    };
  }

  buscar(): void {
    this.page = 1;
    this.loading = true;
    this.error = null;
    this.repo.getComprasPaginado(this.params()).subscribe({
      next: (res: any) => {
        this.items = (res?.items || []).map((c: any) => this.toVM(c));
        this.total = Number(res?.total) || this.items.length;
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las compras';
        this.loading = false;
      },
    });
  }

  cargarMas(): void {
    if (this.loadingMore || !this.hayMas) return;
    this.page += 1;
    this.loadingMore = true;
    this.repo.getComprasPaginado(this.params()).subscribe({
      next: (res: any) => {
        this.items = [...this.items, ...(res?.items || []).map((c: any) => this.toVM(c))];
        this.total = Number(res?.total) || this.total;
        this.loadingMore = false;
      },
      error: () => {
        this.page -= 1;
        this.loadingMore = false;
        this.snack.open('No se pudieron cargar más compras', 'OK', { duration: 3000 });
      },
    });
  }

  limpiar(): void {
    this.filtros.reset({ search: '', proveedorId: null, estado: null, credito: null, fechaDesde: '', fechaHasta: '' });
    this.buscar();
  }

  private toVM(c: any): CompraVM {
    const estado = (c.estado || '').toUpperCase();
    const estadoPago = c.estadoPago ? String(c.estadoPago).toUpperCase() : null;
    return {
      id: c.id,
      proveedor: c.proveedor?.nombre || c.proveedor?.razon_social || `Compra #${c.id}`,
      numeroNota: c.numeroNota,
      fechaCompra: c.fechaCompra,
      simbolo: c.moneda?.simbolo || '',
      decimales: c.moneda?.decimales ?? 0,
      total: Number(c.total ?? c.montoTotal ?? 0),
      estado,
      estadoLabel: ESTADO_LABEL[estado] || estado,
      estadoClase: ESTADO_CLASE[estado] || 'off',
      estadoPago,
      estadoPagoClase: estadoPago ? ESTADO_PAGO_CLASE[estadoPago] || 'off' : 'off',
      cuotasPagadas: c.cuotasPagadas ?? null,
      cuotasTotal: c.cuotasTotal ?? null,
    };
  }
}
