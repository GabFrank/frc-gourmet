import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, BehaviorSubject } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { PermissionService } from 'src/app/services/permission.service';
import { PagarObligacionesDialogComponent } from './pagar-obligaciones-dialog.component';
import { PagoConcepto } from 'src/app/database/entities/financiero/pago-consolidado-enums';

/**
 * El wizard pasó de pagar 4 conceptos a pagar y COBRAR cinco, y la lógica que
 * cambia con la dirección vive en `ngOnInit` y en el efecto de tocar el draft
 * sobre los VALORES del form — el mismo lugar donde vivían los bugs que motivaron
 * `create-operacion-financiera-dialog.component.spec.ts`.
 *
 * Lo que se protege acá: que el payload del cobro llegue completo, que el de los
 * cuatro conceptos viejos NO haya cambiado de forma, y que el descuento no se
 * cuele sin permiso ni sobreviva a un cambio de base de cálculo.
 */
describe('PagarObligacionesDialogComponent', () => {
  const MONEDAS = [
    { id: 1, simbolo: 'Gs', denominacion: 'GUARANI', decimales: 0, principal: true, activo: true },
    { id: 2, simbolo: 'US$', denominacion: 'DOLAR', decimales: 2, principal: false, activo: true },
  ];
  const FORMAS_PAGO = [{ id: 5, nombre: 'EFECTIVO', activo: true, movimentaCaja: true }];
  // Con saldo suficiente: si no, `confirmarSaldosNegativos` abre un diálogo real y
  // `confirmar()` queda esperando una respuesta que en un test nadie da.
  const CAJAS = [{
    id: 1, nombre: 'CAJA MAYOR 1', estado: 'ABIERTA',
    saldos: [{ moneda: { id: 1 }, formaPago: { id: 5 }, saldo: 10_000_000 }],
  }];
  const CUENTAS = [{ id: 9, nombre: 'CTA GS', activo: true, saldo: 5_000_000, moneda: { id: 1, simbolo: 'Gs' } }];

  /** Dos cuotas del MISMO cliente, en guaraníes. */
  const CUOTAS_CPC = [
    {
      origenTipo: 'CPC_CUOTA', origenId: 101, numero: '#1', descripcion: 'CUOTA 1/2 — CPC #7',
      beneficiario: 'JUAN PEREZ', beneficiarioId: 55, fecha: '2026-08-01',
      monedaId: 1, monedaSimbolo: 'Gs', decimales: 0,
      montoTotal: 300_000, montoPagado: 0, saldoPendiente: 300_000, bloqueado: false,
    },
    {
      origenTipo: 'CPC_CUOTA', origenId: 102, numero: '#2', descripcion: 'CUOTA 2/2 — CPC #7',
      beneficiario: 'JUAN PEREZ', beneficiarioId: 55, fecha: '2026-09-01',
      monedaId: 1, monedaSimbolo: 'Gs', decimales: 0,
      montoTotal: 200_000, montoPagado: 0, saldoPendiente: 200_000, bloqueado: false,
    },
  ];
  const GASTOS = [
    {
      origenTipo: 'GASTO', origenId: 7, numero: '#7', descripcion: 'GASTO #7',
      beneficiario: null, beneficiarioId: null, fecha: '2026-08-01',
      monedaId: 1, monedaSimbolo: 'Gs', decimales: 0,
      montoTotal: 100_000, montoPagado: 0, saldoPendiente: 100_000, bloqueado: false,
    },
  ];

  let component: PagarObligacionesDialogComponent;
  let repo: any;
  let permisos: BehaviorSubject<Set<string>>;
  let dialogOpen: jasmine.Spy;

  async function crear(
    concepto: PagoConcepto,
    obligaciones: any[],
    codigosPermiso: string[] = ['CPC_DESCUENTO'],
    configCaja: any = { descuentoCpcMaxPorcentaje: null },
  ): Promise<void> {
    permisos = new BehaviorSubject<Set<string>>(new Set(codigosPermiso.map((c) => c.toUpperCase())));
    repo = {
      getObligacionesPendientes: jasmine.createSpy('getObligacionesPendientes').and.returnValue(of(obligaciones)),
      getCajasMayor: () => of(CAJAS),
      getCuentasBancarias: () => of(CUENTAS),
      getMonedas: () => of(MONEDAS),
      getFormasPago: () => of(FORMAS_PAGO),
      getCajaMayorConfiguracion: () => of(configCaja),
      registrarPagoConsolidado: jasmine.createSpy('registrarPagoConsolidado').and.returnValue(of({ id: 1 })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PagarObligacionesDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        {
          provide: PermissionService,
          useValue: {
            codigos$: permisos.asObservable(),
            has: (c: string) => permisos.value.has(c.toUpperCase()),
          },
        },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { concepto, cajaMayorId: 1 } },
      ],
    });
    component = TestBed.createComponent(PagarObligacionesDialogComponent).componentInstance;
    // El componente es standalone e importa MatDialogModule/MatSnackBarModule, que
    // registran sus propios servicios: espiar la instancia que realmente usa es más
    // fiable que sustituir los providers del TestBed (mismo criterio que
    // `create-operacion-financiera-dialog.component.spec.ts`).
    dialogOpen = spyOn((component as any).dialog as MatDialog, 'open')
      .and.returnValue({ afterClosed: () => of(null) } as any);
    spyOn((component as any).snackBar, 'open').and.stub();
    component.ngOnInit();
    await component.cargar();
  }

  /** Hace que el próximo `dialog.open` devuelva este resultado de descuento. */
  function responderDescuento(res: any): void {
    dialogOpen.and.returnValue({ afterClosed: () => of(res) } as any);
  }

  /** Tilda las obligaciones indicadas por origenId. */
  function seleccionar(...ids: number[]): void {
    for (const id of ids) {
      const row = component.obligaciones.find((o) => o.origenId === id)!;
      component.toggle(row);
    }
  }

  /** Agrega una línea de efectivo en guaraníes por el monto dado. */
  function agregarEfectivo(monto: number): void {
    component.draft.patchValue({ fuente: 'CAJA_MAYOR', cajaMayorId: 1, formaPagoId: 5, monedaId: 1, monto });
    component.agregarLinea();
  }

  describe('dirección del concepto', () => {
    it('un cobro se rotula como cobro en todas las etiquetas', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      expect(component.esIngresoConcepto).toBeTrue();
      expect(component.titulo).toBe('Cobrar a cliente');
      expect(component.txt.confirmar).toBe('Confirmar cobro');
      expect(component.txt.columnaMonto).toBe('Monto a cobrar');
      expect(component.txt.columnaBeneficiario).toBe('Cliente');
      expect(component.txt.destinatarioPrefijo).toBe('Cobrar a');
    });

    it('un pago sigue rotulado como pago', async () => {
      await crear(PagoConcepto.GASTO, GASTOS);
      expect(component.esIngresoConcepto).toBeFalse();
      expect(component.txt.confirmar).toBe('Confirmar pago');
      expect(component.txt.columnaBeneficiario).toBe('Beneficiario');
    });
  });

  describe('payload', () => {
    it('el cobro manda items, líneas, motivo y caja de contexto', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102);
      agregarEfectivo(500_000);
      expect(component.cuadra).toBeTrue();

      await component.confirmar();

      const payload = repo.registrarPagoConsolidado.calls.mostRecent().args[0];
      expect(payload.concepto).toBe(PagoConcepto.COBRO_CLIENTE);
      expect(payload.items).toEqual([
        { origenId: 101, monto: 300_000 },
        { origenId: 102, monto: 200_000 },
      ]);
      expect(payload.lineas.length).toBe(1);
      expect(payload.lineas[0]).toEqual(jasmine.objectContaining({
        fuente: 'CAJA_MAYOR', monedaId: 1, formaPagoId: 5, cajaMayorId: 1, monto: 500_000, cotizacion: 1,
      }));
      expect(payload.cajaMayorContextoId).toBe(1);
      expect(payload.motivoDescuento).toBeUndefined();
    });

    // Regresión: los cuatro conceptos viejos no cambian de forma.
    it('el pago de un gasto manda el mismo payload de siempre', async () => {
      await crear(PagoConcepto.GASTO, GASTOS, []);
      seleccionar(7);
      agregarEfectivo(100_000);
      await component.confirmar();

      const payload = repo.registrarPagoConsolidado.calls.mostRecent().args[0];
      expect(payload.concepto).toBe(PagoConcepto.GASTO);
      expect(payload.items).toEqual([{ origenId: 7, monto: 100_000 }]);
      expect(payload.lineas[0].fuente).toBe('CAJA_MAYOR');
      expect(payload.motivoDescuento).toBeUndefined();
      expect(Object.keys(payload.lineas[0]).sort()).toEqual(
        ['cajaMayorId', 'cotizacion', 'cuentaBancariaId', 'fuente', 'formaPagoId', 'monedaId', 'monto'].sort(),
      );
    });
  });

  describe('descuento', () => {
    it('sólo se ofrece con el permiso, aunque el concepto lo admita', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC, []);
      expect(component.permiteDescuento).toBeTrue();
      expect(component.puedeAplicarDescuento).toBeFalse();
    });

    it('se ofrece cuando el usuario tiene CPC_DESCUENTO', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC, ['CPC_DESCUENTO']);
      expect(component.puedeAplicarDescuento).toBeTrue();
    });

    it('nunca se ofrece en un concepto de egreso', async () => {
      await crear(PagoConcepto.GASTO, GASTOS, ['CPC_DESCUENTO']);
      expect(component.permiteDescuento).toBeFalse();
      expect(component.puedeAplicarDescuento).toBeFalse();
    });

    it('lee el tope de la caja desde la que se abrió', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC, ['CPC_DESCUENTO'], { descuentoCpcMaxPorcentaje: 10 });
      expect(component.topeDescuentoPct).toBe(10);
    });

    it('la línea de descuento va en la moneda de la deuda, 1 a 1 y sin caja', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102);
      responderDescuento({ descuentoMonto: 50_000, descuentoMotivo: 'cliente antiguo' });

      await component.aplicarDescuento();

      const linea = component.lineas.find((l) => l.fuente === 'DESCUENTO')!;
      expect(linea).toBeDefined();
      expect(linea.monedaId).toBe(1);
      expect(linea.cotizacion).toBe(1);
      expect(linea.necesitaCotizacion).toBeFalse();
      expect(linea.cajaMayorId).toBeNull();
      expect(linea.cuentaBancariaId).toBeNull();
      expect(linea.formaPagoId).toBeNull();
      expect(linea.icono).toBe('discount');
      expect(component.motivoDescuento).toBe('CLIENTE ANTIGUO');
    });

    it('el porcentaje se convierte a monto contra el total seleccionado', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102); // 500.000
      responderDescuento({ descuentoPorcentaje: 10, descuentoMotivo: 'promo' });

      await component.aplicarDescuento();

      expect(component.lineas.find((l) => l.fuente === 'DESCUENTO')!.monto).toBe(50_000);
    });

    it('efectivo + descuento cuadran contra la deuda', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102);
      responderDescuento({ descuentoMonto: 50_000, descuentoMotivo: 'promo' });
      await component.aplicarDescuento();
      agregarEfectivo(450_000);

      expect(component.cuadra).toBeTrue();
      await component.confirmar();
      const payload = repo.registrarPagoConsolidado.calls.mostRecent().args[0];
      expect(payload.motivoDescuento).toBe('PROMO');
      expect(payload.lineas.filter((l: any) => l.fuente === 'DESCUENTO').length).toBe(1);
    });

    // El descuento se calculó contra un total: si ese total cambia, deja de significar
    // lo que decía. Se descarta con aviso en vez de sobrevivir en silencio.
    it('cambiar la selección descarta el descuento', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102);
      responderDescuento({ descuentoMonto: 50_000, descuentoMotivo: 'promo' });
      await component.aplicarDescuento();
      expect(component.lineas.some((l) => l.fuente === 'DESCUENTO')).toBeTrue();

      seleccionar(102); // destilda una cuota

      expect(component.lineas.some((l) => l.fuente === 'DESCUENTO')).toBeFalse();
      expect(component.motivoDescuento).toBe('');
    });

    it('quitarDescuento deja el resto de las líneas intacto', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC);
      seleccionar(101, 102);
      agregarEfectivo(450_000);
      responderDescuento({ descuentoMonto: 50_000, descuentoMotivo: 'promo' });
      await component.aplicarDescuento();

      component.quitarDescuento();

      expect(component.lineas.length).toBe(1);
      expect(component.lineas[0].fuente).toBe('CAJA_MAYOR');
      expect(component.motivoDescuento).toBe('');
    });
  });

  describe('filtro del paso 1', () => {
    it('filtra por texto sobre cliente y descripción, con botón', async () => {
      await crear(PagoConcepto.COBRO_CLIENTE, [
        ...CUOTAS_CPC,
        { ...CUOTAS_CPC[0], origenId: 103, beneficiario: 'ANA GOMEZ', beneficiarioId: 77, descripcion: 'CUOTA 1/1 — CPC #9' },
      ]);
      expect(component.obligacionesFiltradas.length).toBe(3);

      component.filtroTexto = 'ana';
      // Sin llamar a aplicarFiltro no pasa nada: el repo no usa filtrado en vivo.
      expect(component.obligacionesFiltradas.length).toBe(3);

      component.aplicarFiltro();
      expect(component.obligacionesFiltradas.length).toBe(1);
      expect(component.obligacionesFiltradas[0].origenId).toBe(103);

      component.limpiarFiltro();
      expect(component.obligacionesFiltradas.length).toBe(3);
    });
  });
});
