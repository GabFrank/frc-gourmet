import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEditMonedaComponent } from './create-edit-moneda.component';

describe('CreateEditMonedaComponent', () => {
  let component: CreateEditMonedaComponent;
  let fixture: ComponentFixture<CreateEditMonedaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateEditMonedaComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CreateEditMonedaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
