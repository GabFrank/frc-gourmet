import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { GastosListPage } from './gastos-list.page';

/**
 * Verifica el mapper privado toVM(g) de la lista de gastos:
 * - esCaja = destinoTipo !== 'CUENTA_BANCARIA' && !g.cuentaBancariaId
 *   (fix ALTO: un gasto de caja con cuentaBancariaId es bancario -> esCaja false).
 * - estadoClase por el mapa ESTADO_CLASE, monto number, categoria, recurrente.
 */
describe('GastosListPage — toVM(g)', () => {
  let component: GastosListPage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GastosListPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: {} },
        { provide: PermissionService, useValue: { codigos$: of([]), has: () => true } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit (que pega al repo) y probamos toVM solo.
    component = TestBed.createComponent(GastosListPage).componentInstance;
  });

  it('CAJA_MAYOR sin cuentaBancariaId -> esCaja true, campos base', () => {
    const vm = (component as any).toVM({
      id: 1,
      descripcion: 'ALQUILER',
      gastoCategoria: { nombre: 'FIJOS' },
      moneda: { simbolo: 'Gs', decimales: 0 },
      monto: '500000',
      fecha: '2026-07-15',
      estado: 'PAGADO',
      destinoTipo: 'CAJA_MAYOR',
      cuentaBancariaId: null,
      esRecurrente: true,
    });

    expect(vm.id).toBe(1);
    expect(vm.descripcion).toBe('ALQUILER');
    expect(vm.categoria).toBe('FIJOS');
    expect(vm.simbolo).toBe('Gs');
    expect(vm.decimales).toBe(0);
    expect(vm.monto).toBe(500000);
    expect(vm.estado).toBe('PAGADO');
    expect(vm.estadoClase).toBe('ok');
    expect(vm.esCaja).toBe(true);
    expect(vm.recurrente).toBe(true);
  });

  it('CUENTA_BANCARIA -> esCaja false', () => {
    const vm = (component as any).toVM({
      id: 2,
      destinoTipo: 'CUENTA_BANCARIA',
      cuentaBancariaId: null,
      estado: 'PENDIENTE',
    });

    expect(vm.esCaja).toBe(false);
    expect(vm.estadoClase).toBe('warn');
  });

  it('fix ALTO: CAJA_MAYOR con cuentaBancariaId=5 (gasto bancario del escritorio) -> esCaja false', () => {
    const vm = (component as any).toVM({
      id: 3,
      destinoTipo: 'CAJA_MAYOR',
      cuentaBancariaId: 5,
      estado: 'PROGRAMADO',
    });

    expect(vm.esCaja).toBe(false);
    expect(vm.estadoClase).toBe('info');
  });

  it('estadoClase mapea CANCELADO -> anul y desconocido -> off', () => {
    expect((component as any).toVM({ estado: 'CANCELADO', destinoTipo: 'CAJA_MAYOR' }).estadoClase).toBe('anul');
    expect((component as any).toVM({ estado: 'OTRO', destinoTipo: 'CAJA_MAYOR' }).estadoClase).toBe('off');
  });
});
