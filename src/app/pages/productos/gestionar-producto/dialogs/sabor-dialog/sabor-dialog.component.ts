import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { SaboresVariacionesService, Sabor } from '../../../../../services/sabores-variaciones.service';

export interface SaborDialogData {
  sabor?: Sabor;
  productoId: number;
  productoNombre: string;
  modo: 'crear' | 'editar';
}

@Component({
  selector: 'app-sabor-dialog',
  templateUrl: './sabor-dialog.component.html',
  styleUrls: ['./sabor-dialog.component.scss']
})
export class SaborDialogComponent implements OnInit, OnDestroy {

  saborForm!: FormGroup;
  loading = false;

  // Opciones para categorías
  categoriasDisponibles = [
    { value: 'PIZZA', label: 'Pizza' },
    { value: 'HAMBURGUESA', label: 'Hamburguesa' },
    { value: 'PASTA', label: 'Pasta' },
    { value: 'EMPANADA', label: 'Empanada' },
    { value: 'SANDWICH', label: 'Sandwich' },
    { value: 'ENSALADA', label: 'Ensalada' },
    { value: 'POSTRE', label: 'Postre' },
    { value: 'BEBIDA', label: 'Bebida' },
    { value: 'OTRO', label: 'Otro' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    public dialogRef: MatDialogRef<SaborDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SaborDialogData,
    private fb: FormBuilder,
    private saboresService: SaboresVariacionesService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    if (this.data.modo === 'editar' && this.data.sabor) {
      this.loadSaborData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.saborForm = this.fb.group({
      nombre: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        this.noWhitespaceValidator
      ]],
      categoria: ['PIZZA', [Validators.required]],
      descripcion: ['', [
        Validators.maxLength(200)
      ]],
      imageUrl: [null]
    });
  }

  private loadSaborData(): void {
    if (this.data.sabor) {
      this.saborForm.patchValue({
        nombre: this.data.sabor.nombre,
        categoria: this.data.sabor.categoria,
        descripcion: this.data.sabor.descripcion || '',
        imageUrl: (this.data.sabor as any).imageUrl ?? null
      });
    }
  }

  onSaborImagenUploaded(event: { url: string }): void {
    this.saborForm.patchValue({ imageUrl: event.url });
    this.saborForm.markAsDirty();
  }

  onSaborImagenRemoved(): void {
    this.saborForm.patchValue({ imageUrl: null });
    this.saborForm.markAsDirty();
  }

  // Custom validator para evitar nombres que solo contengan espacios
  private noWhitespaceValidator(control: any) {
    if (control.value && control.value.trim().length === 0) {
      return { whitespace: true };
    }
    return null;
  }

  get tituloDialog(): string {
    return this.data.modo === 'crear'
      ? `Nuevo Sabor - ${this.data.productoNombre}`
      : `Editar Sabor - ${this.data.productoNombre}`;
  }

  get textoBotonPrimario(): string {
    if (this.loading) {
      return this.data.modo === 'crear' ? 'Creando...' : 'Guardando...';
    }
    return this.data.modo === 'crear' ? 'Crear Sabor' : 'Guardar Cambios';
  }

  get nombreError(): string | null {
    const nombreControl = this.saborForm.get('nombre');
    if (nombreControl?.errors && nombreControl.touched) {
      if (nombreControl.errors['required']) {
        return 'El nombre del sabor es requerido';
      }
      if (nombreControl.errors['minlength']) {
        return 'El nombre debe tener al menos 2 caracteres';
      }
      if (nombreControl.errors['maxlength']) {
        return 'El nombre no puede exceder 50 caracteres';
      }
      if (nombreControl.errors['whitespace']) {
        return 'El nombre no puede estar vacío o contener solo espacios';
      }
    }
    return null;
  }

  get descripcionError(): string | null {
    const descripcionControl = this.saborForm.get('descripcion');
    if (descripcionControl?.errors && descripcionControl.touched) {
      if (descripcionControl.errors['maxlength']) {
        return 'La descripción no puede exceder 200 caracteres';
      }
    }
    return null;
  }

