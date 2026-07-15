import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ValeNuevoPage } from './vale-nuevo.page';

/**
 * Verifica la construcción del payload de `crearValeConfirmado` en guardar():
 * - Fuente CAJA_MAYOR: fuente + formaPagoId (efectivo) + cajaMayorId, sin cuentaBancariaId.
 * - Fuente CUENTA_BANCARIA: fuente + cuentaBancariaId, montoCuentaBancaria/cotizacion null,
 *   moneda alineada a la cuenta.
 * - descripcion siempre en MAYÚSCULAS.
 *
 * No se llama detectChanges: se evita ngOnInit/cargarCatalogos (que pega al repo) y se
 * setea el estado a mano para probar solo guardar().
 */
describe('ValeNuevoPage — construcción del payload', () => {
  let component: ValeNuevoPage;
  let repo: { crearValeConfirmado: jasmine.Spy };

  beforeEach(() => {
    repo = {
      crearValeConfirmado: jasmine.createSpy('crearValeConfirmado').and.returnValue(of({ id: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [ValeNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(ValeNuevoPage).componentInstance;
  });

  it('Fuente CAJA_MAYOR: manda fuente/formaPagoId/cajaMayorId y sin cuentaBancariaId', async () => {
    (component as any).cajaMayorId = 5;
    component.form.patchValue({
      fuente: 'CAJA_MAYOR',
      funcionarioId: 9,
      motivoId: 2,
      descripcion: 'anticipo sueldo',
      esAdelanto: true,
      monto: 150,
      monedaId: 1,
      formaPagoId: 4, // el de efectivo (lo setea cargarCatalogos en el flujo real)
    });

    await component.guardar();

    expect(repo.crearValeConfirmado).toHaveBeenCalledTimes(1);
    const payload = repo.crearValeConfirmado.calls.mostRecent().args[0];
    expect(payload.fuente).toBe('CAJA_MAYOR');
    expect(payload.funcionarioId).toBe(9);
    expect(payload.monedaId).toBe(1);
    expect(payload.monto).toBe(150);
    expect(payload.formaPagoId).toBe(4);
    expect(payload.cajaMayorId).toBe(5);
    expect(payload.esAdelanto).toBe(true);
    expect(payload.descripcion).toBe('ANTICIPO SUELDO');
    expect(payload.cuentaBancariaId).toBeUndefined();
  });

  it('Fuente CUENTA_BANCARIA: manda cuentaBancariaId, montoCuentaBancaria/cotizacion null y moneda de la cuenta', async () => {
    (component as any).cajaMayorId = 5;
    component.cuentasBancarias = [{ id: 7, label: 'BANCO · CTA', monedaId: 3 }];
    component.form.controls.fuente.setValue('CUENTA_BANCARIA');
    // Alinea la moneda con la cuenta (como onCuentaBancariaSelected en el flujo real).
    (component as any).onCuentaBancariaSelected(7);
    component.form.patchValue({
      funcionarioId: 9,
      descripcion: 'adelanto banco',
      esAdelanto: false,
      monto: 200,
      cuentaBancariaId: 7,
    });

    await component.guardar();

    expect(repo.crearValeConfirmado).toHaveBeenCalledTimes(1);
    const payload = repo.crearValeConfirmado.calls.mostRecent().args[0];
    expect(payload.fuente).toBe('CUENTA_BANCARIA');
    expect(payload.cuentaBancariaId).toBe(7);
    expect(payload.montoCuentaBancaria).toBeNull();
    expect(payload.cotizacion).toBeNull();
    expect(payload.monedaId).toBe(3); // moneda alineada a la cuenta
    expect(payload.descripcion).toBe('ADELANTO BANCO');
  });

  it('descripcion se envía siempre en MAYÚSCULAS', async () => {
    (component as any).cajaMayorId = 5;
    component.form.patchValue({
      fuente: 'CAJA_MAYOR',
      funcionarioId: 9,
      monto: 100,
      monedaId: 1,
      formaPagoId: 4,
      descripcion: 'Compra de Materiales',
    });

    await component.guardar();

    const payload = repo.crearValeConfirmado.calls.mostRecent().args[0];
    expect(payload.descripcion).toBe('COMPRA DE MATERIALES');
  });
});
