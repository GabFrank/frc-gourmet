import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { CrearCompraSimplificadaPage } from './crear-compra-simplificada.page';

/**
 * Verifica el payload de crear-compra-simplificada:
 * - Contado sin pago: credito=false, sin pagarAhora.
 * - Contado + pago en caja: pagarAhora=true, fuente CAJA_MAYOR, formaPagoId=efectivo.
 * - Crédito: cantidadCuotas + fechaCreditoInicio, sin pagarAhora.
 */
describe('CrearCompraSimplificadaPage — payload', () => {
  let component: CrearCompraSimplificadaPage;
  let repo: { crearCompraSimplificada: jasmine.Spy };

  beforeEach(() => {
    repo = { crearCompraSimplificada: jasmine.createSpy('crearCompraSimplificada').and.returnValue(of({ id: 1 })) };
    TestBed.configureTestingModule({
      imports: [CrearCompraSimplificadaPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(CrearCompraSimplificadaPage).componentInstance;
    component.proveedores = [{ id: 3, label: 'ACME' }];
    (component as any).efectivoFormaId = 1;
  });

  it('contado sin pago: credito=false, sin pagarAhora', async () => {
    component.form.patchValue({ proveedorId: 3, monedaId: 10, total: 500, fechaCompra: '2026-07-20', credito: false, pagarAhora: false });
    await component.guardar();
    const p = repo.crearCompraSimplificada.calls.mostRecent().args[0];
    expect(p.proveedorId).toBe(3);
    expect(p.proveedorNombre).toBe('ACME');
    expect(p.total).toBe(500);
    expect(p.credito).toBe(false);
    expect(p.pagarAhora).toBeUndefined();
    expect(p.cajaMayorId).toBeUndefined();
  });

  it('contado + pago en caja: pagarAhora + fuente + formaPagoId efectivo', async () => {
    component.form.patchValue({
      proveedorId: 3, monedaId: 10, total: 500, fechaCompra: '2026-07-20',
      credito: false, pagarAhora: true, fuente: 'CAJA_MAYOR', cajaMayorId: 7,
    });
    await component.guardar();
    const p = repo.crearCompraSimplificada.calls.mostRecent().args[0];
    expect(p.pagarAhora).toBe(true);
    expect(p.fuente).toBe('CAJA_MAYOR');
    expect(p.cajaMayorId).toBe(7);
    expect(p.formaPagoId).toBe(1);
    expect(p.cuentaBancariaId).toBeUndefined();
  });

  it('crédito: cantidadCuotas + fechaCreditoInicio, sin pagarAhora', async () => {
    component.form.patchValue({
      proveedorId: 3, monedaId: 10, total: 900, fechaCompra: '2026-07-20',
      credito: true, cantidadCuotas: 3, fechaCreditoInicio: '2026-08-01',
    });
    await component.guardar();
    const p = repo.crearCompraSimplificada.calls.mostRecent().args[0];
    expect(p.credito).toBe(true);
    expect(p.cantidadCuotas).toBe(3);
    expect(p.fechaCreditoInicio).toBe('2026-08-01');
    expect(p.pagarAhora).toBeUndefined();
  });

  it('contado + pago en caja sin forma EFECTIVO: no guarda', async () => {
    (component as any).efectivoFormaId = null;
    component.form.patchValue({
      proveedorId: 3, monedaId: 10, total: 500, fechaCompra: '2026-07-20',
      credito: false, pagarAhora: true, fuente: 'CAJA_MAYOR', cajaMayorId: 7,
    });
    await component.guardar();
    expect(repo.crearCompraSimplificada).not.toHaveBeenCalled();
  });
});
