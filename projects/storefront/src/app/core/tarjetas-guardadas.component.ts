import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PublicApiService } from './public-api.service';
import { esUrlPagoPermitida } from './pago-online';

/** Una tarjeta guardada, como la devuelve el servidor (sin datos de la tarjeta). */
export interface TarjetaGuardadaVista {
  id: number;
  marca: string | null;
  enmascarada: string | null;
  tipo: string | null;
}

const MARCAS: Record<string, string> = { VSA: 'Visa', VISA: 'Visa', MST: 'Mastercard', MASTERCARD: 'Mastercard', DIN: 'dinelco' };

/** «Visa •••• 1005». */
export function nombreTarjeta(t: TarjetaGuardadaVista): string {
  const marca = MARCAS[String(t.marca || '').toUpperCase()] || 'Tarjeta';
  const ult = String(t.enmascarada || '').replace(/\D/g, '').slice(-4);
  return ult ? `${marca} •••• ${ult}` : marca;
}

export const MENSAJES_TARJETA: Record<string, string> = {
  telefono_no_verificado: 'Para guardar una tarjeta, primero verificá tu teléfono en Mi cuenta.',
  tarjeta_sin_consentimiento: 'Marcá la casilla para guardar la tarjeta.',
  tarjeta_no_disponible: 'Guardar tarjetas no está disponible ahora.',
  demasiados_intentos: 'Probaste varias veces seguidas. Esperá un rato y volvé a intentar.',
  tarjeta_tope: 'Este pedido supera el tope del pago con un toque: pagalo esta vez con el formulario de abajo.',
  tarjeta_limite_dia: 'Hoy ya usaste el pago con un toque varias veces: pagá este pedido con el formulario de abajo.',
  tarjeta_direccion_nueva: 'Es una dirección nueva: esta vez pagá con el formulario de abajo (te pide la verificación de tu banco).',
  tarjeta_no_encontrada: 'Esa tarjeta ya no está guardada.',
  pago_en_curso: 'Ya hay un pago en curso para este pedido. Esperá unos segundos.',
};

/**
 * «Guardar mi tarjeta» (PLAN-tienda-tarjeta-guardada): casilla de consentimiento y el iframe del
 * catastro de dinelco (`dinelcoRegistry`). El evento del iframe no trae la tarjeta: solo dispara
 * la confirmación, que el servidor hace preguntándole a dinelco.
 */
