import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-rrhh-dash',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule
  ],
  template: `
    <div class="dashboard-container">
      <h1>Dashboard de Recursos Humanos</h1>
      
      <div class="cards-grid">
        <mat-card class="dashboard-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>people</mat-icon>
            <mat-card-title>Personas</mat-card-title>
            <mat-card-subtitle>Gestión de Personas</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p>Administre todas las personas registradas en el sistema.</p>
          </mat-card-content>
        </mat-card>
        
        <mat-card class="dashboard-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>supervised_user_circle</mat-icon>
            <mat-card-title>Usuarios</mat-card-title>
            <mat-card-subtitle>Gestión de Usuarios</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p>Administre todos los usuarios del sistema.</p>
          </mat-card-content>
        </mat-card>
        
        <mat-card class="dashboard-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>business</mat-icon>
            <mat-card-title>Clientes</mat-card-title>
            <mat-card-subtitle>Gestión de Clientes</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p>Administre todos los clientes registrados.</p>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 20px;
    }
    
    h1 {
      margin-bottom: 20px;
    }
    
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    
    .dashboard-card {
      height: 100%;
      min-height: 150px;
      transition: transform 0.3s, box-shadow 0.3s;
    }
    
    .dashboard-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    }
  `]
})
export class RrhhDashComponent implements OnInit {
  
  constructor() { }
  
  ngOnInit(): void {
  }
  
  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for RRHH Dashboard component:', data);
  }
} 