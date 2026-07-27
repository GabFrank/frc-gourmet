import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ReportePeriodoParams, RANGO_PRESETS } from '../reporte-models';

/**
 * Control de período compartido por las pantallas de Reportes. Presets +
 * personalizado + comparar vs período anterior + moneda. NO filtra en vivo:
 * emite `(aplicar)` solo al tocar "Aplicar" (o al iniciar con el default).
 */
@Component({
  selector: 'app-reporte-periodo-control',
  templateUrl: './reporte-periodo-control.component.html',
  styleUrls: ['./reporte-periodo-control.component.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatSlideToggleModule, MatDatepickerModule, MatNativeDateModule, MatFormFieldModule, MatInputModule,
  ],
})
export class ReportePeriodoControlComponent implements OnInit {
  /** Etiqueta del rango resuelto que devuelve el backend (ej: "1 – 27 Jul 2026"). */
  @Input() rangoLabel = '';
  @Input() comparaLabel: string | null = null;
  @Output() aplicar = new EventEmitter<ReportePeriodoParams>();

  presets = RANGO_PRESETS;
  rango = 'month';
  comparar = true;
  monedaId: number | null = null;
  desde: Date | null = null;
  hasta: Date | null = null;
  monedas: any[] = [];

  constructor(private repository: RepositoryService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.monedas = (await firstValueFrom(this.repository.getMonedas())) || [];
      const principal = this.monedas.find((m: any) => m.principal) || this.monedas[0];
      this.monedaId = principal?.id ?? null;
    } catch (e) {
      console.error('Error cargando monedas', e);
    }
    // Emisión inicial con el default (Mes, comparar).
    this.emitir();
  }

  seleccionarRango(value: string): void {
    this.rango = value;
    if (value !== 'custom') this.emitir();
  }

  emitir(): void {
    if (this.rango === 'custom' && (!this.desde || !this.hasta)) return;
    this.aplicar.emit({
      rango: this.rango,
      desde: this.desde ? this.desde.toISOString() : undefined,
      hasta: this.hasta ? this.hasta.toISOString() : undefined,
      comparar: this.comparar,
      monedaId: this.monedaId ?? undefined,
    });
  }
}
