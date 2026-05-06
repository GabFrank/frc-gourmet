import { Directive, ElementRef, HostListener, Input, OnDestroy, OnInit, Optional, Self } from '@angular/core';
import { NgControl } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Directiva para inputs monetarios con formato locale-aware:
 *   - PYG (decimals=0): "1.234.567" (punto como separador de miles, sin decimales)
 *   - USD/BRL (decimals=2): "1.234.567,89" (punto miles + coma decimal)
 *
 * Comportamiento:
 *   - El FormControl/ngModel sigue manejando el valor RAW como `number`.
 *   - El display de la <input type="text"> se formatea on-blur y on-init.
 *   - On focus: se muestra el valor sin separadores de miles, con coma decimal
 *     (ej: 1234,5) para edicion comoda.
 *
 * Uso:
 *   <input matInput type="text" formControlName="costo" appCurrencyInput [decimals]="moneda.decimales">
 *
 * Importante: usar type="text" (no "number"); con number los browsers no permiten "." y ","
 * locales y se rompe la formateacion.
 */
@Directive({
  selector: 'input[appCurrencyInput]',
  standalone: true,
})
export class CurrencyInputDirective implements OnInit, OnDestroy {
  @Input() decimals = 0;

  private sub?: Subscription;
  private writingFromControl = false;

  constructor(
    private el: ElementRef<HTMLInputElement>,
    @Optional() @Self() private ngControl: NgControl | null,
  ) {}

  ngOnInit(): void {
    if (this.ngControl?.control) {
      this.sub = this.ngControl.control.valueChanges.subscribe((v) => {
        if (this.writingFromControl) return;
        // Si el cambio vino de programa (patchValue, etc) y el input no esta enfocado,
        // re-formatear el display.
        if (document.activeElement !== this.el.nativeElement) {
          this.el.nativeElement.value = this.formatDisplay(v);
        }
      });
      // Estado inicial
      this.el.nativeElement.value = this.formatDisplay(this.ngControl.control.value);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('focus')
  onFocus(): void {
    const raw = this.ngControl?.control?.value;
    this.el.nativeElement.value = this.formatEditable(raw);
    // Seleccionar todo para edicion rapida
    setTimeout(() => this.el.nativeElement.select(), 0);
  }

  @HostListener('blur')
  onBlur(): void {
    const parsed = this.parseInput(this.el.nativeElement.value);
    this.writingFromControl = true;
    if (this.ngControl?.control) {
      // Permitir que el ValueAccessor reciba el valor — el blur ya termina la edicion.
      this.ngControl.control.setValue(parsed, { emitEvent: true });
    }
    this.writingFromControl = false;
    this.el.nativeElement.value = this.formatDisplay(parsed);
  }

  @HostListener('input', ['$event'])
  onInput(_e: Event): void {
    // Mientras escribe, parsear y propagar al model SIN empujar al view (eso sobrescribiria
    // lo que esta tipeando el usuario y rompe la edicion de "." y ",").
    const parsed = this.parseInput(this.el.nativeElement.value);
    this.writingFromControl = true;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(parsed, {
        emitEvent: true,
        emitModelToViewChange: false,
      });
    }
    this.writingFromControl = false;
  }

  /** Formato display blur/init: con separador de miles + decimal segun config. */
  private formatDisplay(value: any): string {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return new Intl.NumberFormat('es-PY', {
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals,
      useGrouping: true,
    }).format(n).replace(/ /g, ' ');
  }

  /** Formato edicion (focus): sin separador miles, con coma decimal si decimals>0. */
  private formatEditable(value: any): string {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (this.decimals === 0) return String(Math.round(n));
    return n.toFixed(this.decimals).replace('.', ',');
  }

  /**
   * Parsea cualquier formato que el usuario escriba:
   *   "1.234.567"     → 1234567
   *   "1.234.567,89"  → 1234567.89
   *   "1234567,89"    → 1234567.89
   *   "1234567.89"    → 1234567.89  (acepta el formato US-style por si el usuario lo tipea)
   *   ""              → null
   */
  private parseInput(raw: string): number | null {
    const s = (raw || '').trim();
    if (!s) return null;
    // Si tiene tanto "." como "," → "." es miles, "," decimal (estilo es-PY).
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    let normalized: string;
    if (hasDot && hasComma) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      // Solo coma → asumir decimal.
      normalized = s.replace(',', '.');
    } else if (hasDot && !hasComma) {
      // Solo punto: ambiguo. Si decimals=0 → tratar como miles. Sino, tratar como decimal.
      normalized = this.decimals === 0 ? s.replace(/\./g, '') : s;
    } else {
      normalized = s;
    }
    // Eliminar caracteres no numericos remanentes (excepto signo y punto)
    normalized = normalized.replace(/[^\d.\-]/g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : null;
  }
}
