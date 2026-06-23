import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { RepositoryService } from '@frc/shared-core';

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

/**
 * Módulo de meseros (M1 — solo lectura): lista de mesas por sector con su
 * estado (libre / ocupada). Al tocar una mesa se ve la cuenta. Los datos salen
 * de `getPdvMesasActivas` (que mapea la venta ABIERTA de cada mesa) por RPC.
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
  ],
  templateUrl: './mesas-list.page.html',
  styleUrls: ['./mesas.scss'],
})
export class MesasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  sectores: SectorVM[] = [];
  sectorSeleccionado: number | null = null; // null = todos

  todas: MesaVM[] = [];
  items: MesaVM[] = [];
  loading = true;
  error: string | null = null;

  // Resumen para el encabezado
  totalMesas = 0;
  ocupadas = 0;

  ngOnInit(): void {
    this.cargarSectores();
    this.cargarMesas();
  }

  private cargarSectores(): void {
    this.repo.getSectoresActivos().subscribe({
      next: (data: any[]) => {
        this.sectores = (data || []).map((s) => ({ id: s.id, nombre: s.nombre }));
      },
      error: () => {
        // No bloquea: el filtro de sector queda vacío.
      },
    });
  }

  private cargarMesas(): void {
    this.loading = true;
    this.error = null;
    this.repo.getPdvMesasActivas().subscribe({
      next: (data: any[]) => {
        this.todas = (data || []).map((m) => this.toVM(m));
        this.totalMesas = this.todas.length;
        this.ocupadas = this.todas.filter((m) => m.ocupada).length;
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las mesas';
        this.loading = false;
      },
    });
  }

  private toVM(m: any): MesaVM {
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

  seleccionarSector(sectorId: number | null): void {
    this.sectorSeleccionado = sectorId;
    this.aplicarFiltro();
  }

  recargar(): void {
    this.cargarMesas();
  }

  private aplicarFiltro(): void {
    this.items =
      this.sectorSeleccionado == null
        ? [...this.todas]
        : this.todas.filter((m) => m.sectorId === this.sectorSeleccionado);
  }
}
