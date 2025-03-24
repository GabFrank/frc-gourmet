import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListMonedasComponent } from './list-monedas.component';

describe('ListMonedasComponent', () => {
  let component: ListMonedasComponent;
  let fixture: ComponentFixture<ListMonedasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListMonedasComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ListMonedasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
