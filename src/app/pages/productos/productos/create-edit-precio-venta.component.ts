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
import { RepositoryService } from '../../../database/repository.service';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { PresentacionSabor } from '../../../database/entities/productos/presentacion-sabor.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../../database/entities/financiero/tipo-precio.entity';
import { firstValueFrom } from 'rxjs';
import { CurrencyInputComponent } from '../../../shared/components/currency-input/currency-input.component';
import { CurrencyConfigService } from '../../../shared/services/currency-config.service';

interface DialogData {
  presentacion?: Presentacion;
  presentacionSabor?: PresentacionSabor;
  precio?: PrecioVenta;
  editMode?: boolean;
  recipeCost?: number;
  suggestedPrice?: number;
}

interface PrecioVentaDisplay extends PrecioVenta {
  formattedValue: string;
  cmv: number;
}

@Component({
  selector: 'app-create-edit-precio-venta',
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
  templateUrl: './create-edit-precio-venta.component.html',
  styleUrls: ['./create-edit-precio-venta.component.scss'],
})
export class CreateEditPrecioVentaComponent implements OnInit, OnChanges {
  @Input() presentacion?: Presentacion;
  @Input() presentacionSabor?: PresentacionSabor;

  precioForm: FormGroup;
  precios: PrecioVentaDisplay[] = [];
  monedas: Moneda[] = [];
  tipoPrecios: TipoPrecio[] = [];
  isLoading = false;
  isEditing = false;
  currentPrecioId?: number;
  displayedColumns: string[] = [
    'moneda',
    'valor',
    'cmv',
    'tipoPrecio',
    'principal',
    'activo',
    'acciones',
  ];

  // Recipe cost and suggested price
  recipeCost = 0;
  suggestedPrice = 0;
  defaultMonedaSimbolo = '$';

  // Selected currency for the currency input component
  selectedMoneda: Moneda | null = null;

  // Add a new property to store the formatted suggested price
  formattedSuggestedPrice = '';

  // Property to store the hint text
  hintText = '';

  get contextTitle(): string {
    if (this.presentacionSabor) {
      return 'Precios de Sabor';
    }
    return 'Precios de Presentación';
  }

