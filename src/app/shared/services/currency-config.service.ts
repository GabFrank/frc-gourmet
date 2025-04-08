import { Injectable } from '@angular/core';
import { CurrencyMaskConfig, CurrencyMaskInputMode } from 'ngx-currency';
import { Moneda } from '../../database/entities/financiero/moneda.entity';

@Injectable({
  providedIn: 'root'
})
export class CurrencyConfigService {
  // Default configuration
  private defaultConfig: CurrencyMaskConfig = {
    align: 'right',
    allowNegative: false,
    allowZero: true,
    decimal: '.',
    precision: 2,
    prefix: '',
    suffix: '',
    thousands: ',',
    nullable: true,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    inputMode: CurrencyMaskInputMode.NATURAL
  };

  // Currency specific configurations
  private currencyConfigs: { [key: string]: Partial<CurrencyMaskConfig> } = {
    'PYG': {
      precision: 0,
      thousands: '.',
      decimal: ',',
      min: 1
    },
    'GUARANI': {
      precision: 0,
      thousands: '.',
      decimal: ',',
      min: 1
    },
    'USD': {
      precision: 2,
      thousands: ',',
      decimal: '.'
    },
    'DOLAR': {
      precision: 2,
      thousands: ',',
      decimal: '.'
    },
    'BRL': {
      precision: 2,
      thousands: '.',
      decimal: ','
    },
    'REAL': {
      precision: 2,
      thousands: '.',
      decimal: ','
    }
  };

  /**
   * Returns the default configuration for ngx-currency
   */
  getDefaultConfig(): CurrencyMaskConfig {
    return this.defaultConfig;
  }

  /**
   * Get currency configuration for a specific currency
   */
  getConfigForCurrency(moneda: Moneda | null): CurrencyMaskConfig {
    if (!moneda) {
      return this.defaultConfig;
    }

    const currencyCode = moneda.simbolo;
    const config = { ...this.defaultConfig };

    // Apply currency-specific settings
    if (this.currencyConfigs[currencyCode]) {
      Object.assign(config, this.currencyConfigs[currencyCode]);
    }

    // Add currency symbol as prefix
    config.prefix = moneda.simbolo ? `${moneda.simbolo} ` : '';
    console.log('config', config);
    return config;
  }

  /**
   * Format a currency value based on the currency type
   */
  formatValue(value: number, moneda: Moneda | null): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (!moneda) {
      return value.toFixed(2);
    }

    const currencyCode = moneda.denominacion?.toUpperCase() || '';
    const config = this.getConfigForCurrency(moneda);

    // Handle special case for PYG
    if (currencyCode === 'PYG' || currencyCode === 'GUARANI') {
      return Math.round(value).toString();
    }

    return value.toFixed(config.precision || 2);
  }

  /**
   * Format currency value according to Moneda type
   * PYG: No decimals and '.' as thousand separator
   * Others: Use default formatting
   */
  formatCurrencyByMoneda(value: number, moneda: Moneda | null): string {
    console.log('formatCurrencyByMoneda', value, moneda);
    if (value === null || value === undefined) {
      return '';
    }

    if (!moneda) {
      // Default formatting with 2 decimal places
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }

    const currencyCode = moneda.denominacion?.toUpperCase() || '';

    // Handle PYG currency (no decimals, '.' as thousand separator)
    if (currencyCode === 'PYG' || currencyCode === 'GUARANI') {
      const roundedValue = Math.round(value);
      return new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(roundedValue);
    }

    // Handle BRL and REAL (uses ',' as decimal separator and '.' for thousands)
    if (currencyCode === 'BRL' || currencyCode === 'REAL') {
      return new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }

    // Default USD, DOLAR and other currencies (uses '.' as decimal and ',' for thousands)
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }
}
