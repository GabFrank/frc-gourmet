import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { RecetaIngrediente } from '../../../../database/entities/productos/receta-ingrediente.entity';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GenericSearchDialogComponent, GenericSearchConfig } from '../../../../shared/components/generic-search-dialog/generic-search-dialog.component';

export interface IngredienteDialogData {
  recetaId?: number;
  ingrediente?: RecetaIngrediente;
  existingIngredientes: RecetaIngrediente[];
  filtroIngredientes: any;
}

@Component({
  selector: 'app-ingrediente-dialog',
  templateUrl: './ingrediente-dialog.component.html',
  styleUrls: ['./ingrediente-dialog.component.scss']
})
export class IngredienteDialogComponent implements OnInit {

  ingredienteForm!: FormGroup;
  loading = false;
  isEditMode = false;

  // Ítem solo-descripción: sin ingrediente (Producto) vinculado todavía.
  soloDescripcion = false;

  // Propiedades para producto seleccionado
  productoSeleccionado: Producto | null = null;

  // Propiedades computadas para performance
  costoUnitario = 0;
  costoTotal = 0;

  // Propiedad para almacenar el costo base original del producto
  costoBaseOriginal = 0;

  // Unidades disponibles con mapeo a unidades base
  unidadesDisponibles = [
    { valor: 'GRAMOS', texto: 'Gramos (g)', unidadBase: 'KILOGRAMO' },
    { valor: 'UNIDADES', texto: 'Unidades (un)', unidadBase: 'UNIDAD' },
    { valor: 'MILILITROS', texto: 'Mililitros (ml)', unidadBase: 'LITRO' },
    { valor: 'KILOGRAMOS', texto: 'Kilogramos (kg)', unidadBase: 'KILOGRAMO' },
    { valor: 'LITROS', texto: 'Litros (l)', unidadBase: 'LITRO' },
    { valor: 'PAQUETES', texto: 'Paquetes (pkg)', unidadBase: 'UNIDAD' }
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<IngredienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: IngredienteDialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.initForm();

    if (this.data.ingrediente) {
      this.isEditMode = true;
      this.loadIngredienteData();
    }
  }

  initForm(): void {
    this.ingredienteForm = this.fb.group({
      ingredienteId: [null, [Validators.required]],
      descripcion: [null],
      cantidad: [null, [Validators.required, Validators.min(0.01)]],
      unidad: ['GRAMOS', [Validators.required]],
      costoUnitario: [0, [Validators.required, Validators.min(0)]],
      costoTotal: [0, [Validators.required, Validators.min(0)]],
      esExtra: [false],
      esOpcional: [false],
      esCambiable: [false],
      costoExtra: [0, [Validators.min(0)]],
      // ✅ NUEVO: Campo para porcentaje de aprovechamiento
      porcentajeAprovechamiento: [100.00, [Validators.required, Validators.min(0.01), Validators.max(100.00)]],
      activo: [true]
    });

    // Suscribirse a cambios para cálculos automáticos
    this.setupFormWatchers();
  }

  private setupFormWatchers(): void {
    // Calcular costo total cuando cambian cantidad o costo unitario
    this.ingredienteForm.get('cantidad')?.valueChanges.subscribe(() => {
      this.calcularCostoTotal();
    });

    this.ingredienteForm.get('costoUnitario')?.valueChanges.subscribe(() => {
      this.calcularCostoTotal();
    });

    // ✅ NUEVO: Watcher para porcentaje de aprovechamiento
    this.ingredienteForm.get('porcentajeAprovechamiento')?.valueChanges.subscribe(() => {
      this.calcularCostoTotal();
    });

    // Watcher para recalcular costo unitario cuando cambia la unidad
    this.ingredienteForm.get('unidad')?.valueChanges.subscribe(() => {
      this.recalcularCostoUnitario();
    });
  }

  /** Alterna entre ítem con ingrediente vinculado y ítem solo-descripción. */
  toggleSoloDescripcion(checked: boolean): void {
    this.soloDescripcion = checked;
    if (checked) {
      this.productoSeleccionado = null;
      this.ingredienteForm.get('ingredienteId')?.setValue(null, { emitEvent: false });
    }
    this.aplicarValidadoresModo();
  }

