import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { CreateEditSaborDialogComponent } from '../dialogs/create-edit-sabor-dialog/create-edit-sabor-dialog.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-list-sabores',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    HasPermissionDirective,
  ],
  templateUrl: './list-sabores.component.html',
  styleUrls: ['./list-sabores.component.scss']
})
export class ListSaboresComponent implements OnInit {

  sabores: string[] = [];
  loading = false;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.loadSabores();
  }

  loadSabores(): void {
    this.loading = true;
    this.repositoryService.getSabores().subscribe({
      next: (data) => {
        this.sabores = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading sabores:', error);
        this.loading = false;
        this.snackBar.open('Error al cargar los sabores', 'Cerrar', { duration: 3000 });
      }
    });
  }

  crearSabor(): void {
    const dialogRef = this.dialog.open(CreateEditSaborDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        isEditMode: false
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Recargar la lista de sabores
        this.loadSabores();
        this.snackBar.open('Sabor creado exitosamente', 'Cerrar', { duration: 3000 });
      }
    });
  }

  editarSabor(sabor: string): void {
    const dialogRef = this.dialog.open(CreateEditSaborDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        categoria: sabor,
        isEditMode: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Recargar la lista de sabores
        this.loadSabores();
        this.snackBar.open('Sabor actualizado exitosamente', 'Cerrar', { duration: 3000 });
      }
    });
  }
}
