import { Component, OnInit } from '@angular/core';
import { DatabaseService } from '../../services/database.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RepositoryService } from 'src/app/database/repository.service';
import { Persona } from 'src/app/database/entities/personas/persona.entity';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTableModule,
    MatProgressSpinnerModule
  ]
})
export class HomeComponent implements OnInit {
  isLoading = true;
  personas: Persona[] = [];
  constructor(private repositoryService: RepositoryService) { }

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    
  }

  // Method required by the tab container
  setData(data: any): void {
    // Handle any data passed from tab container
    console.log('Home component received data:', data);
  }
} 