import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { DescuentoDialogComponent, DescuentoDialogData } from './descuento-dialog.component';

describe('DescuentoDialogComponent', () => {
  let component: DescuentoDialogComponent;
  let fixture: ComponentFixture<DescuentoDialogComponent>;
  let dialog: MatDialog;

  const mockDialogData: DescuentoDialogData = {
    subtotal: 10000,
    decimales: 0,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DescuentoDialogComponent,
        MatDialogModule,
        ReactiveFormsModule,
        BrowserAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DescuentoDialogComponent);
    component = fixture.componentInstance;
    dialog = TestBed.inject(MatDialog);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', (done) => {
    // Arrange: cuota ₲17.550, tope 5% → 878 redondeado
    const subtotal = 17550;
    const topePct = 5;
    const esperado = 878; // redondear(17550 * 0.05, 0)

    const dialogRef = dialog.open(DescuentoDialogComponent, {
      data: {
        subtotal,
        decimales: 0,
        maxPorcentaje: topePct,
      },
    });

    const instance = dialogRef.componentInstance;

    // Esperar a que se inicialice
    setTimeout(() => {
      // Act: pedir exactamente el 5%
      instance.form.patchValue({ tipoDescuento: 'porcentaje', porcentaje: 5, motivo: 'PRUEBA' });
      instance.recalcular();

      // Assert
      expect(instance.montoDescuento).toBe(esperado);
      expect(instance.excedeTope).toBe(false);
      expect(instance.form.valid).toBe(true);

      dialogRef.close();
      done();
    }, 100);
  });

  it('debe calcular maxMonto correctamente con tope porcentual', (done) => {
    const dialogRef = dialog.open(DescuentoDialogComponent, {
      data: {
        subtotal: 20000,
        decimales: 2,
        maxPorcentaje: 10,
      },
    });

    const instance = dialogRef.componentInstance;

    setTimeout(() => {
      // 20000 * 10% = 2000.00 (con 2 decimales)
      expect(instance.maxMonto).toBe(2000);
      expect(instance.topeTexto).toContain('10%');

      dialogRef.close();
      done();
    }, 100);
  });

  it('debe redondear montoDescuento a decimales de la moneda (PYG = 0)', (done) => {
    const dialogRef = dialog.open(DescuentoDialogComponent, {
      data: {
        subtotal: 15000,
        decimales: 0,
      },
    });

    const instance = dialogRef.componentInstance;

    setTimeout(() => {
      // 15000 * 3.5% = 525 (redondeado, sin decimales)
      instance.form.patchValue({ tipoDescuento: 'porcentaje', porcentaje: 3.5, motivo: 'TEST' });
      instance.recalcular();

      expect(instance.montoDescuento).toBe(525);
      expect(Number.isInteger(instance.montoDescuento)).toBe(true);

      dialogRef.close();
      done();
    }, 100);
  });

  it('debe bloquear APLICAR cuando el descuento supera el tope', (done) => {
    const dialogRef = dialog.open(DescuentoDialogComponent, {
      data: {
        subtotal: 10000,
        decimales: 0,
        maxPorcentaje: 5, // tope = 500
      },
    });

    const instance = dialogRef.componentInstance;

    setTimeout(() => {
      // Pedir 6% (600) > tope (500)
      instance.form.patchValue({ tipoDescuento: 'porcentaje', porcentaje: 6, motivo: 'TEST' });
      instance.recalcular();

      expect(instance.montoDescuento).toBe(600);
      expect(instance.excedeTope).toBe(true);

      dialogRef.close();
      done();
    }, 100);
  });
});
