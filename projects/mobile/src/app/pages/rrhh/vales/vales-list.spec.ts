import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ValesListPage } from './vales-list.page';

/**
 * Verifica el mapper privado toVM() (clases de estado + flags de acción) y el
 * filtro por funcionario de aplicarFiltro().
 *
 * No se llama detectChanges: se evita ngOnInit/cargar (que pega al repo) y se
 * prueba directamente la lógica de mapeo/filtrado.
 */
describe('ValesListPage — toVM() y aplicarFiltro()', () => {
  let component: ValesListPage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ValesListPage, NoopAnimationsModule],
      providers: [
        {
          provide: RepositoryService,
          useValue: { getVales: jasmine.createSpy('getVales').and.returnValue(of([])) },
        },
        { provide: PermissionService, useValue: { codigos$: of([]), has: () => true } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(ValesListPage).componentInstance;
  });

  function vale(estado: string): any {
    return {
      id: 1,
      estado,
      funcionario: { id: 3, persona: { nombre: 'Juan', apellido: 'Pérez' } },
      motivo: { nombre: 'ADELANTO' },
      descripcion: 'X',
      fecha: '2026-07-15',
      moneda: { simbolo: 'Gs' },
      monto: '150',
      esAdelanto: 1,
    };
  }

  it('SOLICITADO: estadoClase sol, puedeConfirmar true, puedeAnular true', () => {
    const vm = (component as any).toVM(vale('SOLICITADO'));
    expect(vm.estadoClase).toBe('sol');
    expect(vm.puedeConfirmar).toBe(true);
    expect(vm.puedeAnular).toBe(true);
  });

  it('CONFIRMADO: estadoClase conf, puedeConfirmar false, puedeAnular true', () => {
    const vm = (component as any).toVM(vale('CONFIRMADO'));
    expect(vm.estadoClase).toBe('conf');
    expect(vm.puedeConfirmar).toBe(false);
    expect(vm.puedeAnular).toBe(true);
  });

  it('DESCONTADO: estadoClase desc, puedeConfirmar false, puedeAnular false', () => {
    const vm = (component as any).toVM(vale('DESCONTADO'));
    expect(vm.estadoClase).toBe('desc');
    expect(vm.puedeConfirmar).toBe(false);
    expect(vm.puedeAnular).toBe(false);
  });

  it('ANULADO: estadoClase anul, puedeConfirmar false, puedeAnular false', () => {
    const vm = (component as any).toVM(vale('ANULADO'));
    expect(vm.estadoClase).toBe('anul');
    expect(vm.puedeConfirmar).toBe(false);
    expect(vm.puedeAnular).toBe(false);
  });

  it('arma funcionario desde persona.nombre + apellido y esAdelanto booleano', () => {
    const vm = (component as any).toVM(vale('SOLICITADO'));
    expect(vm.funcionario).toBe('Juan Pérez');
    expect(vm.esAdelanto).toBe(true);
    expect(vm.monto).toBe(150);
    expect(vm.simbolo).toBe('Gs');
  });

  it('aplicarFiltro() filtra por nombre de funcionario', () => {
    (component as any).todos = [
      (component as any).toVM({ ...vale('SOLICITADO'), id: 1, funcionario: { id: 1, persona: { nombre: 'Juan', apellido: 'Pérez' } } }),
      (component as any).toVM({ ...vale('SOLICITADO'), id: 2, funcionario: { id: 2, persona: { nombre: 'Ana', apellido: 'Gómez' } } }),
    ];
    component.busqueda.setValue('ana');
    component.aplicarFiltro();
    expect(component.items.length).toBe(1);
    expect(component.items[0].funcionario).toBe('Ana Gómez');
  });
});
