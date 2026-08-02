import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { FinalizarCompraDialogComponent, FinalizarCompraData } from './finalizar-compra-dialog.component';

/**
 * Verifica el payload de finalizarCompra:
 * - Crédito: cantidadCuotas + fechaCreditoInicio, sin pagarAhora.
 * - Contado + pagarAhora: pagarAhora=true, sin cuotas; devuelve cppId para pagar.
 */
describe('FinalizarCompraDialogComponent — payload', () => {
  let repo: { finalizarCompra: jasmine.Spy };
  let dialogRef: { close: jasmine.Spy };

  function crear(data: Partial<FinalizarCompraData>): FinalizarCompraDialogComponent {
    repo = { finalizarCompra: jasmine.createSpy('finalizarCompra').and.returnValue(of({ compra: { cuentaPorPagar: { id: 9 } } })) };
    dialogRef = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [FinalizarCompraDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { compraId: 5, titulo: 'ACME', total: 1000, simbolo: '₲', decimales: 0, credito: false, ...data },
        },
      ],
    }).compileComponents();
    return TestBed.createComponent(FinalizarCompraDialogComponent).componentInstance;
  }

  it('crédito: manda cantidadCuotas + fechaCreditoInicio', async () => {
    const c = crear({ credito: true });
    c.ngOnInit();
    c.form.patchValue({ cantidadCuotas: 3, fechaCreditoInicio: '2026-08-01' });
    await c.confirmar();
    const payload = repo.finalizarCompra.calls.mostRecent().args[1];
    expect(repo.finalizarCompra.calls.mostRecent().args[0]).toBe(5);
    expect(payload.cantidadCuotas).toBe(3);
    expect(payload.fechaCreditoInicio).toBe('2026-08-01');
    expect(payload.pagarAhora).toBeUndefined();
    expect(dialogRef.close).toHaveBeenCalledWith({ ok: true, cppId: 9, pagarAhora: false });
  });

  it('contado + pagar ahora: pagarAhora=true y devuelve cppId', async () => {
    const c = crear({ credito: false });
    c.ngOnInit();
    c.form.patchValue({ pagarAhora: true });
    await c.confirmar();
    const payload = repo.finalizarCompra.calls.mostRecent().args[1];
    expect(payload.pagarAhora).toBe(true);
    expect(payload.cantidadCuotas).toBeUndefined();
    expect(dialogRef.close).toHaveBeenCalledWith({ ok: true, cppId: 9, pagarAhora: true });
  });
});
