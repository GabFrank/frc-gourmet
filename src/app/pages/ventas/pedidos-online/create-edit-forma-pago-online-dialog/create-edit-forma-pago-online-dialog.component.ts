import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RepositoryService } from '../../../../database/repository.service';

/** Proveedor del catálogo (lo manda `get-formas-pago-online`). */
export interface ProveedorCatalogo {
  id: string;
  nombre: string;
  etiqueta: string;
  medio: string;
  campos: { clave: string; etiqueta: string; secreto?: boolean; requerido?: boolean; opciones?: { valor: string; etiqueta: string }[]; maxLength?: number; ayuda?: string; porDefecto?: string }[];
}

export interface FormaPagoOnlineDialogData {
  catalogo: ProveedorCatalogo[];
  /** La cuenta a editar (null = alta). */
  forma: any | null;
  almacenSeguroDisponible: boolean;
  errores: Record<string, string>;
}

/**
 * Alta / edición de una forma de pago online = una cuenta de un proveedor
 * (PLAN-tienda-pagos-multi-icpay). Los campos salen del proveedor elegido; los secretos son solo
 * de escritura (el servidor nunca los devuelve).
 */
@Component({
  selector: 'app-create-edit-forma-pago-online-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatCheckboxModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './create-edit-forma-pago-online-dialog.component.html',
  styleUrls: ['./create-edit-forma-pago-online-dialog.component.scss'],
})
export class CreateEditFormaPagoOnlineDialogComponent {
  private repo = inject(RepositoryService);
  titulo: string;
  esEdicion: boolean;
  proveedorId = '';
  proveedor: ProveedorCatalogo | null = null;
  /** Una cuenta de uPay (convertida de antes): solo nombre, activa y tipos. */
  soloDatosBasicos = false;
  nombre = '';
  activo = true;
  permitePickup = true;
  permiteDelivery = true;
  valores: Record<string, string> = {};
  secretos: Record<string, string> = {};
  secretosGuardados: Record<string, boolean> = {};
  camposNoSecretos: ProveedorCatalogo['campos'] = [];
  camposSecretos: ProveedorCatalogo['campos'] = [];
  datosPortal: { etiqueta: string; valor: string }[] = [];
  guardando = false;
  error: string | null = null;

  constructor(
    private ref: MatDialogRef<CreateEditFormaPagoOnlineDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FormaPagoOnlineDialogData,
  ) {
    const f = data.forma;
    this.esEdicion = !!f;
    this.titulo = f ? 'Editar forma de pago online' : 'Adicionar forma de pago online';
    if (f) {
      this.proveedorId = f.proveedor;
      this.nombre = f.nombre;
      this.activo = !!f.activo;
      this.permitePickup = !!f.permitePickup;
      this.permiteDelivery = !!f.permiteDelivery;
      this.valores = { ...(f.valores || {}) };
      this.secretosGuardados = { ...(f.secretosGuardados || {}) };
      this.datosPortal = f.datosPortal || [];
    } else if (data.catalogo.length) {
      this.proveedorId = data.catalogo[0].id;
    }
    this.elegirProveedor(!f);
  }

  /** Arma los campos del proveedor elegido. `nuevo`: completa el nombre y los valores por defecto. */
  elegirProveedor(nuevo = true): void {
    this.proveedor = this.data.catalogo.find((p) => p.id === this.proveedorId) || null;
    this.soloDatosBasicos = !this.proveedor;
    const campos = this.proveedor?.campos || [];
    this.camposNoSecretos = campos.filter((c) => !c.secreto);
    this.camposSecretos = campos.filter((c) => !!c.secreto);
    if (nuevo) {
      this.nombre = (this.proveedor?.etiqueta || '').toUpperCase();
      this.valores = {};
      this.secretos = {};
      this.secretosGuardados = {};
      for (const c of this.camposNoSecretos) this.valores[c.clave] = c.porDefecto || '';
    }
    for (const c of this.camposSecretos) if (this.secretos[c.clave] === undefined) this.secretos[c.clave] = '';
  }

  cancelar(): void {
    this.ref.close(null);
  }

  guardar(): void {
    this.error = null;
    if (!this.nombre.trim()) { this.error = 'Poné el nombre que ve el cliente.'; return; }
    if (!this.permitePickup && !this.permiteDelivery) { this.error = 'Elegí al menos retiro o delivery.'; return; }
    const secretos: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.secretos)) if (String(v || '').trim()) secretos[k] = String(v).trim();
    const payload: any = {
      id: this.data.forma?.id ?? null,
      proveedor: this.proveedorId,
      nombre: this.nombre.trim().toUpperCase(),
      activo: this.activo,
      permitePickup: this.permitePickup,
      permiteDelivery: this.permiteDelivery,
      valores: this.soloDatosBasicos ? undefined : this.valores,
      secretos: this.soloDatosBasicos ? undefined : secretos,
    };
    this.guardando = true;
    this.repo.guardarFormaPagoOnline(payload).subscribe({
      next: (r) => {
        this.guardando = false;
        if (r?.success) { this.ref.close(r.data); return; }
        const base = this.data.errores[r?.error] || 'No se pudo guardar';
        this.error = r?.detalle ? `${base}: ${r.detalle}` : base;
      },
      error: (e) => { this.guardando = false; this.error = 'Error: ' + (e?.message || ''); },
    });
  }
}
