import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { CuentaBancariaDestino } from '../../../database/entities/financiero/cuenta-bancaria-destino.entity';
import { firstValueFrom } from 'rxjs';

/**
 * Selector reutilizable de cuenta bancaria de destino para una persona.
 * 
 * USO:
 * <app-selector-cuenta-destino
 *   [personaId]="proveedor.personaId"
 *   [cuentaSeleccionadaId]="proveedor.cuentaBancariaDefaultId"
 *   (cuentaChange)="onCuentaChange($event)">
 * </app-selector-cuenta-destino>
 */
@Component({
  selector: 'app-selector-cuenta-destino',
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    FormsModule,
  ],
  template: `
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>{{ placeholder || 'Cuenta bancaria de cobro' }}</mat-label>
      
      <mat-select
        [(ngModel)]="selectedId"
        (ngModelChange)="onSelectionChange($event)"
        [disabled]="isLoading || !personaId">
        
        <mat-option [value]="null">
          <em>Sin cuenta bancaria</em>
        </mat-option>
        
        <mat-option *ngFor="let cuenta of cuentas" [value]="cuenta.id">
          {{ formatCuenta(cuenta) }}
        </mat-option>
      </mat-select>

      <mat-spinner
        *ngIf="isLoading"
        diameter="20"
        matSuffix
        style="margin-right: 10px;">
      </mat-spinner>

      <mat-hint *ngIf="!personaId">
        Vinculá una persona primero para asignar cuenta bancaria
      </mat-hint>

      <mat-hint *ngIf="personaId && !isLoading && cuentas.length === 0">
        Esta persona no tiene cuentas bancarias registradas
      </mat-hint>
    </mat-form-field>
  `,
  styles: [`
    .full-width {
      width: 100%;
    }
  `]
})
export class SelectorCuentaDestinoComponent implements OnInit, OnChanges {
  @Input() personaId?: number | null;
  @Input() cuentaSeleccionadaId?: number | null;
  @Input() placeholder?: string;
  @Output() cuentaChange = new EventEmitter<CuentaBancariaDestino | null>();

  cuentas: CuentaBancariaDestino[] = [];
  selectedId: number | null = null;
  isLoading = false;

  constructor(private repositoryService: RepositoryService) {}

  ngOnInit(): void {
    this.selectedId = this.cuentaSeleccionadaId || null;
    if (this.personaId) {
      this.loadCuentas();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['personaId'] && !changes['personaId'].firstChange) {
      const newPersonaId = changes['personaId'].currentValue;
      if (newPersonaId) {
        this.loadCuentas();
      } else {
        this.cuentas = [];
        this.selectedId = null;
        this.cuentaChange.emit(null);
      }
    }

    if (changes['cuentaSeleccionadaId'] && !changes['cuentaSeleccionadaId'].firstChange) {
      this.selectedId = changes['cuentaSeleccionadaId'].currentValue || null;
    }
  }

  async loadCuentas(): Promise<void> {
    if (!this.personaId) {
      this.cuentas = [];
      return;
    }

    this.isLoading = true;
    try {
      this.cuentas = await firstValueFrom(
        this.repositoryService.getCuentasBancariasDestinoByPersona(this.personaId, false)
      );

      // Si solo hay una cuenta activa, autoseleccionarla (solo si no hay preseleccion)
      if (this.cuentas.length === 1 && !this.selectedId) {
        this.selectedId = this.cuentas[0].id!;
        this.emitSelectedCuenta();
      }
    } catch (error) {
      console.error('Error loading cuentas:', error);
      this.cuentas = [];
    } finally {
      this.isLoading = false;
    }
  }

  onSelectionChange(cuentaId: number | null): void {
    this.selectedId = cuentaId;
    this.emitSelectedCuenta();
  }

  private emitSelectedCuenta(): void {
    if (this.selectedId) {
      const cuenta = this.cuentas.find(c => c.id === this.selectedId);
      this.cuentaChange.emit(cuenta || null);
    } else {
      this.cuentaChange.emit(null);
    }
  }

  formatCuenta(cuenta: CuentaBancariaDestino): string {
    const parts: string[] = [];
    
    if (cuenta.banco) parts.push(cuenta.banco);
    if (cuenta.numeroCuenta) parts.push(cuenta.numeroCuenta);
    if (cuenta.moneda) parts.push(`(${cuenta.moneda.denominacion})`);
    if (cuenta.alias) parts.push(`- ${cuenta.alias}`);
    
    return parts.join(' ');
  }
}
