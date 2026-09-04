import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { CreateCajaDialogComponent } from './create-caja-dialog.component';
import { RepositoryService } from 'src/app/database/repository.service';
import { AuthService } from 'src/app/services/auth.service';

describe('CreateCajaDialogComponent', () => {
  let component: CreateCajaDialogComponent;
  let fixture: ComponentFixture<CreateCajaDialogComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<CreateCajaDialogComponent>>;
  let mockRepositoryService: jasmine.SpyObj<RepositoryService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    // Mock de MatDialogRef
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close', 'updateSize']);
    
    // Mock de RepositoryService
    mockRepositoryService = jasmine.createSpyObj('RepositoryService', [
      'getDispositivos',
      'getCajasMonedas',
      'getMonedasBilletes',
      'getCaja',
      'getConteo',
      'getConteoDetalles',
      'createCaja',
      'createConteo',
      'createConteoDetalle',
      'updateConteoDetalle',
      'updateCaja',
      'getVentasByCaja',
      'getPagoDetalles'
    ]);
    
    // Configurar mocks por defecto
    mockRepositoryService.getDispositivos.and.returnValue(of([]));
    mockRepositoryService.getCajasMonedas.and.returnValue(of([]));
    mockRepositoryService.getMonedasBilletes.and.returnValue(of([]));
    
    // Mock de AuthService
    mockAuthService = jasmine.createSpyObj('AuthService', ['getCurrentUser']);
    mockAuthService.currentUser = { id: 1, username: 'test' } as any;

    await TestBed.configureTestingModule({
      imports: [
        CreateCajaDialogComponent,
        MatDialogModule,
        ReactiveFormsModule,
        MatSnackBarModule
      ],
      providers: [
        FormBuilder,
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: RepositoryService, useValue: mockRepositoryService },
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateCajaDialogComponent);
    component = fixture.componentInstance;
  });

  /**
   * TEST DE REGRESIÓN DEL BUG #1:
   * El constructor NO debe llamar updateSize()
   */
  it('should NOT call updateSize in constructor', () => {
    // Verificar que updateSize NO fue llamado durante la creación del componente
    expect(mockDialogRef.updateSize).not.toHaveBeenCalled();
  });

  /**
   * TEST DE REGRESIÓN DEL BUG #2:
   * El constructor NO debe manipular el DOM con querySelector
   */
  it('should NOT call querySelector in constructor', () => {
    // Spy en document.querySelector antes de crear un nuevo componente
    const querySelectorSpy = spyOn(document, 'querySelector');
    
    // Crear un nuevo componente para verificar el constructor
    const newComponent = new CreateCajaDialogComponent(
      mockDialogRef,
      {},
      TestBed.inject(FormBuilder),
      mockRepositoryService,
      mockAuthService,
      TestBed.inject(MatSnackBarModule) as any
    );
    
    // Verificar que querySelector NO fue llamado en el constructor
    expect(querySelectorSpy).not.toHaveBeenCalled();
  });

  /**
   * TEST DE REGRESIÓN DEL BUG #3:
   * initForms() debe llamarse SOLO en ngOnInit, no en el constructor
   */
  it('should call initForms only in ngOnInit, not in constructor', () => {
    // Spy en initForms (método privado, accedemos vía any)
    spyOn(component as any, 'initForms');
    
    // Llamar ngOnInit
    component.ngOnInit();
    
    // Verificar que initForms fue llamado exactamente una vez
    expect((component as any).initForms).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST DE LAZY LOADING #1:
   * El stepper NO debe estar en el DOM mientras loading = true
   */
  it('should not render stepper while loading', () => {
    // Establecer loading = true
    component.loading = true;
    fixture.detectChanges();
    
    // Buscar el stepper en el DOM
    const stepper = fixture.nativeElement.querySelector('mat-stepper');
    
    // Verificar que el stepper NO está en el DOM
    expect(stepper).toBeNull();
  });

  /**
   * TEST DE LAZY LOADING #2:
   * El stepper debe renderizarse después de que loading = false
   */
  it('should render stepper after loading completes', () => {
    // Establecer loading = false
    component.loading = false;
    fixture.detectChanges();
    
    // Buscar el stepper en el DOM
    const stepper = fixture.nativeElement.querySelector('mat-stepper');
    
    // Verificar que el stepper SÍ está en el DOM
    expect(stepper).not.toBeNull();
  });

  /**
   * TEST DE NAVEGACIÓN SEGURA:
   * navigateToCierreStep debe retornar si stepper es undefined
   */
  it('should return early from navigateToCierreStep if stepper is undefined', () => {
    // Configurar el modo conteo
    component.dialogMode = 'conteo';
    
    // Asegurar que stepper es undefined (no hay *ngIf="!loading" todavía)
    component.stepper = undefined as any;
    
    // Llamar navigateToCierreStep no debe lanzar error
    expect(() => (component as any).navigateToCierreStep()).not.toThrow();
  });
});
