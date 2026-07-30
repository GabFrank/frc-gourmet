import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface RankingVM {
  nombre: string;
  total: number;
  cantidad: number;
  porcentaje: number;
}

interface VencimientoVM {
  proveedor: string;
  monto: number;
  fecha: string;
  dias: number;
  clase: string;
  label: string;
}

interface BarraVM {
  label: string;
  monto: number;
  altura: number;
}

const URGENCIA_CLASE: Record<string, string> = {
  vencida: 'anul',
  urgente: 'pend',
  proxima: 'info',
};

/** Dashboard de compras: KPIs del mes, CPP por vencer/vencidas, top proveedores,
 *  próximos vencimientos y compras por período. Solo lectura (COMPRAS_DASHBOARD_VER). */
@Component({
  selector: 'app-compras-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './compras-dashboard.page.html',
  styleUrls: ['./compras-dashboard.page.scss'],
})
export class ComprasDashboardPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  loading = true;
  error: string | null = null;

  comprasMes = 0;
  totalMes = 0;
  cppPorVencer = 0;
  cppVencido = 0;

  top: RankingVM[] = [];
  vencimientos: VencimientoVM[] = [];
  barras: BarraVM[] = [];

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    firstValueFrom(this.repo.getDashboardComprasKpis())
      .then((k: any) => {
        this.comprasMes = Number(k?.comprasMes) || 0;
        this.totalMes = Number(k?.totalMesPYG) || 0;
        this.cppPorVencer = Number(k?.cppPorVencer) || 0;
        this.cppVencido = Number(k?.totalCppVencidoPYG) || 0;
        this.top = (k?.topProveedores || []).map((p: any) => ({
          nombre: p.nombre,
          total: Number(p.totalCompras) || 0,
          cantidad: Number(p.cantidad) || 0,
          porcentaje: Number(p.porcentaje) || 0,
        }));
        this.vencimientos = (k?.proximosVencimientos || []).map((v: any) => this.toVencimiento(v));
        this.barras = this.toBarras(k?.comprasPorPeriodo);
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudo cargar el dashboard';
        this.loading = false;
      });
  }

  private toVencimiento(v: any): VencimientoVM {
    const urg = (v.urgencia || 'proxima').toLowerCase();
    const dias = Number(v.diasRestantes) || 0;
    return {
      proveedor: v.proveedor,
      monto: Number(v.monto) || 0,
      fecha: v.fechaVencimiento,
      dias,
      clase: URGENCIA_CLASE[urg] || 'info',
      label: dias < 0 ? `Vencida hace ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoy' : `En ${dias}d`,
    };
  }

  private toBarras(periodo: any): BarraVM[] {
    const labels: string[] = periodo?.labels || [];
    const compras: number[] = periodo?.compras || [];
    const max = compras.reduce((m, x) => Math.max(m, Number(x) || 0), 0);
    return labels.map((label, i) => {
      const monto = Number(compras[i]) || 0;
      return { label, monto, altura: max > 0 ? Math.round((monto / max) * 100) : 0 };
    });
  }
}
