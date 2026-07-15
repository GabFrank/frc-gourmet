import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '@frc/shared-core';
import { PagarComprasPage } from './pagar-compras.page';

/**
 * Verifica el fix de moneda única en pagar-compras: al filtrar, solo quedan las
 * cuotas de la moneda del lote (form o cuenta) y se deseleccionan las de otra
 * moneda, evitando pagar/descontar en la moneda equivocada.
 */
describe('PagarComprasPage — filtro por moneda única', () => {
  let component: PagarComprasPage;

  function cuota(id: number, monedaId: number, selected = false): any {
    return {
      id,
      proveedorId: 1,
      proveedorNombre: 'PROV',
      compraNota: 'Nota 1',
      cuotaLabel: 'Cuota 1/1',
      vencimiento: '2026-07-15',
      monedaId,
      simbolo: monedaId === 10 ? 'Gs' : 'US$',
      decimales: monedaId === 10 ? 0 : 2,
      saldoPendiente: 100,
      selected,
      montoAPagar: selected ? 100 : null,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PagarComprasPage, NoopAnimationsModule],
      providers: [
        {
          provide: RepositoryService,
          useValue: { getCuotasPendientesCompras: () => ({ subscribe: () => undefined }) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: Location, useValue: { back: () => undefined } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    });
    component = TestBed.createComponent(PagarComprasPage).componentInstance;
  });

  it('Caja Mayor: solo muestra cuotas de la moneda del form y deselecciona las demás', () => {
    const cGs = cuota(1, 10);
    const cUsd = cuota(2, 20, true); // seleccionada, de otra moneda
    (component as any).todasCuotas = [cGs, cUsd];
    component.form.controls.fuente.setValue('CAJA_MAYOR');
    component.form.controls.monedaId.setValue(10);
    component.filtroProveedorId = null;

    component.aplicarFiltro();

    expect(component.cuotas.map((c) => c.id)).toEqual([1]);
    expect(cUsd.selected).toBe(false); // deseleccionada por ser de otra moneda
    expect(cGs.selected).toBe(false);
  });

  it('Cuenta bancaria: filtra por la moneda de la cuenta seleccionada', () => {
    const cGs = cuota(1, 10);
    const cUsd = cuota(2, 20);
    (component as any).todasCuotas = [cGs, cUsd];
    (component as any).cuentasBancarias = [{ id: 5, label: 'BANCO US$', monedaId: 20 }];
    component.form.controls.fuente.setValue('CUENTA_BANCARIA');
    component.form.controls.cuentaBancariaId.setValue(5);
    component.filtroProveedorId = null;

    component.aplicarFiltro();

    expect(component.cuotas.map((c) => c.id)).toEqual([2]);
  });

  it('sin moneda seleccionada: muestra todas', () => {
    (component as any).todasCuotas = [cuota(1, 10), cuota(2, 20)];
    component.form.controls.fuente.setValue('CAJA_MAYOR');
    component.form.controls.monedaId.setValue(null);
    component.filtroProveedorId = null;

    component.aplicarFiltro();

    expect(component.cuotas.length).toBe(2);
  });
});
