import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { OperacionFinancieraNuevoPage } from './operacion-financiera-nuevo.page';

/**
 * Verifica la construcción del payload de Operación Financiera:
 * - Mapea *Id planos y descripción en UPPERCASE.
 * - CAMBIO_DIVISA lleva ambos lados + cotización; DEPOSITO_BANCARIO lleva
 *   cuentaBancariaDestinoId.
 * Se prueba solo guardar() (sin ngOnInit, que pega al repo).
 */
describe('OperacionFinancieraNuevoPage — payload', () => {
  let component: OperacionFinancieraNuevoPage;
  let repo: { createOperacionFinanciera: jasmine.Spy };

  beforeEach(() => {
    repo = { createOperacionFinanciera: jasmine.createSpy('createOperacionFinanciera').and.returnValue(of({ id: 1 })) };
    TestBed.configureTestingModule({
      imports: [OperacionFinancieraNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(OperacionFinancieraNuevoPage).componentInstance;
  });

  it('CAMBIO_DIVISA: mapea ambos lados + cotización y uppercasea la descripción', async () => {
    component.form.patchValue({
      tipoOperacion: 'CAMBIO_DIVISA',
      descripcion: 'cambio dolares',
      cajaMayorOrigenId: 1,
      monedaOrigenId: 2,
      formaPagoOrigenId: 5,
      montoOrigen: 100,
      monedaDestinoId: 1,
      formaPagoDestinoId: 5,
      montoDestino: 600000,
      cotizacion: 6000,
    });

    await component.guardar();

    expect(repo.createOperacionFinanciera).toHaveBeenCalledTimes(1);
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.tipoOperacion).toBe('CAMBIO_DIVISA');
    expect(p.descripcion).toBe('CAMBIO DOLARES');
    expect(p.monedaOrigenId).toBe(2);
    expect(p.montoOrigen).toBe(100);
    expect(p.monedaDestinoId).toBe(1);
    expect(p.montoDestino).toBe(600000);
    expect(p.cotizacion).toBe(6000);
    expect(p.diferenciaDestinoTipo).toBe('IGNORAR');
    expect(p.fecha instanceof Date).toBeTrue();
  });

  it('DEPOSITO_BANCARIO: lleva cuentaBancariaDestinoId y sin cuenta origen', async () => {
    component.form.patchValue({
      tipoOperacion: 'DEPOSITO_BANCARIO',
      descripcion: 'deposito',
      cajaMayorOrigenId: 1,
      monedaOrigenId: 1,
      formaPagoOrigenId: 5,
      montoOrigen: 500000,
      cuentaBancariaDestinoId: 9,
      monedaDestinoId: 1,
      montoDestino: 500000,
    });

    await component.guardar();

    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.tipoOperacion).toBe('DEPOSITO_BANCARIO');
    expect(p.cuentaBancariaDestinoId).toBe(9);
    expect(p.cuentaBancariaOrigenId).toBeNull();
    expect(p.cajaMayorOrigenId).toBe(1);
    expect(p.montoDestino).toBe(500000);
  });

  it('Cambiar de tipo limpia los campos que ya no aplican (no persiste relación bogus)', async () => {
    // Elijo DEPOSITO y seteo la cuenta destino…
    component.form.patchValue({ tipoOperacion: 'DEPOSITO_BANCARIO', cuentaBancariaDestinoId: 9 });
    // …y cambio a CAMBIO_DIVISA: la cuenta destino ya no aplica y debe limpiarse.
    component.tipoOperacion = 'CAMBIO_DIVISA';
    (component as any).aplicarTipo();
    expect(component.form.controls.cuentaBancariaDestinoId.value).toBeNull();

    component.form.patchValue({
      descripcion: 'cambio', cajaMayorOrigenId: 1, monedaOrigenId: 2, formaPagoOrigenId: 5, montoOrigen: 100,
      monedaDestinoId: 1, formaPagoDestinoId: 5, montoDestino: 600000, cotizacion: 6000,
    });
    await component.guardar();
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.cuentaBancariaDestinoId).toBeNull();
  });
});

/**
 * Regresiones de la validación: campos requeridos que la UI no muestra y que por
 * lo tanto tiene que poblar el propio componente. Si quedan en null el formulario
 * es inválido para siempre y el botón "Registrar" no se habilita nunca, sin
 * ningún campo marcado en rojo (el control ni siquiera se renderiza).
 *
 * A diferencia del bloque de arriba, acá se corre `ngOnInit()` completo (con los
 * catálogos mockeados) porque lo que se prueba son justamente las suscripciones
 * y el efecto de cambiar de tipo de operación.
 */