  get hasDialog(): boolean {
    return !!this.dialogRef;
  }

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private decimalPipe: DecimalPipe,
    @Optional() public dialogRef: MatDialogRef<CreateEditPrecioVentaComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: DialogData,
    public currencyConfigService: CurrencyConfigService
  ) {
    if (this.dialogData) {
      if (this.dialogData.presentacion) {
        this.presentacion = this.dialogData.presentacion;
      }

      if (this.dialogData.presentacionSabor) {
        this.presentacionSabor = this.dialogData.presentacionSabor;
      }

      if (this.dialogData.editMode && this.dialogData.precio) {
        this.isEditing = true;
        this.currentPrecioId = this.dialogData.precio.id;
      }

      if (this.dialogData.recipeCost !== undefined) {
        this.recipeCost = this.dialogData.recipeCost;
      }

      if (this.dialogData.suggestedPrice !== undefined) {
        console.log(this.dialogData.suggestedPrice );

        this.suggestedPrice = this.dialogData.suggestedPrice;
      }
    }

    this.precioForm = this.fb.group({
      monedaId: ['', Validators.required],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      tipoPrecioId: [null],
      principal: [false],
      activo: [true],
    });
  }

  ngOnInit(): void {
    this.loadMonedas();
    this.loadTipoPrecios();

    // Load prices based on which entity type we have
    if (this.presentacion?.id) {
      this.loadPrecios();
    } else if (this.presentacionSabor?.id) {
      this.loadPreciosByPresentacionSabor();
    }

    // Pre-populate valor field with suggested price if available
    if (this.suggestedPrice > 0 && this.precioForm.get('valor')?.value === 0) {
      let valueToSet = this.suggestedPrice;

      // Round for PYG currency
      if (
        this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
      ) {
        valueToSet = Math.round(valueToSet);
      }

      this.precioForm.get('valor')?.setValue(valueToSet);
    }

    // Pre-fill form if editing
    if (this.isEditing && this.dialogData?.precio) {
      let valorToSet = this.dialogData.precio.valor;

      // Round for PYG currency
      if (
        this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
      ) {
        valorToSet = Math.round(valorToSet);
      }

      this.precioForm.patchValue({
        monedaId: this.dialogData.precio.monedaId,
        valor: valorToSet,
        tipoPrecioId: this.dialogData.precio.tipoPrecioId,
        principal: this.dialogData.precio.principal,
        activo: this.dialogData.precio.activo,
      });
    }

    // Format the suggested price once
    if (this.suggestedPrice > 0) {
      // this.updateFormattedSuggestedPrice();
      this.updateHintText();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['presentacion'] && this.presentacion?.id) ||
      (changes['presentacionSabor'] && this.presentacionSabor?.id)
    ) {
      if (this.presentacion?.id) {
        this.loadPrecios();
      } else if (this.presentacionSabor?.id) {
        this.loadPreciosByPresentacionSabor();
      }
    }

    // Update formatted price when selectedMoneda or suggestedPrice changes
    if (changes['selectedMoneda'] || this.suggestedPrice > 0) {
      // this.updateFormattedSuggestedPrice();
      this.updateHintText();
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
    const monedaId = this.precioForm.get('monedaId')?.value;
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
      const currentValue = this.precioForm.get('valor')?.value;
      if (currentValue) {
        this.precioForm.get('valor')?.setValue(Math.round(currentValue));
      }
    }

    // Update formatted suggested price when currency changes
    // this.updateFormattedSuggestedPrice();
    this.updateHintText();
  }

  async loadMonedas(): Promise<void> {
    this.isLoading = true;
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      if (this.monedas.length > 0) {
        const defaultMoneda =
          this.monedas.find((m) => m.principal) || this.monedas[0];
        this.precioForm.get('monedaId')?.setValue(defaultMoneda.id);

        if (defaultMoneda.simbolo) {
          this.defaultMonedaSimbolo = defaultMoneda.simbolo;
        }

        // Set the selected moneda
        this.selectedMoneda = defaultMoneda;
        this.updateHintText();
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

  async loadTipoPrecios(): Promise<void> {
    this.isLoading = true;
    try {
      this.tipoPrecios = await firstValueFrom(
        this.repositoryService.getTipoPrecios()
      );
    } catch (error) {
      console.error('Error loading tipo precios:', error);
      this.snackBar.open('Error al cargar los tipos de precio', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async loadPrecios(): Promise<void> {
    if (!this.presentacion?.id) return;

    this.isLoading = true;
    try {
      const precios = await firstValueFrom(
        this.repositoryService.getPreciosVentaByPresentacion(
          this.presentacion.id
        )
      );
      await this.loadPrecioDetails(precios);
    } catch (error) {
      console.error('Error loading precios:', error);
      this.snackBar.open('Error al cargar los precios', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  async loadPreciosByPresentacionSabor(): Promise<void> {
    console.log(this.presentacionSabor);

    if (!this.presentacionSabor?.id) return;

    this.isLoading = true;
    try {
      const precios = await firstValueFrom(
        this.repositoryService.getPreciosVentaByPresentacionSabor(
          this.presentacionSabor.id
        )
      );
      await this.loadPrecioDetails(precios);
    } catch (error) {
      console.error('Error loading precios for presentacion sabor:', error);
      this.snackBar.open('Error al cargar los precios', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPrecioDetails(precios: PrecioVenta[]): Promise<void> {
    const displayablePrecios: PrecioVentaDisplay[] = [];

    for (const precio of precios) {
      try {
        precio.moneda = await firstValueFrom(
          this.repositoryService.getMoneda(precio.monedaId)
        );

        if (precio.tipoPrecioId) {
          precio.tipoPrecio = await firstValueFrom(
            this.repositoryService.getTipoPrecio(precio.tipoPrecioId)
          );
        }

        // Pre-format the currency value to avoid using function in template
        const displayPrecio = precio as PrecioVentaDisplay;
        displayPrecio.formattedValue =
          this.currencyConfigService.formatCurrencyByMoneda(
            precio.valor,
            precio.moneda
          );

        // Calculate food cost percentage (CMV)
        if (this.recipeCost > 0 && precio.valor > 0) {
          displayPrecio.cmv = (this.recipeCost / precio.valor) * 100;
        } else {
          displayPrecio.cmv = 0;
        }

        displayablePrecios.push(displayPrecio);
      } catch (error) {
        console.error(`Error loading details for precio ${precio.id}:`, error);
      }
    }

    this.precios = displayablePrecios;
  }

  async savePrecio(): Promise<void> {
    if (this.precioForm.invalid) return;

    if (!this.presentacion?.id && !this.presentacionSabor?.id) {
      this.snackBar.open(
        'Error: No se especificó presentación o sabor',
        'Cerrar',
        { duration: 3000 }
      );
      return;
    }

    this.isLoading = true;
    const formValue = { ...this.precioForm.value };

    // Ensure PYG values are rounded
    if (
      this.selectedMoneda?.denominacion?.toUpperCase() === 'PYG' ||
      this.selectedMoneda?.denominacion?.toUpperCase() === 'GUARANI'
    ) {
      formValue.valor = Math.round(formValue.valor);
    }

    try {
      if (formValue.principal) {
        for (const precio of this.precios) {
          if (precio.id !== this.currentPrecioId && precio.principal) {
            await firstValueFrom(
              this.repositoryService.updatePrecioVenta(precio.id, {
                principal: false,
              })
            );
          }
        }
      } else if (this.precios.length === 0) {
        formValue.principal = true;
      }

      let newPriceId;

      if (this.isEditing && this.currentPrecioId) {
        await firstValueFrom(
          this.repositoryService.updatePrecioVenta(this.currentPrecioId, {
            ...formValue,
          })
        );

        newPriceId = this.currentPrecioId;
        this.snackBar.open('Precio actualizado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      } else {
        const newPrecioData = {
          ...formValue,
          presentacionId: this.presentacion?.id,
          presentacionSaborId: this.presentacionSabor?.id,
        };

        const result = await firstValueFrom(
          this.repositoryService.createPrecioVenta(newPrecioData)
        );

        newPriceId = result.id;
        this.snackBar.open('Precio creado exitosamente', 'Cerrar', {
          duration: 3000,
        });
      }

      if (this.presentacion?.id) {
        this.loadPrecios();
      } else if (this.presentacionSabor?.id) {
        this.loadPreciosByPresentacionSabor();
      }

      this.resetForm();

      if (this.dialogRef) {
        this.dialogRef.close({
          success: true,
          priceId: newPriceId,
          presentacionId: this.presentacion?.id,
          presentacionSaborId: this.presentacionSabor?.id,
        });
      }
    } catch (error) {
      console.error('Error saving precio:', error);
      this.snackBar.open('Error al guardar el precio', 'Cerrar', {
        duration: 3000,
      });
    } finally {
      this.isLoading = false;
    }
  }

  editPrecio(precio: PrecioVenta): void {
    this.isEditing = true;
    this.currentPrecioId = precio.id;

    this.precioForm.patchValue({
      monedaId: precio.monedaId,
      valor: precio.valor,
      tipoPrecioId: precio.tipoPrecioId,
      principal: precio.principal,
      activo: precio.activo,
    });

    // Update selected moneda based on the price's monedaId
    this.selectedMoneda =
      this.monedas.find((m) => m.id === precio.monedaId) || null;
  }

  async deletePrecio(precio: PrecioVenta): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar este precio?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deletePrecioVenta(precio.id));

      this.snackBar.open('Precio eliminado exitosamente', 'Cerrar', {
        duration: 3000,
      });

      if (this.presentacion?.id) {
        this.loadPrecios();
      } else if (this.presentacionSabor?.id) {
        this.loadPreciosByPresentacionSabor();
      }
    } catch (error) {
      console.error('Error deleting precio:', error);
      this.snackBar.open('Error al eliminar el precio', 'Cerrar', {
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
    this.currentPrecioId = undefined;

    const defaultMonedaId =
      this.monedas.length > 0
        ? this.monedas.find((m) => m.principal)?.id || this.monedas[0].id
        : '';

    this.precioForm.reset({
      monedaId: defaultMonedaId,
      valor: 0,
      tipoPrecioId: null,
      principal: false,
      activo: true,
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

  // Method to update the formatted price
  // updateFormattedSuggestedPrice(): void {
  //   if (this.suggestedPrice > 0) {
  //     // Format with DecimalPipe, then update property
  //     // if moneda is PYG so format with 1.0-0, else format with 1.0-2
  //     let formattedNumber = this.decimalPipe.transform(
  //       this.suggestedPrice,
  //       '1.0-2'
  //     );
  //     if (this.selectedMoneda?.simbolo == 'PYG') {
  //       formattedNumber = this.decimalPipe.transform(
  //         this.suggestedPrice,
  //         '1.0-0'
  //       );
  //     }
  //     this.formattedSuggestedPrice =
  //       formattedNumber || this.suggestedPrice.toString();
  //   } else {
  //     this.formattedSuggestedPrice = '';
  //   }
  // }

  // Method to update the hint text
  updateHintText(): void {
    // Using our injected DecimalPipe
    let formattedNumber = this.decimalPipe.transform(
      this.suggestedPrice,
      '1.0-2'
    );

    if (this.selectedMoneda?.simbolo == 'PYG') {
      formattedNumber = this.decimalPipe.transform(
        this.suggestedPrice,
        '1.0-0'
      );
    }
    this.hintText = `Precio sugerido: ${this.defaultMonedaSimbolo} ${formattedNumber} (CMV: 35%)`;
  }
}
