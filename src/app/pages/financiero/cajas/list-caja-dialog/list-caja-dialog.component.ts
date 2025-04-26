import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { MatSelectModule } from '@angular/material/select';

import { RepositoryService } from '../../../../database/repository.service';
import { Caja, CajaEstado } from '../../../../database/entities/financiero/caja.entity';

@Component({
  selector: 'app-list-caja-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    FormsModule,
    MatSnackBarModule,
    MatIconModule,
    MatSelectModule
  ],
  templateUrl: './list-caja-dialog.component.html',
  styleUrls: ['./list-caja-dialog.component.scss']
})
export class ListCajaDialogComponent implements OnInit {
  displayedColumns: string[] = ['nombreCajero', 'dispositivo', 'fechaApertura', 'acciones'];
  dataSource: Caja[] = [];
  filteredData: Caja[] = [];
  isLoading = false;
  
  // Filter control
  cajeroFilterControl = new FormControl('');
  
  // Properties for creating a new caja
  showNewCajaForm = false;
  dispositivos: any[] = [];
  selectedDispositivoId: number | null = null;
  isCreatingCaja = false;
  
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<Caja>;

  constructor(
    private repositoryService: RepositoryService,
    private dialogRef: MatDialogRef<ListCajaDialogComponent>,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Load cajas on init
    this.loadCajas();
    
    // Setup filter listener
    this.cajeroFilterControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.applyFilter();
      });
      
    // Load dispositivos for creating new cajas
    this.loadDispositivos();
  }

  async loadCajas(): Promise<void> {
    try {
      this.isLoading = true;
      
      // Get all cajas from repository using firstValueFrom instead of toPromise
      const allCajas = await firstValueFrom(this.repositoryService.getCajas());
      
      // Filter to only include cajas with estado ABIERTO
      this.dataSource = allCajas.filter(caja => caja.estado === CajaEstado.ABIERTO);
      this.filteredData = [...this.dataSource];
      
      if (this.dataSource.length === 0) {
        this.showMessage('No hay cajas abiertas disponibles');
      }
    } catch (error: any) {
      console.error('Error loading cajas:', error);
      this.showMessage(`Error al cargar cajas: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }
  
  async loadDispositivos(): Promise<void> {
    try {
      const dispositivos = await firstValueFrom(this.repositoryService.getDispositivos());
      this.dispositivos = dispositivos || [];
      
      // Set default selected dispositivo if available
      if (this.dispositivos.length > 0) {
        this.selectedDispositivoId = this.dispositivos[0].id;
      }
    } catch (error: any) {
      console.error('Error loading dispositivos:', error);
      this.showMessage(`Error al cargar dispositivos: ${error.message}`);
    }
  }
  
  applyFilter(): void {
    const filterValue = this.cajeroFilterControl.value?.toLowerCase() || '';
    
    if (!filterValue) {
      this.filteredData = [...this.dataSource];
      return;
    }
    
    this.filteredData = this.dataSource.filter(caja => {
      // Get the name of the cajero from the dispositivo relation
      const cajeroName = caja.dispositivo?.usuario?.nombre?.toLowerCase() || '';
      return cajeroName.includes(filterValue);
    });
  }
  
  selectCaja(caja: Caja): void {
    this.dialogRef.close({ 
      action: 'select',
      caja: caja 
    });
  }
  
  toggleNewCajaForm(): void {
    this.showNewCajaForm = !this.showNewCajaForm;
  }
  
  async createNewCaja(): Promise<void> {
    if (!this.selectedDispositivoId) {
      this.showMessage('Debe seleccionar un dispositivo');
      return;
    }
    
    try {
      this.isCreatingCaja = true;
      
      // Close the dialog and return the action and dispositivo id
      this.dialogRef.close({
        action: 'create',
        dispositivoId: this.selectedDispositivoId
      });
    } catch (error: any) {
      console.error('Error creating caja:', error);
      this.showMessage(`Error al crear caja: ${error.message}`);
    } finally {
      this.isCreatingCaja = false;
    }
  }
  
  cancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }
  
  private showMessage(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000
    });
  }
  
  // Display the name of the cashier
  getNombreCajero(caja: Caja): string {
    return caja.dispositivo?.usuario?.nombre || 'Sin asignar';
  }
  
  // Display the name of the device
  getNombreDispositivo(caja: Caja): string {
    return caja.dispositivo?.nombre || 'Sin dispositivo';
  }
} 