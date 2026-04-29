import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-feriados',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>celebration</mat-icon> <h2>Feriados</h2></div>
            <div class="filtros">
              <mat-form-field appearance="outline">
                <mat-label>Anio</mat-label>
                <input matInput type="number" [(ngModel)]="anio" />
              </mat-form-field>
              <button mat-stroked-button color="primary" (click)="load()">
                <mat-icon>search</mat-icon> Filtrar
              </button>
              <button mat-flat-button color="primary" (click)="showCreateForm()" *ngIf="!showInlineForm">
                <mat-icon>add</mat-icon> Nuevo feriado
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="showInlineForm">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" class="form">
            <mat-form-field appearance="outline">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="p" formControlName="fecha" />
              <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
              <mat-datepicker #p></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Descripcion</mat-label>
              <input matInput formControlName="descripcion" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Recargo (%)</mat-label>
              <input matInput type="number" formControlName="recargoPorcentaje" />
            </mat-form-field>
            <mat-slide-toggle formControlName="esNacional">Nacional</mat-slide-toggle>
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
          <table mat-table [dataSource]="feriados" class="full" *ngIf="!loading">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let f">{{ f.fecha | date:'shortDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="descripcion">
              <th mat-header-cell *matHeaderCellDef>Descripcion</th>
              <td mat-cell *matCellDef="let f">{{ f.descripcion }}</td>
            </ng-container>
            <ng-container matColumnDef="recargo">
              <th mat-header-cell *matHeaderCellDef>Recargo</th>
              <td mat-cell *matCellDef="let f">+{{ f.recargoPorcentaje | number:'1.0-2' }}%</td>
            </ng-container>
            <ng-container matColumnDef="nacional">
              <th mat-header-cell *matHeaderCellDef>Nacional</th>
              <td mat-cell *matCellDef="let f">{{ f.esNacional ? 'Si' : 'No' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let f">
                <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="edit(f)"><mat-icon>edit</mat-icon><span>Editar</span></button>
                  <button mat-menu-item (click)="del(f)"><mat-icon>delete</mat-icon><span>Eliminar</span></button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && feriados.length === 0" class="empty">Sin feriados.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .filtros { display: flex; gap: 12px; align-items: center; }
    .form { display: grid; grid-template-columns: 1fr 2fr 1fr auto auto; gap: 12px; align-items: center; }
    .full { grid-column: 2 / 3; }
    .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
  `],
})
export class ListFeriadosComponent implements OnInit {
  feriados: any[] = [];
  loading = false;
  cols = ['fecha', 'descripcion', 'recargo', 'nacional', 'actions'];
  anio: number = new Date().getFullYear();
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
      fecha: [new Date(), Validators.required],
      descripcion: ['', Validators.required],
      recargoPorcentaje: [100, Validators.required],
      esNacional: [true],
      activo: [true],
    });
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.feriados = await firstValueFrom(this.repositoryService.getFeriados(this.anio));
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar feriados', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.editingId = null;
    this.form.reset({ fecha: new Date(), recargoPorcentaje: 100, esNacional: true, activo: true });
    this.showInlineForm = true;
  }

  edit(f: any): void {
    this.editingId = f.id;
    this.form.patchValue({ ...f, fecha: f.fecha });
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
        await firstValueFrom(this.repositoryService.updateFeriado(this.editingId, v));
        this.snackBar.open('Feriado actualizado', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createFeriado(v));
        this.snackBar.open('Feriado creado', 'Cerrar', { duration: 2500 });
      }
      this.cancelInlineForm();
      this.load();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al guardar feriado', 'Cerrar', { duration: 3500 });
    }
  }

  async del(f: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar feriado', message: `¿Eliminar el feriado "${f.descripcion}"?`, confirmText: 'Eliminar', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteFeriado(f.id));
      this.load();
    } catch (e) {
      console.error(e);
    }
  }
}
