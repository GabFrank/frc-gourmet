import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

const TIPOS = ['CUMPLEANIOS', 'NAVIDAD', 'DESEMPENIO', 'PRODUCTIVIDAD', 'OTRO'];

@Component({
  selector: 'app-list-bonos',
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
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>card_giftcard</mat-icon> <h2>Bonos</h2></div>
            <button mat-flat-button color="primary" (click)="showCreateForm()" *ngIf="!showInlineForm">
              <mat-icon>add</mat-icon> Nuevo bono
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="showInlineForm">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" class="form">
            <mat-form-field appearance="outline">
              <mat-label>Funcionario</mat-label>
              <mat-select formControlName="funcionarioId">
                <mat-option *ngFor="let f of funcionarios" [value]="f.id">
                  {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="tipo">
                <mat-option *ngFor="let t of tipos" [value]="t">{{ t }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="p" formControlName="fecha" />
              <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
              <mat-datepicker #p></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Monto</mat-label>
              <input matInput type="number" formControlName="monto" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Motivo</mat-label>
              <input matInput formControlName="motivo" />
            </mat-form-field>
            <div class="actions">
              <button type="button" mat-button (click)="cancelInlineForm()">Cancelar</button>
              <button type="submit" mat-flat-button color="primary" [disabled]="form.invalid">Crear</button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div class="filtros">
            <mat-form-field appearance="outline">
              <mat-label>Funcionario</mat-label>
              <mat-select [(ngModel)]="filtroFuncionarioId">
                <mat-option [value]="null">Todos</mat-option>
                <mat-option *ngFor="let f of funcionarios" [value]="f.id">
                  {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="load()">
              <mat-icon>search</mat-icon> Filtrar
            </button>
          </div>

          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
          <table mat-table [dataSource]="bonos" class="full" *ngIf="!loading">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let b">{{ b.fecha | date:'shortDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let b">{{ b.funcionario?.persona?.nombre }} {{ b.funcionario?.persona?.apellido || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="tipo">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let b">{{ b.tipo }}</td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let b">{{ b.monto | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="motivo">
              <th mat-header-cell *matHeaderCellDef>Motivo</th>
              <td mat-cell *matCellDef="let b">{{ b.motivo || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let b">
                <span [class.estado-rojo]="b.anulado">{{ b.anulado ? 'ANULADO' : 'VIGENTE' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let b">
                <button mat-icon-button [matMenuTriggerFor]="menu" *ngIf="!b.anulado">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="anular(b)"><mat-icon>cancel</mat-icon><span>Anular</span></button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && bonos.length === 0" class="empty">Sin bonos.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
    .full { grid-column: 1 / -1; }
    .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
    .estado-rojo { color: #e53935; }
  `],
})
export class ListBonosComponent implements OnInit {
  bonos: any[] = [];
  funcionarios: any[] = [];
  loading = false;
  cols = ['fecha', 'funcionario', 'tipo', 'monto', 'motivo', 'estado', 'actions'];
  tipos = TIPOS;
  filtroFuncionarioId: number | null = null;
  showInlineForm = false;
  form!: FormGroup;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder,
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      tipo: ['OTRO', Validators.required],
      fecha: [new Date(), Validators.required],
      monto: [0, [Validators.required, Validators.min(1)]],
      motivo: [''],
    });
    try {
      this.funcionarios = await firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true }));
    } catch (e) { console.error(e); }
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.bonos = await firstValueFrom(this.repositoryService.getBonos({
        funcionarioId: this.filtroFuncionarioId,
        soloVigentes: false,
      }));
    } catch (e) { console.error(e); }
    finally { this.loading = false; }
  }

  showCreateForm(): void {
    this.form.reset({ tipo: 'OTRO', fecha: new Date(), monto: 0 });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void { this.showInlineForm = false; }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    try {
      await firstValueFrom(this.repositoryService.createBono(this.form.value));
      this.snackBar.open('Bono creado', 'Cerrar', { duration: 2500 });
      this.cancelInlineForm();
      this.load();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error', 'Cerrar', { duration: 3500 });
    }
  }

  async anular(b: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Anular bono', message: '¿Anular este bono?', confirmText: 'Anular', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularBono(b.id));
      this.load();
    } catch (e) { console.error(e); }
  }
}
