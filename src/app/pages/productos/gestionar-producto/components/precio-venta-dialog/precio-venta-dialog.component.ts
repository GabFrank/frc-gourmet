import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { RepositoryService } from '../../../../../database/repository.service';
import { PrecioVenta } from '../../../../../database/entities/productos/precio-venta.entity';
import { Presentacion } from '../../../../../database/entities/productos/presentacion.entity';
import { Moneda } from '../../../../../database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../../../../database/entities/financiero/tipo-precio.entity';
import { ConfirmationDialogComponent } from '../../../../../shared/components/confirmation-dialog/confirmation-dialog.component';

// ✅ NUEVA: Interfaz genérica para cualquier entidad con precios de venta
export interface PrecioVentaDialogData {
  // Identificación de la entidad
  entityId: number;
  entityName: string;
  entityType: 'presentacion' | 'variacion' | 'producto' | 'categoria' | 'otro';

  // ✅ NUEVO: ID de la receta para variaciones (OBLIGATORIO para variaciones)
  recetaId: number;

  // Relación específica para la base de datos
  relationField: 'presentacionId' | 'recetaId' | 'productoId' | 'categoriaId' | 'entityId';

  // Precios existentes (opcional)
  preciosExistentes?: any[];

  // Configuración adicional
  allowMultiplePrincipals?: boolean;
  showFilters?: boolean;
  showBulkActions?: boolean;

  // Callbacks personalizados (opcional)
  onPrecioCreated?: (precio: any) => void;
  onPrecioUpdated?: (precio: any) => void;
  onPrecioDeleted?: (precioId: number) => void;
}

// ✅ MANTENER: Interfaz existente para compatibilidad hacia atrás
interface DialogData extends PrecioVentaDialogData {
  presentacion?: any; // Deprecated - usar entityId + entityType
}

@Component({
  selector: 'app-precio-venta-dialog',
  templateUrl: './precio-venta-dialog.component.html',
  styleUrls: ['./precio-venta-dialog.component.scss']
})
export class PrecioVentaDialogComponent implements OnInit {
  precioForm: FormGroup;
  isLoading = false;
  isLoadingPrecios = false;
  dialogTitle: string;

  // Table properties
  precios: PrecioVenta[] = [];
  precioDataSource = new MatTableDataSource<PrecioVenta>();
  precioDisplayedColumns: string[] = ['id', 'moneda', 'tipoPrecio', 'valor', 'principal', 'activo', 'actions'];
  isAddingPrecio = false;
  editingPrecioId: number | null = null;

  // Filter properties
  precioFilter: 'all' | 'active' | 'inactive' = 'all';

  // Dropdown data
  monedas: Moneda[] = [];
  tiposPrecio: TipoPrecio[] = [];

  // ✅ PRE-CALCULATED VALUES (Regla #2: No function calls in templates)
  monedasMap: { [key: number]: string } = {};
  tiposPrecioMap: { [key: number]: string } = {};

  // ✅ PRE-CALCULATED ERROR MESSAGES
  errorMessages: { [key: string]: { [key: string]: string } } = {
    valor: {
      required: 'VALOR_REQUIRED',
      min: 'MINIMUM_VALUE_0.01'
    },
    monedaId: {
      required: 'MONEDA_REQUIRED'
    },
    tipoPrecioId: {
      required: 'TIPO_PRECIO_REQUIRED'
    }
  };

  // Track if changes were made
  private hasChanges = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    public dialogRef: MatDialogRef<PrecioVentaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    // ✅ NUEVO: Manejar cualquier tipo de entidad
    this.dialogTitle = `GESTIONAR PRECIOS - ${this.data.entityName || 'NUEVA ENTIDAD'}`;

    this.precioForm = this.fb.group({
      valor: ['', [Validators.required, Validators.min(0.01)]],
      monedaId: ['', Validators.required],
      tipoPrecioId: ['', Validators.required],
      principal: [false],
      activo: [true],
      // Programación de vigencia (precios por día/horario)
      diasSemana: [[] as number[]],
      horaInicio: [''],
      horaFin: [''],
      fechaInicio: [null],
      fechaFin: [null],
      prioridad: [0],
      // Buffet por peso (opcional): tope "libre" y cobro mínimo
      precioMinimo: [null],
      precioMaximo: [null]
    });

