import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ProveedorEditPage } from './proveedor-edit.page';

/**
 * Verifica el payload de proveedor: UPPERCASE en el componente y null para
 * los opcionales vacíos (el handler no uppercasea ni limpia).
 */
describe('ProveedorEditPage — payload', () => {
  let component: ProveedorEditPage;
  let repo: { createProveedor: jasmine.Spy; updateProveedor: jasmine.Spy };

  beforeEach(() => {
    repo = {
      createProveedor: jasmine.createSpy('createProveedor').and.returnValue(of({ id: 1 })),
      updateProveedor: jasmine.createSpy('updateProveedor').and.returnValue(of({ id: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [ProveedorEditPage, NoopAnimationsModule],
      providers: [
        { provide: RepositoryService, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      ],
    });
    component = TestBed.createComponent(ProveedorEditPage).componentInstance;
  });

  it('alta: uppercasea y nulea opcionales vacíos', async () => {
    component.form.patchValue({ nombre: 'don pepe', razon_social: '', ruc: '80012345-6', telefono: '', direccion: 'av. mcal' });
    await component.guardar();
    expect(repo.createProveedor).toHaveBeenCalledTimes(1);
    const p = repo.createProveedor.calls.mostRecent().args[0];
    expect(p.nombre).toBe('DON PEPE');
    expect(p.razon_social).toBeNull();
    expect(p.ruc).toBe('80012345-6');
    expect(p.telefono).toBeNull();
    expect(p.direccion).toBe('AV. MCAL');
    expect(p.activo).toBe(true);
  });

  it('sin nombre: no guarda', async () => {
    component.form.patchValue({ nombre: '' });
    await component.guardar();
    expect(repo.createProveedor).not.toHaveBeenCalled();
  });
});
