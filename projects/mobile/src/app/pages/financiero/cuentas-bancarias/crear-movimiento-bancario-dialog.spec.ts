import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { CrearMovimientoBancarioDialogComponent } from './crear-movimiento-bancario-dialog.component';

/**
 * Verifica el payload del movimiento bancario manual:
 * - createMovimientoBancario con cuentaBancariaId (del data), monto number,
 *   observacion UPPERCASE, numeroComprobante null si vacío, fecha Date.
 * - en éxito llama ref.close(true).
 */
describe('CrearMovimientoBancarioDialogComponent — guardar()', () => {
  let component: CrearMovimientoBancarioDialogComponent;
  let repo: { createMovimientoBancario: jasmine.Spy };
  let ref: { close: jasmine.Spy };

  beforeEach(() => {
    repo = {
      createMovimientoBancario: jasmine
        .createSpy('createMovimientoBancario')
        .and.returnValue(of({ id: 1 })),
    };
    ref = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [CrearMovimientoBancarioDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { cuentaBancariaId: 9, simbolo: 'Gs' } },
      ],
    });
    component = TestBed.createComponent(CrearMovimientoBancarioDialogComponent).componentInstance;
  });

  it('arma el payload correcto y cierra el diálogo con true', async () => {
    component.form.patchValue({
      tipoMovimiento: 'SALIDA_MANUAL',
      monto: 250,
      observacion: 'pago de servicio',
      numeroComprobante: 'abc-1',
    });

    await component.guardar();

    expect(repo.createMovimientoBancario).toHaveBeenCalledTimes(1);
    const payload = repo.createMovimientoBancario.calls.mostRecent().args[0];
    expect(payload.cuentaBancariaId).toBe(9);
    expect(payload.tipoMovimiento).toBe('SALIDA_MANUAL');
    expect(payload.monto).toBe(250);
    expect(payload.observacion).toBe('PAGO DE SERVICIO');
    expect(payload.numeroComprobante).toBe('ABC-1');
    expect(payload.fecha instanceof Date).toBe(true);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('numeroComprobante vacío -> null en el payload', async () => {
    component.form.patchValue({
      tipoMovimiento: 'ENTRADA_MANUAL',
      monto: 100,
      observacion: 'INGRESO',
      numeroComprobante: '',
    });

    await component.guardar();

    const payload = repo.createMovimientoBancario.calls.mostRecent().args[0];
    expect(payload.numeroComprobante).toBeNull();
    expect(payload.monto).toBe(100);
    expect(ref.close).toHaveBeenCalledWith(true);
  });
});
