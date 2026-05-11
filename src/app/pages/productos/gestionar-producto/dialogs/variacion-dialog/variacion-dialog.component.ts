import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { SaboresVariacionesService, RecetaPresentacion } from '../../../../../services/sabores-variaciones.service';
import { RepositoryService } from '../../../../../database/repository.service';
import { PrecioVentaDialogComponent, PrecioVentaDialogData } from '../../components/precio-venta-dialog/precio-venta-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface VariacionDialogData {
  variacion: RecetaPresentacion;
  modo: 'ver' | 'editar';
  productoNombre: string;
}

@Component({
  selector: 'app-variacion-dialog',
  templateUrl: './variacion-dialog.component.html',
  styleUrls: ['./variacion-dialog.component.scss']
})
export class VariacionDialogComponent implements OnInit, OnDestroy {

  variacionForm!: FormGroup;
  loading = false;
  readonly = false;
  decimalesMoneda = 0;

  // Datos calculados
  margenCalculado = 0;
  porcentajeMargen = 0;

  private destroy$ = new Subject<void>();

  constructor(
    public dialogRef: MatDialogRef<VariacionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VariacionDialogData,
    private fb: FormBuilder,
    private saboresService: SaboresVariacionesService,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.readonly = this.data.modo === 'ver';
    this.initForm();
  }

  ngOnInit(): void {
    this.loadVariacionData();
    this.setupCalculations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.variacionForm = this.fb.group({
      nombre_generado: [
        { value: '', disabled: this.readonly },
        [Validators.required, Validators.maxLength(255)]
      ],
      sku: [
        { value: '', disabled: this.readonly },
        [Validators.maxLength(50)]
      ],
      precio_ajuste: [
        { value: null, disabled: this.readonly },
        [Validators.min(0)]
      ],
      activo: [
        { value: true, disabled: this.readonly }
      ]
    });
  }

  private loadVariacionData(): void {
    const variacion = this.data.variacion;
    this.variacionForm.patchValue({
      nombre_generado: variacion.nombre_generado,
      sku: variacion.sku || '',
      precio_ajuste: variacion.precio_ajuste,
      activo: variacion.activo
    });
  }

