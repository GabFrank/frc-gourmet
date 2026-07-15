import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { CuentaBancariaEditPage } from './cuenta-bancaria-edit.page';

/**
 * Verifica la construcción del payload de Cuenta Bancaria:
 * - Alta (id null) -> createCuentaBancaria(payload).
 * - Edición (id seteado) -> updateCuentaBancaria(id, payload).
 * - moneda ANIDADA ({ id: monedaId }), saldo number, titular/alias null si vacíos.
 */
describe('CuentaBancariaEditPage — construcción del payload', () => {
  let component: CuentaBancariaEditPage;
  let repo: { createCuentaBancaria: jasmine.Spy; updateCuentaBancaria: jasmine.Spy };

  beforeEach(() => {
    repo = {
      createCuentaBancaria: jasmine.createSpy('createCuentaBancaria').and.returnValue(of({ id: 1 })),
      updateCuentaBancaria: jasmine.createSpy('updateCuentaBancaria').and.returnValue(of({ id: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [CuentaBancariaEditPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit/cargar (que pega al repo) y seteamos
    // el estado a mano para probar solo guardar().
    component = TestBed.createComponent(CuentaBancariaEditPage).componentInstance;
  });

  it('Alta (id null): llama createCuentaBancaria con moneda anidada y saldo number', async () => {
    component.form.patchValue({
      nombre: 'CAJA DE AHORRO',
      banco: 'BANCO ITAU',
      numeroCuenta: '123456',
      tipoCuenta: 'AHORRO',
      monedaId: 3,
      saldo: 1500,
      activo: true,
    });

    await component.guardar();

    expect(repo.createCuentaBancaria).toHaveBeenCalledTimes(1);
    expect(repo.updateCuentaBancaria).not.toHaveBeenCalled();
    const payload = repo.createCuentaBancaria.calls.mostRecent().args[0];
    expect(payload.nombre).toBe('CAJA DE AHORRO');
    expect(payload.banco).toBe('BANCO ITAU');
    expect(payload.numeroCuenta).toBe('123456');
    expect(payload.tipoCuenta).toBe('AHORRO');
    expect(payload.moneda).toEqual({ id: 3 });
    expect(payload.saldo).toBe(1500);
    expect(payload.activo).toBe(true);
    // titular/alias vacíos -> null
    expect(payload.titular).toBeNull();
    expect(payload.alias).toBeNull();
    // el fix: moneda anidada, NO monedaId plano
    expect((payload as any).monedaId).toBeUndefined();
  });

  it('Edición (id seteado): llama updateCuentaBancaria(id, payload) con la misma forma', async () => {
    (component as any).id = 7;
    component.form.patchValue({
      nombre: 'CUENTA CORRIENTE',
      banco: 'BANCO GNB',
      numeroCuenta: '987',
      tipoCuenta: 'CORRIENTE',
      monedaId: 1,
      titular: 'JUAN PEREZ',
      alias: 'MI.ALIAS',
      saldo: 200,
      activo: false,
    });

    await component.guardar();

    expect(repo.updateCuentaBancaria).toHaveBeenCalledTimes(1);
    expect(repo.createCuentaBancaria).not.toHaveBeenCalled();
    const [id, payload] = repo.updateCuentaBancaria.calls.mostRecent().args;
    expect(id).toBe(7);
    expect(payload.moneda).toEqual({ id: 1 });
    expect(payload.tipoCuenta).toBe('CORRIENTE');
    expect(payload.saldo).toBe(200);
    expect(payload.titular).toBe('JUAN PEREZ');
    expect(payload.alias).toBe('MI.ALIAS');
    expect(payload.activo).toBe(false);
    expect((payload as any).monedaId).toBeUndefined();
  });
});
