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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

const TIPOS = ['DIURNA', 'NOCTURNA', 'FERIADO'];

@Component({
  selector: 'app-list-horas-extra',
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
    MatSlideToggleModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>more_time</mat-icon> <h2>Horas extra</h2></div>
            <button mat-flat-button color="primary" (click)="showCreateForm()" *ngIf="!showInlineForm">
              <mat-icon>add</mat-icon> Registrar HE
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
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="p" formControlName="fecha" />
              <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
              <mat-datepicker #p></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="tipo">
                <mat-option *ngFor="let t of tipos" [value]="t">{{ t }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Horas</mat-label>
              <input matInput type="number" step="0.5" formControlName="horas" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Recargo % (opcional)</mat-label>
              <input matInput type="number" formControlName="recargoPorcentaje" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Observacion</mat-label>
              <input matInput formControlName="observacion" />
            </mat-form-field>
            <div class="actions">
              <button type="button" mat-button (click)="cancelInlineForm()">Cancelar</button>
              <button type="submit" mat-flat-button color="primary" [disabled]="form.invalid">Registrar</button>
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
            <mat-slide-toggle [(ngModel)]="soloVigentes">Solo vigentes</mat-slide-toggle>
            <button mat-flat-button color="primary" (click)="load()">
              <mat-icon>search</mat-icon> Filtrar
            </button>
          </div>

          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
          <table mat-table [dataSource]="horas" class="full" *ngIf="!loading">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let h">{{ h.fecha | date:'shortDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let h">{{ h.funcionario?.persona?.nombre }} {{ h.funcionario?.persona?.apellido || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="tipo">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let h">{{ h.tipo }}</td>
            </ng-container>
            <ng-container matColumnDef="horas">
              <th mat-header-cell *matHeaderCellDef>Horas</th>
              <td mat-cell *matCellDef="let h">{{ h.horas | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="recargo">
              <th mat-header-cell *matHeaderCellDef>Recargo</th>
              <td mat-cell *matCellDef="let h">+{{ h.recargoPorcentaje | number:'1.0-2' }}%</td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto calc.</th>
              <td mat-cell *matCellDef="let h">{{ h.montoCalculado | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let h">
                <span [class.estado-rojo]="h.anulada">{{ h.anulada ? 'ANULADA' : 'VIGENTE' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let h">
                <button mat-icon-button [matMenuTriggerFor]="menu" *ngIf="!h.anulada">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="anular(h)"><mat-icon>cancel</mat-icon><span>Anular</span></button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && horas.length === 0" class="empty">Sin horas extra.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 12px; align-items: center; }
    .full { grid-column: 1 / -1; }
    .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
    .estado-rojo { color: #e53935; }
  `],
})
export class ListHorasExtraComponent implements OnInit {
  horas: any[] = [];
  funcionarios: any[] = [];
  loading = false;
  cols = ['fecha', 'funcionario', 'tipo', 'horas', 'recargo', 'monto', 'estado', 'actions'];
  tipos = TIPOS;
  filtroFuncionarioId: number | null = null;
  soloVigentes = true;
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
      fecha: [new Date(), Validators.required],
      tipo: ['DIURNA', Validators.required],
      horas: [1, [Validators.required, Validators.min(0.25)]],
      recargoPorcentaje: [null],
      observacion: [''],
    });
    try {
      this.funcionarios = await firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true }));
    } catch (e) {
      console.error(e);
    }
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.horas = await firstValueFrom(this.repositoryService.getHorasExtra({
        funcionarioId: this.filtroFuncionarioId,
        soloVigentes: this.soloVigentes,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.form.reset({ tipo: 'DIURNA', fecha: new Date(), horas: 1 });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void { this.showInlineForm = false; }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    try {
      await firstValueFrom(this.repositoryService.createHoraExtra(this.form.value));
      this.snackBar.open('HE registrada', 'Cerrar', { duration: 2500 });
      this.cancelInlineForm();
      this.load();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al registrar HE', 'Cerrar', { duration: 3500 });
    }
  }

  async anular(h: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Anular HE', message: '¿Anular esta hora extra?', confirmText: 'Anular', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularHoraExtra(h.id));
      this.load();
    } catch (e) {
      console.error(e);
    }
  }
}
