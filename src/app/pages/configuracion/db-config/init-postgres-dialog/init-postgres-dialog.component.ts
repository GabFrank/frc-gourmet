import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface InitPostgresDialogData {
  host: string;
  port: number;
  ssl?: boolean;
  targetUsername: string;
  targetDatabase: string;
}

export interface InitPostgresDialogResult {
  host: string;
  port: number;
  ssl: boolean;
  superuserUsername: string;
  superuserPassword: string;
  targetUsername: string;
  targetPassword: string;
  targetDatabase: string;
}

@Component({
  selector: 'app-init-postgres-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './init-postgres-dialog.component.html',
  styleUrls: ['./init-postgres-dialog.component.scss'],
})
export class InitPostgresDialogComponent {
  form: FormGroup;
  hideSuperuserPassword = true;
  hideTargetPassword = true;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<InitPostgresDialogComponent, InitPostgresDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: InitPostgresDialogData,
  ) {
    this.form = this.fb.group({
      host: [data.host || 'localhost', [Validators.required]],
      port: [data.port || 5432, [Validators.required, Validators.min(1), Validators.max(65535)]],
      ssl: [!!data.ssl],
      superuserUsername: ['postgres', [Validators.required]],
      // Opcional: setups con pg_hba.conf en `trust` (Homebrew/Postgres.app default)
      // no requieren password. La validacion real la hace el server.
      superuserPassword: [''],
      targetUsername: [data.targetUsername || 'frc_user', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)]],
      targetPassword: ['', [Validators.required, Validators.minLength(4)]],
      targetDatabase: [data.targetDatabase || 'frc_gourmet', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)]],
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(this.form.value as InitPostgresDialogResult);
  }
}
