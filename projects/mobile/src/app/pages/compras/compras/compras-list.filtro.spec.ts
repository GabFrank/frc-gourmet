import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ComprasListPage } from './compras-list.page';

/**
 * Verifica el armado de params() (filtros → backend) y el mapeo toVM
 * (clases de estado + estado de pago). No se llama detectChanges para
 * evitar ngOnInit (que pega al repo).
 */
describe('ComprasListPage — filtros y mapeo', () => {
  let component: ComprasListPage;

  beforeEach(() => {
    const repo = {
      getComprasPaginado: jasmine.createSpy('getComprasPaginado').and.returnValue(of({ items: [], total: 0 })),
      getProveedores: jasmine.createSpy('getProveedores').and.returnValue(of([])),
    };
    const perm = { codigos$: of([]), has: () => true };
    TestBed.configureTestingModule({
      imports: [ComprasListPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: PermissionService, useValue: perm },
      ],
    });
    component = TestBed.createComponent(ComprasListPage).componentInstance;
  });

  it('params(): omite vacíos y respeta credito=false (contado)', () => {
    component.filtros.patchValue({
      search: '  factura ',
      proveedorId: 3,
      estado: 'FINALIZADO',
      credito: false,
      fechaDesde: '2026-07-01',
      fechaHasta: '',
    });
    const p = (component as any).params();
    expect(p.search).toBe('factura');
    expect(p.proveedorId).toBe(3);
    expect(p.estado).toBe('FINALIZADO');
    expect(p.credito).toBe(false); // contado: no debe caer a undefined
    expect(p.fechaDesde).toBe('2026-07-01');
    expect(p.fechaHasta).toBeUndefined();
    expect(p.pageSize).toBe(20);
  });

  it('params(): credito=null → undefined (Todas)', () => {
    const p = (component as any).params();
    expect(p.credito).toBeUndefined();
    expect(p.search).toBeUndefined();
  });

  it('toVM(): clases de estado y estado de pago', () => {
    const vm = (component as any).toVM({
      id: 7,
      estado: 'FINALIZADO',
      estadoPago: 'PARCIAL',
      proveedor: { nombre: 'ACME' },
      moneda: { simbolo: '₲', decimales: 0 },
      total: 1000,
      cuotasPagadas: 1,
      cuotasTotal: 3,
    });
    expect(vm.estadoClase).toBe('ok');
    expect(vm.estadoPagoClase).toBe('warn');
    expect(vm.proveedor).toBe('ACME');
    expect(vm.cuotasTotal).toBe(3);
  });

  it('toVM(): ABIERTO/CANCELADO y sin estado de pago', () => {
    const abierto = (component as any).toVM({ id: 1, estado: 'ABIERTO', proveedor: {}, moneda: {} });
    expect(abierto.estadoClase).toBe('info');
    expect(abierto.estadoPago).toBeNull();

    const cancel = (component as any).toVM({ id: 2, estado: 'CANCELADO', proveedor: {}, moneda: {} });
    expect(cancel.estadoClase).toBe('anul');
  });

  it('cargarMas(): concatena la página siguiente', () => {
    component.total = 40;
    (component as any).items = [{ id: 1 } as any];
    const repo = TestBed.inject(RepositoryService) as any;
    repo.getComprasPaginado.and.returnValue(of({ items: [{ id: 2, estado: 'FINALIZADO', proveedor: {}, moneda: {} }], total: 40 }));
    component.cargarMas();
    expect(component.items.length).toBe(2);
    expect(component.items[1].id).toBe(2);
  });
});
