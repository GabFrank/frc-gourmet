import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  FacturaImportService,
  IaConfig,
  IaPromptConfigDto,
  IaPromptSugerenciaDto,
} from 'src/app/services/factura-import.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-ia-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './ia-config.component.html',
  styleUrls: ['./ia-config.component.scss'],
})
export class IaConfigComponent implements OnInit {
  loading = false;
  testing = false;
  saving = false;

  // Conexion
  apiKey = '';
  apiKeyMasked = false;
  apiKeyVisible = false;
  modelo = 'gpt-4o';
  habilitado = false;

  modelos: { value: string; label: string; costoEstimado: string }[] = [
    { value: 'gpt-4o', label: 'GPT-4o (recomendado)', costoEstimado: '~USD 0.01 / factura' },
    { value: 'gpt-4o-mini', label: 'GPT-4o-mini (mas economico)', costoEstimado: '~USD 0.002 / factura' },
  ];

  // Prompt
  promptCfg: IaPromptConfigDto | null = null;
  promptBaseExpanded = false;
  nuevaAdicion = '';
  savingAdiciones = false;
  efectivoLengthChars = 0;
  efectivoVersion = 0;

  // Sugerencias
  sugerencias: IaPromptSugerenciaDto[] = [];
  loadingSugerencias = false;
  nuevaSugTexto = '';
  nuevaSugMotivo = '';
  savingSug = false;

  constructor(
    private service: FacturaImportService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
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
        this.loadPromptConfig();
        this.loadSugerencias();
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Error al cargar configuracion: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  loadPromptConfig(): void {
    this.service.iaPromptGet().subscribe({
      next: (cfg) => {
        this.promptCfg = cfg;
        this.refreshEfectivo();
      },
      error: (err) => {
        this.snackBar.open('Error cargando prompt: ' + (err?.message || ''), 'Cerrar', { duration: 4000 });
      },
    });
  }

  refreshEfectivo(): void {
    this.service.iaPromptEffective().subscribe({
      next: (eff) => {
        this.efectivoLengthChars = eff.lengthChars;
        this.efectivoVersion = eff.version;
      },
    });
  }

  loadSugerencias(): void {
    this.loadingSugerencias = true;
    this.service.iaPromptSugerenciaList().subscribe({
      next: (list) => {
        this.sugerencias = list || [];
        this.loadingSugerencias = false;
      },
      error: () => {
        this.loadingSugerencias = false;
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
      // si la key esta enmascarada y el usuario no la cambio, probamos contra la guardada
    } else {
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

  // --- Adiciones ---
  agregarAdicion(): void {
    const txt = (this.nuevaAdicion || '').trim();
    if (!txt || !this.promptCfg) return;
    const adiciones = [...this.promptCfg.adiciones, txt];
    this.persistAdiciones(adiciones, () => {
      this.nuevaAdicion = '';
      this.snackBar.open('Adicion agregada al prompt.', 'Cerrar', { duration: 3000 });
    });
  }

  quitarAdicion(idx: number): void {
    if (!this.promptCfg) return;
    const adiciones = [...this.promptCfg.adiciones];
    adiciones.splice(idx, 1);
    this.persistAdiciones(adiciones, () => {
      this.snackBar.open('Adicion eliminada.', 'Cerrar', { duration: 2500 });
    });
  }

  private persistAdiciones(adiciones: string[], after: () => void): void {
    this.savingAdiciones = true;
    this.service.iaPromptSetAdiciones(adiciones).subscribe({
      next: (res) => {
        this.savingAdiciones = false;
        if (this.promptCfg) {
          this.promptCfg.adiciones = res.adiciones;
          this.promptCfg.version = res.version;
        }
        this.refreshEfectivo();
        after();
      },
      error: (err) => {
        this.savingAdiciones = false;
        this.snackBar.open('Error guardando adiciones: ' + (err?.message || ''), 'Cerrar', { duration: 5000 });
      },
    });
  }

  togglePromptBase(): void {
    this.promptBaseExpanded = !this.promptBaseExpanded;
  }

  // --- Sugerencias ---
  crearSugerencia(): void {
    const texto = (this.nuevaSugTexto || '').trim();
    if (!texto) return;
    this.savingSug = true;
    this.service.iaPromptSugerenciaCreate({ texto, motivo: this.nuevaSugMotivo?.trim() || undefined, origen: 'USUARIO' })
      .subscribe({
        next: (res) => {
          this.savingSug = false;
          if (res.success) {
            this.nuevaSugTexto = '';
            this.nuevaSugMotivo = '';
            this.snackBar.open('Sugerencia creada.', 'Cerrar', { duration: 3000 });
            this.loadSugerencias();
          } else {
            this.snackBar.open('Error: ' + (res.error || ''), 'Cerrar', { duration: 4000 });
          }
        },
        error: (err) => {
          this.savingSug = false;
          this.snackBar.open('Error: ' + (err?.message || ''), 'Cerrar', { duration: 5000 });
        },
      });
  }

  aprobarSugerencia(s: IaPromptSugerenciaDto): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Aprobar sugerencia',
        message: `Esta sugerencia se va a appendear al prompt como adicion. ¿Confirmar?\n\n"${s.texto}"`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.service.iaPromptSugerenciaAprobar(s.id).subscribe({
        next: (res) => {
          if (res.success) {
            this.snackBar.open('Sugerencia aprobada y agregada al prompt.', 'Cerrar', { duration: 3000 });
            this.loadSugerencias();
            this.loadPromptConfig();
          } else {
            this.snackBar.open('Error: ' + (res.error || ''), 'Cerrar', { duration: 4000 });
          }
        },
      });
    });
  }

  rechazarSugerencia(s: IaPromptSugerenciaDto): void {
    this.service.iaPromptSugerenciaRechazar(s.id).subscribe({
      next: (res) => {
        if (res.success) {
          this.snackBar.open('Sugerencia rechazada.', 'Cerrar', { duration: 3000 });
          this.loadSugerencias();
        }
      },
    });
  }

  eliminarSugerencia(s: IaPromptSugerenciaDto): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar sugerencia',
        message: '¿Eliminar definitivamente esta sugerencia?',
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.service.iaPromptSugerenciaDelete(s.id).subscribe({
        next: () => this.loadSugerencias(),
      });
    });
  }
}
