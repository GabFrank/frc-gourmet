import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
    MatSlideToggleModule, MatSelectModule, MatButtonModule, MatIconModule, MatSnackBarModule,
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
            <mat-label>Teléfono del local</mat-label>
            <input matInput [(ngModel)]="cfg.telefonoContacto" maxlength="30" inputmode="tel" placeholder="0981 123 456">
            <mat-hint>El cliente lo ve en el detalle de su pedido para llamar o escribir.</mat-hint>
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

        <h3 class="sub">Cómo puede pagar el cliente al recibir o retirar</h3>
        <p class="hint">Lo que elige se muestra en la bandeja, en el ticket del delivery y viene precargado en el cobro del PdV. El pago con tarjeta online (uPay) se configura más abajo.</p>
        <div class="toggles">
          <mat-slide-toggle *ngFor="let m of metodosOpciones" [(ngModel)]="m.activo" color="primary">{{ m.label }}</mat-slide-toggle>
        </div>

        <h3 class="sub">Pizzas</h3>
        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="cfg.personalizarSabores" color="primary">
            Personalizar cada sabor (sacar, cambiar ingredientes y adicionales por sabor)
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
          servidor y nunca se vuelve a mostrar. La plantilla tiene que ser de categoría <b>Autenticación</b>, con
          el botón «Copiar código».</p>
        <div class="proveedor">
          <div class="proveedor-head">
            <span class="prov-nombre">WhatsApp (código de ingreso)</span>
            <span class="estado-chip" [class.abierta]="ingreso.whatsappListo">
              {{ ingreso.whatsappListo ? 'Configurado' : 'Sin configurar' }}
            </span>
          </div>
          <!-- F9: dos formas de mandar el código. Si la elegida no está configurada se usa la otra. -->
          <div class="grid">
            <mat-form-field appearance="outline">
              <mat-label>Enviar el código por</mat-label>
              <mat-select [(ngModel)]="cfg.whatsappProveedor">
                <mat-option value="META">WhatsApp Business oficial (Meta)</mat-option>
                <mat-option value="EVOLUTION">Número del local (Evolution API)</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <p class="ayuda" *ngIf="cfg.whatsappProveedor === 'EVOLUTION'">
            Usa la misma conexión que las notificaciones (Configuración › Notificaciones):
            <b>{{ ingreso.evolutionConfigurado ? 'conectada' : 'todavía sin configurar' }}</b>.
            El mensaje sale desde el número del local; no necesita plantilla aprobada.
          </p>
          <p class="ayuda" *ngIf="ingreso.whatsappListo && ingreso.whatsappProveedorActivo && ingreso.whatsappProveedorActivo !== cfg.whatsappProveedor">
            La opción elegida no está configurada: los códigos salen por
            {{ ingreso.whatsappProveedorActivo === 'EVOLUTION' ? 'el número del local (Evolution)' : 'Meta' }}.
          </p>
          <div class="grid" *ngIf="cfg.whatsappProveedor !== 'EVOLUTION'">
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
            <mat-form-field appearance="outline" class="tel-prueba" subscriptSizing="dynamic">
              <mat-label>Teléfono de prueba</mat-label>
              <input matInput [(ngModel)]="telefonoPrueba" placeholder="595981123456" maxlength="20" inputmode="tel">
            </mat-form-field>
            <button mat-stroked-button (click)="probarWhatsapp()" [disabled]="probando || !ingreso.whatsappListo">
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

        <h3 class="sub">Pago online</h3>
        <p class="ayuda">El cliente paga con tarjeta en la página del proveedor y el pedido llega a cocina recién cuando el pago está confirmado.</p>
        <div class="proveedor">
          <div class="proveedor-head">
            <mat-slide-toggle [(ngModel)]="cfg.pagoOnlineActivo">Ofrecer pago con tarjeta</mat-slide-toggle>
            <span class="estado-chip" [class.abierta]="cfg.pagoOnlineActivo && provSelListo">
              {{ cfg.pagoOnlineActivo && provSelListo ? 'Activo' : 'Apagado' }}
            </span>
          </div>
          <div class="grid">
            <mat-form-field appearance="outline">
              <mat-label>Proveedor</mat-label>
              <mat-select [(ngModel)]="provSelId" (selectionChange)="elegirProveedor()">
                <mat-option *ngFor="let p of proveedoresPago" [value]="p.id">{{ p.nombre }}</mat-option>
              </mat-select>
              <mat-hint>Con este se cobran los pedidos nuevos; los ya pagados siguen con el suyo.</mat-hint>
            </mat-form-field>
          </div>
          <!-- Proveedores con campos declarados (Bancard…): la lista sale del servidor. -->
          <div class="grid" *ngIf="provSel && provSel.campos.length">
            <ng-container *ngFor="let c of provSel.campos">
              <mat-form-field appearance="outline" *ngIf="!c.secreto && c.opciones" [class.full]="!!c.ayuda">
                <mat-label>{{ c.etiqueta }}</mat-label>
                <mat-select [(ngModel)]="valoresProv[provSel.id][c.clave]">
                  <mat-option *ngFor="let o of c.opciones" [value]="o.valor">{{ o.etiqueta }}</mat-option>
                </mat-select>
                <mat-hint *ngIf="c.ayuda">{{ c.ayuda }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" *ngIf="!c.secreto && !c.opciones" class="full">
                <mat-label>{{ c.etiqueta }}</mat-label>
                <input matInput [(ngModel)]="valoresProv[provSel.id][c.clave]" [maxlength]="c.maxLength || 255" autocomplete="off">
                <mat-hint *ngIf="c.ayuda">{{ c.ayuda }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" *ngIf="c.secreto" class="full">
                <mat-label>{{ c.etiqueta }}</mat-label>
                <input matInput type="password" [(ngModel)]="secretosNuevos[provSel.id][c.clave]" [maxlength]="c.maxLength || 500"
                       autocomplete="off" [disabled]="!ingreso.almacenSeguroDisponible"
                       [placeholder]="provSel.secretosGuardados[c.clave] ? '•••••• guardada (escribí para cambiar)' : ''">
                <mat-hint *ngIf="ingreso.almacenSeguroDisponible">Se guarda cifrada en este servidor y no se vuelve a mostrar.</mat-hint>
                <mat-hint *ngIf="!ingreso.almacenSeguroDisponible" class="hint-error">Este servidor no tiene almacén seguro: no se puede guardar.</mat-hint>
              </mat-form-field>
            </ng-container>
          </div>
          <div class="datos-portal" *ngIf="provSel?.datosPortal?.length">
            <div *ngFor="let d of provSel.datosPortal">
              <span class="lbl">{{ d.etiqueta }}</span>
              <code>{{ d.valor }}</code>
            </div>
          </div>
          <div class="grid" *ngIf="provSelId === 'UPAY'">
            <mat-form-field appearance="outline" class="full">
              <mat-label>URL base de uPay</mat-label>
              <input matInput [(ngModel)]="cfg.upayBaseUrl" maxlength="255" placeholder="https://…upay.com.py">
              <mat-hint>La que da uPay (prueba o producción). Solo https y dominio de uPay.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Merchant ID</mat-label>
              <input matInput [(ngModel)]="cfg.upayMerchantId" maxlength="64">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Nombre del comercio</mat-label>
              <input matInput [(ngModel)]="cfg.upayMerchantNombre" maxlength="150">
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>API Key de uPay</mat-label>
              <input matInput type="password" [(ngModel)]="upayKeyNueva" maxlength="500" autocomplete="off"
                     [disabled]="!ingreso.almacenSeguroDisponible"
                     [placeholder]="ingreso.upayApiKeyGuardada ? '•••••• guardada (escribí para cambiar)' : ''">
              <mat-hint *ngIf="ingreso.almacenSeguroDisponible">Se guarda cifrada en este servidor y no se vuelve a mostrar.</mat-hint>
              <mat-hint *ngIf="!ingreso.almacenSeguroDisponible" class="hint-error">
                Este servidor no tiene almacén seguro: no se puede guardar la API Key.
              </mat-hint>
            </mat-form-field>
          </div>
          <div class="grid">
            <mat-form-field appearance="outline">
              <mat-label>Aviso si está pagado y sin aceptar (min)</mat-label>
              <input matInput type="number" min="1" max="240" [(ngModel)]="cfg.minutosAvisoPagadoSinAceptar">
            </mat-form-field>
          </div>
          <div class="devolucion-auto" *ngIf="provSel?.devuelvePorApi">
            <mat-slide-toggle [(ngModel)]="cfg.pagoDevolucionAutomatica">Devolver automáticamente</mat-slide-toggle>
            <p class="ayuda">Al cancelar un pedido pagado con «Hay que devolverlo», se intenta devolver por {{ provSel.nombre }} en el momento. Si no se puede, queda en la cola DEVOLVER como siempre.</p>
          </div>
          <div class="fila-acciones">
            <button mat-stroked-button *ngIf="provSelId === 'UPAY' && ingreso.upayApiKeyGuardada" (click)="borrarUpayKey()" [disabled]="guardando">
              <mat-icon>delete</mat-icon> Quitar API Key
            </button>
            <button mat-stroked-button (click)="probarPago()" [disabled]="probando || !provSelListo">
              <mat-icon>wifi_tethering</mat-icon> Probar conexión
            </button>
          </div>
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
    .hint { color: var(--text-secondary); font-size: 12px; margin: 0 0 6px; }
    .lan-field { width: 100%; margin-bottom: 8px; }
    .actions { display: flex; justify-content: flex-end; }
    .ayuda { color: var(--text-secondary); font-size: 13px; margin: 0 0 10px; }
    .proveedor { border: 1px solid var(--border-color, rgba(0,0,0,.12)); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .proveedor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .prov-nombre { font-weight: 600; color: var(--text-primary); }
    .proveedor .grid { margin-top: 10px; align-items: start; }
    /* Identificadores que distinguen mayúsculas (Client ID, plantilla): sin la mayúscula global. */
    .proveedor input { text-transform: none !important; }
    .fila-acciones { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .fila-acciones button { white-space: nowrap; }
    .tel-prueba { width: 220px; }
    .full-width { width: 100%; margin-top: 10px; }
    .hint-error { color: var(--error-color); }
    .devolucion-auto { margin: 4px 0 8px; }
    .datos-portal { margin: 4px 0 12px; font-size: 13px; }
    .datos-portal .lbl { display: block; color: var(--text-secondary); }
    .datos-portal code { word-break: break-all; user-select: all; }
    .devolucion-auto .ayuda { margin: 4px 0 0; }
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
  /** API Key de uPay nueva (solo escritura, F4). */
  upayKeyNueva = '';
  // Proveedores de pago (precalculado para el template).
  proveedoresPago: any[] = [];
  provSelId = 'UPAY';
  provSel: any = null;
  provSelListo = false;
  /** Valores NO secretos por proveedor, editables. */
  valoresProv: Record<string, Record<string, string>> = {};
  /** Secretos nuevos por proveedor (solo escritura: el servidor nunca los devuelve). */
  secretosNuevos: Record<string, Record<string, string>> = {};
  ingreso: any = {};

  private static readonly ERRORES: Record<string, string> = {
    whatsapp_phone_id_invalido: 'El Phone Number ID son solo números',
    whatsapp_plantilla_invalida: 'La plantilla va en minúsculas, números y _',
    whatsapp_idioma_invalido: 'Idioma inválido (ej.: es, es_AR)',
    whatsapp_proveedor_invalido: 'Proveedor de WhatsApp inválido',
    telefono_contacto_invalido: 'El teléfono del local solo lleva números, espacios, + o guiones',
    google_client_id_invalido: 'El Client ID tiene que terminar en .apps.googleusercontent.com',
    almacen_seguro_no_disponible: 'Este servidor no puede guardar el token cifrado',
    token_no_guardado: 'No se pudo guardar el token',
    color_invalido: 'Color inválido',
    whatsapp_no_configurado: 'WhatsApp no está configurado',
    telefono_invalido: 'Teléfono inválido: con código de país, solo números',
    envio_fallido: 'WhatsApp rechazó el envío',
    demasiadas_pruebas: 'Esperá un minuto entre pruebas (máximo 5 por hora)',
    upay_url_invalida: 'La URL de uPay tiene que ser https y de un dominio de uPay',
    upay_merchant_invalido: 'Merchant ID inválido',
    minutos_aviso_invalido: 'Los minutos de aviso van de 1 a 240',
    upay_faltan_credenciales: 'Para activar el pago con tarjeta faltan el Merchant ID o la API Key',
    upay_credenciales: 'uPay rechazó la API Key',
    upay_sin_conexion: 'No se pudo conectar con uPay',
    upay_error: 'uPay respondió con un error',
    pago_proveedor_invalido: 'Proveedor de pago inválido',
    pago_faltan_credenciales: 'Para activar el pago con tarjeta faltan datos del proveedor',
    bancard_publickey_invalido: 'La clave pública de Bancard no tiene el formato esperado',
    bancard_privatekey_invalido: 'La clave privada de Bancard no tiene el formato esperado',
    bancard_entorno_invalido: 'Entorno de Bancard inválido',
    bancard_credenciales: 'Bancard rechazó las claves',
    bancard_sin_conexion: 'No se pudo conectar con Bancard',
    bancard_error: 'Bancard respondió con un error',
  };

  /** Arma el estado de proveedores que vino del servidor. */
  private armarProveedores(pago: any): void {
    this.proveedoresPago = pago?.proveedores || [];
    this.provSelId = pago?.proveedorActivo || 'UPAY';
    for (const p of this.proveedoresPago) {
      this.valoresProv[p.id] = { ...(p.valores || {}) };
      this.secretosNuevos[p.id] = {};
    }
    this.elegirProveedor();
  }

  elegirProveedor(): void {
    this.provSel = this.proveedoresPago.find((p) => p.id === this.provSelId) || null;
    this.provSelListo = this.provSelId === 'UPAY' ? !!this.ingreso?.upayApiKeyGuardada && !!this.cfg?.upayMerchantId : !!this.provSel?.listo;
  }

  private mensajeError(res: any): string {
    const base = TiendaOnlineConfigComponent.ERRORES[res?.error] || 'No se pudo guardar';
    return res?.detalle ? `${base}: ${res.detalle}` : base;
  }

  /** F8: métodos para pagar al recibir (interruptores). Precalculado: el template no calcula. */
  metodosOpciones: { valor: string; label: string; activo: boolean }[] = [];
  private readonly METODOS = [
    { valor: 'EFECTIVO', label: 'Efectivo (con vuelto y moneda)' },
    { valor: 'TARJETA_POS', label: 'Tarjeta en el POS' },
    { valor: 'QR', label: 'QR' },
    { valor: 'PIX', label: 'PIX' },
    { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  ];
  private armarMetodos(): void {
    const activos: string[] = Array.isArray(this.cfg?.metodosPago) ? this.cfg.metodosPago : ['EFECTIVO'];
    this.metodosOpciones = this.METODOS.map((m) => ({ ...m, activo: activos.includes(m.valor) }));
  }

  ngOnInit(): void {
    this.repo.getTiendaOnlineConfig().subscribe({
      next: (c) => {
        this.cfg = c || this.cfg;
        if (!this.cfg.whatsappProveedor) this.cfg.whatsappProveedor = 'META';
        this.ingreso = c?.ingreso || {};
        this.armarMetodos();
        this.armarProveedores(c?.pago);
        this.cargando = false;
      },
      error: () => { this.cargando = false; },
    });
  }

  guardar(extra: any = {}): void {
    this.guardando = true;
    const { ingreso, abiertaAhora, pago, ...datos } = this.cfg;
    const payload: any = { ...datos, ...extra };
    payload.pagoProveedor = this.provSelId;
    // Datos de los proveedores con campos (los de uPay van en sus columnas, como siempre).
    const pagoConfig: Record<string, any> = {};
    const pagoSecretos: Record<string, any> = {};
    for (const p of this.proveedoresPago.filter((x) => x.campos?.length)) {
      pagoConfig[p.id] = this.valoresProv[p.id] || {};
      const nuevos = Object.entries(this.secretosNuevos[p.id] || {}).filter(([, v]) => String(v || '').trim());
      if (nuevos.length) pagoSecretos[p.id] = Object.fromEntries(nuevos);
    }
    if (Object.keys(pagoConfig).length) payload.pagoConfig = pagoConfig;
    if (Object.keys(pagoSecretos).length) payload.pagoSecretos = pagoSecretos;
    // Ninguno marcado = sólo efectivo (el servidor nunca deja la tienda sin forma de pago).
    // Si la config no llegó a cargarse, no se mandan: si no, se resetearía a sólo efectivo.
    if (this.metodosOpciones.length) payload.metodosPago = this.metodosOpciones.filter((m) => m.activo).map((m) => m.valor);
    else delete payload.metodosPago;
    if (this.tokenNuevo.trim() && !extra.whatsappTokenBorrar) payload.whatsappToken = this.tokenNuevo.trim();
    if (this.upayKeyNueva.trim() && !extra.upayApiKeyBorrar) payload.upayApiKey = this.upayKeyNueva.trim();
    this.repo.updateTiendaOnlineConfig(payload).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.cfg = res.config;
          this.ingreso = res.config?.ingreso || {};
          this.armarMetodos();
          this.armarProveedores(res.config?.pago);
          this.tokenNuevo = '';
          this.upayKeyNueva = '';
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
    if (!confirm('¿Quitar el token de WhatsApp? El ingreso por código deja de funcionar hasta cargar otro.')) return;
    this.tokenNuevo = '';
    this.guardando = true;
    this.repo.updateTiendaOnlineConfig({ whatsappTokenBorrar: true }).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.ingreso = res.config?.ingreso || {};
          this.snack.open('Token quitado', 'OK', { duration: 2500 });
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

  borrarUpayKey(): void {
    if (!confirm('¿Quitar la API Key de uPay? El pago con tarjeta se apaga hasta cargar otra.')) return;
    this.upayKeyNueva = '';
    this.guardando = true;
    this.repo.updateTiendaOnlineConfig({ upayApiKeyBorrar: true, pagoOnlineActivo: false }).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.cfg = res.config;
          this.ingreso = res.config?.ingreso || {};
          this.armarProveedores(res.config?.pago);
          this.snack.open('API Key quitada', 'OK', { duration: 2500 });
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

  probarPago(): void {
    this.probando = true;
    this.repo.probarTiendaPago(this.provSelId).subscribe({
      next: (res) => {
        this.probando = false;
        this.snack.open(res?.success ? `Conexión con ${res.proveedor || 'el proveedor'} correcta` : this.mensajeError(res), 'OK', { duration: 5000 });
      },
      error: (e) => {
        this.probando = false;
        this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 });
      },
    });
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