  /** Ajusta los validadores según el modo (con ingrediente vs solo-descripción). */
  private aplicarValidadoresModo(): void {
    const ingredienteId = this.ingredienteForm.get('ingredienteId');
    const cantidad = this.ingredienteForm.get('cantidad');
    const unidad = this.ingredienteForm.get('unidad');
    const descripcion = this.ingredienteForm.get('descripcion');
    const costoUnitario = this.ingredienteForm.get('costoUnitario');
    const costoTotal = this.ingredienteForm.get('costoTotal');

    if (this.soloDescripcion) {
      // En solo-descripción: descripción obligatoria; cantidad/unidad opcionales; sin costos.
      descripcion?.setValidators([Validators.required]);
      ingredienteId?.clearValidators();
      cantidad?.clearValidators();
      unidad?.clearValidators();
      costoUnitario?.clearValidators();
      costoTotal?.clearValidators();
    } else {
      ingredienteId?.setValidators([Validators.required]);
      cantidad?.setValidators([Validators.required, Validators.min(0.01)]);
      unidad?.setValidators([Validators.required]);
      costoUnitario?.setValidators([Validators.required, Validators.min(0)]);
      costoTotal?.setValidators([Validators.required, Validators.min(0)]);
      descripcion?.clearValidators();
    }
    [ingredienteId, cantidad, unidad, descripcion, costoUnitario, costoTotal]
      .forEach((c) => c?.updateValueAndValidity({ emitEvent: false }));
  }

  /**
   * Determina la unidad por defecto basada en el producto seleccionado
   */
  private determinarUnidadPorDefecto(producto: Producto): string {
    const unidadBase = producto.unidadBase;

    // Mapeo de unidades base a unidades de medida más comunes
    switch (unidadBase) {
      case 'KILOGRAMO':
        return 'GRAMOS'; // Usar gramos por defecto para productos por kg
      case 'LITRO':
        return 'MILILITROS'; // Usar mililitros por defecto para productos por litro
      case 'UNIDAD':
        return 'UNIDADES'; // Usar unidades por defecto
      case 'PAQUETE':
        return 'PAQUETES'; // Usar paquetes por defecto
      default:
        return 'UNIDADES'; // Unidad por defecto
    }
  }

  /**
   * Filtra las unidades disponibles basadas en el producto seleccionado
   */
  private getUnidadesDisponiblesParaProducto(producto: Producto): Array<{valor: string, texto: string, unidadBase: string}> {
    const unidadBase = producto.unidadBase;

    // Filtrar unidades que son compatibles con la unidad base del producto
    return this.unidadesDisponibles.filter(unidad => {
      switch (unidadBase) {
        case 'KILOGRAMO':
          return unidad.valor === 'GRAMOS' || unidad.valor === 'KILOGRAMOS';
        case 'LITRO':
          return unidad.valor === 'MILILITROS' || unidad.valor === 'LITROS';
        case 'UNIDAD':
        case 'PAQUETE':
          return unidad.valor === 'UNIDADES' || unidad.valor === 'PAQUETES';
        default:
          return true; // Mostrar todas las unidades si no hay mapeo específico
      }
    });
  }

  /**
   * Recalcula el costo unitario basado en la unidad seleccionada
   */
  private recalcularCostoUnitario(): void {
    if (!this.productoSeleccionado) return;

    const unidadSeleccionada = this.ingredienteForm.get('unidad')?.value;
    const unidadBaseProducto = this.productoSeleccionado.unidadBase;
    const costoBase = this.costoBaseOriginal;

    let costoUnitario = costoBase;

    // Conversiones de unidades
    if (unidadBaseProducto === 'KILOGRAMO') {
      switch (unidadSeleccionada) {
        case 'GRAMOS':
          // Convertir costo de kg a gramos (1 kg = 1000 g)
          costoUnitario = costoBase / 1000;
          break;
        case 'KILOGRAMOS':
          // Mantener el costo original por kg
          costoUnitario = costoBase;
          break;
        default:
          // Para otras unidades, mantener el costo original
          costoUnitario = costoBase;
      }
    } else if (unidadBaseProducto === 'LITRO') {
      switch (unidadSeleccionada) {
        case 'MILILITROS':
          // Convertir costo de litro a mililitros (1 L = 1000 ml)
          costoUnitario = costoBase / 1000;
          break;
        case 'LITROS':
          // Mantener el costo original por litro
          costoUnitario = costoBase;
          break;
        default:
          // Para otras unidades, mantener el costo original
          costoUnitario = costoBase;
      }
    } else {
      // Para otros tipos de unidades base, mantener el costo original
      costoUnitario = costoBase;
    }

    this.ingredienteForm.patchValue({
      costoUnitario: costoUnitario
    }, { emitEvent: false });

    // Recalcular el costo total después de ajustar el costo unitario
    this.calcularCostoTotal();
  }

