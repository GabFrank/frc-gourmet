import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-turnos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>schedule</mat-icon> <h2>Turnos</h2></div>
            <button mat-flat-button color="primary" (click)="showCreateForm()" *ngIf="!showInlineForm">
              <mat-icon>add</mat-icon> Nuevo turno
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="showInlineForm">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" class="form">
            <mat-form-field appearance="outline">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="nombre" placeholder="MAÑANA / TARDE / NOCHE / CORRIDO" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Hora entrada (HH:mm)</mat-label>
              <input matInput formControlName="horaEntrada" placeholder="08:00" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Hora salida (HH:mm)</mat-label>
              <input matInput formControlName="horaSalida" placeholder="16:00" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Tolerancia tardanza (min)</mat-label>
              <input matInput type="number" formControlName="toleranciaTardanzaMinutos" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Descripcion</mat-label>
              <input matInput formControlName="descripcion" />
            </mat-form-field>
            <mat-slide-toggle formControlName="activo">Activo</mat-slide-toggle>
            <div class="actions">
              <button type="button" mat-button (click)="cancelInlineForm()">Cancelar</button>
              <button type="submit" mat-flat-button color="primary" [disabled]="form.invalid">
                {{ editingId ? 'Actualizar' : 'Crear' }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
          <table mat-table [dataSource]="turnos" class="full" *ngIf="!loading">
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>Nombre</th>
              <td mat-cell *matCellDef="let t">{{ t.nombre }}</td>
            </ng-container>
            <ng-container matColumnDef="horario">
              <th mat-header-cell *matHeaderCellDef>Horario</th>
              <td mat-cell *matCellDef="let t">{{ t.horaEntrada }} - {{ t.horaSalida }}</td>
            </ng-container>
            <ng-container matColumnDef="tolerancia">
              <th mat-header-cell *matHeaderCellDef>Tolerancia</th>
              <td mat-cell *matCellDef="let t">{{ t.toleranciaTardanzaMinutos }} min</td>
            </ng-container>
            <ng-container matColumnDef="activo">
              <th mat-header-cell *matHeaderCellDef>Activo</th>
              <td mat-cell *matCellDef="let t">
                <mat-icon [class.estado-verde]="t.activo" [class.estado-rojo]="!t.activo">
                  {{ t.activo ? 'check_circle' : 'cancel' }}
                </mat-icon>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let t">
                <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="edit(t)"><mat-icon>edit</mat-icon><span>Editar</span></button>
                  <button mat-menu-item (click)="del(t)" *ngIf="t.activo"><mat-icon>block</mat-icon><span>Desactivar</span></button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && turnos.length === 0" class="empty">Sin turnos.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; align-items: center; }
    .full { grid-column: 1 / -1; }
    .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .full { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
    .estado-verde { color: #43a047; }
    .estado-rojo { color: #e53935; }
  `],
})
export class ListTurnosComponent implements OnInit {
  turnos: any[] = [];
  loading = false;
  cols = ['nombre', 'horario', 'tolerancia', 'activo', 'actions'];
  showInlineForm = false;
  editingId: number | null = null;
  form!: FormGroup;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      horaEntrada: ['08:00', Validators.required],
      horaSalida: ['16:00', Validators.required],
      toleranciaTardanzaMinutos: [5, [Validators.required, Validators.min(0)]],
      descripcion: [''],
      activo: [true],
    });
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.turnos = await firstValueFrom(this.repositoryService.getTurnos());
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar turnos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.editingId = null;
    this.form.reset({ horaEntrada: '08:00', horaSalida: '16:00', toleranciaTardanzaMinutos: 5, activo: true });
    this.showInlineForm = true;
  }

  edit(t: any): void {
    this.editingId = t.id;
    this.form.patchValue(t);
    this.showInlineForm = true;
  }

  cancelInlineForm(): void {
    this.showInlineForm = false;
    this.editingId = null;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    try {
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateTurno(this.editingId, v));
        this.snackBar.open('Turno actualizado', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createTurno(v));
        this.snackBar.open('Turno creado', 'Cerrar', { duration: 2500 });
      }
      this.cancelInlineForm();
      this.load();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3500 });
    }
  }

  async del(t: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Desactivar turno', message: `¿Desactivar "${t.nombre}"?`, confirmText: 'Desactivar', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteTurno(t.id));
      this.load();
    } catch (e) {
      console.error(e);
    }
  }
}
