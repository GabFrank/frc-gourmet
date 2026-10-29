import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';

/**
 * Config de la TIENDA ONLINE (cierre MVP). Una sola fila: apertura, tipos de
 * pedido, prep-time, mínimo, aceptación automática y branding.
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
@Component({
  selector: 'app-tienda-online-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSlideToggleModule, MatButtonModule, MatIconModule, MatSnackBarModule,
  ],
  template: `
    <div class="config-container">
      <h2>Configuración de la tienda online</h2>
      <p class="muted" *ngIf="cargando">Cargando…</p>

      <mat-card class="config-card" *ngIf="!cargando">
        <mat-slide-toggle [(ngModel)]="cfg.activa" color="primary" class="row-toggle">
          Tienda activa (toma pedidos)
        </mat-slide-toggle>
        <span class="estado-chip" [class.abierta]="cfg.abiertaAhora">
          {{ cfg.abiertaAhora ? 'Abierta ahora' : 'Cerrada ahora' }}
        </span>

        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>Nombre del comercio</mat-label>
            <input matInput [(ngModel)]="cfg.nombreComercio" maxlength="150">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Color de marca (hex)</mat-label>
            <input matInput [(ngModel)]="cfg.colorPrimario" placeholder="#c0392b" maxlength="20">
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Mensaje de bienvenida</mat-label>
            <input matInput [(ngModel)]="cfg.mensajeBienvenida" maxlength="300">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Prep-time (minutos)</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="cfg.prepTimeMinutos">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Monto mínimo de pedido</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="cfg.montoMinimoPedido">
          </mat-form-field>
        </div>

        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="cfg.permitePickup" color="primary">Permite retiro (pickup)</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="cfg.permiteDelivery" color="primary">Permite delivery</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="cfg.aceptacionAutomatica" color="warn">
            Aceptación automática (sin revisión en el PdV)
          </mat-slide-toggle>
        </div>

        <h3 class="sub">Pedidos en mesa (QR autoservicio)</h3>
        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="cfg.permiteMesa" color="primary">Permite pedidos en mesa (QR)</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="cfg.requiereLanMesa" color="warn">
            Exigir la red del local (WiFi) para pedir en mesa
          </mat-slide-toggle>
        </div>
        <mat-form-field appearance="outline" class="lan-field" *ngIf="cfg.requiereLanMesa">
          <mat-label>IPs / CIDR permitidos para mesa (separados por coma)</mat-label>
          <input matInput [(ngModel)]="cfg.rangoLanMesa" placeholder="Ej: 190.10.20.30 (IP pública del local)" maxlength="255">
          <mat-hint>Detrás de proxy en la nube: la IP pública de egreso del local. Vacío = rangos privados. Desactivá el toggle en desarrollo.</mat-hint>
        </mat-form-field>

        <h3 class="sub">Ingreso de clientes</h3>
        <p class="ayuda">Vacío = se usan las variables de entorno del servidor. El token se guarda cifrado en el
          servidor y nunca se vuelve a mostrar.</p>
        <div class="proveedor">
          <div class="proveedor-head">
            <span class="prov-nombre">WhatsApp (código de ingreso)</span>
            <span class="estado-chip" [class.abierta]="ingreso.whatsappConfigurado">
              {{ ingreso.whatsappConfigurado ? 'Configurado' : 'Sin configurar' }}
            </span>
          </div>
          <div class="grid">
            <mat-form-field appearance="outline">
              <mat-label>Phone Number ID</mat-label>
              <input matInput [(ngModel)]="cfg.whatsappPhoneNumberId" maxlength="30" inputmode="numeric"
                     [placeholder]="ingreso.whatsappPhoneNumberIdEnEntorno ? 'Usando el del entorno' : ''">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Plantilla</mat-label>
              <input matInput [(ngModel)]="cfg.whatsappPlantilla" maxlength="120" placeholder="codigo_ingreso">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Idioma de la plantilla</mat-label>
              <input matInput [(ngModel)]="cfg.whatsappIdioma" maxlength="16" placeholder="es">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Token de acceso</mat-label>
              <input matInput type="password" autocomplete="new-password" [(ngModel)]="tokenNuevo"
                     [disabled]="!ingreso.almacenSeguroDisponible"
                     [placeholder]="ingreso.whatsappTokenGuardado ? '•••••• guardado (escribí para cambiar)' : ''">
              <mat-hint *ngIf="!ingreso.almacenSeguroDisponible" class="hint-error">
                Este servidor no tiene almacén seguro: el token solo se puede poner por variable de entorno.
              </mat-hint>
            </mat-form-field>
          </div>
          <div class="fila-acciones">
            <button mat-stroked-button *ngIf="ingreso.whatsappTokenGuardado" (click)="borrarToken()" [disabled]="guardando">
              <mat-icon>key_off</mat-icon> Quitar token
            </button>
            <mat-form-field appearance="outline" class="tel-prueba">
              <mat-label>Teléfono de prueba</mat-label>
              <input matInput [(ngModel)]="telefonoPrueba" placeholder="595981123456" maxlength="20" inputmode="tel">
            </mat-form-field>
            <button mat-stroked-button (click)="probarWhatsapp()" [disabled]="probando || !ingreso.whatsappConfigurado">
              <mat-icon>send</mat-icon> Probar envío
            </button>
          </div>
        </div>
        <div class="proveedor">
          <div class="proveedor-head">
            <span class="prov-nombre">Google</span>
            <span class="estado-chip" [class.abierta]="ingreso.googleConfigurado">
              {{ ingreso.googleConfigurado ? 'Configurado' : 'Sin configurar' }}
            </span>
          </div>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Client ID (OAuth web)</mat-label>
            <input matInput [(ngModel)]="cfg.googleClientId" maxlength="255"
                   placeholder="1234-abc.apps.googleusercontent.com">
            <mat-hint>Origen autorizado en Google: la dirección pública de la tienda.</mat-hint>
          </mat-form-field>
        </div>

        <div class="actions">
          <button mat-flat-button color="primary" [disabled]="guardando" (click)="guardar()">
            <mat-icon>save</mat-icon> Guardar
          </button>
        </div>
      </mat-card>
    </div>
  `,
  styles: [`
    .config-container { padding: 16px; height: 100%; overflow-y: auto; box-sizing: border-box; }
    h2 { color: var(--text-primary); margin: 0 0 16px; }
    .muted { color: var(--text-secondary); }
    .config-card { max-width: 760px; padding: 20px; }
    .row-toggle { margin-right: 12px; }
    .estado-chip { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--surface-variant); color: var(--error-color); border: 1px solid var(--error-color); }
    .estado-chip.abierta { color: var(--success-color); border-color: var(--success-color); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0 6px; }
    .grid .full { grid-column: 1 / -1; }
    .toggles { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 18px; }
    .sub { color: var(--text-primary); margin: 8px 0 4px; font-size: 15px; }
    .lan-field { width: 100%; margin-bottom: 8px; }
    .actions { display: flex; justify-content: flex-end; }
    .ayuda { color: var(--text-secondary); font-size: 13px; margin: 0 0 10px; }
    .proveedor { border: 1px solid var(--border-color, rgba(0,0,0,.12)); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .proveedor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .prov-nombre { font-weight: 600; color: var(--text-primary); }
    .proveedor .grid { margin-top: 10px; }
    .fila-acciones { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .fila-acciones button { white-space: nowrap; }
    .tel-prueba { width: 220px; margin-bottom: -1.25em; }
    .full-width { width: 100%; margin-top: 10px; }
    .hint-error { color: var(--error-color); }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class TiendaOnlineConfigComponent implements OnInit {
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);

  cfg: any = { activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30, montoMinimoPedido: 0 };
  cargando = true;
  guardando = false;
  probando = false;
  /** Token nuevo (solo escritura: el servidor nunca lo devuelve). */
  tokenNuevo = '';
  telefonoPrueba = '';
  ingreso: any = {};

  private static readonly ERRORES: Record<string, string> = {
    whatsapp_phone_id_invalido: 'El Phone Number ID son solo números',
    whatsapp_plantilla_invalida: 'La plantilla va en minúsculas, números y _',
    whatsapp_idioma_invalido: 'Idioma inválido (ej.: es, es_AR)',
    google_client_id_invalido: 'El Client ID tiene que terminar en .apps.googleusercontent.com',
    almacen_seguro_no_disponible: 'Este servidor no puede guardar el token cifrado',
    token_no_guardado: 'No se pudo guardar el token',
    color_invalido: 'Color inválido',
    whatsapp_no_configurado: 'WhatsApp no está configurado',
    telefono_invalido: 'Teléfono inválido: con código de país, solo números',
    envio_fallido: 'WhatsApp rechazó el envío',
  };

  private mensajeError(res: any): string {
    const base = TiendaOnlineConfigComponent.ERRORES[res?.error] || 'No se pudo guardar';
    return res?.detalle ? `${base}: ${res.detalle}` : base;
  }

  ngOnInit(): void {
    this.repo.getTiendaOnlineConfig().subscribe({
      next: (c) => { this.cfg = c || this.cfg; this.ingreso = c?.ingreso || {}; this.cargando = false; },
      error: () => { this.cargando = false; },
    });
  }

  guardar(extra: any = {}): void {
    this.guardando = true;
    const { ingreso, abiertaAhora, ...datos } = this.cfg;
    const payload = { ...datos, ...extra };
    if (this.tokenNuevo.trim() && !extra.whatsappTokenBorrar) payload.whatsappToken = this.tokenNuevo.trim();
    this.repo.updateTiendaOnlineConfig(payload).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.cfg = res.config;
          this.ingreso = res.config?.ingreso || {};
          this.tokenNuevo = '';
          this.snack.open('Configuración guardada', 'OK', { duration: 2500 });
        } else {
          this.snack.open(this.mensajeError(res), 'OK', { duration: 4000 });
        }
      },
      error: (e) => {
        this.guardando = false;
        this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 });
      },
    });
  }

  borrarToken(): void {
    this.tokenNuevo = '';
    this.guardar({ whatsappTokenBorrar: true });
  }

  probarWhatsapp(): void {
    this.probando = true;
    this.repo.probarTiendaWhatsapp({ telefono: this.telefonoPrueba }).subscribe({
      next: (res) => {
        this.probando = false;
        this.snack.open(res?.success ? 'Código de prueba enviado: revisá el WhatsApp' : this.mensajeError(res), 'OK', { duration: 5000 });
      },
      error: (e) => {
        this.probando = false;
        this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 });
      },
    });
  }
}
