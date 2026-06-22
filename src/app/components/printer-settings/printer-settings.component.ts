import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { PrinterService } from '../../services/printer.service';
import { PrinterConfig } from '../../services/database.service';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-printer-settings',
  templateUrl: './printer-settings.component.html',
  styleUrls: ['./printer-settings.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ]
})
export class PrinterSettingsComponent implements OnInit {
  printerForm: FormGroup;
  printers: PrinterConfig[] = [];
  displayedColumns: string[] = ['name', 'type', 'connectionType', 'address', 'isDefault', 'actions'];
  isLoading = false;
  editingPrinterId: number | null = null;

  // Opciones para los select
  printerTypes = [
    { value: 'epson', displayName: 'Epson' },
    { value: 'star', displayName: 'Star' },
    { value: 'thermal', displayName: 'Térmica genérica' }
  ];

  connectionTypes = [
    { value: 'network', displayName: 'Red / IP' },
    { value: 'lpr', displayName: 'LPR/LPD (Windows compartida)' },
    { value: 'usb', displayName: 'USB' },
    { value: 'bluetooth', displayName: 'Bluetooth' }
  ];

  characterSets = [
    { value: 'PC437_USA', displayName: 'USA (PC437)' },
    { value: 'PC850_MULTILINGUAL', displayName: 'Multilingual (PC850)' },
    { value: 'PC860_PORTUGUESE', displayName: 'Portuguese (PC860)' },
    { value: 'PC863_CANADIAN_FRENCH', displayName: 'Canadian French (PC863)' },
    { value: 'PC865_NORDIC', displayName: 'Nordic (PC865)' },
    { value: 'PC852_LATIN2', displayName: 'Latin 2 (PC852)' },
    { value: 'PC858_EURO', displayName: 'Euro (PC858)' },
    { value: 'SLOVENIA', displayName: 'Slovenia' },
    { value: 'WPC1252', displayName: 'Windows 1252' },
  ];
  
  constructor(
    private fb: FormBuilder,
    private printerService: PrinterService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<PrinterSettingsComponent>
  ) {
    // Initialize form
    this.printerForm = this.createPrinterForm();
  }

  ngOnInit(): void {
    this.loadPrinters();
  }

  /**
   * Create the printer form
   */
  createPrinterForm(printer?: PrinterConfig): FormGroup {
    const form = this.fb.group({
      name: [printer?.name || '', [Validators.required, Validators.maxLength(100)]],
      type: [printer?.type || 'thermal', Validators.required],
      connectionType: [printer?.connectionType || 'network', Validators.required],
      address: [printer?.address || '', Validators.required],
      port: [printer?.port || 9100],
      dpi: [printer?.dpi || 203],
      width: [printer?.width || 58],
      characterSet: [printer?.characterSet || 'PC437_USA'],
      isDefault: [printer?.isDefault || false]
    });
    
    // Add conditional validation for port based on connection type
    const connectionType = form.get('connectionType')?.value;
    this.updatePortValidation(form, connectionType);
    
    // Listen for connection type changes to update port validation
    form.get('connectionType')?.valueChanges.subscribe((type: string | null) => {
      this.updatePortValidation(form, type);
      // Sugerir puerto default según el tipo de conexión
      const portCtrl = form.get('port');
      if (portCtrl) {
        if (type === 'lpr' && (!portCtrl.value || portCtrl.value === 9100)) {
          portCtrl.setValue(515);
        } else if (type === 'network' && (!portCtrl.value || portCtrl.value === 515)) {
          portCtrl.setValue(9100);
        }
      }
    });
    
    return form;
  }
  
  /**
   * Update port validation based on connection type
   */
  private updatePortValidation(form: FormGroup, connectionType: string | null | undefined): void {
    const portControl = form.get('port');
    
    if (!portControl) return;
    
    if (connectionType === 'network' || connectionType === 'lpr') {
      // Network y LPR requieren puerto válido (network=9100, lpr=515 por default)
      portControl.setValidators([Validators.required, Validators.min(1), Validators.max(65535)]);
    } else {
      // USB and Bluetooth don't need a port
      portControl.clearValidators();
    }
    
    portControl.updateValueAndValidity();
  }

  /**
   * Load printers from the service
   */
  loadPrinters(): void {
    this.isLoading = true;
    this.printerService.getPrinters().subscribe(
      printers => {
        // Decoramos cada fila con etiquetas humanizadas (sin function calls en template)
        this.printers = (printers || []).map(p => ({
          ...p,
          typeLabel: this.printerTypes.find(t => t.value === p.type)?.displayName || p.type,
          connectionLabel: this.connectionTypes.find(c => c.value === p.connectionType)?.displayName || p.connectionType,
        })) as any;
        this.isLoading = false;
      },
      error => {
        console.error('Error loading printers:', error);
        this.snackBar.open('No se pudieron cargar las impresoras', 'CERRAR', { duration: 3000 });
        this.isLoading = false;
      }
    );
  }