  private setupCalculations(): void {
    // Calcular márgenes cuando cambien los valores del formulario principal
    this.variacionForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.calcularMargenes();
      });

    // Calcular inicial
    this.calcularMargenes();
  }

  private calcularMargenes(): void {
    const precioVenta = this.data.variacion.precio_ajuste || 0;
    const costoCalculado = this.saboresService.calcularCostoTotalVariacion(this.data.variacion);

    if (precioVenta > 0 && costoCalculado > 0) {
      this.margenCalculado = precioVenta - costoCalculado;
      this.porcentajeMargen = (this.margenCalculado / precioVenta) * 100;
    } else {
      this.margenCalculado = 0;
      this.porcentajeMargen = 0;
    }
  }

  get tituloDialog(): string {
    const modo = this.data.modo === 'ver' ? 'Ver' : 'Editar';
    return `${modo} Variación - ${this.data.productoNombre}`;
  }

  get textoBotonPrimario(): string {
    if (this.readonly) return 'Cerrar';
    return this.loading ? 'Guardando...' : 'Guardar Cambios';
  }

  get nombreGeneradoError(): string | null {
    const control = this.variacionForm.get('nombre_generado');
    if (control?.errors && control.touched) {
      if (control.errors['required']) {
        return 'El nombre es requerido';
      }
      if (control.errors['maxlength']) {
        return 'El nombre no puede exceder 255 caracteres';
      }
    }
    return null;
  }

  get skuError(): string | null {
    const control = this.variacionForm.get('sku');
    if (control?.errors && control.touched) {
      if (control.errors['maxlength']) {
        return 'El SKU no puede exceder 50 caracteres';
      }
    }
    return null;
  }

  get precioAjusteError(): string | null {
    const control = this.variacionForm.get('precio_ajuste');
    if (control?.errors && control.touched) {
      if (control.errors['min']) {
        return 'El precio no puede ser negativo';
      }
    }
    return null;
  }

  onSubmit(): void {
    if (this.readonly) {
      this.dialogRef.close();
      return;
    }

    if (this.variacionForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.guardarCambios();
  }

  private guardarCambios(): void {
    if (!this.data.variacion.id) return;

    this.loading = true;

    const datosActualizados = {
      nombre_generado: this.variacionForm.value.nombre_generado?.trim(),
      sku: this.variacionForm.value.sku?.trim() || null,
      precio_ajuste: this.variacionForm.value.precio_ajuste || null,
      activo: this.variacionForm.value.activo
    };

    this.repositoryService.updateRecetaPresentacion(
      this.data.variacion.id,
      datosActualizados
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (variacionActualizada) => {
        console.log('✅ Variación actualizada:', variacionActualizada.nombre_generado);

        // ✅ NUEVO: Actualizar datos locales con la variación actualizada
        this.data.variacion = variacionActualizada;

        // ✅ NUEVO: Recalcular márgenes con los datos actualizados
        this.calcularMargenes();

        this.loading = false;
        this.dialogRef.close({
          action: 'updated',
          variacion: variacionActualizada
        });
      },
      error: (error) => {
        console.error('❌ Error actualizando variación:', error);
        this.loading = false;
        // El error se maneja en el servicio
      }
    });
  }

  onCancel(): void {
    if (this.readonly) {
      this.dialogRef.close();
      return;
    }

    if (this.hasUnsavedChanges()) {
      if (confirm('¿Estás seguro de que quieres cancelar? Los cambios no guardados se perderán.')) {
        this.dialogRef.close();
      }
    } else {
      this.dialogRef.close();
    }
  }

  // ✅ ACCIONES ESPECÍFICAS

  recalcularCosto(): void {
    if (!this.data.variacion.id) return;

    this.repositoryService.recalcularCostoVariacion(this.data.variacion.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resultado) => {
          // ✅ NUEVO: Actualizar el costo usando el servicio para mantener consistencia
          // El costo se recalcula desde precio_costo, no desde costo_calculado
          console.log('✅ Costo recalculado:', resultado.mensaje);

          // Recalcular márgenes con el nuevo costo
          this.calcularMargenes();

          // Mostrar notificación de éxito
          console.log(`Costo actualizado: $${resultado.costoAnterior.toFixed(2)} → $${resultado.costoNuevo.toFixed(2)}`);
        },
        error: (error) => {
          console.error('❌ Error recalculando costo:', error);
        }
      });
  }

  generarSKU(): void {
    if (this.readonly) return;

    // Generar SKU automático basado en datos disponibles
    const timestamp = Date.now().toString().slice(-4);
    const nombrePartes = this.data.variacion.nombre_generado.split(' ');

    let sku = '';
    if (nombrePartes.length >= 3) {
      // Formato: PRODUCTO-SABOR-PRESENTACION-TIMESTAMP
      sku = `${nombrePartes[0].substring(0, 3)}-${nombrePartes[2].substring(0, 3)}-${nombrePartes[1].substring(0, 1)}-${timestamp}`.toUpperCase();
    } else {
      // Formato simple: VAR-TIMESTAMP
      sku = `VAR-${timestamp}`;
    }

    this.variacionForm.patchValue({ sku });
  }

  toggleModo(): void {
    this.readonly = !this.readonly;

    if (this.readonly) {
      this.variacionForm.disable();
    } else {
      this.variacionForm.enable();
    }
  }

  // ✅ UTILIDADES

  private hasUnsavedChanges(): boolean {
    const currentValues = this.variacionForm.value;
    const original = this.data.variacion;

    return (
      currentValues.nombre_generado?.trim() !== original.nombre_generado ||
      (currentValues.sku?.trim() || null) !== (original.sku || null) ||
      (currentValues.precio_ajuste || null) !== (original.precio_ajuste || null) ||
      currentValues.activo !== original.activo
    );
  }

  private markFormGroupTouched(): void {
    Object.keys(this.variacionForm.controls).forEach(key => {
      const control = this.variacionForm.get(key);
      control?.markAsTouched();
    });
  }

  // ✅ GETTERS PARA TEMPLATE

  get informacionReceta(): any {
    return this.data.variacion.receta || {};
  }

  get informacionPresentacion(): any {
    return this.data.variacion.presentacion || {};
  }

  get informacionCosto(): any {
    const receta = this.data.variacion.receta;
    if (!receta?.preciosCosto || !Array.isArray(receta.preciosCosto)) {
      return { tieneDetalle: false, mensaje: 'No hay información detallada de costos' };
    }

    const costosActivos = receta.preciosCosto.filter(precio => precio.activo);
    const costoTotal = costosActivos.reduce((total, precio) => total + precio.valor, 0);

    return {
      tieneDetalle: true,
      costoTotal,
      costosDetallados: costosActivos.map(precio => ({
        fuente: precio.fuente,
        valor: precio.valor,
        fecha: precio.fecha
      }))
    };
  }

  get costoFormateado(): string {
    // ✅ NUEVO: Usar el servicio para obtener el costo real desde precio_costo
    const costoReal = this.saboresService.calcularCostoTotalVariacion(this.data.variacion);
    return costoReal.toFixed(2);
  }

  get margenFormateado(): string {
    return this.margenCalculado.toFixed(2);
  }

  get porcentajeMargenFormateado(): string {
    return this.porcentajeMargen.toFixed(1);
  }

  get esMargenPositivo(): boolean {
    return this.margenCalculado > 0;
  }

  get colorMargen(): string {
    if (this.porcentajeMargen > 30) return 'primary';
    if (this.porcentajeMargen > 15) return 'accent';
    return 'warn';
  }

  // ✅ NUEVO: Método para abrir el dialog de precios de venta
  abrirPreciosVentaDialog(): void {
    // ✅ NUEVO: Verificar que la variación tenga una receta asociada
    if (!this.data.variacion.receta?.id) {
      this.snackBar.open('No se puede gestionar precios: La variación no tiene una receta asociada', 'Cerrar', {
        duration: 4000,
        panelClass: ['snackbar-error']
      });
      return;
    }

    const dialogData: PrecioVentaDialogData = {
      entityId: this.data.variacion.id!,
      entityName: this.data.variacion.nombre_generado,
      entityType: 'variacion',
      recetaId: this.data.variacion.receta.id, // ✅ Ahora es seguro usar
      relationField: 'recetaId', // ✅ CORREGIDO: Usar recetaId para variaciones
      preciosExistentes: this.data.variacion.preciosVenta || []
    };

    this.dialog.open(PrecioVentaDialogComponent, {
      data: dialogData,
      width: '900px',
      maxHeight: '80vh'
    })
    .afterClosed()
    .pipe(takeUntil(this.destroy$))
    .subscribe(result => {
      if (result && result.action === 'closed') {
        // Actualizar precios locales si se modificaron
        if (result.precios) {
          this.data.variacion.preciosVenta = result.precios;
          this.calcularMargenes(); // Recalcular márgenes con los precios actualizados
        }
      }
    });
  }
}
