import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from './icon.component';
import { AnalisisTelefono, PAISES_TELEFONO, PaisTelefono, analizarTelefono, separarTelefono } from './telefono';

/**
 * Campo de teléfono con país, como en las demás apps: el país elige el código y el número se
 * valida mientras se escribe. Emite el análisis en cada cambio; el número a guardar es `e164`,
 * que solo viene lleno cuando el estado es «valido».
 *
 * Uso: `<sf-telefono-input [valor]="guardado" [soloMovil]="true" (cambio)="tel = $event">`.
 * `valor` es solo para precargar: el padre no tiene que devolverle lo que el campo emite.
 */
@Component({
  selector: 'sf-telefono-input',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="tel" [class.tel--ok]="analisis.estado === 'valido'" [class.tel--err]="marcarError">
      <label class="pais">
        <span class="pais-vista" aria-hidden="true">
          <span class="bandera">{{ pais.bandera }}</span>{{ prefijo }}
          <sf-icon name="chevron-down" [size]="14"></sf-icon>
        </span>
        <select [ngModel]="pais" (ngModelChange)="cambiarPais($event)" [compareWith]="mismoPais"
                aria-label="País del teléfono" [disabled]="deshabilitado">
          <option *ngFor="let p of paises" [ngValue]="p">{{ p.bandera }} {{ p.nombre }}{{ p.codigo ? ' (+' + p.codigo + ')' : '' }}</option>
        </select>
      </label>
      <input class="numero" [ngModel]="numero" (ngModelChange)="escribir($event)" (blur)="salir()"
             [placeholder]="pais.ejemplo" inputmode="tel" autocomplete="tel-national" maxlength="22"
             [attr.aria-invalid]="marcarError" [disabled]="deshabilitado" />
      <sf-icon *ngIf="analisis.estado === 'valido'" class="tilde" name="check" [size]="18"></sf-icon>
    </div>
    <p class="estado ok" *ngIf="analisis.estado === 'valido'">{{ analisis.legible }}</p>
    <p class="estado err" *ngIf="marcarError">{{ analisis.mensaje }}</p>
    <p class="estado sf-muted" *ngIf="mostrarPista">{{ analisis.mensaje }}</p>
  `,
  styles: [`
    :host { display: block; }
    .tel {
      display: flex; align-items: stretch; height: 48px;
      border: 1.5px solid var(--sf-border); border-radius: var(--sf-radius);
      background: var(--sf-surface); transition: border-color .15s ease; overflow: hidden;
    }
    .tel:focus-within { border-color: var(--sf-primary); }
    .tel--ok, .tel--ok:focus-within { border-color: var(--sf-success); }
    .tel--err, .tel--err:focus-within { border-color: var(--sf-error); }
    .pais { position: relative; display: flex; align-items: center; flex: none;
            border-right: 1.5px solid var(--sf-border); background: var(--sf-surface-alt); }
    .pais-vista { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 10px;
                  font-size: 15px; font-weight: 600; color: var(--sf-text); white-space: nowrap; }
    .bandera { font-size: 18px; line-height: 1; margin-right: 2px; }
    .pais-vista sf-icon { color: var(--sf-text-muted); }
    /* El select nativo cubre la vista: en el celular abre la lista del sistema. */
    .pais select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
    .numero { flex: 1; min-width: 0; border: none; background: transparent; color: var(--sf-text);
              font-size: 16px; padding: 0 12px; }
    .numero:focus { outline: none; }
    .tilde { display: flex; align-items: center; padding-right: 12px; color: var(--sf-success); }
    .estado { font-size: 12px; margin: 4px 0 0; }
    .estado.ok { color: var(--sf-success); }
    .estado.err { color: var(--sf-error); }
  `],
})
export class TelefonoInputComponent implements OnChanges {
  /** Número guardado (internacional o local viejo) para precargar. Cambiarlo reemplaza lo escrito. */
  @Input() valor: string | null | undefined = '';
  /** Exige celular (ingreso por código de WhatsApp). */
  @Input() soloMovil = false;
  @Input() deshabilitado = false;
  /** El padre lo pone en true al intentar enviar, para mostrar el error aunque no haya salido del campo. */
  @Input() forzarError = false;
  @Output() cambio = new EventEmitter<AnalisisTelefono>();

  readonly paises = PAISES_TELEFONO;
  pais: PaisTelefono = PAISES_TELEFONO[0];
  numero = '';
  prefijo = '+595';
  analisis: AnalisisTelefono = { estado: 'vacio', e164: '', legible: '', mensaje: '' };
  tocado = false;
  marcarError = false;
  mostrarPista = false;

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['valor']) {
      const s = separarTelefono(this.valor);
      this.pais = s.pais;
      this.numero = s.numero;
    }
    this.recalcular(false);
  }

  mismoPais = (a: PaisTelefono, b: PaisTelefono): boolean => !!a && !!b && a.iso === b.iso;

  salir(): void {
    this.tocado = true;
    this.recalcular(false);
  }

  cambiarPais(p: PaisTelefono): void {
    this.pais = p;
    this.recalcular(true);
  }

  escribir(texto: string): void {
    this.numero = texto;
    // Pegaron un número internacional con otro código: se cambia el país solo.
    // En «Otro país» basta con que el código sea uno conocido, aunque no lleve «+».
    if (/^\s*(\+|00)/.test(texto) || (!this.pais.codigo && /^[1-9]/.test(texto.replace(/\D+/g, '')))) {
      const s = separarTelefono(texto.replace(/\D+/g, '').replace(/^00/, ''));
      if (s.pais.iso !== this.pais.iso) { this.pais = s.pais; this.numero = s.numero; }
    }
    this.recalcular(true);
  }

  private recalcular(emitir: boolean): void {
    this.prefijo = this.pais.codigo ? '+' + this.pais.codigo : '';
    this.analisis = analizarTelefono(this.pais, this.numero, { soloMovil: this.soloMovil });
    const e = this.analisis.estado;
    // «Incompleto» se muestra como pista mientras escribe; como error, recién al salir o al enviar.
    this.marcarError = e === 'invalido' || (e === 'incompleto' && (this.tocado || this.forzarError));
    this.mostrarPista = e === 'incompleto' && !this.marcarError;
    if (emitir) this.cambio.emit(this.analisis);
  }
}
