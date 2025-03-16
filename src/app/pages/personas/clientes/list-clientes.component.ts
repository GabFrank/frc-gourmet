import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-list-clientes',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule
  ],
  template: `
    <div class="list-clientes-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Gestión de Clientes</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p>Componente de gestión de clientes en desarrollo.</p>
          <p>Aquí se mostrará la lista de clientes.</p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .list-clientes-container {
      padding: 20px;
    }
  `]
})
export class ListClientesComponent implements OnInit {
  
  constructor() { }
  
  ngOnInit(): void {
  }
  
  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for Clientes list component:', data);
  }
} 