  // Método para abrir el diálogo de búsqueda de productos
  openProductSearch(): void {
    const config: GenericSearchConfig = {
      title: 'SELECCIONAR PRODUCTO INGREDIENTE',
      displayedColumns: ['nombre', 'tipo', 'unidadBase', 'activo'],
      columnLabels: {
        nombre: 'NOMBRE',
        tipo: 'TIPO',
        unidadBase: 'UNIDAD BASE',
        activo: 'ESTADO'
      },
      columnAlignments: {
        nombre: 'left',
        tipo: 'center',
        unidadBase: 'center',
        activo: 'center'
      },
      booleanColumns: {
        activo: { trueValue: 'Activo', falseValue: 'Inactivo' }
      },
      showActiveFilter: true,
      searchFn: async (query: string, page: number, pageSize: number, activeFilter?: 'all' | 'active' | 'inactive') => {
        try {
          // Obtener todos los productos y filtrar en el frontend
          const productos = await this.repositoryService.getProductos().toPromise();

          if (!productos) {
            return { items: [], total: 0 };
          }

          // Filtrar productos que pueden ser ingredientes
          let filteredProductos = productos.filter(producto =>
            producto.esIngrediente &&
            (producto.tipo === 'RETAIL_INGREDIENTE' || producto.tipo === 'ELABORADO_SIN_VARIACION')
          );

          // Aplicar filtro de estado
          if (activeFilter === 'active') {
            filteredProductos = filteredProductos.filter(p => p.activo);
          } else if (activeFilter === 'inactive') {
            filteredProductos = filteredProductos.filter(p => !p.activo);
          }

          // Aplicar búsqueda por nombre
          if (query) {
            const queryUpper = query.toUpperCase();
            filteredProductos = filteredProductos.filter(p =>
              p.nombre.toUpperCase().includes(queryUpper)
            );
          }

          // Aplicar paginación
          const startIndex = page * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedProductos = filteredProductos.slice(startIndex, endIndex);

          return {
            items: paginatedProductos,
            total: filteredProductos.length
          };
        } catch (error) {
          console.error('Error searching productos:', error);
          return { items: [], total: 0 };
        }
      }
    };

    const searchDialog = this.dialog.open(GenericSearchDialogComponent, {
      width: '800px',
      height: '600px',
      data: config
    });

    searchDialog.afterClosed().subscribe((selectedProduct: Producto) => {
      if (selectedProduct) {
        this.onProductoSeleccionado(selectedProduct);
      }
    });
  }

