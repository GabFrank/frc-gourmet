import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { PagoMixtoCppDialogComponent, PagoMixtoCppData } from './pago-mixto-cpp-dialog.component';

/**
 * Verifica la conversión (compraLocal) y el armado de líneas del pago mixto.
 * CPP en moneda 1 (guaraní). Cambio USD(2)→PYG(1) = 7000.
 */
describe('PagoMixtoCppDialogComponent — conversión y payload', () => {
  let c: PagoMixtoCppDialogComponent;

  const data: PagoMixtoCppData = { cuotaId: 5, titulo: 'ACME', saldo: 100000, monedaId: 1, simbolo: '₲', decimales: 0 };

  beforeEach(() => {
    const repo = {
      getMonedas: () => of([]), getFormasPago: () => of([]), getCajasMayor: () => of([]), getMonedasCambio: () => of([]),
      pagarCppCuotaMixto: jasmine.createSpy('pagarCppCuotaMixto').and.returnValue(of({ lineas: 2 })),
    };
    TestBed.configureTestingModule({
      imports: [PagoMixtoCppDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    c = TestBed.createComponent(PagoMixtoCppDialogComponent).componentInstance;
    (c as any).cambios = [
      { monedaOrigen: { id: 2 }, monedaDestino: { id: 1 }, compraLocal: 7000, activo: true },
    ];
    c.cajaMayorId = 9;
  });

  it('cotizacionA: 1 si es la misma moneda; tasa cruzada; null si falta', () => {
    expect(c.cotizacionA(1)).toBe(1);
    expect(c.cotizacionA(2)).toBe(7000);
    expect(c.cotizacionA(3)).toBeNull();
  });

  it('recompute: convierte y valida contra el saldo', () => {
    c.lineas = [
      { monedaId: 1, formaPagoId: 1, monto: 30000, convertido: null },
      { monedaId: 2, formaPagoId: 1, monto: 10, convertido: null }, // 10 USD * 7000 = 70000
    ];
    c.recompute();
    expect(c.totalConvertido).toBe(100000); // 30000 + 70000
    expect(c.restante).toBe(0);
    expect(c.valido).toBe(true);
  });

  it('recompute: sobre-pago invalida', () => {
    c.lineas = [{ monedaId: 2, formaPagoId: 1, monto: 20, convertido: null }]; // 140000 > 100000
    c.recompute();
    expect(c.valido).toBe(false);
  });

  it('recompute: línea sin cotización invalida y marca el flag', () => {
    c.lineas = [{ monedaId: 3, formaPagoId: 1, monto: 5, convertido: null }];
    c.recompute();
    expect(c.hayLineaSinCotizacion).toBe(true);
    expect(c.valido).toBe(false);
  });

  it('construirLineas: fuente CAJA_MAYOR + cotización + caja', () => {
    c.lineas = [{ monedaId: 2, formaPagoId: 4, monto: 10, convertido: null }];
    const out = c.construirLineas();
    expect(out).toEqual([{ monedaId: 2, formaPagoId: 4, monto: 10, cotizacion: 7000, fuente: 'CAJA_MAYOR', cajaMayorId: 9 }]);
  });

  it('confirmar: envía payload y cierra en true', async () => {
    c.lineas = [{ monedaId: 1, formaPagoId: 1, monto: 100000, convertido: null }];
    await c.confirmar();
    const repo = TestBed.inject(RepositoryService) as any;
    expect(repo.pagarCppCuotaMixto).toHaveBeenCalledTimes(1);
    const payload = repo.pagarCppCuotaMixto.calls.mostRecent().args[0];
    expect(payload.cuotaId).toBe(5);
    expect(payload.lineas.length).toBe(1);
    expect(c.ref.close).toHaveBeenCalledWith(true);
  });
});
