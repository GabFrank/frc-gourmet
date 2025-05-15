import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEditObservacionProductoDialogComponent } from './create-edit-observacion-producto-dialog.component';

describe('CreateEditObservacionProductoDialogComponent', () => {
  let component: CreateEditObservacionProductoDialogComponent;
  let fixture: ComponentFixture<CreateEditObservacionProductoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ CreateEditObservacionProductoDialogComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateEditObservacionProductoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
