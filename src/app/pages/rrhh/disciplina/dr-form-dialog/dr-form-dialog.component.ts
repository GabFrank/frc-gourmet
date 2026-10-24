/**
 * Diálogo genérico de alta/edición para los catálogos DR, armado desde una lista de campos.
 * Recibe `guardar(payload)`: el diálogo llama, muestra el error del backend sin cerrarse y
 * cierra con el registro guardado. Textos en MAYÚSCULAS al guardar (el backend también).
 */
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { drMensajeError } from '../disciplina-api.service';

export type DrCampoTipo = 'texto' | 'textarea' | 'numero' | 'entero' | 'select' | 'bool' | 'hora' | 'json';

export interface DrOpcion { valor: any; label: string }

export interface DrCampo {
  key: string;
  label: string;
  tipo: DrCampoTipo;
  requerido?: boolean;
  opciones?: DrOpcion[];
  /** Nombre de la lista de opciones que resuelve la pantalla (grupos, monedas, funcionarios…). */
  fuente?: string;
  /** El valor es el id de una relación: se manda como { id } (o null). */
  relacion?: boolean;
  /** Si queda vacío al editar, no se manda (el backend conserva el valor actual). */
  mantenerSiVacio?: boolean;
  ancho?: 'completo' | 'mitad';
  min?: number;
  max?: number;
  hint?: string;
  /** Valor por defecto al crear. */
  defecto?: any;
}

export interface DrFormDialogData {
  titulo: string;
  campos: DrCampo[];
  /** Registro a editar (null = alta). */
  valor: any | null;
  /** Campos fijos que se agregan al payload (p. ej. la relación con el padre). */
  fijos?: Record<string, any>;
  aviso?: string;
  guardar: (payload: any) => Promise<any>;
}

interface CampoVista extends DrCampo {
  claseAncho: string;
  esRequerido: boolean;
}

@Component({
  selector: 'app-dr-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSlideToggleModule, MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './dr-form-dialog.component.html',
  styleUrls: ['./dr-form-dialog.component.scss'],
})
export class DrFormDialogComponent {
  form: FormGroup;
  campos: CampoVista[];
  guardando = false;
  error = '';
  esEdicion: boolean;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<DrFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DrFormDialogData,
  ) {
    this.esEdicion = !!data.valor?.id;
    this.campos = data.campos.map((c) => ({
      ...c,
      claseAncho: c.ancho === 'completo' || c.tipo === 'textarea' || c.tipo === 'json' ? 'campo completo' : 'campo',
      esRequerido: !!c.requerido && !(this.esEdicion && c.mantenerSiVacio),
    }));
    const controles: Record<string, any> = {};
    for (const c of this.campos) {
      controles[c.key] = [this.valorInicial(c), this.validadores(c)];
    }
    this.form = this.fb.group(controles);
  }

  private valorInicial(c: DrCampo): any {
    const v = this.data.valor?.[c.key];
    if (!this.data.valor) return c.defecto ?? (c.tipo === 'bool' ? false : null);
    if (c.relacion) return v && typeof v === 'object' ? v.id ?? null : v ?? null;
    if (c.tipo === 'bool') return !!v;
    if (c.tipo === 'numero' || c.tipo === 'entero') return v === null || v === undefined ? null : Number(v);
    if (c.tipo === 'json') return v ? (typeof v === 'string' ? v : JSON.stringify(v)) : '';
    return v ?? null;
  }

  private validadores(c: CampoVista): ValidatorFn[] {
    const vs: ValidatorFn[] = [];
    if (c.esRequerido && c.tipo !== 'bool') vs.push(Validators.required);
    if (c.min !== undefined) vs.push(Validators.min(c.min));
    if (c.max !== undefined) vs.push(Validators.max(c.max));
    if (c.tipo === 'hora') vs.push(Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/));
    return vs;
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando) return;
    this.error = '';
    const payload: any = { ...(this.data.fijos ?? {}) };
    if (this.data.valor?.id) payload.id = this.data.valor.id;
    for (const c of this.campos) {
      let v = this.form.value[c.key];
      const vacio = v === null || v === undefined || v === '';
      if (vacio && this.esEdicion && c.mantenerSiVacio) continue;
      if (c.relacion) v = vacio ? null : { id: v };
      else if (c.tipo === 'numero' || c.tipo === 'entero') v = vacio ? null : Number(v);
      else if (c.tipo === 'bool') v = !!v;
      else if (c.tipo === 'json') {
        if (vacio) v = null;
        else {
          try {
            const o = JSON.parse(String(v));
            if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('x');
            v = JSON.stringify(o);
          } catch {
            this.error = `${c.label.toUpperCase()}: JSON INVÁLIDO (EJ. {"3": 30000})`;
            return;
          }
        }
      } else if (typeof v === 'string') v = c.tipo === 'hora' ? v.trim() : v.trim().toUpperCase();
      if (vacio && !c.relacion && c.tipo !== 'bool' && c.tipo !== 'numero' && c.tipo !== 'entero') v = null;
      payload[c.key] = v;
    }
    this.guardando = true;
    try {
      const r = await this.data.guardar(payload);
      this.dialogRef.close(r ?? true);
    } catch (e) {
      this.error = drMensajeError(e);
    } finally {
      this.guardando = false;
    }
  }
}
