import { Component, Input, OnChanges, SimpleChanges, Optional, Self, OnInit, ViewChild, ElementRef } from '@angular/core';
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
        <mat-label *ngIf="!disableFloating">{{ label }}</mat-label>
        <input
          #inputElement
          matInput
          currencyMask
          [options]="currencyConfig"
          [formControl]="inputControl"
          [placeholder]="placeholder"
          [required]="required"
          (focus)="onInputFocus()">
        <mat-hint *ngIf="hint">{{ hint }}</mat-hint>
        <mat-error *ngIf="control && control.errors && control.touched">
          <ng-container *ngIf="control.errors['required']">
            Este campo es requerido
          </ng-container>
          <ng-container *ngIf="control.errors['min']">
            El valor debe ser mayor a {{ min }}
          </ng-container>
          <ng-container *ngIf="control.errors['nonZero']">
            El valor no puede ser cero
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
export class CurrencyInputComponent implements ControlValueAccessor, OnChanges, OnInit {
  @Input() label = 'Valor';
  @Input() placeholder = 'Ingrese el valor';
  @Input() required = false;
  @Input() disabled = false;
  @Input() min: number | null = null;
  @Input() hint = '';
  @Input() moneda: Moneda | null = null;
  @Input() disableFloating = false;
  @Input() selectOnFocus = true;

  @ViewChild('inputElement') inputElement!: ElementRef;

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
    
    // Ensure negative values are allowed
    this.currencyConfig.allowNegative = true;
    
    // Remove min constraint from currency config to allow negative values
    if (this.currencyConfig.min !== undefined && this.currencyConfig.min > 0) {
      this.currencyConfig.min = undefined;
    }

    // Apply currency mask to the input
    this.inputControl.valueChanges.subscribe(value => {
      this.onChange(value);
    });
  }

  onInputFocus(): void {
    if (this.selectOnFocus && this.inputElement) {
      // Use setTimeout to ensure the input has focus before selecting
      setTimeout(() => {
        this.inputElement.nativeElement.select();
      });
    }
  }

  ngOnInit(): void {
    // Set initial disabled state if provided
    if (this.disabled) {
      this.inputControl.disable();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['moneda']) {
      // Update config when currency changes
      this.currencyConfig = this.currencyConfigService.getConfigForCurrency(this.moneda);
      
      // Ensure negative values are allowed regardless of currency
      this.currencyConfig.allowNegative = true;
      
      // Remove min constraint from currency config to allow negative values
      if (this.currencyConfig.min !== undefined && this.currencyConfig.min > 0) {
        this.currencyConfig.min = undefined;
      }
    }

    if (changes['min']) {
      // Update the min value in the currency config, but allow negative values
      this.currencyConfig.min = this.min !== null ? this.min : undefined;
    }

    if (changes['disabled']) {
      // Update disabled state when it changes
      if (this.disabled) {
        this.inputControl.disable();
      } else {
        this.inputControl.enable();
      }
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
