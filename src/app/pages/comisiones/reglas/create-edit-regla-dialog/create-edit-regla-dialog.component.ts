import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { TipoReglaComision, ModoValidacionComision, RecurrenciaComision, TipoRequisitoComision } from 'src/app/database/entities/rrhh/regla-comision-enums';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

@Component({
  selector: 'app-create-edit-regla-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTableModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
    CurrencyInputDirective,
  ],
  templateUrl: './create-edit-regla-dialog.component.html',
  styleUrls: ['./create-edit-regla-dialog.component.scss'],
})
export class CreateEditReglaDialogComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  isEdit = false;
  decimalesMoneda = 0;

  tiposRegla = Object.values(TipoReglaComision);
  modos = Object.values(ModoValidacionComision);
  recurrencias = Object.values(RecurrenciaComision);
  tiposRequisito = Object.values(TipoRequisitoComision);

  // Productos y requisitos editables
  productoIds: number[] = [];
  requisitos: any[] = [];
  nuevoRequisito: any = { tipo: TipoRequisitoComision.TARDANZA_MAX, umbral: 0, peso: 1, descripcion: '' };

  // Lista de productos para seleccionar
  productos: any[] = [];
  filteredProductos: any[] = [];
  productoBuscarControl = new FormControl<any | string | null>(null);
  selectedProducto: any | null = null;

  // Columnas tabla requisitos
  reqColumns = ['tipo', 'umbral', 'peso', 'descripcion', 'acciones'];

  get tipoActual(): TipoReglaComision { return this.form?.get('tipo')?.value; }
  get showMontoBase(): boolean { return [TipoReglaComision.META_UNIDADES, TipoReglaComision.META_VENTA_LOCAL].includes(this.tipoActual); }
  get showPorcentaje(): boolean { return [TipoReglaComision.PORCENTAJE_VENTA, TipoReglaComision.EQUIPO_PORCENTAJE].includes(this.tipoActual); }
  get showMetaUnidades(): boolean { return this.tipoActual === TipoReglaComision.META_UNIDADES; }
  get showMetaMontoLocal(): boolean { return this.tipoActual === TipoReglaComision.META_VENTA_LOCAL; }

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<CreateEditReglaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { regla: any },
  ) {}

  ngOnInit(): void {
    this.isEdit = !!this.data.regla;
    const r = this.data.regla;

    this.form = this.fb.group({
      nombre: [r?.nombre || '', Validators.required],
      descripcion: [r?.descripcion || ''],
      tipo: [r?.tipo || TipoReglaComision.PORCENTAJE_VENTA, Validators.required],
      montoBase: [r?.montoBase || 0],
      porcentaje: [r?.porcentaje || null],
      metaUnidades: [r?.metaUnidades || null],
      metaMontoLocal: [r?.metaMontoLocal || null],
      modoValidacion: [r?.modoValidacion || ModoValidacionComision.TODO_O_NADA, Validators.required],
      recurrencia: [r?.recurrencia || RecurrenciaComision.INDEFINIDA, Validators.required],
      fechaInicio: [r?.fechaInicio ? new Date(r.fechaInicio) : null],
      fechaFin: [r?.fechaFin ? new Date(r.fechaFin) : null],
      esEquipo: [r?.esEquipo || false],
      activo: [r?.activo !== undefined ? r.activo : true],
    });

    // Cargar lista de productos (con paginado, solo activos)
    this.repo.getProductosWithFilters({
      activo: 'true',
      page: 0,
      pageSize: 5000,
    }).subscribe({
      next: (res: any) => {
        this.productos = res?.items || [];
        this.filteredProductos = this.productos.slice(0, 50);
      },
    });

    // Suscripción de búsqueda incremental
    this.productoBuscarControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredProductos = this.productos
          .filter(p => (p.nombre || '').toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedProducto && (this.selectedProducto.nombre || '').toUpperCase() !== filter) {
          this.selectedProducto = null;
        }
      } else {
        this.filteredProductos = this.productos.slice(0, 50);
      }
    });

    // Si editando, cargar productos y requisitos
    if (this.isEdit && r?.id) {
      this.repo.getReglaComision(r.id).subscribe({
        next: (full) => {
          if (full?.productos) this.productoIds = full.productos.map((p: any) => p.producto?.id).filter(Boolean);
          if (full?.requisitos) this.requisitos = full.requisitos.map((req: any) => ({ ...req }));
        },
      });
    }
  }

  agregarProducto(): void {
    if (this.selectedProducto && !this.productoIds.includes(this.selectedProducto.id)) {
      this.productoIds = [...this.productoIds, this.selectedProducto.id];
      this.selectedProducto = null;
      this.productoBuscarControl.setValue('');
    }
  }

  quitarProducto(pid: number): void {
    this.productoIds = this.productoIds.filter((p) => p !== pid);
  }

  getNombreProducto(pid: number): string {
    return this.productos.find((p) => p.id === pid)?.nombre || String(pid);
  }

  displayProducto = (p: any): string => (p && typeof p === 'object') ? (p.nombre || '') : '';

  onProductoSeleccionado(producto: any): void {
    this.selectedProducto = producto;
  }

  agregarRequisito(): void {
    this.requisitos = [...this.requisitos, { ...this.nuevoRequisito }];
    this.nuevoRequisito = { tipo: TipoRequisitoComision.TARDANZA_MAX, umbral: 0, peso: 1, descripcion: '' };
  }

  quitarRequisito(idx: number): void {
    this.requisitos = this.requisitos.filter((_, i) => i !== idx);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    try {
      const payload = {
        ...this.form.value,
        productoIds: this.productoIds,
        requisitos: this.requisitos,
      };
      if (this.isEdit) {
        await firstValueFrom(this.repo.updateReglaComision(this.data.regla.id, payload));
      } else {
        await firstValueFrom(this.repo.createReglaComision(payload));
      }
      this.snackBar.open('Regla guardada', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  cancelar(): void { this.dialogRef.close(false); }
}