    this.precioForm.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());

    // ✅ NUEVO: El formulario se inicializará con valores por defecto después de cargar los datos
  }

  decimalesMoneda = 0;

  // Opciones de días para el selector de vigencia (1=Lun … 7=Dom).
  diasOpciones: { value: number; label: string }[] = [
    { value: 1, label: 'LUN' },
    { value: 2, label: 'MAR' },
    { value: 3, label: 'MIE' },
    { value: 4, label: 'JUE' },
    { value: 5, label: 'VIE' },
    { value: 6, label: 'SAB' },
    { value: 7, label: 'DOM' }
  ];

  // Mostrar/ocultar la sección de programación de vigencia (colapsable).
  mostrarProgramacion = false;

  private recalcDecimalesMoneda(): void {
    const id = this.precioForm?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  // Convierte un Date (o string) a 'YYYY-MM-DD' en zona local, o null.
  private toIsoDate(value: any): string | null {
    if (!value) return null;
    const dte = value instanceof Date ? value : new Date(value);
    if (isNaN(dte.getTime())) return null;
    const y = dte.getFullYear();
    const m = String(dte.getMonth() + 1).padStart(2, '0');
    const d = String(dte.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  ngOnInit(): void {
    this.loadDropdownData();
    this.loadPrecios();

    // ✅ NUEVO: Reinicializar formulario con valores por defecto después de cargar datos
    // Esto se hace en loadDropdownData() cuando los datos están disponibles
  }

  // Load dropdown data
  loadDropdownData(): void {
    this.isLoading = true;

    // Load monedas
    this.repositoryService.getMonedas().subscribe({
      next: (monedas) => {
        this.monedas = monedas;
        // ✅ PRE-CALCULATE: Crear map para acceso directo en template
        this.monedasMap = {};
        monedas.forEach(moneda => {
          if (moneda.id) {
            this.monedasMap[moneda.id] = moneda.denominacion;
          }
        });
        // ✅ NUEVO: Reinicializar formulario con valores por defecto después de cargar monedas
        this.resetFormToDefaults();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('ERROR_LOADING_MONEDAS', error);
        this.snackBar.open('Error al cargar monedas', 'CERRAR', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isLoading = false;
      }
    });

    // Load tipos de precio
    this.repositoryService.getTiposPrecio().subscribe({
      next: (tiposPrecio) => {
        this.tiposPrecio = tiposPrecio;
        // ✅ PRE-CALCULATE: Crear map para acceso directo en template
        this.tiposPrecioMap = {};
        tiposPrecio.forEach(tipo => {
          if (tipo.id) {
            this.tiposPrecioMap[tipo.id] = tipo.descripcion;
          }
        });
        // ✅ NUEVO: Reinicializar formulario con valores por defecto después de cargar tipos de precio
        // Solo si ya tenemos monedas cargadas para evitar reinicializaciones innecesarias
        if (this.monedas.length > 0) {
          this.resetFormToDefaults();
        }
      },
      error: (error) => {
        console.error('ERROR_LOADING_TIPOS_PRECIO', error);
        this.snackBar.open('Error al cargar tipos de precio', 'CERRAR', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  // Load precios for any entity type
  loadPrecios(): void {
    if (this.data.entityId) {
      this.isLoadingPrecios = true;

      // ✅ NUEVO: Cargar precios según el tipo de entidad
      if (this.data.entityType === 'presentacion') {
        // Caso: Presentación
      let activoFilter: boolean | null = null;
      if (this.precioFilter === 'active') {
        activoFilter = true;
      } else if (this.precioFilter === 'inactive') {
        activoFilter = false;
      }

        this.repositoryService.getPreciosVentaByPresentacion(this.data.entityId, activoFilter).subscribe({
        next: (precios) => {
          this.precios = precios;
          this.precioDataSource.data = this.precios;
          this.isLoadingPrecios = false;
            this.ensurePrincipalPriceExists(); // Asegurarse de que haya un precio principal
        },
        error: (error) => {
          console.error('ERROR_LOADING_PRECIOS', error);
          this.snackBar.open('Error al cargar precios', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingPrecios = false;
        }
      });
      } else if (this.data.preciosExistentes) {
        // Caso: Otras entidades - usar precios existentes
        this.precios = [...this.data.preciosExistentes];
        this.precioDataSource.data = this.precios;
        this.isLoadingPrecios = false;
        this.ensurePrincipalPriceExists(); // Asegurarse de que haya un precio principal
      } else {
        // Caso: Nueva entidad sin precios
        this.precios = [];
        this.precioDataSource.data = this.precios;
        this.isLoadingPrecios = false;
      }
    }
  }

  // Apply precio filter
  applyPrecioFilter(): void {
    this.loadPrecios(); // Reload with the new filter
  }

  // Change precio filter
  onPrecioFilterChange(event: any): void {
    this.precioFilter = event.value;
    this.applyPrecioFilter();
  }

  // Start adding a new precio
  startAddingPrecio(): void {
    this.isAddingPrecio = true;
    this.editingPrecioId = null;
    this.resetFormToDefaults(); // ✅ NUEVO: Usar el método centralizado
  }

  // Cancel adding/editing precio
  cancelPrecioEdit(): void {
    this.isAddingPrecio = false;
    this.editingPrecioId = null;
    this.resetFormToDefaults(); // ✅ NUEVO: Usar el método centralizado
  }

  // Start editing a precio
  editPrecio(precio: PrecioVenta): void {
    this.isAddingPrecio = false;
    this.editingPrecioId = precio.id!;
    const dias = (precio.diasSemana || '')
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !Number.isNaN(n));
    this.precioForm.patchValue({
      valor: precio.valor,
      monedaId: precio.moneda?.id,
      tipoPrecioId: precio.tipoPrecio?.id,
      principal: precio.principal,
      activo: precio.activo,
      precioMinimo: precio.precioMinimo ?? null,
      precioMaximo: precio.precioMaximo ?? null,
      diasSemana: dias,
      horaInicio: precio.horaInicio || '',
      horaFin: precio.horaFin || '',
      fechaInicio: this.toIsoDate(precio.fechaInicio),
      fechaFin: this.toIsoDate(precio.fechaFin),
      prioridad: precio.prioridad ?? 0
    });
    this.mostrarProgramacion = !!(
      dias.length || precio.horaInicio || precio.horaFin || precio.fechaInicio || precio.fechaFin
    );
  }

  // Save precio (create or update)
  savePrecio(): void {
    if (this.precioForm.valid) {
      this.isLoadingPrecios = true;

      const precioData = {
        ...this.precioForm.value
      };

      // Vigencia: días (array) → CSV; normalizar vacíos a null; fechas a
      // 'YYYY-MM-DD' local (evita corrimiento UTC).
      const diasArr: number[] = Array.isArray(precioData.diasSemana) ? precioData.diasSemana : [];
      precioData.diasSemana = diasArr.length
        ? diasArr.slice().sort((a, b) => a - b).join(',')
        : null;
      precioData.horaInicio = precioData.horaInicio || null;
      precioData.horaFin = precioData.horaFin || null;
      precioData.fechaInicio = this.toIsoDate(precioData.fechaInicio);
      precioData.fechaFin = this.toIsoDate(precioData.fechaFin);
      precioData.prioridad = precioData.prioridad ?? 0;
      precioData.precioMinimo =
        precioData.precioMinimo === '' || precioData.precioMinimo == null
          ? null
          : Number(precioData.precioMinimo);
      precioData.precioMaximo =
        precioData.precioMaximo === '' || precioData.precioMaximo == null
          ? null
          : Number(precioData.precioMaximo);

      // ✅ NUEVO: Manejar cualquier tipo de entidad
      if (this.data.entityId) {
        // ✅ CORREGIDO: Para variaciones, usar recetaId directamente
        if (this.data.entityType === 'variacion') {
          precioData.recetaId = this.data.recetaId;
        } else {
          // Para otras entidades, usar el campo de relación dinámico
          (precioData as any)[this.data.relationField] = this.data.entityId;
        }
      } else {
        this.snackBar.open('Error: No se puede identificar la entidad para el precio', 'CERRAR', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isLoadingPrecios = false;
        return;
      }

      const operation = this.editingPrecioId
        ? this.repositoryService.updatePrecioVenta(this.editingPrecioId, precioData)
        : this.repositoryService.createPrecioVenta(precioData);

      operation.subscribe({
        next: (precioGuardado) => {
          const actionText = this.editingPrecioId ? 'actualizado' : 'creado';
          this.snackBar.open(`Precio ${actionText} correctamente`, 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });

          // ✅ NUEVO: Si el precio nuevo se marca como principal, desmarcar otros
          if (this.precioForm.value.principal) {
            this.unmarkOtherPrincipals(precioGuardado.id);
          }

          // ✅ NUEVO: Llamar callbacks personalizados
          if (this.editingPrecioId) {
            this.handlePrecioUpdated(precioGuardado);
          } else {
            this.handlePrecioCreated(precioGuardado);
          }

          this.cancelPrecioEdit();
          this.loadPrecios();
          this.hasChanges = true; // Mark that changes were made
          this.resetFormToDefaults(); // Reset form with defaults after successful save
        },
        error: (error) => {
          console.error('ERROR_SAVING_PRECIO', error);
          const actionText = this.editingPrecioId ? 'actualizar' : 'crear';
          this.snackBar.open(`Error al ${actionText} precio`, 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingPrecios = false;
        }
      });
    }
  }

  // Delete precio
  deletePrecio(precio: PrecioVenta): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR ELIMINACION',
        message: `¿Está seguro que desea eliminar el precio de ${precio.valor}?`,
        confirmText: 'ELIMINAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precio.id) {
        this.isLoadingPrecios = true;
        this.repositoryService.deletePrecioVenta(precio.id).subscribe({
          next: () => {
            this.snackBar.open('Precio eliminado correctamente', 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadPrecios();
            this.hasChanges = true; // Mark that changes were made
            this.handlePrecioDeleted(precio.id); // Call custom callback
          },
          error: (error) => {
            console.error('ERROR_DELETING_PRECIO', error);
            this.snackBar.open('Error al eliminar precio', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoadingPrecios = false;
          }
        });
      }
    });
  }

  // Toggle precio status
  togglePrecioStatus(precio: PrecioVenta): void {
    if (precio.id) {
      const updatedData = { ...precio, activo: !precio.activo };
      this.isLoadingPrecios = true;

      this.repositoryService.updatePrecioVenta(precio.id, updatedData).subscribe({
        next: () => {
          const statusText = updatedData.activo ? 'activado' : 'desactivado';
          this.snackBar.open(`Precio ${statusText} correctamente`, 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadPrecios();
          this.hasChanges = true; // Mark that changes were made
        },
        error: (error) => {
          console.error('ERROR_UPDATING_PRECIO_STATUS', error);
          this.snackBar.open('Error al cambiar estado de precio', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingPrecios = false;
        }
      });
    }
  }

  // Mark as principal
  marcarComoPrincipal(precio: PrecioVenta): void {
    if (precio.id) {
      this.isLoadingPrecios = true;

      // ✅ NUEVO: Desmarcar otros precios como principales
      this.unmarkOtherPrincipals(precio.id);

      // ✅ NUEVO: Marcar este precio como principal
      this.repositoryService.updatePrecioVenta(precio.id, { principal: true }).subscribe({
        next: () => {
          this.snackBar.open('Precio marcado como principal correctamente', 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadPrecios();
          this.hasChanges = true; // Mark that changes were made
        },
        error: (error) => {
          console.error('ERROR_MARKING_PRINCIPAL', error);
          this.snackBar.open('Error al marcar precio como principal', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoadingPrecios = false;
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close(this.hasChanges);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.precioForm.controls).forEach(key => {
      const control = this.precioForm.get(key);
      control?.markAsTouched();
    });
  }

  // ✅ UTILITY METHOD: Para obtener mensajes de error (no se llama directamente en template)
  getFieldErrorMessage(fieldName: string): string {
    const control = this.precioForm.get(fieldName);

    if (control?.hasError('required')) {
      return this.errorMessages[fieldName]?.['required'] || 'FIELD_REQUIRED';
    }

    if (control?.hasError('min')) {
      return this.errorMessages[fieldName]?.['min'] || 'MINIMUM_VALUE_ERROR';
    }

    return '';
  }

  // ✅ NUEVO: Métodos para manejar callbacks personalizados
  private handlePrecioCreated(precio: any): void {
    if (this.data.onPrecioCreated) {
      this.data.onPrecioCreated(precio);
    }
  }

  private handlePrecioUpdated(precio: any): void {
    if (this.data.onPrecioUpdated) {
      this.data.onPrecioUpdated(precio);
    }
  }

  private handlePrecioDeleted(precioId: number): void {
    if (this.data.onPrecioDeleted) {
      this.data.onPrecioDeleted(precioId);
    }
  }

  // ✅ NUEVO: Método para verificar si mostrar filtros
  get mostrarFiltros(): boolean {
    return this.data.showFilters !== false; // Por defecto mostrar filtros
  }

  // ✅ NUEVO: Método para verificar si permitir múltiples principales
  get permitirMultiplesPrincipales(): boolean {
    return this.data.allowMultiplePrincipals === true; // Por defecto solo uno principal
  }

  // ✅ NUEVO: Método para verificar si mostrar acciones masivas
  get mostrarAccionesMasivas(): boolean {
    return this.data.showBulkActions === true; // Por defecto no mostrar
  }

  // ✅ NUEVO: Método estático para crear datos del dialog fácilmente
  static createDialogData(
    entityId: number,
    entityName: string,
    entityType: 'presentacion' | 'variacion' | 'producto' | 'categoria' | 'otro',
    options: {
      recetaId: number; // ✅ OBLIGATORIO para variaciones
      preciosExistentes?: any[];
      allowMultiplePrincipals?: boolean;
      showFilters?: boolean;
      showBulkActions?: boolean;
      onPrecioCreated?: (precio: any) => void;
      onPrecioUpdated?: (precio: any) => void;
      onPrecioDeleted?: (precioId: number) => void;
    }
  ): PrecioVentaDialogData {
    // Mapear tipo de entidad al campo de relación correcto
    const relationFieldMap: { [key: string]: any } = {
      'presentacion': 'presentacionId',
      'variacion': 'recetaId',
      'producto': 'productoId',
      'categoria': 'categoriaId',
      'otro': 'entityId'
    };

    return {
      entityId,
      entityName,
      entityType,
      recetaId: options.recetaId, // ✅ Ahora es obligatorio
      relationField: relationFieldMap[entityType] || 'entityId',
      preciosExistentes: options.preciosExistentes || [],
      allowMultiplePrincipals: options.allowMultiplePrincipals || false,
      showFilters: options.showFilters !== false, // Por defecto true
      showBulkActions: options.showBulkActions || false,
      onPrecioCreated: options.onPrecioCreated,
      onPrecioUpdated: options.onPrecioUpdated,
      onPrecioDeleted: options.onPrecioDeleted
    };
  }

  // ✅ NUEVO: Método para reinicializar el formulario con valores por defecto
  private resetFormToDefaults(): void {
    // ✅ NUEVO: Obtener valores por defecto seguros
    const defaultMonedaId = this.monedas.length > 0 ? this.monedas[0].id : '';
    const defaultTipoPrecioId = this.tiposPrecio.length > 0 ? this.tiposPrecio[0].id : '';

    this.precioForm.reset({
      valor: '',
      monedaId: defaultMonedaId,
      tipoPrecioId: defaultTipoPrecioId,
      principal: false,
      activo: true,
      diasSemana: [],
      horaInicio: '',
      horaFin: '',
      fechaInicio: null,
      fechaFin: null,
      prioridad: 0,
      precioMinimo: null,
      precioMaximo: null
    });
    this.mostrarProgramacion = false;

    // ✅ NUEVO: Marcar todos los campos como no tocados y no sucios
    this.precioForm.markAsUntouched();
    this.precioForm.markAsPristine();

    // ✅ NUEVO: Limpiar errores de validación
    Object.keys(this.precioForm.controls).forEach(key => {
      const control = this.precioForm.get(key);
      if (control) {
        control.setErrors(null);
        // ✅ NUEVO: Asegurar que los campos opcionales mantengan sus valores por defecto
        if (key === 'principal' || key === 'activo') {
          control.setValue(key === 'activo' ? true : false);
        }
      }
    });

    // ✅ NUEVO: Log para debugging
    console.log('🔄 Formulario reinicializado con valores por defecto:', {
      monedaId: defaultMonedaId,
      tipoPrecioId: defaultTipoPrecioId,
      principal: false,
      activo: true
    });
  }

  // ✅ NUEVO: Método para asegurar que siempre exista un precio principal
  private ensurePrincipalPriceExists(): void {
    if (this.precios.length === 0) return;

    // ✅ Verificar si ya existe un precio principal
    const existingPrincipal = this.precios.find(p => p.principal);

    if (!existingPrincipal) {
      // ✅ Si no hay precio principal, marcar el primero como principal
      const firstPrecio = this.precios[0];
      if (firstPrecio.id) {
        this.repositoryService.updatePrecioVenta(firstPrecio.id, { principal: true }).subscribe({
          next: () => {
            console.log('✅ Primer precio marcado como principal automáticamente');
            this.loadPrecios(); // Recargar para reflejar cambios
          },
          error: (error) => {
            console.error('❌ Error marcando primer precio como principal:', error);
          }
        });
      }
    }
  }

  // ✅ NUEVO: Método para desmarcar otros precios como principales
  private unmarkOtherPrincipals(currentPrecioId: number): void {
    this.precios.forEach(precio => {
      if (precio.id && precio.id !== currentPrecioId && precio.principal) {
        this.repositoryService.updatePrecioVenta(precio.id, { principal: false }).subscribe({
          next: () => {
            console.log(`✅ Precio ${precio.id} desmarcado como principal`);
          },
          error: (error) => {
            console.error(`❌ Error desmarcando precio ${precio.id} como principal:`, error);
          }
        });
      }
    });
  }
}
