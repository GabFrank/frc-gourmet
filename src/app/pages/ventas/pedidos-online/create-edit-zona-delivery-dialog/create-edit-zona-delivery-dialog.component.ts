import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../../database/repository.service';
import { CreateEditPrecioDeliveryDialogComponent } from '../../precios-delivery/create-edit-precio-delivery-dialog.component';

export interface CreateEditZonaDeliveryDialogData {
  /** null = zona nueva. */
  zona: any | null;
  /** Todas las zonas, para saber qué tarifas ya están tomadas. */
  zonas: any[];
  tarifas: { id: number; descripcion: string; valor: number; activo: boolean }[];
}

/**
 * Alta / edición de una zona de delivery (datos; el área se dibuja aparte, en el mapa).
 *
 * La tarifa del PdV es EL precio de envío de la zona y es obligatoria: la misma que
 * usa el cajero por teléfono, así el envío es uno solo en los dos canales. Una por
 * zona: las que ya usa otra zona se muestran deshabilitadas con su dueña; si igual
 * choca (otra pestaña la tomó en el medio), el error del servidor va en el campo.
 * Si la tarifa que hace falta no existe, «Nueva tarifa» la crea sin salir de acá.
 */
@Component({
  selector: 'app-create-edit-zona-delivery-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
  ],
  providers: [DecimalPipe],
  templateUrl: './create-edit-zona-delivery-dialog.component.html',
  styleUrls: ['./create-edit-zona-delivery-dialog.component.scss'],
})
export class CreateEditZonaDeliveryDialogComponent implements OnInit {
  form!: FormGroup;
  esEdicion = false;
  guardando = false;
  errorTarifa = '';
  errorGeneral = '';
  tarifasOpciones: { id: number; label: string; disabled: boolean }[] = [];
  creandoTarifa = false;

  constructor(
    public dialogRef: MatDialogRef<CreateEditZonaDeliveryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CreateEditZonaDeliveryDialogData,
    private fb: FormBuilder,
    private repo: RepositoryService,
    private decimal: DecimalPipe,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    const z = this.data.zona;
    this.esEdicion = !!z?.id;
    this.form = this.fb.group({
      nombre: [z?.nombre || '', [Validators.required, Validators.maxLength(150)]],
      precioDeliveryId: [z?.precioDeliveryId ?? null, Validators.required],
      montoMinimo: [z?.montoMinimo ?? 0, [Validators.min(0)]],
      orden: [z?.orden ?? (this.data.zonas?.length || 0)],
      activa: [z?.activa !== false],
    });
    this.armarOpciones();
    this.form.get('precioDeliveryId')!.valueChanges.subscribe(() => (this.errorTarifa = ''));
  }

  private armarOpciones(): void {
    const z = this.data.zona;
    const usadaPor = new Map<number, string>();
    for (const o of this.data.zonas || []) {
      if (o.precioDeliveryId != null && o.id !== z?.id) usadaPor.set(o.precioDeliveryId, o.nombre);
    }
    this.tarifasOpciones = (this.data.tarifas || [])
      .filter((t) => t.activo || t.id === z?.precioDeliveryId)
      .map((t) => ({
        id: t.id,
        label: `${t.descripcion} · ₲ ${this.decimal.transform(t.valor, '1.0-2')}${usadaPor.has(t.id) ? ` (usada por ${usadaPor.get(t.id)})` : ''}`,
        disabled: usadaPor.has(t.id),
      }));
  }

  /** Crea una tarifa en Precios de Delivery y la deja elegida. */
  nuevaTarifa(): void {
    const antes = new Set((this.data.tarifas || []).map((t) => t.id));
    const ref = this.dialog.open(CreateEditPrecioDeliveryDialogComponent, { width: '400px', data: { precioDelivery: null } });
    ref.afterClosed().subscribe(async (creada: boolean) => {
      if (!creada) return;
      this.creandoTarifa = true;
      try {
        const todas: any[] = await firstValueFrom(this.repo.getPreciosDelivery());
        this.data.tarifas = todas.map((t: any) => ({ id: t.id, descripcion: t.descripcion, valor: Number(t.valor), activo: t.activo !== false }));
        this.armarOpciones();
        const nueva = this.data.tarifas.find((t) => !antes.has(t.id));
        if (nueva) this.form.get('precioDeliveryId')!.setValue(nueva.id);
      } finally {
        this.creandoTarifa = false;
      }
    });
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando) return;
    this.guardando = true;
    this.errorTarifa = '';
    this.errorGeneral = '';
    const v = this.form.value;
    const payload = {
      ...(this.data.zona || {}),
      nombre: String(v.nombre || '').trim().toUpperCase(),
      precioDeliveryId: v.precioDeliveryId ?? null,
      montoMinimo: Number(v.montoMinimo) || 0,
      orden: Number(v.orden) || 0,
      activa: !!v.activa,
    };
    try {
      const res: any = await firstValueFrom(this.repo.guardarZonaDelivery(payload));
      if (res?.success) { this.dialogRef.close(true); return; }
      if (res?.error === 'tarifa_en_uso') this.errorTarifa = `Esa tarifa ya la usa la zona ${res.zona}. Cada tarifa va en una sola zona.`;
      else if (res?.error === 'tarifa_requerida') this.errorTarifa = 'Elegí la tarifa del PdV: es el precio de envío de la zona.';
      else if (res?.error === 'tarifa_invalida') this.errorTarifa = 'Esa tarifa ya no existe. Elegí otra o creá una nueva.';
      else this.errorGeneral = 'No se pudo guardar: ' + (res?.error || 'error desconocido');
    } catch (e: any) {
      this.errorGeneral = 'No se pudo guardar: ' + (e?.message || '');
    }
    this.guardando = false;
  }

  cancelar(): void { this.dialogRef.close(null); }
}
