import {
  Component,
  Input,
  OnInit,
  Inject,
  Optional,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { CostoPorProducto, OrigenCosto } from '../../../../database/entities/productos/costo-por-producto.entity';
import { Moneda } from '../../../../database/entities/financiero/moneda.entity';
import { firstValueFrom } from 'rxjs';
import { CurrencyInputComponent } from '../../../../shared/components/currency-input/currency-input.component';
import { CurrencyConfigService } from '../../../../shared/services/currency-config.service';

interface DialogData {
  productoId?: number;
  costo?: CostoPorProducto;
  editMode?: boolean;
}

interface CostoPorProductoDisplay extends CostoPorProducto {
  formattedValue: string;
}

@Component({
  selector: 'app-create-edit-costo-por-producto-dialog',
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
    MatRadioModule,
    MatDividerModule,
    MatTableModule,
    MatTooltipModule,
    MatCardModule,
    MatSnackBarModule,
    MatDialogModule,
    CurrencyInputComponent,
  ],
  providers: [DecimalPipe],
  templateUrl: './create-edit-costo-por-producto-dialog.component.html',
  styleUrls: ['./create-edit-costo-por-producto-dialog.component.scss'],
})
export class CreateEditCostoPorProductoDialogComponent implements OnInit {
  @Input() productoId?: number;

  costoForm: FormGroup;
  costos: CostoPorProductoDisplay[] = [];
  monedas: Moneda[] = [];
  isLoading = false;
  isEditing = false;
  currentCostoId?: number;
  displayedColumns: string[] = [
    'moneda',
    'valor',
    'origenCosto',
    'acciones',
  ];

  // For dropdown options
  origenCostoOptions = Object.values(OrigenCosto);

  // Selected currency for the currency input component
  selectedMoneda: Moneda | null = null;
  defaultMonedaSimbolo = '$';

