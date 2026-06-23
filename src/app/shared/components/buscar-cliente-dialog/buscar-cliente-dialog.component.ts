import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { Cliente } from '../../../database/entities/personas/cliente.entity';

@Component({
  selector: 'app-buscar-cliente-dialog',
  templateUrl: './buscar-cliente-dialog.component.html',
  styleUrls: ['./buscar-cliente-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
  ],
})
export class BuscarClienteDialogComponent implements OnInit {
  clientes: Cliente[] = [];
  filteredClientes: Cliente[] = [];
  searchControl = new FormControl('', { nonNullable: true });
  displayedColumns = ['nombre', 'ruc', 'telefono', 'acciones'];

  constructor(
    public dialogRef: MatDialogRef<BuscarClienteDialogComponent>,
    private repositoryService: RepositoryService
  ) {}

  async ngOnInit(): Promise<void> {
    this.clientes = await firstValueFrom(this.repositoryService.getClientes());
    this.filteredClientes = this.clientes;
  }

  filtrar(): void {
    const term = this.searchControl.value.toUpperCase().trim();
    if (!term) {
      this.filteredClientes = this.clientes;
      return;
    }
    this.filteredClientes = this.clientes.filter(c =>
      c.persona?.nombre?.toUpperCase().includes(term) ||
      c.persona?.documento?.toUpperCase().includes(term) ||
      c.ruc?.toUpperCase().includes(term) ||
      c.razon_social?.toUpperCase().includes(term) ||
      c.persona?.telefono?.includes(term)
    );
  }

  seleccionar(cliente: Cliente): void {
    this.dialogRef.close(cliente);
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