@Component({
  selector: 'sf-registro-tarjeta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="registro">
      <ng-container *ngIf="!abierto">
        <label class="consent">
          <input type="checkbox" [(ngModel)]="consentimiento" />
          <span>Guardar mi tarjeta para pagar mis próximos pedidos con un toque. Se guarda en dinelco, no en la tienda, y la podés quitar cuando quieras desde Mi cuenta.</span>
        </label>
        <div class="acciones">
          <button type="button" class="sf-btn sf-btn-primary" [disabled]="!consentimiento || abriendo" (click)="abrir()">Guardar tarjeta</button>
          <button type="button" class="sf-btn" (click)="cerrar.emit()">Ahora no</button>
        </div>
      </ng-container>
      <p class="sf-muted" *ngIf="abierto && !confirmando">Cargá tu tarjeta. Tu banco te va a pedir una verificación. Los datos son de dinelco: la tienda no los ve.</p>
      <div id="sf-iframe-registro" class="iframe-registro" [hidden]="!abierto || confirmando"></div>
      <p class="sf-muted" *ngIf="confirmando">Confirmando con dinelco…</p>
      <p class="sf-error" *ngIf="error">{{ error }}</p>
    </div>
  `,
  styles: [`
    .registro { margin: 8px 0 12px; }
    .consent { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
    .consent input { margin-top: 4px; width: 18px; height: 18px; flex: none; }
    .acciones { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .iframe-registro ::ng-deep iframe { display: block; width: 100%; height: 680px; border: 0; border-radius: 8px; background: #fff; }
    @media (max-width: 768px) { .iframe-registro ::ng-deep iframe { height: 600px; } }
  `],
})
export class RegistroTarjetaComponent implements OnDestroy {
  private api = inject(PublicApiService);
  @Output() guardada = new EventEmitter<TarjetaGuardadaVista | null>();
  @Output() cerrar = new EventEmitter<void>();
  consentimiento = false;
  abriendo = false;
  abierto = false;
  confirmando = false;
  error: string | null = null;
  private ref = '';
  private origenes: string[] = [];
  private escucha = (ev: MessageEvent) => this.alMensaje(ev);
  private reintento: any = null;

  ngOnDestroy(): void {
    window.removeEventListener('message', this.escucha);
    if (this.reintento) clearTimeout(this.reintento);
  }

  abrir(): void {
    this.abriendo = true;
    this.error = null;
    this.api.call<any>('tarjetas.registro.abrir', [{ consentimiento: this.consentimiento === true }]).subscribe({
      next: (r) => {
        this.abriendo = false;
        if (!r?.success || !r.token || !esUrlPagoPermitida(r.validarUrl, r.hosts)) {
          this.error = MENSAJES_TARJETA[r?.error] || 'No pudimos abrir el formulario para guardar la tarjeta.';
          return;
        }
        this.ref = r.ref;
        this.origenes = (r.hosts || []).map((h: string) => 'https://' + h);
        window.removeEventListener('message', this.escucha);
        window.addEventListener('message', this.escucha);
        this.abierto = true;
        setTimeout(() => this.montar(r.validarUrl, r.token));
      },
      error: () => { this.abriendo = false; this.error = 'No pudimos abrir el formulario para guardar la tarjeta.'; },
    });
  }

  /** Nombres que exige dinelco: iframe `dinelcoRegistry`, formulario `registryForm`, input `JWT`. */
  private montar(validarUrl: string, token: string): void {
    const cont = document.getElementById('sf-iframe-registro');
    if (!cont) { this.abierto = false; this.error = 'No pudimos mostrar el formulario.'; return; }
    cont.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = 'dinelcoRegistry';
    iframe.name = 'dinelcoRegistry';
    iframe.title = 'Guardar tarjeta (dinelco)';
    const form = document.createElement('form');
    form.id = 'registryForm';
    form.method = 'POST';
    form.target = 'dinelcoRegistry';
    form.action = validarUrl;
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'JWT';
    input.id = 'integrityToken';
    input.value = token;
    form.appendChild(input);
    cont.appendChild(iframe);
    cont.appendChild(form);
    form.submit();
  }

  private alMensaje(ev: MessageEvent): void {
    if (!this.origenes.includes(ev.origin)) return;
    const st = ev.data && typeof ev.data === 'object' ? String((ev.data as any).registryStatus || '') : '';
    if (st === 'registry.success') { this.confirmar(0); return; }
    if (st === 'registry.failed') { this.terminar(); this.error = 'No se pudo guardar la tarjeta (tu banco tiene que pedir la verificación). Podés pagar igual con el formulario.'; return; }
    if (st === 'registry.cancel') { this.terminar(); this.cerrar.emit(); }
  }

  /** El servidor le pregunta a dinelco; si todavía no lo sabe, se reintenta unos segundos. */
  private confirmar(vuelta: number): void {
    this.confirmando = true;
    this.api.call<any>('tarjetas.registro.confirmar', [this.ref]).subscribe({
      next: (r) => {
        if (r?.estado === 'ACTIVA') { this.terminar(); this.guardada.emit(r.tarjeta ?? null); return; }
        if (r?.estado === 'PENDIENTE' && vuelta < 10) { this.reintento = setTimeout(() => this.confirmar(vuelta + 1), 3000); return; }
        this.terminar();
        this.error = r?.estado === 'FALLIDA' ? 'No se pudo guardar la tarjeta. Podés pagar igual con el formulario.' : 'dinelco todavía no confirmó la tarjeta. Mirá en unos minutos en Mi cuenta.';
      },
      error: () => { this.terminar(); this.error = 'No pudimos confirmar la tarjeta.'; },
    });
  }

  private terminar(): void {
    window.removeEventListener('message', this.escucha);
    this.confirmando = false;
    this.abierto = false;
    const cont = document.getElementById('sf-iframe-registro');
    if (cont) cont.innerHTML = '';
  }
}

/** «Mis tarjetas» en Mi cuenta: las guardadas, quitar y agregar. Solo si la tienda lo ofrece. */
@Component({
  selector: 'sf-mis-tarjetas',
  standalone: true,
  imports: [CommonModule, RegistroTarjetaComponent],
  template: `
    <div class="sf-card mt" *ngIf="disponible">
      <div class="titulo">Mis tarjetas</div>
      <p class="sf-muted ayuda">Pagá tus pedidos con un toque. Las tarjetas se guardan en dinelco: la tienda nunca ve el número.</p>
      <div class="fila" *ngFor="let t of tarjetas">
        <span>{{ nombre(t) }}</span>
        <button type="button" class="sf-btn" [disabled]="quitando === t.id" (click)="quitar(t)">Quitar</button>
      </div>
      <p class="sf-muted" *ngIf="!tarjetas.length && !agregando">Todavía no guardaste ninguna tarjeta.</p>
      <button type="button" class="sf-btn" *ngIf="!agregando" (click)="agregando = true">Agregar tarjeta</button>
      <sf-registro-tarjeta *ngIf="agregando" (guardada)="alGuardar()" (cerrar)="agregando = false"></sf-registro-tarjeta>
      <p class="sf-error" *ngIf="error">{{ error }}</p>
    </div>
  `,
  styles: [`
    .mt { margin-top: 16px; }
    .titulo { font-weight: 600; }
    .ayuda { margin: 4px 0 10px; }
    .fila { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--sf-border, #eee); }
  `],
})
export class MisTarjetasComponent implements OnInit {
  private api = inject(PublicApiService);
  disponible = false;
  tarjetas: TarjetaGuardadaVista[] = [];
  agregando = false;
  quitando: number | null = null;
  error: string | null = null;
  nombre = nombreTarjeta;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.api.call<any>('tarjetas.listar', []).subscribe({
      next: (r) => { this.disponible = !!r?.disponible; this.tarjetas = r?.tarjetas || []; },
      error: () => { this.disponible = false; },
    });
  }

  alGuardar(): void { this.agregando = false; this.cargar(); }

  quitar(t: TarjetaGuardadaVista): void {
    this.quitando = t.id;
    this.error = null;
    this.api.call<any>('tarjetas.quitar', [t.id]).subscribe({
      next: (r) => { this.quitando = null; if (!r?.success) this.error = 'No pudimos quitar la tarjeta.'; this.cargar(); },
      error: () => { this.quitando = null; this.error = 'No pudimos quitar la tarjeta.'; },
    });
  }
}
