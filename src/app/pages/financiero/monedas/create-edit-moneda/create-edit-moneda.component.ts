import { Component, Input, OnInit, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { RepositoryService } from '../../../../database/repository.service';
import { Moneda } from '../../../../database/entities/financiero/moneda.entity';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface CountryData {
  flags?: {
    svg?: string;
    png?: string;
  };
  cca2?: string;
}

@Component({
  selector: 'app-create-edit-moneda',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './create-edit-moneda.component.html',
  styleUrls: ['./create-edit-moneda.component.scss']
})
export class CreateEditMonedaComponent implements OnInit {
  @Input() data: any;

  monedaForm: FormGroup;
  isLoading = false;
  isEditing = false;
  moneda?: Moneda;
  submitted = false;
  isDialog = false;
  loadingFlag = false;
  previewFlagUrl: string | null = null;
  errorFetchingFlag = false;
  isOffline = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    @Optional() private dialogRef?: MatDialogRef<CreateEditMonedaComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData?: any
  ) {
    this.monedaForm = this.fb.group({
      denominacion: ['', [Validators.required]],
      simbolo: ['', [Validators.required]],
      countryCode: ['', [Validators.pattern('[A-Za-z]{2}')]],
      flagIcon: [''],
      flagIconBase64: [''],
      principal: [false],
      activo: [true]
    });

    // Check if component is opened in a dialog
    this.isDialog = !!this.dialogRef;

    // Check if device is online
    this.isOffline = !navigator.onLine;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOffline = false;

      // If we have a country code but no flag yet, try to fetch flag
      const countryCode = this.monedaForm.get('countryCode')?.value;
      if (countryCode && countryCode.length === 2 && !this.monedaForm.get('flagIcon')?.value) {
        this.fetchFlagUrl(countryCode);
      }
    });

    window.addEventListener('offline', () => {
      this.isOffline = true;
    });
  }

  ngOnInit(): void {
    // If opened in a dialog, use dialogData, otherwise use Input data
    const inputData = this.isDialog ? this.dialogData : this.data;
    this.setData(inputData);

    // Set up value changes subscription for countryCode
    this.monedaForm.get('countryCode')?.valueChanges.subscribe(code => {
      if (code && code.length === 2) {
        this.fetchFlagUrl(code);
      } else {
        this.previewFlagUrl = null;
      }
    });
  }

  setData(data: any): void {
    if (data && data.moneda) {
      this.moneda = data.moneda;
      this.isEditing = true;

      this.monedaForm.patchValue({
        denominacion: this.moneda?.denominacion || '',
        simbolo: this.moneda?.simbolo || '',
        countryCode: this.moneda?.countryCode || '',
        flagIcon: this.moneda?.flagIcon || '',
        flagIconBase64: this.moneda?.flagIconBase64 || '',
        principal: this.moneda?.principal || false,
        activo: this.moneda?.activo !== undefined ? this.moneda.activo : true
      });

      // Set preview flag - use base64 data if available (offline mode), otherwise use URL
      if (this.isOffline && this.moneda?.flagIconBase64) {
        this.previewFlagUrl = this.moneda.flagIconBase64;
      } else if (this.moneda?.flagIconBase64) {
        this.previewFlagUrl = this.moneda.flagIconBase64;
      } else if (this.moneda?.flagIcon && !this.isOffline) {
        this.previewFlagUrl = this.moneda.flagIcon;
      } else if (this.moneda?.countryCode && !this.isOffline) {
        this.fetchFlagUrl(this.moneda.countryCode);
      }
    }
  }

  fetchFlagUrl(countryCode: string): void {
    // If offline, try to use any existing base64 data
    if (this.isOffline) {
      const base64Data = this.monedaForm.get('flagIconBase64')?.value;
      if (base64Data) {
        this.previewFlagUrl = base64Data;
        this.loadingFlag = false;
        return;
      } else {
        // Show error or fallback placeholder
        this.errorFetchingFlag = true;
        this.loadingFlag = false;
        this.snackBar.open(
          'No se puede cargar la bandera en modo sin conexión porque no hay datos guardados previamente',
          'Cerrar',
          { duration: 5000 }
        );
        return;
      }
    }

    this.loadingFlag = true;
    this.errorFetchingFlag = false;
    this.previewFlagUrl = null;

    // Convert to lowercase for API call
    const code = countryCode.toLowerCase();

    // Direct approach using flagcdn.com
    const directFlagUrl = `https://flagcdn.com/w320/${code}.png`;
    this.previewFlagUrl = directFlagUrl;

    // Download the actual flag image and convert to base64
    this.fetchImageAsBase64(directFlagUrl).then(base64Data => {
      if (base64Data) {
        // Set the base64 data for offline use
        this.monedaForm.patchValue({ flagIconBase64: base64Data });
      }
    }).catch(error => {
      console.error('Error fetching flag image as base64:', error);
    });

    // As a fallback, we can also try to fetch data from restcountries API
    this.http.get<CountryData[]>(`https://restcountries.com/v3.1/alpha/${code}`)
      .pipe(
        catchError(error => {
          console.error('Error fetching country data:', error);
          return [];
        })
      )
      .subscribe((data: any) => {
        this.loadingFlag = false;

        if (data && data.length > 0 && data[0].flags) {
          // Use SVG flag from REST Countries API
          const flagUrl = data[0].flags.svg || data[0].flags.png;
          if (flagUrl) {
            this.previewFlagUrl = flagUrl;
            this.monedaForm.patchValue({ flagIcon: flagUrl });

            // Also download this image as base64 for offline use (prefer SVG if available)
            this.fetchImageAsBase64(flagUrl).then(base64Data => {
              if (base64Data) {
                // Set the base64 data for offline use
                this.monedaForm.patchValue({ flagIconBase64: base64Data });
              }
            }).catch(error => {
              console.error('Error fetching flag image as base64:', error);
            });
          }
        } else {
          // Keep using the direct flag URL if the API call failed
          this.monedaForm.patchValue({ flagIcon: directFlagUrl });
        }
      }, error => {
        this.loadingFlag = false;
        // If the API call fails, still use the direct URL
        this.monedaForm.patchValue({ flagIcon: directFlagUrl });
      });
  }

  /**
   * Fetch an image and convert it to base64
   * @param url The image URL to fetch
   * @returns Promise with the base64 data
   */
  private fetchImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Fetch the image
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          return response.blob();
        })
        .then(blob => {
          // Convert the blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data);
          };
          reader.onerror = () => {
            reject(new Error('Error reading image blob'));
          };
          reader.readAsDataURL(blob);
        })
        .catch(error => {
          console.error('Error fetching image:', error);
          reject(error);
        })
        .finally(() => {
          this.loadingFlag = false;
        });
    });
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    if (this.monedaForm.invalid) {
      this.markFormGroupTouched(this.monedaForm);
      return;
    }

    this.isLoading = true;
    try {
      const formData = {
        ...this.monedaForm.value,
        // Ensure strings are in uppercase
        denominacion: this.monedaForm.value.denominacion?.toUpperCase(),
        simbolo: this.monedaForm.value.simbolo?.toUpperCase(),
        countryCode: this.monedaForm.value.countryCode?.toUpperCase(),
      };

      // If setting as principal, we need to unset other monedas as principal
      let monedas: Moneda[] = [];
      if (formData.principal) {
        monedas = await firstValueFrom(this.repositoryService.getMonedas());

        // If there's already a principal moneda different from the current one
        const existingPrincipal = monedas.find(m =>
          m.principal && (!this.isEditing || m.id !== this.moneda?.id)
        );

        if (existingPrincipal) {
          // Show a warning that another moneda will lose principal status
          this.snackBar.open(
            `La moneda "${existingPrincipal.denominacion}" perderá su estado como moneda principal`,
            'Entendido',
            { duration: 5000 }
          );
        }
      }

      if (this.isEditing && this.moneda) {
        // Update
        await firstValueFrom(
          this.repositoryService.updateMoneda(this.moneda.id!, formData)
        );
        this.snackBar.open('Moneda actualizada con éxito', 'Cerrar', { duration: 3000 });

        // Close dialog with success result if in dialog mode
        if (this.isDialog && this.dialogRef) {
          this.dialogRef.close(true);
        } else {
          this.resetForm();
        }
      } else {
        // Create
        await firstValueFrom(
          this.repositoryService.createMoneda(formData)
        );
        this.snackBar.open('Moneda creada con éxito', 'Cerrar', { duration: 3000 });

        // Close dialog with success result if in dialog mode
        if (this.isDialog && this.dialogRef) {
          this.dialogRef.close(true);
        } else {
          this.resetForm();
        }
      }
    } catch (error) {
      console.error('Error saving moneda:', error);
      this.snackBar.open('Error al guardar moneda', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.submitted = false;
    }
  }

  cancel(): void {
    if (this.isDialog && this.dialogRef) {
      // Close dialog without result if in dialog mode
      this.dialogRef.close(false);
    } else {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.isEditing = false;
    this.moneda = undefined;
    this.previewFlagUrl = null;
    this.monedaForm.reset({
      denominacion: '',
      simbolo: '',
      countryCode: '',
      flagIcon: '',
      flagIconBase64: '',
      principal: false,
      activo: true
    });
    this.submitted = false;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();

      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
}
