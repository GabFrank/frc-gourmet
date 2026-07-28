import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { CajaMayorDetallePage } from './caja-mayor-detalle.page';

/**
 * Observación legible compuesta (5.6) + flags de acción del movimiento:
 * - Gasto: "Gasto #id: desc · proveedor" y puedeAnular (por gastoId).
 * - Cierre de caja: "Cierre de caja #id".
 * - Ajuste manual: puedeEditar + puedeAnular.
 * - Otros tipos: cae al observacion crudo (ya legible).
 */
describe('CajaMayorDetallePage — observación y flags de movimiento', () => {
  let component: CajaMayorDetallePage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CajaMayorDetallePage, NoopAnimationsModule, RouterTestingModule],
      providers: [
        { provide: RepositoryService, useValue: {} },
        { provide: PermissionService, useValue: { codigos$: of([]), has: () => false } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(CajaMayorDetallePage).componentInstance;
  });

  const vm = (m: any) => (component as any).toMovVM(m);

  it('Gasto: compone "Gasto #id: desc · proveedor" y es anulable', () => {
    const r = vm({
      id: 10, tipoMovimiento: 'EGRESO_GASTO', monto: 50000, moneda: { simbolo: 'Gs', decimales: 0 },
      gasto: { id: 12, descripcion: 'LUZ', proveedor: { nombre: 'ANDE' } }, observacion: 'GASTO: LUZ',
    });
    expect(r.observacion).toBe('Gasto #12: LUZ · ANDE');
    expect(r.puedeAnular).toBeTrue();
    expect(r.puedeEditar).toBeFalse();
  });

  it('Cierre de caja: compone "Cierre de caja #id"', () => {
    const r = vm({
      id: 20, tipoMovimiento: 'INGRESO_CIERRE_CAJA', monto: 100000, moneda: { simbolo: 'Gs', decimales: 0 },
      retiroCaja: { id: 5 }, observacion: '',
    });
    expect(r.observacion).toBe('Cierre de caja #5');
  });

  it('Ajuste manual: puedeEditar y puedeAnular, y usa el observacion crudo', () => {
    const r = vm({
      id: 30, tipoMovimiento: 'AJUSTE_POSITIVO', monto: 1000, moneda: { id: 1, simbolo: 'Gs', decimales: 0 },
      formaPago: { id: 5 }, observacion: 'AJUSTE MANUAL',
    });
    expect(r.observacion).toBe('AJUSTE MANUAL');
    expect(r.puedeEditar).toBeTrue();
    expect(r.puedeAnular).toBeTrue();
    expect(r.monedaId).toBe(1);
    expect(r.formaPagoId).toBe(5);
  });

  it('Entrada varia: cae al observacion crudo (ya legible)', () => {
    const r = vm({
      id: 40, tipoMovimiento: 'INGRESO_ENTRADA_VARIA', monto: 2000, moneda: { simbolo: 'Gs', decimales: 0 },
      entradaVariaId: 3, observacion: 'ENTRADA VARIA: APORTE',
    });
    expect(r.observacion).toBe('ENTRADA VARIA: APORTE');
    expect(r.puedeAnular).toBeTrue();
  });
});
