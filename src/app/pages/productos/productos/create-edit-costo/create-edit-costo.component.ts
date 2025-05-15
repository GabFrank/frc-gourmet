import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
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
import { Producto } from '../../../../database/entities/productos/producto.entity';

interface DialogData {
  producto: Producto;
  costo?: CostoPorProducto;
  editMode?: boolean;
}

interface CostoDisplay {
  id: number;
  productoId: number;
  origenCosto: OrigenCosto;
  monedaId: number;
  valor: number;
  moneda?: Moneda;
  updatedAt?: Date;
  createdAt?: Date;
  formattedValue: string;
  principal: boolean;
}

@Component({
  selector: 'app-create-edit-costo',
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
  templateUrl: './create-edit-costo.component.html',
  styleUrls: ['./create-edit-costo.component.scss']
})
export class CreateEditCostoComponent implements OnInit, OnChanges {
  @Input() productoId?: number;

  costoForm: FormGroup;
  costos: CostoDisplay[] = [];
  monedas: Moneda[] = [];
  isLoading = false;
  isEditing = false;
  currentCostoId?: number;
  displayedColumns: string[] = [
    'moneda',
    'valor',
    'origen',
    'principal',
    'fechaActualizacion',
    'acciones',
  ];

  // Origin cost options
  origenCostoOptions = Object.values(OrigenCosto);

