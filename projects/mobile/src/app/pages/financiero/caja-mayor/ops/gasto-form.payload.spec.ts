import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { GastoFormPage } from './gasto-form.page';

/**
 * Verifica la construcción del payload de gasto (fix de la revisión):
 * - Caja Mayor: detalles[] con formaPagoId = efectivo.
 * - Cuenta bancaria: cuentaBancaria:{id} ANIDADO + monto/monedaId (no cuentaBancariaId plano).
 * - Bloqueo de guardado si no hay forma EFECTIVO.
 */
describe('GastoFormPage — construcción del payload', () => {
  let component: GastoFormPage;
  let repo: { createGasto: jasmine.Spy; editGasto: jasmine.Spy };

  beforeEach(() => {
    repo = {
      createGasto: jasmine.createSpy('createGasto').and.returnValue(of({ id: 1 })),
      editGasto: jasmine.createSpy('editGasto').and.returnValue(of({ id: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [GastoFormPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // No llamamos detectChanges: evitamos ngOnInit/cargar (que pega al repo) y
    // seteamos el estado a mano para probar solo guardar().
    component = TestBed.createComponent(GastoFormPage).componentInstance;
  });

  function setLineas(...lineas: Array<[number, number]>): void {
    component.detalles.clear();
    for (const [monedaId, monto] of lineas) {
      (component as any).detalles.push((component as any).nuevaLinea(monedaId, monto));
    }
  }

  it('Caja Mayor: manda detalles[] con formaPagoId = efectivo y sin cuentaBancaria', async () => {
    component.form.patchValue({
      destinoTipo: 'CAJA_MAYOR',
      cajaMayorId: 5,
      gastoCategoriaId: 2,
      descripcion: 'ALQUILER',
      fecha: '2026-07-15',
    });
    (component as any).efectivoFormaId = 1;
    setLineas([10, 100], [20, 50]);

    await component.guardar();

    expect(repo.createGasto).toHaveBeenCalledTimes(1);
    const payload = repo.createGasto.calls.mostRecent().args[0];
    expect(payload.destinoTipo).toBe('CAJA_MAYOR');
    expect(payload.cajaMayor).toEqual({ id: 5 });
    expect(payload.detalles).toEqual([
      { monedaId: 10, formaPagoId: 1, monto: 100 },
      { monedaId: 20, formaPagoId: 1, monto: 50 },
    ]);
    expect(payload.cuentaBancaria).toBeUndefined();
  });

  it('Cuenta bancaria: manda cuentaBancaria:{id} ANIDADO + monto/monedaId, sin detalles', async () => {
    component.form.patchValue({
      destinoTipo: 'CUENTA_BANCARIA',
      cajaMayorId: 5,
      gastoCategoriaId: 2,
      descripcion: 'SERVICIO',
      fecha: '2026-07-15',
      cuentaBancariaId: 7,
    });
    setLineas([10, 100]);

    await component.guardar();

    expect(repo.createGasto).toHaveBeenCalledTimes(1);
    const payload = repo.createGasto.calls.mostRecent().args[0];
    expect(payload.destinoTipo).toBe('CUENTA_BANCARIA');
    expect(payload.cuentaBancaria).toEqual({ id: 7 });
    expect(payload.monto).toBe(100);
    expect(payload.monedaId).toBe(10);
    expect(payload.detalles).toBeUndefined();
    // el fix: NO debe ir cuentaBancariaId plano (que el handler descarta)
    expect(payload.cuentaBancariaId).toBeUndefined();
  });

  it('Caja Mayor sin forma EFECTIVO: NO guarda (bloqueo)', async () => {
    component.form.patchValue({
      destinoTipo: 'CAJA_MAYOR',
      cajaMayorId: 5,
      gastoCategoriaId: 2,
      descripcion: 'X',
      fecha: '2026-07-15',
    });
    (component as any).efectivoFormaId = null;
    setLineas([10, 100]);

    await component.guardar();

    expect(repo.createGasto).not.toHaveBeenCalled();
  });
});
