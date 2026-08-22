import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateOperacionFinancieraDialogComponent } from './create-operacion-financiera-dialog.component';

/**
 * El diálogo de escritorio no tenía ningún test de componente: las reglas de
 * campos requeridos se probaban sólo como funciones puras
 * (`scripts/test-operacion-financiera-validacion-e2e.ts`), así que nada cubría el
 * orden de `ngOnInit` ni el efecto de cambiar de tipo sobre los VALORES del form
 * — que es justo donde vivían los bugs.
 */
describe('CreateOperacionFinancieraDialogComponent', () => {
  const MONEDAS = [
    { id: 1, simbolo: 'Gs', denominacion: 'GUARANI', decimales: 0, principal: true, activo: true },
    { id: 2, simbolo: 'US$', denominacion: 'DOLAR', decimales: 2, principal: false, activo: true },
  ];
  const FORMAS_PAGO = [
    { id: 5, nombre: 'EFECTIVO', activo: true, movimentaCaja: true },
    { id: 6, nombre: 'TARJETA', activo: true, movimentaCaja: false },
    { id: 7, nombre: 'CAJA CHICA', activo: true, movimentaCaja: true },
  ];
  const CAJAS = [
    { id: 1, nombre: 'CAJA MAYOR 1', estado: 'ABIERTA' },
    { id: 2, nombre: 'CAJA MAYOR 2', estado: 'ABIERTA' },
  ];
  const CUENTAS = [
    { id: 9, nombre: 'CTA USD', banco: 'BANCO', activo: true, saldo: 1000, moneda: { id: 2, simbolo: 'US$' } },
    { id: 10, nombre: 'CTA GS', banco: 'BANCO', activo: true, saldo: 5000000, moneda: { id: 1, simbolo: 'Gs' } },
  ];

  let component: CreateOperacionFinancieraDialogComponent;
  let repo: any;
  let snack: { open: jasmine.Spy };   // spy sobre la instancia real del componente

  async function crear(formasPago: any[] = FORMAS_PAGO): Promise<void> {
    repo = {
      createOperacionFinanciera: jasmine.createSpy('createOperacionFinanciera').and.returnValue(of({ id: 1 })),
      getOperacionFinancieraCategorias: () => of([{ id: 1, nombre: 'GENERAL', activo: true }]),
      getMonedas: () => of(MONEDAS),
      getFormasPago: () => of(formasPago),
      getCajasMayor: () => of(CAJAS),
      getCuentasBancarias: () => of(CUENTAS),
      getCajaMayorSaldos: () => of([]),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CreateOperacionFinancieraDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { cajaMayorId: 1 } },
      ],
    });
    component = TestBed.createComponent(CreateOperacionFinancieraDialogComponent).componentInstance;
    // El componente es standalone e importa MatDialogModule/MatSnackBarModule, que
    // registran sus propios servicios: espiar las instancias que realmente usa es
    // más fiable que sustituir los providers.
    spyOn((component as any).dialog as MatDialog, 'open').and.returnValue({ afterClosed: () => of(true) } as any);
    snack = { open: spyOn((component as any).snackBar as MatSnackBar, 'open').and.stub() } as any;
    await component.ngOnInit();
  }

  beforeEach(async () => { await crear(); });

  it('arranca con la caja de contexto y el efectivo preseleccionados', () => {
    expect(component.form.get('cajaMayorOrigenId')?.value).toBe(1);
    expect(component.form.get('formaPagoOrigenId')?.value).toBe(5);
    // CAMBIO_DIVISA mueve caja de los dos lados aunque haya un solo select.
    expect(component.form.get('formaPagoDestinoId')?.value).toBe(5);
    expect(component.sinFormaPagoEfectivo).toBeFalse();
  });

  it('el select de forma de pago ofrece sólo efectivo, no todas las que mueven caja', () => {
    // CAJA CHICA mueve caja pero no es efectivo: no debe ser elegible.
    expect(component.formasPagoEfectivo.map((f: any) => f.id)).toEqual([5]);
  });

  it('cambiar de tipo limpia la cuenta bancaria que ya no aplica', () => {
    component.setTipo('DEPOSITO_BANCARIO');
    component.form.get('cuentaBancariaDestinoId')?.setValue(10);
    expect(component.form.get('monedaOrigenId')?.value).toBe(1);   // heredada de la cuenta

    component.setTipo('CAMBIO_DIVISA');
    expect(component.form.get('cuentaBancariaDestinoId')?.value).toBeNull();
    expect(component.form.get('monedaOrigenId')?.value).toBeNull(); // se vuelve a elegir a mano
  });

  it('volver a clickear el tipo YA elegido no borra lo cargado', () => {
    component.setTipo('CAMBIO_DIVISA');
    component.form.patchValue({ monedaOrigenId: 1, monedaDestinoId: 2 });

    component.setTipo('CAMBIO_DIVISA');   // mismo tipo: debe ser no-op

    expect(component.form.get('monedaOrigenId')?.value).toBe(1);
    expect(component.form.get('monedaDestinoId')?.value).toBe(2);
  });

  it('RETIRO → TRANSFERENCIA_BANCARIA → RETIRO conserva la moneda heredada', () => {
    component.setTipo('RETIRO_BANCARIO');
    component.form.get('cuentaBancariaOrigenId')?.setValue(9);
    expect(component.form.get('monedaDestinoId')?.value).toBe(2);

    component.setTipo('TRANSFERENCIA_BANCARIA');
    component.setTipo('RETIRO_BANCARIO');
    // Reelegir la misma opción en un mat-select no emite valueChanges: si no se
    // re-derivara acá, la moneda quedaría en null y sería irrecuperable.
    expect(component.form.get('monedaDestinoId')?.value).toBe(2);
  });

  it('en RETIRO_BANCARIO la caja de contexto se preselecciona del lado destino', () => {
    component.setTipo('RETIRO_BANCARIO');
    expect(component.form.get('cajaMayorDestinoId')?.value).toBe(1);
    expect(component.form.get('cajaMayorOrigenId')?.value).toBeNull();
  });

  it('la cotización no sobrevive a una transferencia bancaria de la misma moneda', () => {
    component.setTipo('TRANSFERENCIA_BANCARIA');
    component.form.get('cuentaBancariaOrigenId')?.setValue(9);   // US$
    component.form.get('cuentaBancariaDestinoId')?.setValue(10); // Gs
    expect(component.monedasTransferenciaDistintas()).toBeTrue();
    component.form.get('cotizacion')?.setValue(7000);

    // Ahora ambas cuentas quedan en Gs: la cotización ya no aplica.
    component.form.get('cuentaBancariaOrigenId')?.setValue(10);
    expect(component.monedasTransferenciaDistintas()).toBeFalse();
    expect(component.form.get('cotizacion')?.value).toBeNull();
  });

  it('al guardar con campos faltantes nombra cuáles son y no llama al repo', async () => {
    component.setTipo('CAMBIO_DIVISA');
    component.form.patchValue({ descripcion: 'cambio', monedaOrigenId: 1, montoOrigen: 100 });
    await component.save();
    expect(repo.createOperacionFinanciera).not.toHaveBeenCalled();
    const msg = snack.open.calls.mostRecent().args[0] as string;
    expect(msg).toContain('Faltan completar');
    expect(msg).toContain('Moneda destino');
  });

  it('bloquea un cambio de divisa con la misma moneda a ambos lados', async () => {
    component.setTipo('CAMBIO_DIVISA');
    component.form.patchValue({
      descripcion: 'cambio', cajaMayorOrigenId: 1, monedaOrigenId: 1, montoOrigen: 100,
      monedaDestinoId: 1, montoDestino: 100, cotizacion: 1,
    });
    await component.save();
    expect(repo.createOperacionFinanciera).not.toHaveBeenCalled();
    expect(snack.open.calls.mostRecent().args[0] as string).toContain('deben ser distintas');
  });

  it('guarda un cambio de divisa completo con ambas formas de pago', async () => {
    component.setTipo('CAMBIO_DIVISA');
    component.form.patchValue({
      descripcion: 'CAMBIO DOLARES', cajaMayorOrigenId: 1,
      monedaOrigenId: 1, montoOrigen: 600000, monedaDestinoId: 2, cotizacion: 6000,
    });
    expect(component.form.valid).toBeTrue();

    await component.save();
    expect(repo.createOperacionFinanciera).toHaveBeenCalledTimes(1);
    const p = repo.createOperacionFinanciera.calls.mostRecent().args[0];
    expect(p.formaPagoOrigenId).toBe(5);
    expect(p.formaPagoDestinoId).toBe(5);
    expect(p.montoDestino).toBe(100);
    expect(p.cuentaBancariaOrigenId).toBeNull();
  });

  it('avisa cuando no hay ninguna forma de pago configurada', async () => {
    await crear([]);
    expect(component.sinFormaPagoEfectivo).toBeTrue();
    expect(component.formasPagoEfectivo).toEqual([]);
  });
});