  private loadIngredienteData(): void {
    const ingrediente = this.data.ingrediente!;

    // Ítem solo-descripción si no tiene ingrediente vinculado.
    this.soloDescripcion = !ingrediente.ingrediente;
    this.ingredienteForm.patchValue({ descripcion: ingrediente.descripcion ?? null }, { emitEvent: false });
    if (this.soloDescripcion) {
      this.ingredienteForm.patchValue({
        cantidad: ingrediente.cantidad ?? null,
        unidad: ingrediente.unidad ?? null,
        esExtra: ingrediente.esExtra,
        esOpcional: ingrediente.esOpcional,
        esCambiable: ingrediente.esCambiable,
        activo: ingrediente.activo,
      });
      this.aplicarValidadoresModo();
      return;
    }

    // Determinar si hay conversión de unidades
    const unidadBaseProducto = ingrediente.ingrediente?.unidadBase;
    const unidadGuardada = ingrediente.unidad;
    const unidadOriginal = ingrediente.unidadOriginal;
    const cantidadGuardada = ingrediente.cantidad ?? 0;

    // Convertir cantidad si es necesario para mostrar en la unidad original
    let cantidadParaMostrar = cantidadGuardada;
    let unidadParaMostrar = unidadGuardada;

    // Si hay unidad original guardada, usarla para mostrar
    if (unidadOriginal && unidadOriginal !== unidadGuardada) {
      if (unidadBaseProducto === 'KILOGRAMO' && unidadOriginal === 'GRAMOS') {
        // Si se guardó en kg pero la unidad original es gramos, convertir de vuelta
        cantidadParaMostrar = cantidadGuardada * 1000;
        unidadParaMostrar = 'GRAMOS';
      } else if (unidadBaseProducto === 'LITRO' && unidadOriginal === 'MILILITROS') {
        // Si se guardó en litros pero la unidad original es mililitros, convertir de vuelta
        cantidadParaMostrar = cantidadGuardada * 1000;
        unidadParaMostrar = 'MILILITROS';
      }
    }

    this.ingredienteForm.patchValue({
      ingredienteId: ingrediente.ingrediente?.id ?? null,
      cantidad: cantidadParaMostrar,
      unidad: unidadParaMostrar,
      costoUnitario: ingrediente.costoUnitario,
      costoTotal: ingrediente.costoTotal,
      esExtra: ingrediente.esExtra,
      esOpcional: ingrediente.esOpcional,
      esCambiable: ingrediente.esCambiable,
      costoExtra: ingrediente.costoExtra,
      // ✅ NUEVO: Cargar porcentaje de aprovechamiento
      porcentajeAprovechamiento: ingrediente.porcentajeAprovechamiento || 100.00,
      activo: ingrediente.activo
    });

    this.productoSeleccionado = ingrediente.ingrediente ?? null;

    // ✅ CORREGIDO: Para ingredientes existentes, usar el costo unitario guardado
    // en lugar de recalcular desde la receta del producto
    if (ingrediente.costoUnitario && ingrediente.costoUnitario > 0) {
      // Si ya tenemos un costo unitario guardado, usarlo como base
      this.costoBaseOriginal = ingrediente.costoUnitario;

      // Si hay conversión de unidades, convertir el costo base a la unidad base del producto
      if (unidadBaseProducto === 'KILOGRAMO' && unidadOriginal === 'GRAMOS') {
        // El costo unitario está en gramos, convertirlo a kg para el costo base
        this.costoBaseOriginal = ingrediente.costoUnitario * 1000;
      } else if (unidadBaseProducto === 'LITRO' && unidadOriginal === 'MILILITROS') {
        // El costo unitario está en ml, convertirlo a litros para el costo base
        this.costoBaseOriginal = ingrediente.costoUnitario * 1000;
      }
    } else if (ingrediente.ingrediente) {
      // Solo cargar el costo desde la receta si no tenemos un costo unitario guardado
      this.loadPrecioCostoProducto(ingrediente.ingrediente);
    }

    this.calcularCostoTotal();
  }

  private onProductoSeleccionado(producto: Producto): void {
    this.productoSeleccionado = producto;

    // Determinar la unidad por defecto basada en el producto
    const unidadPorDefecto = this.determinarUnidadPorDefecto(producto);

    this.ingredienteForm.patchValue({
      ingredienteId: producto.id,
      unidad: unidadPorDefecto
    });

    // Obtener el precio de costo del producto
    this.loadPrecioCostoProducto(producto);
  }

  private loadPrecioCostoProducto(producto: Producto): void {
    // Si el producto es de tipo ELABORADO_SIN_VARIACION, buscar el costo en su receta
    if (producto.tipo === 'ELABORADO_SIN_VARIACION' && producto.receta) {
      this.loadCostoDesdeReceta(producto.receta.id!);
    } else {
      // Para productos RETAIL_INGREDIENTE, buscar en precios de costo
      this.loadCostoDesdePreciosCosto(producto);
    }
  }

  /**
   * Carga el costo desde la receta del producto elaborado
   */
  private loadCostoDesdeReceta(recetaId: number): void {
    this.repositoryService.getReceta(recetaId).subscribe({
      next: (receta) => {
        if (receta && receta.costoCalculado) {
          this.costoBaseOriginal = receta.costoCalculado;

          // Aplicar conversión de unidades según la unidad seleccionada
          this.aplicarConversionUnidades();
        } else {
          this.costoBaseOriginal = 0;
          this.ingredienteForm.patchValue({
            costoUnitario: 0
          });
        }
      },
      error: (error: any) => {
        console.error('Error loading receta costo:', error);
        this.costoBaseOriginal = 0;
        this.ingredienteForm.patchValue({
          costoUnitario: 0
        });
      }
    });
  }

