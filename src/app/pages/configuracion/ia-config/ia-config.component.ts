import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FacturaImportService, IaConfig } from 'src/app/services/factura-import.service';

@Component({
  selector: 'app-ia-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './ia-config.component.html',
  styleUrls: ['./ia-config.component.scss'],
})
export class IaConfigComponent implements OnInit {
  loading = false;
  testing = false;
  saving = false;

  apiKey = '';
  apiKeyMasked = false;
  apiKeyVisible = false;
  modelo = 'gpt-4o';
  habilitado = false;

  modelos: { value: string; label: string; costoEstimado: string }[] = [
    { value: 'gpt-4o', label: 'GPT-4o (recomendado)', costoEstimado: '~USD 0.01 / factura' },
    { value: 'gpt-4o-mini', label: 'GPT-4o-mini (mas economico)', costoEstimado: '~USD 0.002 / factura' },
  ];

  constructor(
    private service: FacturaImportService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get costoSeleccionado(): string {
    const m = this.modelos.find(m => m.value === this.modelo);
    return m?.costoEstimado || '';
  }

  load(): void {
    this.loading = true;
    this.service.iaConfigGet().subscribe({
      next: (cfg: IaConfig) => {
        this.apiKey = cfg.openaiApiKey || '';
        this.apiKeyMasked = this.apiKey === '***';
        this.modelo = cfg.modelo || 'gpt-4o';
        this.habilitado = !!cfg.habilitado;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Error al cargar configuracion: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  toggleApiKeyVisible(): void {
    this.apiKeyVisible = !this.apiKeyVisible;
  }

  guardar(): void {
    this.saving = true;
    const payload: Partial<IaConfig> = {
      modelo: this.modelo,
      habilitado: this.habilitado,
    };
    if (this.apiKey && this.apiKey !== '***') {
      payload.openaiApiKey = this.apiKey;
    }
    this.service.iaConfigSet(payload).subscribe({
      next: (res) => {
        this.saving = false;
        if (res.success) {
          this.apiKey = res.config.openaiApiKey || '';
          this.apiKeyMasked = this.apiKey === '***';
          this.snackBar.open('Configuracion guardada.', 'Cerrar', { duration: 3000 });
        } else {
          this.snackBar.open('No se pudo guardar.', 'Cerrar', { duration: 4000 });
        }
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Error al guardar: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  probar(): void {
    if (!this.apiKey || this.apiKey === '***') {
      // Si la key vino enmascarada y el usuario no la cambio, igual probamos contra la guardada
    } else {
      // Guardamos antes de probar para que el handler lea desde disco
      this.guardarSilencioso(() => this.runTest());
      return;
    }
    this.runTest();
  }

  private guardarSilencioso(after: () => void): void {
    const payload: Partial<IaConfig> = { modelo: this.modelo, habilitado: this.habilitado };
    if (this.apiKey && this.apiKey !== '***') payload.openaiApiKey = this.apiKey;
    this.service.iaConfigSet(payload).subscribe({
      next: () => after(),
      error: () => after(),
    });
  }

  private runTest(): void {
    this.testing = true;
    this.service.iaConfigTest().subscribe({
      next: (res) => {
        this.testing = false;
        if (res.success) {
          this.snackBar.open(`Conexion OK. ${res.latencyMs}ms`, 'Cerrar', { duration: 4000, panelClass: ['snack-success'] });
        } else {
          this.snackBar.open(`Error: ${res.message}`, 'Cerrar', { duration: 6000, panelClass: ['snack-error'] });
        }
      },
      error: (err) => {
        this.testing = false;
        this.snackBar.open('Error: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
