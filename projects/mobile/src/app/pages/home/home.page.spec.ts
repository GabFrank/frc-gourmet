import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, firstValueFrom } from 'rxjs';
import { AuthService, PermissionService, RepositoryService } from '@frc/shared-core';
import { HomePage } from './home.page';
import { PwaInstallService } from '../../core/services/pwa-install.service';

/**
 * Verifica el acceso directo a cajas mayores abiertas del home:
 * filtra por estado ABIERTA y respeta el permiso CAJA_MAYOR_OPERAR.
 */
describe('HomePage — cajasMayorAbiertas$', () => {
  const CAJAS = [
    { id: 1, nombre: 'CAJA CENTRO', estado: 'ABIERTA' },
    { id: 2, nombre: 'CAJA SUR', estado: 'CERRADA' },
    { id: 3, nombre: null, estado: 'ABIERTA' },
  ];

  function crear(permisos: string[]): HomePage {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HomePage, NoopAnimationsModule, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: { currentUser: null } },
        { provide: PermissionService, useValue: { codigos$: of(new Set(permisos)) } },
        {
          provide: RepositoryService,
          useValue: { getCajasMayor: jasmine.createSpy('getCajasMayor').and.returnValue(of(CAJAS)) },
        },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        { provide: PwaInstallService, useValue: { canInstall$: of(false) } },
      ],
    });
    return TestBed.createComponent(HomePage).componentInstance;
  }

  it('con CAJA_MAYOR_OPERAR: solo cajas ABIERTAS, con fallback de nombre', async () => {
    const comp = crear(['CAJA_MAYOR_OPERAR']);
    const cajas = await firstValueFrom(comp.cajasMayorAbiertas$);
    expect(cajas.length).toBe(2);
    expect(cajas.map((c) => c.id)).toEqual([1, 3]);
    expect(cajas[1].nombre).toBe('Caja Mayor #3');
  });

  it('sin permiso: no muestra cajas', async () => {
    const comp = crear([]);
    const cajas = await firstValueFrom(comp.cajasMayorAbiertas$);
    expect(cajas.length).toBe(0);
  });

  // El bug que protege: FINANCIERO_CAJA_VER es el permiso de la caja del turno.
  // Un cajero lo tiene, y con el veia las cards de Caja Mayor en el home.
  it('con FINANCIERO_CAJA_VER solo (perfil cajero): no muestra cajas mayores', async () => {
    const comp = crear(['FINANCIERO_CAJA_VER']);
    const cajas = await firstValueFrom(comp.cajasMayorAbiertas$);
    expect(cajas.length).toBe(0);
  });
});
