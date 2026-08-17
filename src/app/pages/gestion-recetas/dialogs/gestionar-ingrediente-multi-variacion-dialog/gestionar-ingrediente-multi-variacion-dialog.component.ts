import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { RecetaPresentacion } from '../../../../database/entities/productos/receta-presentacion.entity';
import { RecetaIngrediente } from '../../../../database/entities/productos/receta-ingrediente.entity';

export interface GestionarIngredienteMultiVariacionDialogData {
  nombreIngrediente: string;
  unidadIngrediente: string;
  variaciones: RecetaPresentacion[];
  ingredienteOriginal: RecetaIngrediente;
  // ✅ NUEVO: Información para mostrar correctamente las unidades
  cantidadOriginal: number;
  unidadOriginal: string;
  /** Ids de receta que YA tienen este ingrediente: no se pueden volver a agregar. */
  recetasConIngrediente: number[];
  /** Id de la receta que se está editando: las variaciones que la comparten ya lo tienen. */
  recetaActualId?: number;
}

@Component({
  selector: 'app-gestionar-ingrediente-multi-variacion-dialog',
  templateUrl: './gestionar-ingrediente-multi-variacion-dialog.component.html',
  styleUrls: ['./gestionar-ingrediente-multi-variacion-dialog.component.scss']
})
export class GestionarIngredienteMultiVariacionDialogComponent implements OnInit {

  form: FormGroup;
  loading = false;

  /** Hay al menos una variación bloqueada: se explica en el pie del diálogo. */
  hayBloqueadas = false;

  /** Ninguna variación se puede seleccionar: no tiene sentido habilitar Guardar. */
  haySeleccionables = false;

  /** Datos planos para la tabla (el template no llama funciones ni getters). */
  variacionesInfo: Array<{ id?: number; nombre: string; bloqueada: boolean; motivoBloqueo: string }> = [];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<GestionarIngredienteMultiVariacionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GestionarIngredienteMultiVariacionDialogData
  ) {
    this.form = this.fb.group({
      variaciones: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.buildForm();
  }

  private buildForm(): void {
    const variacionesFormArray = this.form.get('variaciones') as FormArray;
    const recetasConIngrediente = new Set(this.data.recetasConIngrediente || []);

    this.data.variaciones.forEach(variacion => {
      const recetaId = variacion.receta?.id;
      // Comparte la receta que se está editando: agregar ahí duplicaría la fila
      // dentro de la misma receta (datos con recetas compartidas).
      const comparteReceta = !!recetaId && recetaId === this.data.recetaActualId;
      const yaLoTiene = !!recetaId && recetasConIngrediente.has(recetaId);
      const bloqueada = comparteReceta || yaLoTiene;

      let motivoBloqueo = '';
      if (comparteReceta) motivoBloqueo = 'COMPARTE LA RECETA ACTUAL';
      else if (yaLoTiene) motivoBloqueo = 'YA LO TIENE';

      const grupo = this.fb.group({
        id: [variacion.id],
        nombre: [variacion.nombre_generado],
        // Sólo se preseleccionan las variaciones a las que sí se puede agregar.
        seleccionada: [!bloqueada],
        bloqueada: [bloqueada],
        motivoBloqueo: [motivoBloqueo],
        // ✅ CORREGIDO: Usar la cantidad original en lugar de la convertida
        cantidad: [this.data.cantidadOriginal || 0]
      });

      if (bloqueada) {
        this.hayBloqueadas = true;
        grupo.get('seleccionada')?.disable();
        grupo.get('cantidad')?.disable();
      } else {
        this.haySeleccionables = true;
      }

      variacionesFormArray.push(grupo);
      this.variacionesInfo.push({
        id: variacion.id,
        nombre: variacion.nombre_generado,
        bloqueada,
        motivoBloqueo
      });
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.form.valid) {
      // getRawValue() no incluye los controles deshabilitados en `value`; se filtra
      // igual por `bloqueada` para no depender del estado del control.
      const resultado = (this.form.getRawValue().variaciones || [])
        .filter((v: any) => !v.bloqueada && v.seleccionada && v.cantidad > 0)
        .map((v: any) => ({
          variacionId: v.id,
          cantidad: v.cantidad
        }));

      this.dialogRef.close(resultado);
    }
  }

  trackById(index: number, item: { id?: number }): number {
    return item.id ?? index;
  }
}