  onSubmit(): void {
    if (this.saborForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    if (this.data.modo === 'crear') {
      this.crearSabor();
    } else {
      this.actualizarSabor();
    }
  }

  private crearSabor(): void {
    this.loading = true;

    const saborData = {
      ...this.saborForm.value,
      productoId: this.data.productoId,
      nombre: this.saborForm.value.nombre.trim().toUpperCase(),
      categoria: this.saborForm.value.categoria.toUpperCase(),
      descripcion: this.saborForm.value.descripcion?.trim().toUpperCase() || undefined,
      imageUrl: this.saborForm.value.imageUrl ?? null
    };

    this.saboresService.crearSabor(saborData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resultado) => {
          console.log('✅ Sabor creado exitosamente:', resultado.sabor.nombre);
          this.loading = false;
          this.dialogRef.close({
            action: 'created',
            sabor: resultado.sabor,
            receta: resultado.receta,
            mensaje: resultado.mensaje
          });
        },
        error: (error) => {
          console.error('❌ Error creando sabor:', error);
          this.loading = false;
          // El error ya se muestra en el service mediante snackBar
        }
      });
  }

  private actualizarSabor(): void {
    if (!this.data.sabor?.id) return;

    this.loading = true;

    const saborData = {
      nombre: this.saborForm.value.nombre.trim().toUpperCase(),
      categoria: this.saborForm.value.categoria.toUpperCase(),
      descripcion: this.saborForm.value.descripcion?.trim().toUpperCase() || undefined,
      imageUrl: this.saborForm.value.imageUrl ?? null
    };

    this.saboresService.actualizarSabor(this.data.sabor.id, saborData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saborActualizado) => {
          console.log('✅ Sabor actualizado exitosamente:', saborActualizado.nombre);
          this.loading = false;
          this.dialogRef.close({
            action: 'updated',
            sabor: saborActualizado
          });
        },
        error: (error) => {
          console.error('❌ Error actualizando sabor:', error);
          this.loading = false;
          // El error ya se muestra en el service mediante snackBar
        }
      });
  }

  onCancel(): void {
    if (this.hasUnsavedChanges()) {
      if (confirm('¿Estás seguro de que quieres cancelar? Los cambios no guardados se perderán.')) {
        this.dialogRef.close();
      }
    } else {
      this.dialogRef.close();
    }
  }

  private hasUnsavedChanges(): boolean {
    if (this.data.modo === 'crear') {
      return this.saborForm.dirty;
    } else {
      // Para edición, comparar con valores originales
      if (!this.data.sabor) return false;

      const currentValues = this.saborForm.value;
      return (
        currentValues.nombre.trim().toUpperCase() !== this.data.sabor.nombre ||
        currentValues.categoria.toUpperCase() !== this.data.sabor.categoria ||
        (currentValues.descripcion?.trim().toUpperCase() || '') !== (this.data.sabor.descripcion || '')
      );
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.saborForm.controls).forEach(key => {
      const control = this.saborForm.get(key);
      control?.markAsTouched();
    });
  }

  // Método para preview del nombre generado
  get nombreGeneradoPreview(): string {
    const nombre = this.saborForm.get('nombre')?.value?.trim();
    if (!nombre) return 'Ingresa un nombre para ver el preview';

    return `${this.data.productoNombre} ${nombre.toUpperCase()}`;
  }

  // Método para obtener el ícono según la categoría
  getIconoCategoria(categoria: string): string {
    const iconos: { [key: string]: string } = {
      'PIZZA': 'local_pizza',
      'HAMBURGUESA': 'lunch_dining',
      'PASTA': 'ramen_dining',
      'EMPANADA': 'bakery_dining',
      'SANDWICH': 'lunch_dining',
      'ENSALADA': 'eco',
      'POSTRE': 'cake',
      'BEBIDA': 'local_drink',
      'OTRO': 'restaurant'
    };
    return iconos[categoria] || 'restaurant';
  }

  // Validación en tiempo real del nombre
  onNombreChange(): void {
    const nombreControl = this.saborForm.get('nombre');
    if (nombreControl?.value) {
      // Limpiar espacios múltiples y convertir a mayúsculas para preview
      const cleaned = nombreControl.value.replace(/\s+/g, ' ');
      if (cleaned !== nombreControl.value) {
        nombreControl.setValue(cleaned, { emitEvent: false });
      }
    }
  }

  // Helper para mostrar contador de caracteres
  get caracteresRestantes(): { descripcion: number } {
    return {
      descripcion: 200 - (this.saborForm.get('descripcion')?.value?.length || 0)
    };
  }
}
