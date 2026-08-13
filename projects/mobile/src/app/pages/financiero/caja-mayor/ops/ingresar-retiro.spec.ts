import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { IngresarRetiroPage } from './ingresar-retiro.page';

/**
 * Verifica el mapper privado toVM(r): agrupa detalles por moneda sumando montos,
 * arma origenCaja / responsable y resuelve estadoClase (warn/info).
 *
 * NOTA: la lógica de filtrar los VINCULADO_PENDIENTE por cajaMayorId (para no
 * ingresar a esta caja un retiro destinado a otra) vive en cargar(); no se
 * ejercita aquí porque depende de ngOnInit/red — este spec cubre toVM.
 */
describe('IngresarRetiroPage — toVM', () => {
  let component: IngresarRetiroPage;

  beforeEach(() => {
    const repo = {
      getRetirosCaja: jasmine.createSpy('getRetirosCaja').and.returnValue(of([])),
      ingresarRetiroCaja: jasmine.createSpy('ingresarRetiroCaja').and.returnValue(of({})),
    };
    TestBed.configureTestingModule({
      imports: [IngresarRetiroPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    // Sin detectChanges: evitamos ngOnInit/cargar (que pega al repo).
    component = TestBed.createComponent(IngresarRetiroPage).componentInstance;
  });

  it('agrupa dos detalles de la MISMA moneda en un total sumado', () => {
    const r = {
      id: 7,
      caja: { id: 3, dispositivo: { nombre: 'TERMINAL 1' } },
      fechaRetiro: '2026-07-15',
      responsableRetiro: { persona: { nombre: 'Juan', apellido: 'Perez' } },
      estado: 'FLOTANTE',
      detalles: [
        { moneda: { id: 1, simbolo: 'Gs', decimales: 0 }, monto: 100 },
        { moneda: { id: 1, simbolo: 'Gs', decimales: 0 }, monto: 50 },
      ],
    };

    const vm = (component as any).toVM(r);

    expect(vm.id).toBe(7);
    expect(vm.totales.length).toBe(1);
    expect(vm.totales[0].simbolo).toBe('Gs');
    expect(vm.totales[0].monto).toBe(150);
    expect(vm.totales[0].decimales).toBe(0);
    expect(vm.origenCaja).toBe('Caja #3 · TERMINAL 1');
    expect(vm.responsable).toBe('Juan Perez');
    expect(vm.estado).toBe('FLOTANTE');
    expect(vm.estadoLabel).toBe('Flotante');
    expect(vm.estadoClase).toBe('warn');
  });

  it('separa dos monedas en dos totales y marca VINCULADO_PENDIENTE como info', () => {
    const r = {
      id: 8,
      caja: { id: 4, dispositivo: { nombre: 'CAJA A' } },
      fechaRetiro: '2026-07-15',
      responsableRetiro: { persona: { nombre: 'Ana', apellido: 'Lopez' } },
      estado: 'VINCULADO_PENDIENTE',
      detalles: [
        { moneda: { id: 1, simbolo: 'Gs', decimales: 0 }, monto: 100 },
        { moneda: { id: 2, simbolo: 'US$', decimales: 2 }, monto: 20 },
      ],
    };

    const vm = (component as any).toVM(r);

    expect(vm.totales.length).toBe(2);
    const gs = vm.totales.find((t: any) => t.simbolo === 'Gs');
    const usd = vm.totales.find((t: any) => t.simbolo === 'US$');
    expect(gs.monto).toBe(100);
    expect(usd.monto).toBe(20);
    expect(usd.decimales).toBe(2);
    expect(vm.origenCaja).toBe('Caja #4 · CAJA A');
    expect(vm.estadoLabel).toBe('Vinculado');
    expect(vm.estadoClase).toBe('info');
  });
});
