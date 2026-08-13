import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { PagarCppDialogComponent, PagarCppData } from './pagar-cpp-dialog.component';

/**
 * Payload de pago de cuota CxP: caja mayor (efectivo) vs cuenta bancaria.
 */
describe('PagarCppDialogComponent — payload', () => {
  let component: PagarCppDialogComponent;
  let repo: { pagarCppCuota: jasmine.Spy };
  let ref: { close: jasmine.Spy };

  const data: PagarCppData = { cuotaId: 7, titulo: 'PROV · Cuota 1', saldo: 200000, monedaId: 1, simbolo: 'Gs', decimales: 0 };

  beforeEach(() => {
    repo = { pagarCppCuota: jasmine.createSpy('pagarCppCuota').and.returnValue(of({ success: true })) };
    ref = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [PagarCppDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(PagarCppDialogComponent).componentInstance;
    (component as any).formaPagoId = 5;
  });

  it('Caja mayor: fuente CAJA_MAYOR con cajaMayorId + monedaId + formaPagoId', async () => {
    component.form.patchValue({ fuente: 'CAJA_MAYOR', cajaMayorId: 3, monto: 200000, observacion: 'pago' });

    await component.pagar();

    expect(repo.pagarCppCuota).toHaveBeenCalledTimes(1);
    const p = repo.pagarCppCuota.calls.mostRecent().args[0];
    expect(p).toEqual(jasmine.objectContaining({
      cuotaId: 7, monto: 200000, fuente: 'CAJA_MAYOR', cajaMayorId: 3, monedaId: 1, formaPagoId: 5, observacion: 'PAGO',
    }));
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('Cuenta bancaria: fuente CUENTA_BANCARIA con cuentaBancariaId', async () => {
    (component as any).aplicarValidadoresFuente('CUENTA_BANCARIA');
    component.form.patchValue({ fuente: 'CUENTA_BANCARIA', cuentaBancariaId: 9, monto: 150000 });

    await component.pagar();

    const p = repo.pagarCppCuota.calls.mostRecent().args[0];
    expect(p.fuente).toBe('CUENTA_BANCARIA');
    expect(p.cuentaBancariaId).toBe(9);
    expect(p.cajaMayorId).toBeUndefined();
    expect(p.monto).toBe(150000);
  });
});
