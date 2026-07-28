import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { CobrarCpcDialogComponent, CobrarCpcData } from './cobrar-cpc-dialog.component';

/**
 * Payload de cobro de cuota CxC: caja mayor (efectivo) vs cuenta bancaria.
 * Nota: la clave del monto es `montoCobrar` (no `monto`).
 */
describe('CobrarCpcDialogComponent — payload', () => {
  let component: CobrarCpcDialogComponent;
  let repo: { cobrarCpcCuota: jasmine.Spy };
  let ref: { close: jasmine.Spy };

  const data: CobrarCpcData = { cuotaId: 4, titulo: 'CLIENTE · Cuota 1', saldo: 90000, monedaId: 1, simbolo: 'Gs', decimales: 0 };

  beforeEach(() => {
    repo = { cobrarCpcCuota: jasmine.createSpy('cobrarCpcCuota').and.returnValue(of({ success: true })) };
    ref = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [CobrarCpcDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(CobrarCpcDialogComponent).componentInstance;
    (component as any).formaPagoId = 5;
  });

  it('Caja mayor: fuente CAJA_MAYOR con montoCobrar + cajaMayorId + formaPagoId', async () => {
    component.form.patchValue({ fuente: 'CAJA_MAYOR', cajaMayorId: 2, monto: 90000 });

    await component.cobrar();

    const p = repo.cobrarCpcCuota.calls.mostRecent().args[0];
    expect(p).toEqual(jasmine.objectContaining({
      cuotaId: 4, montoCobrar: 90000, fuente: 'CAJA_MAYOR', cajaMayorId: 2, monedaId: 1, formaPagoId: 5,
    }));
    expect(p.monto).toBeUndefined();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('Cuenta bancaria: fuente CUENTA_BANCARIA con cuentaBancariaId', async () => {
    (component as any).aplicarValidadoresFuente('CUENTA_BANCARIA');
    component.form.patchValue({ fuente: 'CUENTA_BANCARIA', cuentaBancariaId: 6, monto: 50000 });

    await component.cobrar();

    const p = repo.cobrarCpcCuota.calls.mostRecent().args[0];
    expect(p.fuente).toBe('CUENTA_BANCARIA');
    expect(p.cuentaBancariaId).toBe(6);
    expect(p.montoCobrar).toBe(50000);
    expect(p.cajaMayorId).toBeUndefined();
  });
});
