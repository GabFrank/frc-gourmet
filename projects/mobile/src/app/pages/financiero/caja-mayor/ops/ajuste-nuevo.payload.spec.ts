import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { AjusteNuevoPage } from './ajuste-nuevo.page';

/**
 * Verifica la construcción del payload de ajuste (ingreso/egreso genérico):
 * - Caja Mayor ingreso  -> createCajaMayorMovimiento con tipoMovimiento AJUSTE_POSITIVO.
 * - Caja Mayor egreso   -> AJUSTE_NEGATIVO (pasa la confirmación de saldo negativo).
 * - Cuenta bancaria      -> createMovimientoBancario con ENTRADA_MANUAL / SALIDA_MANUAL.
 * El motivo se guarda en observacion en MAYÚSCULAS.
 */
describe('AjusteNuevoPage — construcción del payload', () => {
  let component: AjusteNuevoPage;
  let repo: {
    createCajaMayorMovimiento: jasmine.Spy;
    createMovimientoBancario: jasmine.Spy;
    getCajaMayorSaldos: jasmine.Spy;
  };
  let dialog: { open: jasmine.Spy };

  beforeEach(() => {
    repo = {
      createCajaMayorMovimiento: jasmine.createSpy('createCajaMayorMovimiento').and.returnValue(of({ id: 1 })),
      createMovimientoBancario: jasmine.createSpy('createMovimientoBancario').and.returnValue(of({ id: 1 })),
      // Saldo vacío -> egreso deja saldo negativo -> se dispara el ConfirmDialog.
      getCajaMayorSaldos: jasmine.createSpy('getCajaMayorSaldos').and.returnValue(of([])),
    };
    // Dialog de confirmación (solo egreso caja) que devuelve true -> continúa.
    dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(true) }) };

    TestBed.configureTestingModule({
      imports: [AjusteNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit/cargarCatalogos (que pega al repo) y
    // seteamos el estado a mano para probar solo guardar().
    component = TestBed.createComponent(AjusteNuevoPage).componentInstance;
  });

  it('INGRESO caja: AJUSTE_POSITIVO a createCajaMayorMovimiento con observacion en mayúsculas', async () => {
    (component as any).cajaMayorId = 5;
    (component as any).esIngreso = true;
    component.form.patchValue({
      fuente: 'CAJA_MAYOR',
      monedaId: 10,
      formaPagoId: 1,
      monto: 100,
      motivo: 'ajuste manual',
    });

    await component.guardar();

    expect(repo.createCajaMayorMovimiento).toHaveBeenCalledTimes(1);
    expect(repo.createMovimientoBancario).not.toHaveBeenCalled();
    const payload = repo.createCajaMayorMovimiento.calls.mostRecent().args[0];
    expect(payload.tipoMovimiento).toBe('AJUSTE_POSITIVO');
    expect(payload.cajaMayor).toEqual({ id: 5 });
    expect(payload.moneda).toEqual({ id: 10 });
    expect(payload.formaPago).toEqual({ id: 1 });
    expect(payload.monto).toBe(100);
    expect(payload.observacion).toBe('AJUSTE MANUAL');
  });

  it('EGRESO caja: AJUSTE_NEGATIVO (confirmación de saldo OK → continúa)', async () => {
    // Stubeamos la confirmación de saldo negativo (que abre un ConfirmDialog real,
    // no unit-testeable acá) para probar solo la construcción del payload.
    spyOn(component as any, 'confirmarSaldoSiNegativo').and.returnValue(Promise.resolve(true));
    (component as any).cajaMayorId = 5;
    (component as any).esIngreso = false;
    component.form.patchValue({
      fuente: 'CAJA_MAYOR',
      monedaId: 10,
      formaPagoId: 1,
      monto: 100,
      motivo: 'retiro caja',
    });

    await component.guardar();

    expect(repo.createCajaMayorMovimiento).toHaveBeenCalledTimes(1);
    const payload = repo.createCajaMayorMovimiento.calls.mostRecent().args[0];
    expect(payload.tipoMovimiento).toBe('AJUSTE_NEGATIVO');
    expect(payload.cajaMayor).toEqual({ id: 5 });
    expect(payload.observacion).toBe('RETIRO CAJA');
  });

  it('EGRESO caja: si la confirmación de saldo se cancela, NO guarda', async () => {
    spyOn(component as any, 'confirmarSaldoSiNegativo').and.returnValue(Promise.resolve(false));
    (component as any).cajaMayorId = 5;
    (component as any).esIngreso = false;
    component.form.patchValue({ fuente: 'CAJA_MAYOR', monedaId: 10, formaPagoId: 1, monto: 100, motivo: 'x' });

    await component.guardar();

    expect(repo.createCajaMayorMovimiento).not.toHaveBeenCalled();
  });

  it('BANCO ingreso: ENTRADA_MANUAL a createMovimientoBancario con numeroComprobante null', async () => {
    (component as any).cajaMayorId = 5;
    (component as any).esIngreso = true;
    component.form.patchValue({
      fuente: 'CUENTA_BANCARIA',
      monedaId: 10,
      cuentaBancariaId: 7,
      monto: 250,
      motivo: 'deposito',
    });

    await component.guardar();

    expect(repo.createMovimientoBancario).toHaveBeenCalledTimes(1);
    expect(repo.createCajaMayorMovimiento).not.toHaveBeenCalled();
    const payload = repo.createMovimientoBancario.calls.mostRecent().args[0];
    expect(payload.cuentaBancariaId).toBe(7);
    expect(payload.tipoMovimiento).toBe('ENTRADA_MANUAL');
    expect(payload.monto).toBe(250);
    expect(payload.observacion).toBe('DEPOSITO');
    expect(payload.numeroComprobante).toBeNull();
  });

  it('BANCO egreso: SALIDA_MANUAL a createMovimientoBancario (sin confirmación de saldo)', async () => {
    (component as any).cajaMayorId = 5;
    (component as any).esIngreso = false;
    component.form.patchValue({
      fuente: 'CUENTA_BANCARIA',
      monedaId: 10,
      cuentaBancariaId: 7,
      monto: 80,
      motivo: 'extraccion',
    });

    await component.guardar();

    expect(repo.getCajaMayorSaldos).not.toHaveBeenCalled();
    expect(repo.createMovimientoBancario).toHaveBeenCalledTimes(1);
    const payload = repo.createMovimientoBancario.calls.mostRecent().args[0];
    expect(payload.tipoMovimiento).toBe('SALIDA_MANUAL');
    expect(payload.observacion).toBe('EXTRACCION');
    expect(payload.numeroComprobante).toBeNull();
  });
});