  /**
   * Carga el costo desde los precios de costo del producto
   */
  private loadCostoDesdePreciosCosto(producto: Producto): void {
    this.repositoryService.getPreciosCostoByProducto(producto.id!).subscribe({
      next: (precios) => {
        if (precios && precios.length > 0) {
          // Tomar el precio más reciente (el primero de la lista)
          const precioReciente = precios[0];
          const costoBase = precioReciente.valor;

          // Almacenar el costo base original
          this.costoBaseOriginal = costoBase;

          // Aplicar conversión de unidades según la unidad seleccionada
          this.aplicarConversionUnidades();
        } else {
          this.costoBaseOriginal = 0;
          this.ingredienteForm.patchValue({
            costoUnitario: 0
          });
        }
      },
      error: (error: any) => {
        console.error('Error loading precio costo:', error);
        this.costoBaseOriginal = 0;
        this.ingredienteForm.patchValue({
          costoUnitario: 0
        });
      }
    });
  }

  /**
   * Aplica la conversión de unidades según la unidad seleccionada
   */
  private aplicarConversionUnidades(): void {
    if (!this.productoSeleccionado) return;

          const unidadSeleccionada = this.ingredienteForm.get('unidad')?.value;
    const unidadBaseProducto = this.productoSeleccionado.unidadBase;
    const costoBase = this.costoBaseOriginal;

          let costoUnitario = costoBase;

          // Aplicar la misma lógica de conversión que en recalcularCostoUnitario
          if (unidadBaseProducto === 'KILOGRAMO') {
            switch (unidadSeleccionada) {
              case 'GRAMOS':
                costoUnitario = costoBase / 1000;
                break;
              case 'KILOGRAMOS':
                costoUnitario = costoBase;
                break;
              default:
                costoUnitario = costoBase;
            }
          } else if (unidadBaseProducto === 'LITRO') {
            switch (unidadSeleccionada) {
              case 'MILILITROS':
                costoUnitario = costoBase / 1000;
                break;
              case 'LITROS':
                costoUnitario = costoBase;
                break;
              default:
                costoUnitario = costoBase;
            }
          } else {
            costoUnitario = costoBase;
          }

          this.ingredienteForm.patchValue({
            costoUnitario: costoUnitario
          });

          // Recalcular el costo total después de establecer el costo unitario
          this.calcularCostoTotal();
  }

  private calcularCostoTotal(): void {
    const cantidad = this.ingredienteForm.get('cantidad')?.value || 0;
    const costoUnitario = this.ingredienteForm.get('costoUnitario')?.value || 0;
    const porcentajeAprovechamiento = this.ingredienteForm.get('porcentajeAprovechamiento')?.value || 100.00;

    // ✅ IMPORTANTE: El porcentaje de aprovechamiento NO afecta el costo del ingrediente
    // Se usa únicamente para cálculos futuros de producción
    // Ejemplo: Si necesitas 1kg de carne pero solo aprovechas 80%,
    // el costo sigue siendo por 1kg, pero para producción necesitarás comprar 1.25kg
    const costoTotal = cantidad * costoUnitario;

    this.ingredienteForm.patchValue({
      costoTotal: costoTotal
    }, { emitEvent: false });

    // Actualizar propiedades computadas
    this.costoTotal = costoTotal;
  }

  // Validar que el producto no esté duplicado
  validarProductoDuplicado(productoId: number): boolean {
    if (!this.data.existingIngredientes) return true;

    const existe = this.data.existingIngredientes.some(
      ingrediente => ingrediente.ingrediente?.id === productoId
    );

    if (existe && !this.isEditMode) {
      this.snackBar.open('Este ingrediente ya está en la receta', 'Cerrar', { duration: 3000 });
      return false;
    }

    return true;
  }

  onSubmit(): void {
    if (this.ingredienteForm.valid) {
      const formValue = this.ingredienteForm.value;

      // Ítem solo-descripción: sin ingrediente, sin costos.
      if (this.soloDescripcion) {
        this.dialogRef.close({
          recetaId: this.data.recetaId,
          ingredienteId: null,
          descripcion: formValue.descripcion,
          cantidad: formValue.cantidad || null,
          unidad: formValue.unidad || null,
          unidadOriginal: formValue.unidad || null,
          esExtra: formValue.esExtra,
          esOpcional: formValue.esOpcional,
          esCambiable: formValue.esCambiable,
          activo: formValue.activo,
          costoUnitario: 0,
          costoTotal: 0,
        });
        return;
      }

      // Validar producto duplicado
      if (!this.validarProductoDuplicado(formValue.ingredienteId)) {
        return;
      }

      // Normalizar datos según la conversión de unidades
      const datosNormalizados = this.normalizarDatosParaGuardar(formValue);

      // Preparar datos para guardar
      const ingredienteData = {
        ...datosNormalizados,
        recetaId: this.data.recetaId,
        ingredienteId: formValue.ingredienteId,
        costoTotal: this.costoTotal
      };

      this.dialogRef.close(ingredienteData);
    }
  }

