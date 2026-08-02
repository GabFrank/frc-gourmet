import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ComprasDashboardPage } from './compras-dashboard.page';

/** Verifica el mapeo de KPIs: urgencia → clase/label y alturas de barras. */
describe('ComprasDashboardPage — mapeo', () => {
  let c: ComprasDashboardPage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: RepositoryService, useValue: { getDashboardComprasKpis: () => of({}) } }],
    });
    c = TestBed.createComponent(ComprasDashboardPage).componentInstance;
  });

  it('toVencimiento: clases e etiquetas por urgencia', () => {
    const vencida = (c as any).toVencimiento({ urgencia: 'vencida', diasRestantes: -3, monto: 100, proveedor: 'A' });
    expect(vencida.clase).toBe('anul');
    expect(vencida.label).toBe('Vencida hace 3d');

    const hoy = (c as any).toVencimiento({ urgencia: 'urgente', diasRestantes: 0, monto: 100, proveedor: 'B' });
    expect(hoy.clase).toBe('pend');
    expect(hoy.label).toBe('Vence hoy');

    const prox = (c as any).toVencimiento({ urgencia: 'proxima', diasRestantes: 5, monto: 100, proveedor: 'C' });
    expect(prox.clase).toBe('info');
    expect(prox.label).toBe('En 5d');
  });

  it('toBarras: altura proporcional al máximo', () => {
    const barras = (c as any).toBarras({ labels: ['Ene', 'Feb', 'Mar'], compras: [0, 500, 1000] });
    expect(barras.length).toBe(3);
    expect(barras[0].altura).toBe(0);
    expect(barras[1].altura).toBe(50);
    expect(barras[2].altura).toBe(100);
  });

  it('toBarras: máximo 0 → alturas 0 (sin división por cero)', () => {
    const barras = (c as any).toBarras({ labels: ['Ene'], compras: [0] });
    expect(barras[0].altura).toBe(0);
  });
});
