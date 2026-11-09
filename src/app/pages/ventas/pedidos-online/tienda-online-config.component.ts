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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditFormaPagoOnlineDialogComponent, ProveedorCatalogo } from './create-edit-forma-pago-online-dialog/create-edit-forma-pago-online-dialog.component';

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
    MatSlideToggleModule, MatSelectModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule,
  ],
  template: `
    <div class="config-container">
      <header class="barra">
        <div class="barra-titulo">
          <h2>Configuración de la tienda online</h2>
          <p class="muted" *ngIf="cargando">Cargando…</p>
        </div>
        <div class="barra-acciones" *ngIf="!cargando">
          <mat-slide-toggle [(ngModel)]="cfg.activa" color="primary">Tienda activa (toma pedidos)</mat-slide-toggle>
          <span class="estado-chip" [class.abierta]="cfg.abiertaAhora">
            {{ cfg.abiertaAhora ? 'Abierta ahora' : 'Cerrada ahora' }}
          </span>
          <button mat-flat-button color="primary" [disabled]="guardando" (click)="guardar()">
            <mat-icon>save</mat-icon> Guardar
          </button>
        </div>
      </header>

      <div class="columnas" *ngIf="!cargando">
        <!-- Columna 1: la tienda (datos, pedidos y cómo se cobra). -->
        <div class="columna">
          <mat-card class="bloque">
            <h3 class="bloque-titulo"><mat-icon>storefront</mat-icon> Datos de la tienda</h3>
            <div class="grid grid-datos">
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>Nombre del comercio</mat-label>
                <input matInput [(ngModel)]="cfg.nombreComercio" maxlength="150">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Teléfono del local</mat-label>
                <input matInput [(ngModel)]="cfg.telefonoContacto" maxlength="30" inputmode="tel" placeholder="0981 123 456">
                <mat-hint>Lo ve el cliente en el detalle de su pedido.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Color de marca (hex)</mat-label>
                <input matInput [(ngModel)]="cfg.colorPrimario" placeholder="#c0392b" maxlength="20">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Prep-time (minutos)</mat-label>
                <input matInput type="number" min="0" [(ngModel)]="cfg.prepTimeMinutos">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Monto mínimo de pedido</mat-label>
                <input matInput type="number" min="0" [(ngModel)]="cfg.montoMinimoPedido">
              </mat-form-field>
              <mat-form-field appearance="outline" class="full">
                <mat-label>Mensaje de bienvenida</mat-label>
                <input matInput [(ngModel)]="cfg.mensajeBienvenida" maxlength="300">
              </mat-form-field>
            </div>
          </mat-card>

          <mat-card class="bloque">
            <h3 class="bloque-titulo"><mat-icon>receipt_long</mat-icon> Pedidos</h3>
            <div class="toggles">
              <mat-slide-toggle [(ngModel)]="cfg.permitePickup" color="primary">Permite retiro (pickup)</mat-slide-toggle>
              <mat-slide-toggle [(ngModel)]="cfg.permiteDelivery" color="primary">Permite delivery</mat-slide-toggle>
              <mat-slide-toggle [(ngModel)]="cfg.aceptacionAutomatica" color="warn">Aceptación automática (sin revisión en el PdV)</mat-slide-toggle>
              <mat-slide-toggle [(ngModel)]="cfg.personalizarSabores" color="primary">Pizzas: personalizar cada sabor</mat-slide-toggle>
            </div>
            <h4 class="sub">Pedidos en mesa (QR autoservicio)</h4>
            <div class="toggles">
              <mat-slide-toggle [(ngModel)]="cfg.permiteMesa" color="primary">Permite pedidos en mesa (QR)</mat-slide-toggle>
              <mat-slide-toggle [(ngModel)]="cfg.requiereLanMesa" color="warn">Exigir la red del local (WiFi)</mat-slide-toggle>
            </div>
            <mat-form-field appearance="outline" class="lan-field" *ngIf="cfg.requiereLanMesa">
              <mat-label>IPs / CIDR permitidos para mesa (separados por coma)</mat-label>
              <input matInput [(ngModel)]="cfg.rangoLanMesa" placeholder="Ej: 190.10.20.30 (IP pública del local)" maxlength="255">
              <mat-hint>Detrás de proxy en la nube: la IP pública de egreso del local. Vacío = rangos privados. Desactivá el toggle en desarrollo.</mat-hint>
            </mat-form-field>

          </mat-card>

          <mat-card class="bloque">
            <h3 class="bloque-titulo"><mat-icon>payments</mat-icon> Cobro al recibir o retirar</h3>
            <p class="hint">Lo que elige se muestra en la bandeja, en el ticket del delivery y viene precargado en el cobro del PdV.</p>
            <div class="toggles">
              <mat-slide-toggle *ngFor="let m of metodosOpciones" [(ngModel)]="m.activo" color="primary">{{ m.label }}</mat-slide-toggle>
            </div>
            <h4 class="sub">Compra a cuenta</h4>
            <p class="hint">Solo cuentas web vinculadas a un cliente con crédito (Ventas → Tienda online → Cuentas web) y con teléfono o correo verificado. La deuda nace al aceptar el pedido, en una cuota que vence a fin de mes, y respeta el límite sin excepción.</p>
            <div class="toggles">
              <mat-slide-toggle [(ngModel)]="cfg.creditoTienda" color="primary">Permitir «A cuenta» en la tienda</mat-slide-toggle>
            </div>
          </mat-card>
        </div>

        <!-- Columna 2: integraciones (ingreso de clientes y pago online). -->
        <div class="columna">
          <mat-card class="bloque">
            <h3 class="bloque-titulo"><mat-icon>login</mat-icon> Ingreso de clientes</h3>
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
                <mat-form-field appearance="outline" class="full">
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

          </mat-card>

          <mat-card class="bloque">
            <h3 class="bloque-titulo"><mat-icon>credit_card</mat-icon> Pago online</h3>
            <p class="ayuda">El cliente paga antes (tarjeta o Pix) y el pedido llega a cocina recién cuando el pago está confirmado. Se pueden ofrecer varios proveedores a la vez: el cliente elige.</p>
            <div class="proveedor">
              <div class="proveedor-head">
                <mat-slide-toggle [(ngModel)]="cfg.pagoOnlineActivo">Ofrecer pago online</mat-slide-toggle>
                <span class="estado-chip" [class.abierta]="cfg.pagoOnlineActivo && pagoOfrecidoListo">
                  {{ cfg.pagoOnlineActivo && pagoOfrecidoListo ? 'Activo' : 'Apagado' }}
                </span>
              </div>
              <div class="formas-head">
                <span class="sub">Formas de pago online</span>
                <button mat-stroked-button (click)="adicionarForma()" [disabled]="cargandoFormas">
                  <mat-icon>add</mat-icon> Adicionar
                </button>
              </div>
              <p class="ayuda" *ngIf="!formas.length && !cargandoFormas">Todavía no hay formas de pago online. Tocá «Adicionar» para cargar una cuenta (Bancard, IC Pay…).</p>
              <div class="tabla-wrap" *ngIf="formas.length">
                <table class="tabla-formas">
                  <thead>
                    <tr>
                      <th class="col-orden">Orden</th>
                      <th>Nombre para el cliente</th>
                      <th>Proveedor</th>
                      <th>Tipos de pedido</th>
                      <th>Estado</th>
                      <th class="col-activa">Activa</th>
                      <th class="col-acc"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let f of formas">
                      <td class="col-orden"><div class="botones">
                        <button mat-icon-button [disabled]="f.esPrimera || moviendo" (click)="moverForma(f, -1)" aria-label="Subir"><mat-icon>arrow_upward</mat-icon></button>
                        <button mat-icon-button [disabled]="f.esUltima || moviendo" (click)="moverForma(f, 1)" aria-label="Bajar"><mat-icon>arrow_downward</mat-icon></button>
                      </div></td>
                      <td class="nombre">{{ f.nombre }}</td>
                      <td>{{ f.proveedorNombre }}</td>
                      <td>{{ f.tiposTexto }}</td>
                      <td><span class="estado-chip" [class.abierta]="f.listo">{{ f.listo ? 'Datos completos' : 'Faltan datos' }}</span></td>
                      <td class="col-activa"><mat-slide-toggle [checked]="f.activo" (change)="cambiarActiva(f, $event.checked)" [disabled]="f.guardando"></mat-slide-toggle></td>
                      <td class="col-acc"><div class="botones">
                        <button mat-icon-button (click)="editarForma(f)" aria-label="Editar"><mat-icon>edit</mat-icon></button>
                        <button mat-icon-button (click)="probarForma(f)" [disabled]="probando || !f.listo" aria-label="Probar conexión"><mat-icon>wifi_tethering</mat-icon></button>
                        <button mat-icon-button (click)="quitarForma(f)" aria-label="Quitar"><mat-icon>delete</mat-icon></button>
                      </div></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="aviso-prueba" *ngIf="cfg.pagoOnlineActivo && !pagoOfrecidoListo && formas.length">
                <mat-icon>warning</mat-icon> Ninguna forma activa tiene sus datos completos: la tienda no ofrece pago online.
              </p>
              <div class="grid">
                <mat-form-field appearance="outline">
                  <mat-label>Aviso si está pagado y sin aceptar (min)</mat-label>
                  <input matInput type="number" min="1" max="240" [(ngModel)]="cfg.minutosAvisoPagadoSinAceptar">
                </mat-form-field>
              </div>
              <div class="devolucion-auto" *ngIf="algunaDevuelve">
                <mat-slide-toggle [(ngModel)]="cfg.pagoDevolucionAutomatica">Devolver automáticamente</mat-slide-toggle>
                <p class="ayuda">Al cancelar un pedido pagado con «Hay que devolverlo», se intenta devolver por el proveedor en el momento (si su cuenta lo permite). Si no se puede, queda en la cola DEVOLVER como siempre.</p>
              </div>
            </div>

          </mat-card>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .config-container { height: 100%; overflow-y: auto; box-sizing: border-box; padding: 0 16px 24px; }
    .muted { color: var(--text-secondary); }
    /* Barra fija: título, estado y Guardar siempre a mano. */
    .barra { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; padding: 14px 0 12px; background: var(--background-color); border-bottom: 1px solid var(--border-color); margin-bottom: 16px; }
    .barra h2 { color: var(--text-primary); margin: 0; font-size: 20px; }
    .barra-acciones { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    /* Dos columnas en pantallas anchas; una en pantallas chicas o cuadradas. */
    .columnas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .columna { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    @media (max-width: 1280px) { .columnas { grid-template-columns: minmax(0, 1fr); } }
    .bloque { padding: 16px 18px; }
    .bloque-titulo { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 16px; color: var(--text-primary); }
    .bloque-titulo mat-icon { color: var(--text-secondary); }
    .estado-chip { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--surface-variant); color: var(--error-color); border: 1px solid var(--error-color); white-space: nowrap; }
    .estado-chip.abierta { color: var(--success-color); border-color: var(--success-color); }
    /* Los campos se acomodan solos al ancho de la tarjeta. */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 12px; margin: 6px 0 4px; align-items: start; }
    .grid .full { grid-column: 1 / -1; }
    .grid mat-form-field { width: 100%; }
    /* Datos de la tienda: 3 columnas fijas (nombre ocupa 2) para que no quede un campo suelto. */
    .grid-datos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-datos .span-2 { grid-column: span 2; }
    @media (max-width: 760px) {
      .grid-datos { grid-template-columns: minmax(0, 1fr); }
      .grid-datos .span-2 { grid-column: auto; }
    }
    .toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 16px; margin: 6px 0 14px; }
    .sub { color: var(--text-primary); margin: 10px 0 4px; font-size: 14px; font-weight: 600; }
    .hint { color: var(--text-secondary); font-size: 12px; margin: 0 0 8px; }
    .lan-field { width: 100%; margin-bottom: 4px; }
    .ayuda { color: var(--text-secondary); font-size: 13px; margin: 0 0 10px; }
    .proveedor { border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .proveedor:last-child { margin-bottom: 0; }
    .proveedor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .prov-nombre { font-weight: 600; color: var(--text-primary); }
    /* Proveedores: dos columnas fijas (sin huecos); una en pantallas chicas. */
    .proveedor .grid { margin-top: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (max-width: 760px) { .proveedor .grid { grid-template-columns: minmax(0, 1fr); } }
    /* Identificadores que distinguen mayúsculas (Client ID, plantilla): sin la mayúscula global. */
    .proveedor input { text-transform: none !important; }
    .formas-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0 6px; }
    .tabla-wrap { overflow-x: auto; margin-bottom: 10px; }
    .tabla-formas { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tabla-formas th { text-align: left; font-weight: 500; color: var(--text-secondary); padding: 6px 8px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
    .tabla-formas td { padding: 4px 8px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
    .tabla-formas .nombre { font-weight: 600; color: var(--text-primary); }
    .tabla-formas .col-orden, .tabla-formas .col-acc { white-space: nowrap; width: 1%; }
    .tabla-formas .col-activa { width: 1%; text-align: center; }
    .tabla-formas .botones { display: flex; align-items: center; gap: 2px; }
    .fila-acciones { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .fila-acciones button { white-space: nowrap; }
    .tel-prueba { width: 220px; max-width: 100%; }
    .full-width { width: 100%; margin-top: 10px; }
    .hint-error { color: var(--error-color); }
    .devolucion-auto { margin: 4px 0 8px; }
    .datos-portal { margin: 4px 0 20px; font-size: 13px; }
    .aviso-prueba { display: flex; align-items: center; gap: 6px; color: var(--warning-color); font-size: 13px; margin: 4px 0 8px; }
    .datos-portal .lbl { display: block; color: var(--text-secondary); }
    .datos-portal code { word-break: break-all; user-select: all; }
    .devolucion-auto .ayuda { margin: 4px 0 0; }
  `],
})
export class TiendaOnlineConfigComponent implements OnInit {
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  cfg: any = { activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30, montoMinimoPedido: 0 };
  cargando = true;
  guardando = false;
  probando = false;
  /** Token nuevo (solo escritura: el servidor nunca lo devuelve). */
  tokenNuevo = '';
  telefonoPrueba = '';
  /** Formas de pago online = cuentas de los proveedores (precalculado para el template). */
  formas: any[] = [];
  catalogoPago: ProveedorCatalogo[] = [];
  almacenSeguroPago = false;
  cargandoFormas = true;
  moviendo = false;
  /** Alguna forma activa tiene sus datos completos. */
  pagoOfrecidoListo = false;
  /** Algún proveedor cargado sabe devolver por API (muestra «Devolver automáticamente»). */
  algunaDevuelve = false;
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
    pago_faltan_credenciales: 'Para ofrecer el pago online faltan datos del proveedor',
    bancard_publickey_invalido: 'La clave pública de Bancard no tiene el formato esperado',
    bancard_privatekey_invalido: 'La clave privada de Bancard no tiene el formato esperado',
    bancard_entorno_invalido: 'Entorno de Bancard inválido',
    bancard_credenciales: 'Bancard rechazó las claves',
    bancard_sin_conexion: 'No se pudo conectar con Bancard',
    bancard_error: 'Bancard respondió con un error',
    pago_sin_proveedor: 'Para ofrecer pago online elegí al menos un proveedor',
    icpay_credenciales: 'IC Pay rechazó las credenciales',
    icpay_mfa: 'El usuario de IC Pay pide MFA o cambio de contraseña: usá uno sin MFA',
    icpay_cotizacion: 'IC Pay no devolvió una cotización válida',
    icpay_sin_conexion: 'No se pudo conectar con IC Pay',
    icpay_error: 'IC Pay respondió con un error',
    icpay_baseurl_invalido: 'La URL de IC Pay tiene que ser https',
    icpay_email_invalido: 'El usuario de IC Pay tiene que ser un email',
    icpay_apikey_invalido: 'La API key de IC Pay es demasiado larga',
    nombre_invalido: 'Poné el nombre que ve el cliente (hasta 80 letras)',
    forma_sin_tipo: 'Elegí al menos retiro o delivery',
    forma_no_encontrada: 'La forma de pago ya no existe',
    datos_invalidos: 'Datos inválidos',
  };

  /** Trae las formas de pago online y precalcula lo que muestra la tabla. */
  cargarFormas(): void {
    this.cargandoFormas = true;
    this.repo.getFormasPagoOnline().subscribe({
      next: (r) => {
        this.cargandoFormas = false;
        if (!r?.success) { this.snack.open(this.mensajeError(r), 'OK', { duration: 4000 }); return; }
        this.catalogoPago = r.catalogo || [];
        this.almacenSeguroPago = !!r.almacenSeguroDisponible;
        const lista: any[] = r.data || [];
        this.formas = lista.map((f, i) => ({
          ...f,
          esPrimera: i === 0,
          esUltima: i === lista.length - 1,
          tiposTexto: [f.permitePickup ? 'Retiro' : null, f.permiteDelivery ? 'Delivery' : null].filter(Boolean).join(' · '),
          guardando: false,
        }));
        this.pagoOfrecidoListo = this.formas.some((f) => f.activo && f.listo);
        const devuelven = new Set(this.catalogoPago.filter((c: any) => c.devuelvePorApi).map((c) => c.id));
        this.algunaDevuelve = this.formas.some((f) => devuelven.has(f.proveedor));
      },
      error: () => { this.cargandoFormas = false; },
    });
  }

  private abrirDialogoForma(forma: any | null): void {
    this.dialog.open(CreateEditFormaPagoOnlineDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      data: { catalogo: this.catalogoPago, forma, almacenSeguroDisponible: this.almacenSeguroPago, errores: TiendaOnlineConfigComponent.ERRORES },
    }).afterClosed().subscribe((r) => {
      if (!r) return;
      this.snack.open(forma ? 'Forma de pago guardada' : 'Forma de pago agregada', 'OK', { duration: 2500 });
      this.cargarFormas();
    });
  }

  adicionarForma(): void {
    this.abrirDialogoForma(null);
  }

  editarForma(f: any): void {
    this.abrirDialogoForma(f);
  }

  cambiarActiva(f: any, activo: boolean): void {
    f.guardando = true;
    this.repo.guardarFormaPagoOnline({ id: f.id, activo }).subscribe({
      next: (r) => {
        f.guardando = false;
        if (!r?.success) this.snack.open(this.mensajeError(r), 'OK', { duration: 4000 });
        this.cargarFormas();
      },
      error: (e) => { f.guardando = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }); this.cargarFormas(); },
    });
  }

  moverForma(f: any, direccion: number): void {
    this.moviendo = true;
    this.repo.moverFormaPagoOnline(f.id, direccion).subscribe({
      next: () => { this.moviendo = false; this.cargarFormas(); },
      error: () => { this.moviendo = false; },
    });
  }

  quitarForma(f: any): void {
    const conPedidos = f.pedidos > 0;
    this.dialog.open(ConfirmationDialogComponent, {
      width: '460px',
      data: {
        title: 'Quitar forma de pago online',
        message: conPedidos
          ? `«${f.nombre}» ya tiene ${f.pedidos} pedido(s): se desactiva (deja de ofrecerse) pero se conserva para consultar y devolver esos pedidos.`
          : `¿Quitar «${f.nombre}»? Se borran también sus claves guardadas.`,
        confirmText: conPedidos ? 'Desactivar' : 'Quitar',
        cancelText: 'Volver',
      },
    }).afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.repo.eliminarFormaPagoOnline(f.id).subscribe({
        next: (r) => {
          if (!r?.success) { this.snack.open(this.mensajeError(r), 'OK', { duration: 4000 }); return; }
          this.snack.open(r.desactivada ? 'Forma de pago desactivada' : 'Forma de pago quitada', 'OK', { duration: 2500 });
          this.cargarFormas();
        },
        error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
      });
    });
  }

  probarForma(f: any): void {
    this.probando = true;
    this.repo.probarFormaPagoOnline(f.id).subscribe({
      next: (res) => {
        this.probando = false;
        this.snack.open(res?.success ? `Conexión con ${res.proveedor || 'el proveedor'} correcta${res.detalle ? ': ' + res.detalle : ''}` : this.mensajeError(res), 'OK', { duration: 5000 });
      },
      error: (e) => { this.probando = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }); },
    });
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
    this.cargarFormas();
    this.repo.getTiendaOnlineConfig().subscribe({
      next: (c) => {
        this.cfg = c || this.cfg;
        if (!this.cfg.whatsappProveedor) this.cfg.whatsappProveedor = 'META';
        this.ingreso = c?.ingreso || {};
        this.armarMetodos();
        this.cargando = false;
      },
      error: () => { this.cargando = false; },
    });
  }

  guardar(extra: any = {}): void {
    this.guardando = true;
    const { ingreso, abiertaAhora, pago, ...datos } = this.cfg;
    const payload: any = { ...datos, ...extra };
    // Ninguno marcado = sólo efectivo (el servidor nunca deja la tienda sin forma de pago).
    // Si la config no llegó a cargarse, no se mandan: si no, se resetearía a sólo efectivo.
    if (this.metodosOpciones.length) {
      payload.metodosPago = this.metodosOpciones.filter((m) => m.activo).map((m) => m.valor);
      // F8b: «A cuenta» va aparte; mismo cuidado (sin config cargada no se toca).
      payload.creditoTienda = !!this.cfg?.creditoTienda;
    } else {
      delete payload.metodosPago;
      delete payload.creditoTienda;
    }
    if (this.tokenNuevo.trim() && !extra.whatsappTokenBorrar) payload.whatsappToken = this.tokenNuevo.trim();
    this.repo.updateTiendaOnlineConfig(payload).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.cfg = res.config;
          this.ingreso = res.config?.ingreso || {};
          this.armarMetodos();
          this.tokenNuevo = '';
          this.cargarFormas();
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
