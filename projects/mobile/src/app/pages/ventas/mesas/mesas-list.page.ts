import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { AbrirComandaDialogComponent, AbrirComandaResult } from './abrir-comanda-dialog.component';

interface SectorVM {
  id: number;
  nombre: string;
}

interface MesaVM {
  id: number;
  numero: number;
  nombre: string;
  sectorId: number | null;
  sectorNombre?: string;
  capacidad?: number;
  ocupada: boolean;
  estado: string;
  comandas: number;
}

interface ComandaVM {
  id: number;
  numero: number;
  sectorId: number | null;
  sectorNombre?: string;
  ocupada: boolean;
  estado: string;
  observacion?: string;
}

/**
 * Hub de ventas (meseros): dos vistas (MESAS / COMANDAS) como el PdV. Filtro por
 * sector compartido. Mesas → detalle directo. Comandas → si está DISPONIBLE se
 * abre (diálogo) y luego va al detalle; si está OCUPADA va directo al detalle.
 */
@Component({
  selector: 'app-mesas-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatProgressBarModule,
    MatRippleModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './mesas-list.page.html',
  styleUrls: ['./mesas.scss'],
})
export class MesasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  vista: 'mesas' | 'comandas' = 'mesas';

  sectores: SectorVM[] = [];
  sectorSeleccionado: number | null = null; // null = todos

  todas: MesaVM[] = [];
  items: MesaVM[] = [];

  private comandasTodas: ComandaVM[] = [];
  comandas: ComandaVM[] = [];
  private comandasCargadas = false;

  loading = true;
  error: string | null = null;
  abriendo = false;

  // Resumen para el encabezado (de la vista activa).
  totalMesas = 0;
  ocupadas = 0;

  ngOnInit(): void {
    this.cargarSectores();
    this.cargarMesas();
  }

  // ---- Tabs ----
  seleccionarVista(v: 'mesas' | 'comandas'): void {
    if (this.vista === v) return;
    this.vista = v;
    if (v === 'comandas' && !this.comandasCargadas) {
      this.cargarComandas();
    } else {
      this.aplicarFiltro();
    }
  }

  recargar(): void {
    if (this.vista === 'comandas') this.cargarComandas();
    else this.cargarMesas();
  }

  // ---- Sectores ----
  private cargarSectores(): void {
    this.repo.getSectoresActivos().subscribe({
      next: (data: any[]) => {
        this.sectores = (data || []).map((s) => ({ id: s.id, nombre: s.nombre }));
      },
      error: () => {
        /* el filtro de sector queda vacío */
      },
    });
  }

  seleccionarSector(sectorId: number | null): void {
    this.sectorSeleccionado = sectorId;
    this.aplicarFiltro();
  }

  // ---- Mesas ----
  private cargarMesas(): void {
    this.loading = true;
    this.error = null;
    this.repo.getPdvMesasActivas().subscribe({
      next: (data: any[]) => {
        this.todas = (data || []).map((m) => this.toMesaVM(m));
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las mesas';
        this.loading = false;
      },
    });
  }

  private toMesaVM(m: any): MesaVM {
    const ocupada = !!m.venta || m.estado === 'OCUPADO';
    return {
      id: m.id,
      numero: m.numero,
      nombre: `Mesa ${m.numero}`,
      sectorId: m.sector?.id ?? null,
      sectorNombre: m.sector?.nombre,
      capacidad: m.cantidad_personas,
      ocupada,
      estado: ocupada ? 'Ocupada' : 'Libre',
      comandas: Array.isArray(m.comandas) ? m.comandas.length : 0,
    };
  }

  // ---- Comandas ----
  private cargarComandas(): void {
    this.loading = true;
    this.error = null;
    this.repo.getComandasActivas().subscribe({
      next: (data: any[]) => {
        this.comandasTodas = (data || []).map((c) => this.toComandaVM(c));
        this.comandasCargadas = true;
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las comandas';
        this.loading = false;
      },
    });
  }

  private toComandaVM(c: any): ComandaVM {
    const ocupada = c.estado === 'OCUPADO';
    return {
      id: c.id,
      numero: c.numero,
      sectorId: c.sector?.id ?? null,
      sectorNombre: c.sector?.nombre,
      ocupada,
      estado: ocupada ? 'Ocupada' : 'Libre',
      observacion: c.observacion || undefined,
    };
  }

  async tocarComanda(c: ComandaVM): Promise<void> {
    if (this.abriendo) return;
    if (c.ocupada) {
      this.router.navigate(['/ventas/comandas', c.id]);
      return;
    }
    // DISPONIBLE → abrir (diálogo) y luego ir al detalle.
    const res = (await firstValueFrom(
      this.dialog.open(AbrirComandaDialogComponent, { width: '340px', maxHeight: '85vh' }).afterClosed(),
    )) as AbrirComandaResult | undefined;
    if (!res) return;
    this.abriendo = true;
    try {
      await firstValueFrom(this.repo.abrirComanda(c.id, res as any));
      this.router.navigate(['/ventas/comandas', c.id]);
    } catch {
      this.snack.open('No se pudo abrir la comanda', 'CERRAR', { duration: 4000 });
    } finally {
      this.abriendo = false;
    }
  }

  // ---- Filtro por sector (aplica a la vista activa) ----
  private aplicarFiltro(): void {
    const sec = this.sectorSeleccionado;
    if (this.vista === 'comandas') {
      this.comandas =
        sec == null ? [...this.comandasTodas] : this.comandasTodas.filter((c) => c.sectorId === sec);
      this.ocupadas = this.comandasTodas.filter((c) => c.ocupada).length;
      this.totalMesas = this.comandasTodas.length;
    } else {
      this.items = sec == null ? [...this.todas] : this.todas.filter((m) => m.sectorId === sec);
      this.ocupadas = this.todas.filter((m) => m.ocupada).length;
      this.totalMesas = this.todas.length;
    }
  }
}