describe('OperacionFinancieraNuevoPage — campos requeridos poblables', () => {
  const CATEGORIAS = [{ id: 1, nombre: 'GENERAL', activo: true }];
  const MONEDAS = [
    { id: 1, simbolo: 'Gs', denominacion: 'GUARANI', decimales: 0, principal: true, activo: true },
    { id: 2, simbolo: 'US$', denominacion: 'DOLAR', decimales: 2, principal: false, activo: true },
  ];
  const FORMAS_PAGO = [
    { id: 5, nombre: 'EFECTIVO', activo: true, movimentaCaja: true },
    { id: 6, nombre: 'TARJETA', activo: true, movimentaCaja: false },
  ];
  const CAJAS = [
    { id: 1, nombre: 'CAJA MAYOR 1', estado: 'ABIERTA' },
    { id: 2, nombre: 'CAJA MAYOR 2', estado: 'ABIERTA' },
  ];
  const CUENTAS = [
    { id: 9, nombre: 'CTA USD', banco: 'BANCO', activo: true, moneda: { id: 2, simbolo: 'US$' } },
    { id: 10, nombre: 'CTA GS', banco: 'BANCO', activo: true, moneda: { id: 1, simbolo: 'Gs' } },
  ];

  let component: OperacionFinancieraNuevoPage;
  let repo: any;
  let snackOpen: jasmine.Spy;

  async function crear(formas: any[] = FORMAS_PAGO): Promise<void> {
    repo = {
      createOperacionFinanciera: jasmine.createSpy('createOperacionFinanciera').and.returnValue(of({ id: 1 })),
      getOperacionFinancieraCategorias: () => of(CATEGORIAS),
      getMonedas: () => of(MONEDAS),
      getFormasPago: () => of(formas),
      getCajasMayor: () => of(CAJAS),
      getCuentasBancarias: () => of(CUENTAS),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OperacionFinancieraNuevoPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
      ],
    });
    component = TestBed.createComponent(OperacionFinancieraNuevoPage).componentInstance;
    // El componente es standalone e importa MatSnackBarModule, que registra su
    // propio MatSnackBar: espiar la instancia que realmente usa es más fiable
    // que sustituir el provider.
    snackOpen = spyOn((component as any).snack as MatSnackBar, 'open').and.stub();
    component.ngOnInit();
    await new Promise((r) => setTimeout(r));   // deja resolver el Promise.all de cargar()
  }

  /** Cambia el tipo como lo haría el usuario en el select. */
  function elegirTipo(tipo: string): void {
    component.form.controls.tipoOperacion.setValue(tipo as any);
  }

  beforeEach(async () => { await crear(); });

  it('carga los catálogos y arranca en CAMBIO_DIVISA', () => {
    expect(component.loading).toBeFalse();
    expect(component.cajas.length).toBe(2);
    expect(component.cuentas.length).toBe(2);
    expect(component.sinFormaPagoEfectivo).toBeFalse();
  });

  it('CAMBIO_DIVISA: setea la forma de pago de AMBOS lados (el destino no tiene select de caja)', () => {
    elegirTipo('CAMBIO_DIVISA');
    expect(component.showCajaDestino).withContext('el ingreso vuelve a la misma caja').toBeFalse();
    expect(component.form.controls.formaPagoOrigenId.value).toBe(5);
    // La regresión: antes quedaba en null porque no había select de caja destino.
    expect(component.form.controls.formaPagoDestinoId.value).toBe(5);
  });

  it('CAMBIO_DIVISA: el formulario queda válido sin tocar ningún campo oculto', async () => {
    elegirTipo('CAMBIO_DIVISA');
    component.form.patchValue({
      descripcion: 'cambio dolares',
      cajaMayorOrigenId: 1,
      monedaOrigenId: 1,
      montoOrigen: 600000,
      monedaDestinoId: 2,
      cotizacion: 6000,
    });
    expect(component.form.valid).withContext('no debe quedar inválido por campos que no se muestran').toBeTrue();

    await component.guardar();
    expect(repo.createOperacionFinanciera).toHaveBeenCalledTimes(1);
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.tipoOperacion).toBe('CAMBIO_DIVISA');
    expect(p.formaPagoOrigenId).toBe(5);
    expect(p.formaPagoDestinoId).toBe(5);
    expect(p.montoDestino).toBe(100);   // 600.000 Gs / 6.000 = 100 US$
  });

  it('RETIRO → TRANSFERENCIA_BANCARIA → RETIRO conserva la moneda heredada de la cuenta', () => {
    elegirTipo('RETIRO_BANCARIO');
    component.form.controls.cuentaBancariaOrigenId.setValue(9); // dispara la herencia
    expect(component.form.controls.monedaDestinoId.value).toBe(2);

    elegirTipo('TRANSFERENCIA_BANCARIA');
    expect(component.form.controls.cuentaBancariaOrigenId.value).withContext('la cuenta sobrevive').toBe(9);

    elegirTipo('RETIRO_BANCARIO');
    // Antes: la moneda quedaba en null y era irrecuperable — reelegir la misma
    // opción en un mat-select no emite valueChanges.
    expect(component.form.controls.monedaDestinoId.value).toBe(2);
    expect(component.form.controls.monedaDestinoId.hasError('required')).toBeFalse();
  });

  it('DEPOSITO → TRANSFERENCIA_BANCARIA → DEPOSITO conserva la moneda heredada', () => {
    elegirTipo('DEPOSITO_BANCARIO');
    component.form.controls.cuentaBancariaDestinoId.setValue(10);
    expect(component.form.controls.monedaOrigenId.value).toBe(1);

    elegirTipo('TRANSFERENCIA_BANCARIA');
    elegirTipo('DEPOSITO_BANCARIO');
    expect(component.form.controls.monedaOrigenId.value).toBe(1);
    expect(component.form.controls.monedaOrigenId.hasError('required')).toBeFalse();
  });

  it('TRANSFERENCIA_BANCARIA: cada cuenta setea SÓLO su lado y aparece la cotización', () => {
    elegirTipo('TRANSFERENCIA_BANCARIA');
    component.form.controls.cuentaBancariaOrigenId.setValue(9);   // USD
    component.form.controls.cuentaBancariaDestinoId.setValue(10); // Gs
    expect(component.form.controls.monedaOrigenId.value).toBe(2);
    expect(component.form.controls.monedaDestinoId.value).toBe(1);
    expect(component.showCotizacion).withContext('monedas distintas').toBeTrue();
  });

  it('TRANSFERENCIA_BANCARIA oculta y neutraliza la diferencia (el backend la descarta)', () => {
    elegirTipo('TRANSFERENCIA_ENTRE_CAJAS');
    component.form.patchValue({ diferencia: 5000, diferenciaDestinoTipo: 'GASTO', diferenciaObservacion: 'X' });
    elegirTipo('TRANSFERENCIA_BANCARIA');
    expect(component.showDiferencia).toBeFalse();
    expect(component.form.controls.diferencia.value).toBe(0);
    expect(component.form.controls.diferenciaDestinoTipo.value).toBe('IGNORAR');
  });

  it('la forma de pago se setea sólo en los lados que mueven caja mayor', () => {
    elegirTipo('DEPOSITO_BANCARIO');
    expect(component.form.controls.formaPagoOrigenId.value).toBe(5);
    expect(component.form.controls.formaPagoDestinoId.value).withContext('el banco no usa forma de pago').toBeNull();

    elegirTipo('RETIRO_BANCARIO');
    expect(component.form.controls.formaPagoDestinoId.value).toBe(5);
    expect(component.form.controls.formaPagoOrigenId.value).toBeNull();

    elegirTipo('TRANSFERENCIA_ENTRE_CAJAS');
    expect(component.form.controls.formaPagoOrigenId.value).toBe(5);
    expect(component.form.controls.formaPagoDestinoId.value).toBe(5);

    elegirTipo('TRANSFERENCIA_BANCARIA');
    expect(component.form.controls.formaPagoOrigenId.value).toBeNull();
    expect(component.form.controls.formaPagoDestinoId.value).toBeNull();
  });

  it('cambiar de tipo no arrastra la cuenta bancaria del tipo anterior', async () => {
    elegirTipo('DEPOSITO_BANCARIO');
    component.form.controls.cuentaBancariaDestinoId.setValue(10);
    elegirTipo('TRANSFERENCIA_ENTRE_CAJAS');
    expect(component.form.controls.cuentaBancariaDestinoId.value).toBeNull();

    component.form.patchValue({
      descripcion: 'transferencia', cajaMayorOrigenId: 1, monedaOrigenId: 1, montoOrigen: 100,
      cajaMayorDestinoId: 2, monedaDestinoId: 1,
    });
    await component.guardar();
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.cuentaBancariaDestinoId).toBeNull();
  });

  it('el mensaje nombra los campos que faltan en vez del genérico', async () => {
    elegirTipo('CAMBIO_DIVISA');
    component.form.patchValue({ descripcion: 'cambio', cajaMayorOrigenId: 1, monedaOrigenId: 1, montoOrigen: 100 });
    await component.guardar();
    expect(repo.createOperacionFinanciera).not.toHaveBeenCalled();
    const msg = snackOpen.calls.mostRecent().args[0] as string;
    expect(msg).toContain('Faltan completar');
    expect(msg).toContain('Moneda destino');
    expect(msg).toContain('Cotización');
  });

  it('bloquea un cambio de divisa con la misma moneda a ambos lados', async () => {
    elegirTipo('CAMBIO_DIVISA');
    component.form.patchValue({
      descripcion: 'cambio', cajaMayorOrigenId: 1,
      monedaOrigenId: 1, montoOrigen: 100, monedaDestinoId: 1, cotizacion: 1,
    });
    await component.guardar();
    expect(repo.createOperacionFinanciera).not.toHaveBeenCalled();
    expect(snackOpen.calls.mostRecent().args[0] as string).toContain('deben ser distintas');
  });

  it('avisa cuando no hay ninguna forma de pago configurada', async () => {
    await crear([]);
    expect(component.sinFormaPagoEfectivo).toBeTrue();
    elegirTipo('CAMBIO_DIVISA');
    expect(component.form.controls.formaPagoOrigenId.value).toBeNull();
  });
});
