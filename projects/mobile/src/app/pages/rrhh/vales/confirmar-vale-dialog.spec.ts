import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmarValeDialogComponent } from './confirmar-vale-dialog.component';

/**
 * Verifica el payload que aceptar() manda a ref.close() según la fuente.
 *
 * No se llama detectChanges: se evita ngOnInit/cargar (que pega al repo) y se
 * setea el estado (form + monedaId) a mano.
 */
describe('ConfirmarValeDialogComponent — aceptar()', () => {
  let component: ConfirmarValeDialogComponent;
  let ref: { close: jasmine.Spy };

  beforeEach(() => {
    ref = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [ConfirmarValeDialogComponent, NoopAnimationsModule],
      providers: [
        {
          provide: RepositoryService,
          useValue: {
            getCajasMayor: jasmine.createSpy('getCajasMayor').and.returnValue(of([])),
            getFormasPago: jasmine.createSpy('getFormasPago').and.returnValue(of([])),
            getCuentasBancarias: jasmine.createSpy('getCuentasBancarias').and.returnValue(of([])),
          },
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { vale: { id: 1, moneda: { id: 3, simbolo: 'Gs' }, monto: 150 } },
        },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    component = TestBed.createComponent(ConfirmarValeDialogComponent).componentInstance;
  });

  it('Fuente CAJA_MAYOR: close con cajaMayorId/formaPagoId y cuentaBancariaId null', () => {
    (component as any).monedaId = 3;
    component.form.patchValue({
      fuente: 'CAJA_MAYOR',
      cajaMayorId: 5,
      formaPagoId: 4,
    });

    component.aceptar();

    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith({
      fuente: 'CAJA_MAYOR',
      monedaId: 3,
      cajaMayorId: 5,
      formaPagoId: 4,
      cuentaBancariaId: null,
      montoCuentaBancaria: null,
    });
  });

  it('Fuente CUENTA_BANCARIA: close con cuentaBancariaId y cajaMayorId/formaPagoId null', () => {
    (component as any).monedaId = 3;
    component.form.patchValue({
      fuente: 'CUENTA_BANCARIA',
      cajaMayorId: 5,
      formaPagoId: 4,
      cuentaBancariaId: 7,
    });

    component.aceptar();

    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith({
      fuente: 'CUENTA_BANCARIA',
      monedaId: 3,
      cajaMayorId: null,
      formaPagoId: null,
      cuentaBancariaId: 7,
      montoCuentaBancaria: null,
    });
  });
});
