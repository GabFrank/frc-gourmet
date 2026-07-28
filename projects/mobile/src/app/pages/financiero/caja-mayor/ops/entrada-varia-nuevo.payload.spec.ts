import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { EntradaVariaNuevoPage } from './entrada-varia-nuevo.page';

/**
 * Payload de Entrada Varia: destino CAJA_MAYOR (con cajaMayorId) vs
 * CUENTA_BANCARIA (con cuentaBancariaId). Descripción en UPPERCASE.
 */
describe('EntradaVariaNuevoPage — payload', () => {
  let component: EntradaVariaNuevoPage;
  let repo: { createEntradaVaria: jasmine.Spy };

  beforeEach(() => {
    repo = { createEntradaVaria: jasmine.createSpy('createEntradaVaria').and.returnValue(of({ id: 1 })) };
    TestBed.configureTestingModule({
      imports: [EntradaVariaNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(EntradaVariaNuevoPage).componentInstance;
    component.cajaMayorId = 11;
  });

  it('Destino CAJA_MAYOR: manda cajaMayorId y NO cuentaBancariaId', async () => {
    component.form.patchValue({
      destinoTipo: 'CAJA_MAYOR', entradaVariaCategoriaId: 2, descripcion: 'aporte socio',
      monto: 300000, monedaId: 1, formaPagoId: 5,
    });

    await component.guardar();

    expect(repo.createEntradaVaria).toHaveBeenCalledTimes(1);
    const p = repo.createEntradaVaria.calls.mostRecent().args[0];
    expect(p.destinoTipo).toBe('CAJA_MAYOR');
    expect(p.cajaMayorId).toBe(11);
    expect(p.cuentaBancariaId).toBeUndefined();
    expect(p.descripcion).toBe('APORTE SOCIO');
    expect(p.monto).toBe(300000);
  });

  it('Destino CUENTA_BANCARIA: manda cuentaBancariaId y NO cajaMayorId', async () => {
    (component as any).aplicarDestino('CUENTA_BANCARIA');
    component.form.patchValue({
      destinoTipo: 'CUENTA_BANCARIA', cuentaBancariaId: 8, entradaVariaCategoriaId: 2,
      descripcion: 'transferencia', monto: 500000, monedaId: 1, formaPagoId: 5,
    });

    await component.guardar();

    const p = repo.createEntradaVaria.calls.mostRecent().args[0];
    expect(p.destinoTipo).toBe('CUENTA_BANCARIA');
    expect(p.cuentaBancariaId).toBe(8);
    expect(p.cajaMayorId).toBeUndefined();
  });
});
