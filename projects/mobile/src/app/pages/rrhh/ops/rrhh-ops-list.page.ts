import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface OpVM {
  id: number;
  titulo: string;
  subtitulo: string;
  monto: number | null;
  estado?: string;
}

/**
 * Vista (solo lectura) genérica para operaciones RRHH (Vales, Liquidaciones,
 * Penalizaciones, Bonos, Aguinaldos). Data-driven por `route.data.source`.
 * Mapeo defensivo de campos (los handlers devuelven shapes variados).
 * Las altas/workflows (confirmar vale, generar liquidación) se hacen en escritorio.
 */
@Component({
  selector: 'app-rrhh-ops-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './rrhh-ops-list.page.html',
})
export class RrhhOpsListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);

  items: OpVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    const source = String(this.route.snapshot.data['source'] || '');
    const loader = this.loaderFor(source);
    if (!loader) {
      this.error = 'Origen de datos no configurado';
      this.loading = false;
      return;
    }
    loader.subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.data || data?.items || [];
        this.items = arr.map((x) => this.mapItem(x));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los datos';
        this.loading = false;
      },
    });
  }

  private loaderFor(source: string): Observable<any> | null {
    switch (source) {
      case 'vales':
        return this.repo.getVales();
      case 'liquidaciones':
        return this.repo.getLiquidacionesSueldo();
      case 'penalizaciones':
        return this.repo.getPenalizaciones();
      case 'bonos':
        return this.repo.getBonos();
      case 'aguinaldos':
        return this.repo.getAguinaldos();
      case 'reglas-comision':
        return this.repo.getReglasComision();
      case 'equipos-comision':
        return this.repo.getEquiposComision();
      case 'liquidaciones-comision':
        return this.repo.getLiquidacionesComision();
      case 'asistencias':
        return this.repo.getAsistencias();
      case 'horas-extra':
        return this.repo.getHorasExtra();
      default:
        return null;
    }
  }

  private mapItem(x: any): OpVM {
    const persona = x?.funcionario?.persona;
    const nombre = persona ? `${persona.nombre || ''} ${persona.apellido || ''}`.trim() : '';
    const fechaRaw = x?.fecha || x?.fechaCreacion || x?.periodo || x?.createdAt;
    const fecha = fechaRaw ? String(fechaRaw).slice(0, 10) : '';
    const motivo = x?.motivo?.nombre || x?.motivoVale?.nombre || x?.tipo || x?.concepto || x?.descripcion || '';
    const porcentaje = x?.porcentaje != null ? `${x.porcentaje}%` : '';
    const monto = x?.monto ?? x?.montoNeto ?? x?.montoTotal ?? x?.total ?? x?.importe ?? null;
    return {
      id: x?.id,
      titulo: nombre || x?.nombre || x?.descripcion || `#${x?.id}`,
      subtitulo: [fecha, motivo, porcentaje].filter(Boolean).join(' · '),
      monto: monto != null ? Number(monto) : null,
      estado: x?.estado,
    };
  }
}
