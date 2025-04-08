import { Component, Input, OnChanges, SimpleChanges, Optional, Self } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NgControl, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { CurrencyConfigService } from '../../services/currency-config.service';
import { CurrencyMaskConfig, CURRENCY_MASK_CONFIG } from 'ngx-currency';
import { NgxCurrencyModule } from 'ngx-currency';

@Component({
  selector: 'app-currency-input',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    NgxCurrencyModule
  ],
  providers: [
    {
      provide: CURRENCY_MASK_CONFIG,
      useFactory: (component: CurrencyInputComponent) => component.currencyConfig,
      deps: [CurrencyInputComponent]
    }
  ],
  template: `
    <div class="currency-input-container">
      <mat-form-field appearance="outline" class="currency-field">
        <mat-label>{{ label }}</mat-label>
        <input
          matInput
          currencyMask
          [options]="currencyConfig"
          [formControl]="inputControl"
          [placeholder]="placeholder"
          [required]="required"
          [disabled]="disabled">
        <mat-hint *ngIf="hint">{{ hint }}</mat-hint>
        <mat-error *ngIf="control && control.errors && control.touched">
          <ng-container *ngIf="control.errors['required']">
            Este campo es requerido
          </ng-container>
          <ng-container *ngIf="control.errors['min']">
            El valor debe ser mayor a {{ min }}
          </ng-container>
        </mat-error>
      </mat-form-field>
    </div>
  `,
  styles: [`
    .currency-input-container {
      width: 100%;
    }

    .currency-field {
      width: 100%;
    }
  `]
})
export class CurrencyInputComponent implements ControlValueAccessor, OnChanges {
  @Input() label = 'Valor';
  @Input() placeholder = 'Ingrese el valor';
  @Input() required = false;
  @Input() disabled = false;
  @Input() min = 0.01;
  @Input() hint = '';
  @Input() moneda: Moneda | null = null;

  // Form control to manage the input
  inputControl = new FormControl<number | null>(null);

  // Current currency configuration
  currencyConfig: CurrencyMaskConfig;

  constructor(
    @Optional() @Self() public control: NgControl,
    private currencyConfigService: CurrencyConfigService
  ) {
    if (this.control) {
      this.control.valueAccessor = this;
    }

    // Initialize with default configuration
    this.currencyConfig = this.currencyConfigService.getConfigForCurrency(this.moneda);

    // Apply currency mask to the input
    this.inputControl.valueChanges.subscribe(value => {
      this.onChange(value);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['moneda']) {
      // Update config when currency changes
      this.currencyConfig = this.currencyConfigService.getConfigForCurrency(this.moneda);
    }
  }

  // ControlValueAccessor implementation
  writeValue(value: number): void {
    // For PYG currency, always round to whole number
    if (this.moneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.moneda?.denominacion?.toUpperCase() === 'GUARANI') {
      value = Math.round(value || 0);
    }

    this.inputControl.setValue(value, { emitEvent: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onChange: (value: number | null) => void = () => {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched: () => void = () => {};

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
    this.inputControl.valueChanges.subscribe(() => {
      this.onTouched();
    });
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.inputControl.disable();
    } else {
      this.inputControl.enable();
    }
    this.disabled = isDisabled;
  }
}
