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
 * Verifica el mapper privado toMovVM(m), con foco en la regla "anulable":
 * solo gastos, entradas varias, vales y ajustes manuales se pueden anular desde
 * la PWA; retiros/cuotas/salarios no; y nada que ya esté anulado o sea ANULACION.
 * También confirma el mapeo de tipoLabel (TIPO_LABELS).
 */
describe('CajaMayorDetallePage — toMovVM (puedeAnular / tipoLabel)', () => {
  let component: CajaMayorDetallePage;

  beforeEach(() => {
    const repo = {
      getCajaMayor: jasmine.createSpy('getCajaMayor').and.returnValue(of(null)),
      getCajaMayorConfiguracion: jasmine.createSpy('getCajaMayorConfiguracion').and.returnValue(of(null)),
      getCajaMayorSaldos: jasmine.createSpy('getCajaMayorSaldos').and.returnValue(of([])),
      getCuentasBancarias: jasmine.createSpy('getCuentasBancarias').and.returnValue(of([])),
      getCajaMayorMovimientos: jasmine
        .createSpy('getCajaMayorMovimientos')
        .and.returnValue(of({ items: [], total: 0 })),
    };
    TestBed.configureTestingModule({
      imports: [CajaMayorDetallePage, NoopAnimationsModule, RouterTestingModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: PermissionService, useValue: { codigos$: of([]), has: () => true } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(null) }) } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit/cargar (que pega al repo).
    component = TestBed.createComponent(CajaMayorDetallePage).componentInstance;
  });

  function toVM(m: any): any {
    return (component as any).toMovVM(m);
  }

  it('EGRESO_GASTO con gasto.id -> puedeAnular true y gastoId seteado', () => {
    const vm = toVM({ id: 1, tipoMovimiento: 'EGRESO_GASTO', gasto: { id: 99 } });
    expect(vm.puedeAnular).toBe(true);
    expect(vm.gastoId).toBe(99);
    expect(vm.tipoLabel).toBe('Gasto');
  });

  it('INGRESO_ENTRADA_VARIA con entradaVariaId -> puedeAnular true', () => {
    const vm = toVM({ id: 2, tipoMovimiento: 'INGRESO_ENTRADA_VARIA', entradaVariaId: 5 });
    expect(vm.puedeAnular).toBe(true);
    expect(vm.entradaVariaId).toBe(5);
    expect(vm.tipoLabel).toBe('Entrada varia');
  });

  it('EGRESO_VALE con valeId -> puedeAnular true y valeId seteado', () => {
    const vm = toVM({ id: 3, tipoMovimiento: 'EGRESO_VALE', valeId: 12 });
    expect(vm.puedeAnular).toBe(true);
    expect(vm.valeId).toBe(12);
    expect(vm.tipoLabel).toBe('Vale');
  });

  it('AJUSTE_POSITIVO y AJUSTE_NEGATIVO -> puedeAnular true', () => {
    const pos = toVM({ id: 4, tipoMovimiento: 'AJUSTE_POSITIVO' });
    const neg = toVM({ id: 5, tipoMovimiento: 'AJUSTE_NEGATIVO' });
    expect(pos.puedeAnular).toBe(true);
    expect(pos.tipoLabel).toBe('Ajuste positivo');
    expect(neg.puedeAnular).toBe(true);
    expect(neg.tipoLabel).toBe('Ajuste negativo');
  });

  it('INGRESO_RETIRO_CAJA / EGRESO_CUOTA_COMPRA / EGRESO_SALARIO -> puedeAnular false', () => {
    const retiro = toVM({ id: 6, tipoMovimiento: 'INGRESO_RETIRO_CAJA' });
    const cuota = toVM({ id: 7, tipoMovimiento: 'EGRESO_CUOTA_COMPRA' });
    const salario = toVM({ id: 8, tipoMovimiento: 'EGRESO_SALARIO' });
    expect(retiro.puedeAnular).toBe(false);
    expect(cuota.puedeAnular).toBe(false);
    expect(salario.puedeAnular).toBe(false);
    expect(retiro.tipoLabel).toBe('Retiro de caja');
    expect(cuota.tipoLabel).toBe('Cuota de compra');
    expect(salario.tipoLabel).toBe('Salario');
  });

  it('movimiento ya anulado (m.anulacion) -> puedeAnular false y anulado true', () => {
    const vm = toVM({
      id: 9,
      tipoMovimiento: 'EGRESO_GASTO',
      gasto: { id: 99 },
      anulacion: { motivo: 'ERROR DE CARGA' },
    });
    expect(vm.anulado).toBe(true);
    expect(vm.motivoAnulacion).toBe('ERROR DE CARGA');
    expect(vm.puedeAnular).toBe(false);
  });

  it('un movimiento ANULACION -> esAnulacion true y puedeAnular false', () => {
    const vm = toVM({ id: 10, tipoMovimiento: 'ANULACION' });
    expect(vm.esAnulacion).toBe(true);
    expect(vm.puedeAnular).toBe(false);
    expect(vm.tipoLabel).toBe('Anulación');
  });
});