  get hasDialog(): boolean {
    return !!this.dialogRef;
  }

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private decimalPipe: DecimalPipe,
    @Optional() public dialogRef: MatDialogRef<CreateEditCostoPorProductoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: DialogData,
    public currencyConfigService: CurrencyConfigService
  ) {
    if (this.dialogData) {
      if (this.dialogData.productoId) {
        this.productoId = this.dialogData.productoId;
      }

      if (this.dialogData.editMode && this.dialogData.costo) {
        this.isEditing = true;
        this.currentCostoId = this.dialogData.costo.id;
      }
    }

    this.costoForm = this.fb.group({
      monedaId: ['', Validators.required],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      origenCosto: [OrigenCosto.MANUAL, Validators.required],
    });
  }

  ngOnInit(): void {
    if (!this.productoId && !this.dialogData?.productoId) {
      this.snackBar.open('Error: No se especificó el producto', 'Cerrar', { 
        duration: 3000 
      });
      
      if (this.dialogRef) {
        this.dialogRef.close({
          success: false,
          message: 'No se especificó el producto'
        });
      }
      return;
    }

    // If productoId is not set but available in dialogData, use it
    if (!this.productoId && this.dialogData?.productoId) {
      this.productoId = this.dialogData.productoId;
    }

    this.loadMonedas();
    this.loadCostos();

    // Pre-fill form if editing
    if (this.isEditing && this.dialogData?.costo) {
      let valorToSet = this.dialogData.costo.valor;

      // Round for PYG currency
      if (
        this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
      ) {
        valorToSet = Math.round(valorToSet);
      }

      this.costoForm.patchValue({
        monedaId: this.dialogData.costo.monedaId,
        valor: valorToSet,
        origenCosto: this.dialogData.costo.origenCosto,
      });
    }
  }

  /**
   * Format a value based on currency type
   */
  formatCurrencyValue(value: number): string {
    return this.currencyConfigService.formatCurrencyByMoneda(
      value,
      this.selectedMoneda
    );
  }

  /**
   * Update the selected moneda when the dropdown changes
   */
  onMonedaChange(): void {
    const monedaId = this.costoForm.get('monedaId')?.value;
    this.selectedMoneda = this.monedas.find((m) => m.id === monedaId) || null;

    // Update default currency symbol if a valid currency is selected
    if (this.selectedMoneda?.simbolo) {
      this.defaultMonedaSimbolo = this.selectedMoneda.simbolo;
    }

    // For PYG, we should round the value
    if (
      this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
      this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
    ) {
      const currentValue = this.costoForm.get('valor')?.value;
      if (currentValue) {
        this.costoForm.get('valor')?.setValue(Math.round(currentValue));
      }
    }
  }

  async loadMonedas(): Promise<void> {
    this.isLoading = true;
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      if (this.monedas.length > 0) {
        const defaultMoneda =
          this.monedas.find((m) => m.principal) || this.monedas[0];
        this.costoForm.get('monedaId')?.setValue(defaultMoneda.id);

        if (defaultMoneda.simbolo) {
          this.defaultMonedaSimbolo = defaultMoneda.simbolo;
        }

        // Set the selected moneda
        this.selectedMoneda = defaultMoneda;
      }
    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar las monedas', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async loadCostos(): Promise<void> {
    if (!this.productoId) return;

    this.isLoading = true;
    try {
      const costos = await firstValueFrom(
        this.repositoryService.getCostosPorProductoByProducto(this.productoId)
      );
      await this.loadCostoDetails(costos);
    } catch (error) {
      console.error('Error loading costos:', error);
      this.snackBar.open('Error al cargar los costos', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCostoDetails(costos: CostoPorProducto[]): Promise<void> {
    const displayableCostos: CostoPorProductoDisplay[] = [];

    for (const costo of costos) {
      try {
        costo.moneda = await firstValueFrom(
          this.repositoryService.getMoneda(costo.monedaId)
        );

        // Pre-format the currency value to avoid using function in template
        const displayCosto = costo as CostoPorProductoDisplay;
        displayCosto.formattedValue =
          this.currencyConfigService.formatCurrencyByMoneda(
            costo.valor,
            costo.moneda
          );

        displayableCostos.push(displayCosto);
      } catch (error) {
        console.error(`Error loading details for costo ${costo.id}:`, error);
      }
    }

    this.costos = displayableCostos;
  }

  async saveCosto(): Promise<void> {
    if (this.costoForm.invalid) return;

    if (!this.productoId) {
      this.snackBar.open(
        'Error: No se especificó el producto',
        'Cerrar',
        { duration: 3000 }
      );
      return;
    }

    this.isLoading = true;
    const formValue = { ...this.costoForm.value };

    // Ensure PYG values are rounded
    if (
      this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
      this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
    ) {
      formValue.valor = Math.round(formValue.valor);
    }

    try {
      let newCostoId;

      if (this.isEditing && this.currentCostoId) {
        await firstValueFrom(
          this.repositoryService.updateCostoPorProducto(this.currentCostoId, {
            ...formValue,
          })
        );

        newCostoId = this.currentCostoId;
        this.snackBar.open('Costo actualizado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      } else {
        const newCostoData = {
          ...formValue,
          productoId: this.productoId,
        };

        const result = await firstValueFrom(
          this.repositoryService.createCostoPorProducto(newCostoData)
        );

        newCostoId = result.id;
        this.snackBar.open('Costo creado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      }

      this.loadCostos();
      this.resetForm();

      if (this.dialogRef) {
        this.dialogRef.close({
          success: true,
          costoId: newCostoId,
          productoId: this.productoId,
        });
      }
    } catch (error) {
      console.error('Error saving costo:', error);
      this.snackBar.open('Error al guardar el costo', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  editCosto(costo: CostoPorProducto): void {
    this.isEditing = true;
    this.currentCostoId = costo.id;

    this.costoForm.patchValue({
      monedaId: costo.monedaId,
      valor: costo.valor,
      origenCosto: costo.origenCosto,
    });

    // Update selected moneda based on the costo's monedaId
    this.selectedMoneda =
      this.monedas.find((m) => m.id === costo.monedaId) || null;
  }

  async deleteCosto(costo: CostoPorProducto): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar este costo?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deleteCostoPorProducto(costo.id));

      this.snackBar.open('Costo eliminado exitosamente', 'Cerrar', {
        duration: 3000,
      });

      this.loadCostos();
    } catch (error) {
      console.error('Error deleting costo:', error);
      this.snackBar.open('Error al eliminar el costo', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentCostoId = undefined;

    const defaultMonedaId =
      this.monedas.length > 0
        ? this.monedas.find((m) => m.principal)?.id || this.monedas[0].id
        : '';

    this.costoForm.reset({
      monedaId: defaultMonedaId,
      valor: 0,
      origenCosto: OrigenCosto.MANUAL,
    });

    // Reset selected moneda to default
    const defaultMoneda =
      this.monedas.find((m) => m.id === defaultMonedaId) || null;
    this.selectedMoneda = defaultMoneda;
  }

  closeDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close({
        success: false,
      });
    }
  }
} 