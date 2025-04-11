import { Injectable } from '@angular/core';

export interface UnitConversion {
  from: string;
  to: string;
  factor: number;
  displayLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class UnitConversionService {
  private conversionMap = new Map<string, UnitConversion[]>();

  constructor() {
    this.initializeConversions();
  }

  private initializeConversions(): void {
    // Weight conversions
    // Note: factor is how many base units are in one of the target unit
    // e.g., 1 kg = 1000 g, so factor for KILOGRAMO to GRAMO is 1000
    this.addConversion('GRAMO', 'KILOGRAMO', 1000, 'kg');
    this.addConversion('KILOGRAMO', 'GRAMO', 1000, 'g');
    this.addConversion('GRAMO', 'LIBRA', 453.592, 'lb');
    this.addConversion('LIBRA', 'GRAMO', 453.592, 'g');
    this.addConversion('KILOGRAMO', 'LIBRA', 2.20462, 'lb');
    this.addConversion('LIBRA', 'KILOGRAMO', 0.453592, 'kg');
    this.addConversion('ONZA', 'GRAMO', 28.3495, 'g');
    this.addConversion('GRAMO', 'ONZA', 28.3495, 'oz');

    // Volume conversions
    this.addConversion('LITRO', 'MILILITRO', 1000, 'ml');
    this.addConversion('MILILITRO', 'LITRO', 1000, 'L');
    this.addConversion('GALON', 'LITRO', 3.78541, 'L');
    this.addConversion('LITRO', 'GALON', 3.78541, 'gal');
    
    // Length conversions
    this.addConversion('METRO', 'CENTIMETRO', 100, 'cm');
    this.addConversion('CENTIMETRO', 'METRO', 100, 'm');
  }

  private addConversion(from: string, to: string, factor: number, displayLabel: string): void {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();
    
    if (!this.conversionMap.has(fromUpper)) {
      this.conversionMap.set(fromUpper, []);
    }
    
    this.conversionMap.get(fromUpper)!.push({
      from: fromUpper,
      to: toUpper,
      factor,
      displayLabel
    });
  }

  getAvailableConversions(unitType: string): UnitConversion[] {
    const upperUnit = unitType?.toUpperCase() || '';
    return this.conversionMap.get(upperUnit) || [];
  }

  convert(value: number, from: string, to: string): number {
    if (from.toUpperCase() === to.toUpperCase()) {
      return value;
    }
    
    const conversions = this.getAvailableConversions(from);
    const conversion = conversions.find(c => c.to === to.toUpperCase());
    
    if (conversion) {
      // If converting to a larger unit (e.g., g to kg), divide by the factor
      // If converting to a smaller unit (e.g., kg to g), multiply by the factor
      return value * conversion.factor;
    }
    
    // Try reverse conversion
    const reverseConversions = this.getAvailableConversions(to);
    const reverseConversion = reverseConversions.find(c => c.to === from.toUpperCase());
    
    if (reverseConversion) {
      // For reverse conversion, we divide by the factor
      return value / reverseConversion.factor;
    }
    
    // If no conversion found, return original value
    return value;
  }
} 