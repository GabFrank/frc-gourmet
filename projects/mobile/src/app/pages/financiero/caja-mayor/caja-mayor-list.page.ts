import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { RepositoryService } from '@frc/shared-core';

interface SaldoMoneda {
  simbolo: string;
  monto: number;
  decimales: number;
}

interface CajaMayorVM {
  id: number;
  nombre: string;
  estado: string;
  estadoClase: string;
  abierta: boolean;
  responsable?: string;
  saldos: SaldoMoneda[];
}

/**
 * Lista de Cajas Mayor (Financiero) — entrada al módulo de Caja Mayor mobile.
 * Cada tarjeta resume el saldo por moneda y enlaza al detalle operativo.
 */
@Component({
  selector: 'app-caja-mayor-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule, MatProgressBarModule, MatRippleModule],
  templateUrl: './caja-mayor-list.page.html',
  styleUrls: ['./caja-mayor.scss'],
})
export class CajaMayorListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: CajaMayorVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getCajasMayor().subscribe({
      next: (data) => {
        this.items = (data || []).map((c: any) => this.toVM(c));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cajas mayor';
        this.loading = false;
      },
    });
  }

  private toVM(c: any): CajaMayorVM {
    const estado = (c.estado || '').toUpperCase();
    const abierta = estado.includes('ABIERT');
    // Sumar saldos por moneda — pero SOLO los buckets de formas de pago que
    // mueven caja (EFECTIVO y similares). El resto son contabilidades internas;
    // el detalle real de bank-like vive en cuentas bancarias (visibles en el
    // detalle de cada caja).
    const porMoneda = new Map<number, SaldoMoneda>();
    for (const s of c.saldos || []) {
      const m = s.moneda;
      if (!m) continue;
      if (s.formaPago && s.formaPago.movimentaCaja === false) continue;
      const acc = porMoneda.get(m.id) ?? { simbolo: m.simbolo || '', monto: 0, decimales: m.decimales ?? 0 };
      acc.monto += Number(s.saldo) || 0;
      porMoneda.set(m.id, acc);
    }
    return {
      id: c.id,
      nombre: c.nombre || `Caja Mayor #${c.id}`,
      estado: abierta ? 'Abierta' : 'Cerrada',
      estadoClase: abierta ? 'ok' : 'off',
      abierta,
      responsable: c.responsable?.persona?.nombre || c.responsable?.nickname || undefined,
      saldos: [...porMoneda.values()],
    };
  }
}