  /**
   * Normaliza los datos para guardar considerando las conversiones de unidades
   */
  private normalizarDatosParaGuardar(formValue: any): any {
    if (!this.productoSeleccionado) return formValue;

    const unidadSeleccionada = formValue.unidad;
    const unidadBaseProducto = this.productoSeleccionado.unidadBase;
    const cantidad = formValue.cantidad;
    const costoUnitario = formValue.costoUnitario;

    // Si hay conversión de unidades, normalizar los datos
    if (unidadBaseProducto === 'KILOGRAMO' && unidadSeleccionada === 'GRAMOS') {
      // Convertir gramos a kilogramos para guardar
      const cantidadEnKg = cantidad / 1000;
      // El costo unitario ya está convertido, mantenerlo
      return {
        ...formValue,
        cantidad: cantidadEnKg,
        costoUnitario: costoUnitario,
        unidad: 'KILOGRAMOS', // Guardar en la unidad base del producto
        unidadOriginal: unidadSeleccionada // Guardar la unidad seleccionada por el usuario
      };
    } else if (unidadBaseProducto === 'LITRO' && unidadSeleccionada === 'MILILITROS') {
      // Convertir mililitros a litros para guardar
      const cantidadEnL = cantidad / 1000;
      return {
        ...formValue,
        cantidad: cantidadEnL,
        costoUnitario: costoUnitario,
        unidad: 'LITROS', // Guardar en la unidad base del producto
        unidadOriginal: unidadSeleccionada // Guardar la unidad seleccionada por el usuario
      };
    } else {
      // No hay conversión, guardar datos originales
      return {
        ...formValue,
        unidadOriginal: unidadSeleccionada
      };
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  // Métodos para cálculos individuales (para templates)
  getCostoTotalCalculado(): number {
    const cantidad = this.ingredienteForm.get('cantidad')?.value || 0;
    const costoUnitario = this.ingredienteForm.get('costoUnitario')?.value || 0;
    return cantidad * costoUnitario;
  }

  getProductoNombre(): string {
    return this.productoSeleccionado?.nombre || '';
  }

  getProductoTipo(): string {
    return this.productoSeleccionado?.tipo || '';
  }

  /**
   * Verifica si se está aplicando una conversión de unidades
   */
  isConversionAplicada(): boolean {
    if (!this.productoSeleccionado) return false;

    const unidadSeleccionada = this.ingredienteForm.get('unidad')?.value;
    const unidadBaseProducto = this.productoSeleccionado.unidadBase;

    // Verificar diferentes casos de conversión
    return (unidadBaseProducto === 'KILOGRAMO' && unidadSeleccionada === 'GRAMOS') ||
           (unidadBaseProducto === 'LITRO' && unidadSeleccionada === 'MILILITROS');
  }

  /**
   * Obtiene la unidad base del producto
   */
  getUnidadBaseProducto(): string {
    return this.productoSeleccionado?.unidadBase || '';
  }

  /**
   * Obtiene la unidad seleccionada en el formulario
   */
  getUnidadSeleccionada(): string {
    return this.ingredienteForm.get('unidad')?.value || '';
  }

  /**
   * Obtiene las unidades disponibles filtradas para el producto seleccionado
   */
  getUnidadesDisponibles(): Array<{valor: string, texto: string, unidadBase: string}> {
    if (!this.productoSeleccionado) {
      return this.unidadesDisponibles;
    }
    return this.getUnidadesDisponiblesParaProducto(this.productoSeleccionado);
  }

  /**
   * Obtiene información sobre el origen del costo
   */
  getOrigenCosto(): string {
    if (!this.productoSeleccionado) return '';

    if (this.productoSeleccionado.tipo === 'ELABORADO_SIN_VARIACION') {
      return 'Costo calculado desde receta';
    } else {
      return 'Costo desde precios de compra';
    }
  }
}