  /**
   * Handle form submission to add/update printer
   */
  async onSubmit(): Promise<void> {
    if (this.printerForm.valid) {
      this.isLoading = true;
      const printerData = this.printerForm.value as PrinterConfig;
      
      try {
        if (this.editingPrinterId) {
          // Actualizar impresora existente
          const success = await this.printerService.updatePrinter(this.editingPrinterId, printerData);
          if (success) {
            this.snackBar.open('Impresora actualizada correctamente', 'CERRAR', { duration: 3000 });
            this.resetForm();
          } else {
            this.snackBar.open('No se pudo actualizar la impresora', 'CERRAR', { duration: 3000 });
          }
        } else {
          // Agregar nueva impresora
          const success = await this.printerService.addPrinter(printerData);
          if (success) {
            this.snackBar.open('Impresora agregada correctamente', 'CERRAR', { duration: 3000 });
            this.resetForm();
          } else {
            this.snackBar.open('No se pudo agregar la impresora', 'CERRAR', { duration: 3000 });
          }
        }
      } catch (error) {
        console.error('Error saving printer:', error);
        this.snackBar.open('Error al guardar la impresora', 'CERRAR', { duration: 3000 });
      } finally {
        this.isLoading = false;
      }
    }
  }

  /**
   * Edit an existing printer
   */
  editPrinter(printer: PrinterConfig): void {
    this.editingPrinterId = printer.id!;
    this.printerForm = this.createPrinterForm(printer);
  }

  /**
   * Delete a printer
   */
  async deletePrinter(printer: PrinterConfig): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: 'Eliminar impresora',
          message: `¿Confirmás la eliminación de la impresora "${printer.name}"?`,
        },
      }).afterClosed()
    );
    if (!confirmed) return;

    this.isLoading = true;
    try {
      const success = await this.printerService.deletePrinter(printer.id!);
      if (success) {
        this.snackBar.open('Impresora eliminada correctamente', 'CERRAR', { duration: 3000 });
      } else {
        this.snackBar.open('No se pudo eliminar la impresora', 'CERRAR', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error deleting printer:', error);
      this.snackBar.open('Error al eliminar la impresora', 'CERRAR', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Set a printer as default
   */
  async setDefaultPrinter(printer: PrinterConfig): Promise<void> {
    this.isLoading = true;
    try {
      const success = await this.printerService.setDefaultPrinter(printer.id!);
      if (success) {
        this.snackBar.open(`"${printer.name}" definida como predeterminada`, 'CERRAR', { duration: 3000 });
      } else {
        this.snackBar.open('No se pudo definir la impresora predeterminada', 'CERRAR', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error setting default printer:', error);
      this.snackBar.open('Error al definir la impresora predeterminada', 'CERRAR', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Print a test page
   */
  async printTestPage(printer: PrinterConfig): Promise<void> {
    this.isLoading = true;
    try {
      const success = await this.printerService.printTestPage(printer.id!);
      if (success) {
        this.snackBar.open('Página de prueba enviada a la impresora', 'CERRAR', { duration: 3000 });
      } else {
        this.snackBar.open('No se pudo imprimir la página de prueba', 'CERRAR', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error printing test page:', error);
      this.snackBar.open('Error al imprimir la página de prueba', 'CERRAR', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Reset the form to add a new printer
   */
  resetForm(): void {
    this.editingPrinterId = null;
    this.printerForm = this.createPrinterForm();
  }

  /**
   * Close the dialog
   */
  onClose(): void {
    this.dialogRef.close();
  }

  /**
   * Setup a CUPS printer configuration
   */
  setupCupsPrinter(printerName: string = 'ticket-58mm'): void {
    // Reset any previous form
    this.resetForm();
    
    // Set up the CUPS printer configuration with the right type and settings for node-thermal-printer
    this.printerForm.patchValue({
      name: `CUPS ${printerName}`,
      type: 'epson',             // Using 'epson' driver for CUPS printer
      connectionType: 'usb',     // Use USB connection type for CUPS
      address: printerName,      // Just use the printer name for CUPS
      port: null,                // CUPS doesn't need a port
      width: 48,                 // Character width in characters (not mm)
      dpi: 203,                  // Standard DPI for most thermal printers
      characterSet: 'PC437_USA', // Use a standard character set supported by the library
      isDefault: true
    });
    
    // Ensure the form updates validation based on the new connection type
    this.updatePortValidation(this.printerForm, 'usb');
    
    this.snackBar.open(`Configuración CUPS cargada para ${printerName}. Hacé clic en Guardar para agregarla.`, 'OK', { duration: 5000 });
  }
} 