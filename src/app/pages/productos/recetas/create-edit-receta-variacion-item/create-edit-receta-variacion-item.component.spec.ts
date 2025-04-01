import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEditRecetaVariacionItemComponent } from './create-edit-receta-variacion-item.component';

describe('CreateEditRecetaVariacionItemComponent', () => {
  let component: CreateEditRecetaVariacionItemComponent;
  let fixture: ComponentFixture<CreateEditRecetaVariacionItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ CreateEditRecetaVariacionItemComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateEditRecetaVariacionItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