  // Selected currency for the currency input component
  selectedMoneda: Moneda | null = null;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private decimalPipe: DecimalPipe,
    @Optional() public dialogRef: MatDialogRef<CreateEditCostoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: DialogData,
    public currencyConfigService: CurrencyConfigService
  ) {
    if (this.dialogData) {
      if (this.dialogData.producto) {
        this.productoId = this.dialogData.producto?.id;
      }

      if (this.dialogData.editMode && this.dialogData.costo) {
        this.isEditing = true;
        this.currentCostoId = this.dialogData.costo.id;
      }
    }

    this.costoForm = this.fb.group({
      monedaId: ['', Validators.required],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      origenCosto: [OrigenCosto.MANUAL],
      principal: [true]
    });
  }

  ngOnInit(): void {
    this.loadMonedas();

    // Load costs if product ID is provided
    if (this.productoId) {
      this.loadCostos();
    }

    // Pre-fill form if editing
    if (this.isEditing && this.dialogData?.costo) {
      let valorToSet = this.dialogData.costo.valor;

      // Round for PYG currency
      if (
        this.dialogData.costo.moneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.dialogData.costo.moneda?.denominacion?.toUpperCase() === 'GUARANI'
      ) {
        valorToSet = Math.round(valorToSet);
      }

      this.costoForm.patchValue({
        monedaId: this.dialogData.costo.monedaId,
        valor: valorToSet,
        origenCosto: this.dialogData.costo.origenCosto,
        principal: this.dialogData.costo.principal
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productoId'] && this.productoId) {
      this.loadCostos();
    }
  }

  /**
   * Handle moneda change
   */
  onMonedaChange(): void {
    const monedaId = this.costoForm.get('monedaId')?.value;
    if (monedaId) {
      this.selectedMoneda = this.monedas.find(m => m.id === monedaId) || null;
    } else {
      this.selectedMoneda = null;
    }
  }

  /**
   * Load available currencies
   */
  async loadMonedas(): Promise<void> {
    try {
      this.isLoading = true;
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      
      // Select first moneda by default if available
      if (this.monedas.length > 0 && !this.costoForm.get('monedaId')?.value) {
        this.costoForm.get('monedaId')?.setValue(this.monedas[0].id);
        this.onMonedaChange();
      }
    } catch (error) {
      console.error('Error loading currencies:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load costs for the product
   */
  async loadCostos(): Promise<void> {
    if (!this.productoId) return;
    
    try {
      this.isLoading = true;
      const costos = await firstValueFrom(this.repositoryService.getCostosPorProductoByProducto(this.productoId));
      await this.loadCostoDetails(costos);
    } catch (error) {
      console.error(`Error loading costs for product ${this.productoId}:`, error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load detailed cost information including currency formatting
   */
  private async loadCostoDetails(costos: CostoPorProducto[]): Promise<void> {
    const costosDisplay: CostoDisplay[] = [];
    
    for (const costo of costos) {
      // Ensure moneda is loaded
      if (!costo.moneda && costo.monedaId) {
        try {
          costo.moneda = await firstValueFrom(this.repositoryService.getMoneda(costo.monedaId));
        } catch (error) {
          console.error(`Error loading moneda ${costo.monedaId}:`, error);
        }
      }
      
      // Format currency value
      const formattedValue = this.formatCurrencyValue(costo.valor);
      
      const display: CostoDisplay = {
        id: costo.id,
        productoId: costo.productoId,
        origenCosto: costo.origenCosto,
        monedaId: costo.monedaId,
        valor: costo.valor,
        moneda: costo.moneda,
        updatedAt: costo.updatedAt,
        createdAt: costo.createdAt,
        formattedValue,
        principal: costo.principal
      };
      
      costosDisplay.push(display);
    }
    
    this.costos = costosDisplay;
  }

  /**
   * Format a value based on currency type
   */
  formatCurrencyValue(value: number): string {
    if (!value && value !== 0) return '';
    
    return this.decimalPipe.transform(value, '1.0-2') || '';
  }

  /**
   * Save or update a cost
   */
  async saveCosto(): Promise<void> {
    if (this.costoForm.invalid) return;
    
    try {
      this.isLoading = true;
      
      const formValue = this.costoForm.value;
      const costo: Partial<CostoPorProducto> = {
        monedaId: formValue.monedaId,
        valor: formValue.valor,
        origenCosto: formValue.origenCosto,
        principal: formValue.principal
      };
      
      if (this.productoId) {
        costo.productoId = this.productoId;
      }

      // If this cost is set as principal and principal is true
      // The backend will handle setting other costs principal to false
      
      if (this.isEditing && this.currentCostoId) {
        // Update existing cost
        await firstValueFrom(this.repositoryService.updateCostoPorProducto(this.currentCostoId, costo));
        
        this.snackBar.open('Costo actualizado correctamente', 'Cerrar', {
          duration: 3000
        });
        
        // Reset editing state
        this.isEditing = false;
        this.currentCostoId = undefined;
      } else {
        // Create new cost
        await firstValueFrom(this.repositoryService.createCostoPorProducto(costo));
        
        this.snackBar.open('Costo agregado correctamente', 'Cerrar', {
          duration: 3000
        });
      }
      
      // Reset form and reload data
      this.resetForm();
      await this.loadCostos();
      
      // Close dialog with success if applicable
      if (this.dialogRef) {
        this.dialogRef.close({ success: true });
      }
    } catch (error) {
      console.error('Error saving cost:', error);
      this.snackBar.open('Error al guardar el costo', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Edit an existing cost
   */
  editCosto(costo: CostoDisplay): void {
    this.isEditing = true;
    this.currentCostoId = costo.id;
    
    let valorToSet = costo.valor;
    
    // Round for PYG currency
    if (
      costo.moneda?.denominacion?.toUpperCase() === 'PYG' ||
      costo.moneda?.denominacion?.toUpperCase() === 'GUARANI'
    ) {
      valorToSet = Math.round(valorToSet);
    }
    
    this.costoForm.patchValue({
      monedaId: costo.monedaId,
      valor: valorToSet,
      origenCosto: costo.origenCosto,
      principal: costo.principal
    });
    
    this.onMonedaChange();
  }

  /**
   * Delete a cost
   */
  async deleteCosto(costo: CostoDisplay): Promise<void> {
    try {
      this.isLoading = true;
      await firstValueFrom(this.repositoryService.deleteCostoPorProducto(costo.id));
      this.snackBar.open('Costo eliminado con éxito', 'Cerrar', { duration: 3000 });
      await this.loadCostos();
    } catch (error) {
      console.error(`Error deleting cost ${costo.id}:`, error);
      this.snackBar.open('Error al eliminar el costo', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Cancel editing and reset form
   */
  cancelEdit(): void {
    this.isEditing = false;
    this.currentCostoId = undefined;
    this.resetForm();
  }

  /**
   * Reset the form to default values
   */
  resetForm(): void {
    // Find default moneda (first one)
    const defaultMonedaId = this.monedas.length > 0 ? this.monedas[0].id : '';
    
    this.costoForm.reset({
      monedaId: defaultMonedaId,
      valor: 0,
      origenCosto: OrigenCosto.MANUAL,
      principal: true
    });
    
    this.isEditing = false;
    this.currentCostoId = undefined;
    this.onMonedaChange();
  }

  /**
   * Close the dialog
   */
  closeDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }
}