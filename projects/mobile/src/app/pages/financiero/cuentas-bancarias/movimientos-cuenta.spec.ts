import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { MovimientosCuentaPage } from './movimientos-cuenta.page';

/**
 * Verifica el mapper privado toVM(m) de la vista de movimientos bancarios:
 * mapea el tipo al label legible (TIPO_LABELS), esIngreso/monto/descripcion,
 * numeroComprobante/origen, responsable '-' -> undefined, anulado.
 */
describe('MovimientosCuentaPage — toVM(m)', () => {
  let component: MovimientosCuentaPage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MovimientosCuentaPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: {} },
        { provide: PermissionService, useValue: { codigos$: of([]), has: () => true } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit (que pega al repo) y probamos toVM solo.
    component = TestBed.createComponent(MovimientosCuentaPage).componentInstance;
  });

  it('mapea tipo -> tipoLabel legible y los campos base', () => {
    const vm = (component as any).toVM({
      id: 5,
      tipo: 'ENTRADA_MANUAL',
      esIngreso: true,
      monto: '150.5',
      fecha: '2026-07-15',
      descripcion: 'DEPOSITO INICIAL',
      numeroComprobante: 'C-1',
      origen: 'MANUAL',
      responsable: 'JUAN',
      anulado: false,
    });

    expect(vm.id).toBe(5);
    expect(vm.tipoLabel).toBe('Entrada manual');
    expect(vm.esIngreso).toBe(true);
    expect(vm.monto).toBe(150.5);
    expect(vm.fecha).toBe('2026-07-15');
    expect(vm.descripcion).toBe('DEPOSITO INICIAL');
    expect(vm.numeroComprobante).toBe('C-1');
    expect(vm.origen).toBe('MANUAL');
    expect(vm.responsable).toBe('JUAN');
    expect(vm.anulado).toBe(false);
  });

  it('responsable "-" se mapea a undefined y anulado true', () => {
    const vm = (component as any).toVM({
      id: 6,
      tipo: 'SALIDA_MANUAL',
      esIngreso: false,
      monto: 80,
      fecha: '2026-07-15',
      responsable: '-',
      anulado: true,
    });

    expect(vm.tipoLabel).toBe('Salida manual');
    expect(vm.esIngreso).toBe(false);
    expect(vm.monto).toBe(80);
    expect(vm.responsable).toBeUndefined();
    expect(vm.descripcion).toBeUndefined();
    expect(vm.numeroComprobante).toBeUndefined();
    expect(vm.origen).toBeUndefined();
    expect(vm.anulado).toBe(true);
  });

  it('tipo desconocido cae al valor crudo (uppercase) y monto no numérico -> 0', () => {
    const vm = (component as any).toVM({
      id: 7,
      tipo: 'algo_raro',
      esIngreso: true,
      monto: 'x',
      fecha: '2026-07-15',
    });

    expect(vm.tipoLabel).toBe('ALGO_RARO');
    expect(vm.monto).toBe(0);
  });
});
