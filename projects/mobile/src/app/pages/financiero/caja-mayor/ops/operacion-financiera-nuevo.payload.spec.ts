import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { OperacionFinancieraNuevoPage } from './operacion-financiera-nuevo.page';

/**
 * Verifica la construcción del payload de Operación Financiera:
 * - Mapea *Id planos y descripción en UPPERCASE.
 * - CAMBIO_DIVISA lleva ambos lados + cotización; DEPOSITO_BANCARIO lleva
 *   cuentaBancariaDestinoId.
 * Se prueba solo guardar() (sin ngOnInit, que pega al repo).
 */
describe('OperacionFinancieraNuevoPage — payload', () => {
  let component: OperacionFinancieraNuevoPage;
  let repo: { createOperacionFinanciera: jasmine.Spy };

  beforeEach(() => {
    repo = { createOperacionFinanciera: jasmine.createSpy('createOperacionFinanciera').and.returnValue(of({ id: 1 })) };
    TestBed.configureTestingModule({
      imports: [OperacionFinancieraNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(OperacionFinancieraNuevoPage).componentInstance;
  });

  it('CAMBIO_DIVISA: mapea ambos lados + cotización y uppercasea la descripción', async () => {
    component.form.patchValue({
      tipoOperacion: 'CAMBIO_DIVISA',
      descripcion: 'cambio dolares',
      cajaMayorOrigenId: 1,
      monedaOrigenId: 2,
      formaPagoOrigenId: 5,
      montoOrigen: 100,
      monedaDestinoId: 1,
      formaPagoDestinoId: 5,
      montoDestino: 600000,
      cotizacion: 6000,
    });

    await component.guardar();

    expect(repo.createOperacionFinanciera).toHaveBeenCalledTimes(1);
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.tipoOperacion).toBe('CAMBIO_DIVISA');
    expect(p.descripcion).toBe('CAMBIO DOLARES');
    expect(p.monedaOrigenId).toBe(2);
    expect(p.montoOrigen).toBe(100);
    expect(p.monedaDestinoId).toBe(1);
    expect(p.montoDestino).toBe(600000);
    expect(p.cotizacion).toBe(6000);
    expect(p.diferenciaDestinoTipo).toBe('IGNORAR');
    expect(p.fecha instanceof Date).toBeTrue();
  });

  it('DEPOSITO_BANCARIO: lleva cuentaBancariaDestinoId y sin cuenta origen', async () => {
    component.form.patchValue({
      tipoOperacion: 'DEPOSITO_BANCARIO',
      descripcion: 'deposito',
      cajaMayorOrigenId: 1,
      monedaOrigenId: 1,
      formaPagoOrigenId: 5,
      montoOrigen: 500000,
      cuentaBancariaDestinoId: 9,
      monedaDestinoId: 1,
      montoDestino: 500000,
    });

    await component.guardar();

    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.tipoOperacion).toBe('DEPOSITO_BANCARIO');
    expect(p.cuentaBancariaDestinoId).toBe(9);
    expect(p.cuentaBancariaOrigenId).toBeNull();
    expect(p.cajaMayorOrigenId).toBe(1);
    expect(p.montoDestino).toBe(500000);
  });

  it('Cambiar de tipo limpia los campos que ya no aplican (no persiste relación bogus)', async () => {
    // Elijo DEPOSITO y seteo la cuenta destino…
    component.form.patchValue({ tipoOperacion: 'DEPOSITO_BANCARIO', cuentaBancariaDestinoId: 9 });
    // …y cambio a CAMBIO_DIVISA: la cuenta destino ya no aplica y debe limpiarse.
    component.tipoOperacion = 'CAMBIO_DIVISA';
    (component as any).aplicarTipo();
    expect(component.form.controls.cuentaBancariaDestinoId.value).toBeNull();

    component.form.patchValue({
      descripcion: 'cambio', cajaMayorOrigenId: 1, monedaOrigenId: 2, formaPagoOrigenId: 5, montoOrigen: 100,
      monedaDestinoId: 1, formaPagoDestinoId: 5, montoDestino: 600000, cotizacion: 6000,
    });
    await component.guardar();
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.cuentaBancariaDestinoId).toBeNull();
  });
});
