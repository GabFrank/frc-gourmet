import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { firstValueFrom } from 'rxjs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

interface DialogData {
  ingrediente?: Ingrediente | null;
  ingredienteId?: number;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-ingrediente-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './create-edit-ingrediente-dialog.component.html',
  styleUrls: ['./create-edit-ingrediente-dialog.component.scss']
})
export class CreateEditIngredienteDialogComponent implements OnInit {
  ingredienteForm: FormGroup;
  loading = false;
  savingIngrediente = false;
  ingredienteId?: number;
  tipoMedidaOptions = Object.values(TipoMedida);
  recetas: any[] = [];
  monedas: Moneda[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditIngredienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.ingredienteForm = this.fb.group({
      descripcion: ['', Validators.required],
      tipoMedida: [TipoMedida.UNIDAD, Validators.required],
      costo: [0, [Validators.required, Validators.min(0)]],
      monedaId: [null, Validators.required],
      isProduccion: [false],
      recetaId: [null],
      activo: [true]
    });

    // Monitor changes to monedaId
    this.ingredienteForm.get('monedaId')?.valueChanges.subscribe(value => {
      console.log('monedaId changed to:', value);
    });
  }

  ngOnInit(): void {
    this.initializeForm();
  }

  private async initializeForm(): Promise<void> {
    try {
      this.loading = true;

      // Load monedas first to ensure they're available
      await this.loadMonedas();

      // For new ingredients, select the principal currency by default right after loading
      //or if data.ingrediente.moneda is null
      console.log(!this.data.editMode, !this.data.ingrediente?.moneda);
      if (!this.data.editMode || !this.data.ingrediente?.moneda) {
        this.setDefaultMoneda();
      }

      // Then load recetas
      await this.loadRecetas();

      if (this.data.editMode) {
        if (this.data.ingrediente) {
          // If full ingrediente object is provided
          this.ingredienteId = this.data.ingrediente.id;
          this.patchIngredienteForm(this.data.ingrediente);
        } else if (this.data.ingredienteId) {
          // If only ingredienteId is provided, load the ingrediente
          this.ingredienteId = this.data.ingredienteId;
          await this.loadIngredienteById(this.ingredienteId);
        }
      }
    } catch (error) {
      console.error('Error initializing form:', error);
      this.snackBar.open('Error al inicializar el formulario', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private setDefaultMoneda(): void {
    // Find the principal moneda
    const principalMoneda = this.monedas.find(m => m.principal);

    if (principalMoneda) {
      console.log('Setting default moneda:', principalMoneda);

      // Use setTimeout to ensure value is set after the next change detection cycle
      setTimeout(() => {
        this.ingredienteForm.patchValue({
          monedaId: principalMoneda.id
        });
        console.log('Current monedaId value after timeout:', this.ingredienteForm.get('monedaId')?.value);
      });

      // Verify if the value was set
      console.log('Current monedaId value:', this.ingredienteForm.get('monedaId')?.value);
    } else {
      console.log('No principal moneda found among:', this.monedas);
    }
  }

  private patchIngredienteForm(ingrediente: Ingrediente): void {
    this.ingredienteForm.patchValue({
      descripcion: ingrediente.descripcion,
      tipoMedida: ingrediente.tipoMedida,
      costo: ingrediente.costo,
      monedaId: ingrediente.monedaId || null,
      isProduccion: ingrediente.isProduccion,
      recetaId: ingrediente.recetaId || null,
      activo: ingrediente.activo
    });
  }

  async loadIngredienteById(ingredienteId: number): Promise<void> {
    try {
      const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(ingredienteId));
      this.data.ingrediente = ingrediente;
      this.patchIngredienteForm(ingrediente);
    } catch (error) {
      console.error('Error loading ingrediente:', error);
      this.snackBar.open('Error al cargar el ingrediente', 'Cerrar', { duration: 3000 });
    }
  }

  async loadRecetas(): Promise<void> {
    try {
      this.recetas = await firstValueFrom(this.repositoryService.getRecetas());
    } catch (error) {
      console.error('Error loading recetas:', error);
      this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
    }
  }

  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      console.log('Monedas loaded:', this.monedas);
    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar las monedas', 'Cerrar', { duration: 3000 });
    }
  }

  async save(): Promise<void> {
    if (this.ingredienteForm.invalid) {
      this.ingredienteForm.markAllAsTouched();
      return;
    }

    this.savingIngrediente = true;

    try {
      const formValues = this.ingredienteForm.value;

      if (this.data.editMode && this.ingredienteId) {
        // Update existing ingrediente
        await firstValueFrom(this.repositoryService.updateIngrediente(this.ingredienteId, {
          descripcion: formValues.descripcion.toUpperCase(),
          tipoMedida: formValues.tipoMedida,
          costo: formValues.costo,
          monedaId: formValues.monedaId,
          isProduccion: formValues.isProduccion,
          recetaId: formValues.recetaId,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new ingrediente
        const newIngrediente = await firstValueFrom(this.repositoryService.createIngrediente({
          descripcion: formValues.descripcion.toUpperCase(),
          tipoMedida: formValues.tipoMedida,
          costo: formValues.costo,
          monedaId: formValues.monedaId,
          isProduccion: formValues.isProduccion,
          recetaId: formValues.recetaId,
          activo: formValues.activo
        }));
        this.ingredienteId = newIngrediente.id;
        this.snackBar.open('Ingrediente creado correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving ingrediente:', error);
      this.snackBar.open('Error al guardar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingIngrediente = false;
    }
  }

  getTipoMedidaText(tipo: TipoMedida): string {
    switch (tipo) {
      case TipoMedida.UNIDAD:
        return 'Unidad';
      case TipoMedida.GRAMO:
        return 'Gramo';
      case TipoMedida.MILILITRO:
        return 'Mililitro';
      case TipoMedida.PAQUETE:
        return 'Paquete';
      default:
        return tipo;
    }
  }

  getMonedaLabel(moneda: Moneda): string {
    return moneda.principal ?
      `${moneda.denominacion} (${moneda.simbolo}) - Principal` :
      `${moneda.denominacion} (${moneda.simbolo})`;
  }

  getSelectedMonedaSymbol(): string {
    const monedaId = this.ingredienteForm.get('monedaId')?.value;
    if (!monedaId) return '$';

    const selectedMoneda = this.monedas.find(m => m.id === monedaId);
    return selectedMoneda ? selectedMoneda.simbolo : '$';
  }
}
