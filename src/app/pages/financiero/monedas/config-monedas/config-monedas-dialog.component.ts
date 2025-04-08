import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { RepositoryService } from 'src/app/database/repository.service';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { CajaMoneda } from 'src/app/database/entities/financiero/caja-moneda.entity';

interface MonedaWithConfig {
  id?: number;
  cajaMonedaId?: number;
  monedaId: number;
  denominacion: string;
  simbolo: string;
  activo: boolean;
  predeterminado: boolean;
  orden?: number;
}

@Component({
  selector: 'app-config-monedas-dialog',
  templateUrl: './config-monedas-dialog.component.html',
  styleUrls: ['./config-monedas-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSortModule,
    MatTooltipModule,
    FormsModule,
    DragDropModule
  ]
})
export class ConfigMonedasDialogComponent implements OnInit {
  displayedColumns: string[] = ['drag', 'denominacion', 'simbolo', 'activo', 'predeterminado'];
  monedas: MonedaWithConfig[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<ConfigMonedasDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    this.error = null;

    // Load both monedas and caja-monedas
    this.repositoryService.getMonedas().subscribe(
      monedas => {
        // Get existing caja-monedas config
        this.repositoryService.getCajasMonedas().subscribe(
          cajaMonedas => {
            this.processMonedasData(monedas, cajaMonedas);
            this.loading = false;
          },
          error => {
            console.error('Error loading cajas monedas:', error);
            this.error = 'Error al cargar la configuración de monedas para cajas';
            this.loading = false;
          }
        );
      },
      error => {
        console.error('Error loading monedas:', error);
        this.error = 'Error al cargar las monedas';
        this.loading = false;
      }
    );
  }

  private processMonedasData(monedas: Moneda[], cajaMonedas: CajaMoneda[]): void {
    // Create a map of monedaId -> cajaMoneda for quick lookup
    const cajaMonedaMap = new Map<number, CajaMoneda>();
    cajaMonedas.forEach(cm => {
      if (cm.moneda && cm.moneda.id) {
        cajaMonedaMap.set(cm.moneda.id, cm);
      }
    });

    // Create the combined data
    this.monedas = monedas.map((moneda, index) => {
      const cajaMoneda = cajaMonedaMap.get(moneda.id!);

      return {
        id: moneda.id,
        cajaMonedaId: cajaMoneda?.id,
        monedaId: moneda.id!,
        denominacion: moneda.denominacion,
        simbolo: moneda.simbolo,
        activo: cajaMoneda ? cajaMoneda.activo : false,
        predeterminado: cajaMoneda ? cajaMoneda.predeterminado : false,
        orden: cajaMoneda && cajaMoneda.orden ? parseInt(cajaMoneda.orden) : index + 1
      };
    });

    // Sort by orden
    this.monedas.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }

  sortData(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.monedas = this.monedas.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'denominacion': return this.compare(a.denominacion, b.denominacion, isAsc);
        case 'simbolo': return this.compare(a.simbolo, b.simbolo, isAsc);
        default: return 0;
      }
    });
  }

  private compare(a: string, b: string, isAsc: boolean): number {
    return (a.toLowerCase() < b.toLowerCase() ? -1 : 1) * (isAsc ? 1 : -1);
  }

  drop(event: CdkDragDrop<string[]>): void {
    moveItemInArray(this.monedas, event.previousIndex, event.currentIndex);

    // Update order values after drag and drop
    this.monedas.forEach((moneda, index) => {
      moneda.orden = index + 1;
    });
  }

  togglePredeterminado(monedaConfig: MonedaWithConfig): void {
    if (monedaConfig.predeterminado) {
      // If turning off, allow it
      monedaConfig.predeterminado = false;
    } else {
      // If turning on, turn off all others
      this.monedas.forEach(m => {
        m.predeterminado = false;
      });
      monedaConfig.predeterminado = true;

      // Also ensure it's active
      monedaConfig.activo = true;
    }
  }

  saveChanges(): void {
    this.saving = true;

    // Prepare the data for saving
    const updates = this.monedas.map(moneda => {
      return {
        id: moneda.cajaMonedaId,
        monedaId: moneda.monedaId,
        activo: moneda.activo,
        predeterminado: moneda.predeterminado,
        orden: moneda.orden?.toString().padStart(3, '0')
      };
    });

    console.log('Saving CajaMoneda updates:', updates);

    // Call the repository service to save the changes
    this.repositoryService.saveCajasMonedas(updates).subscribe(
      result => {
        console.log('CajaMoneda save result:', result);
        this.saving = false;
        this.snackBar.open('Configuración guardada exitosamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
        this.dialogRef.close({ success: true, result });
      },
      error => {
        console.error('Error saving cajas monedas:', error);
        this.saving = false;
        this.snackBar.open('Error al guardar la configuración', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
      }
    );
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
