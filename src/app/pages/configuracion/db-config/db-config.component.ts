import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { DbConfigDto, DbConfigService } from 'src/app/services/db-config.service';
import { InitPostgresDialogComponent, InitPostgresDialogData, InitPostgresDialogResult } from './init-postgres-dialog/init-postgres-dialog.component';

const PASSWORD_MASK = '***';

@Component({
  selector: 'app-db-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './db-config.component.html',
  styleUrls: ['./db-config.component.scss'],
})
export class DbConfigComponent implements OnInit {
  loading = false;
  testing = false;
  saving = false;

  selectedTab: 'sqlite' | 'postgres' = 'sqlite';
  initialType: 'sqlite' | 'postgres' = 'sqlite';

  // SQLite
  sqlitePathDefault = true;
  sqliteCustomPath = '';

  // Postgres
  pgHost = 'localhost';
  pgPort = 5432;
  pgDatabase = 'frc_gourmet';
  pgUsername = 'postgres';
  pgPassword = '';
  pgPasswordHasStored = false; // si la BD tenia un password persistido (mostramos *** placeholder)
  pgSchema = '';
  pgSsl = false;

  testResult: { ok: boolean; msg: string } | null = null;
  initResult: { ok: boolean; msg: string } | null = null;
  initializing = false;

  constructor(
    private svc: DbConfigService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const cfg = await this.svc.get();
      this.initialType = cfg.type;
      this.selectedTab = cfg.type;

      if (cfg.type === 'sqlite') {
        this.sqlitePathDefault = !cfg.path || cfg.path === 'default';
        this.sqliteCustomPath = this.sqlitePathDefault ? '' : (cfg.path || '');
      } else {
        this.pgHost = cfg.host || 'localhost';
        this.pgPort = cfg.port || 5432;
        this.pgDatabase = cfg.database || 'frc_gourmet';
        this.pgUsername = cfg.username || 'postgres';
        this.pgPassword = cfg.password === PASSWORD_MASK ? PASSWORD_MASK : '';
        this.pgPasswordHasStored = cfg.password === PASSWORD_MASK;
        this.pgSchema = cfg.schema || '';
        this.pgSsl = !!cfg.ssl;
      }
    } catch (e) {
      this.snack.open('No se pudo cargar la configuracion: ' + this.errMsg(e), 'OK', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  onTabChange(idx: number): void {
    this.selectedTab = idx === 0 ? 'sqlite' : 'postgres';
    this.testResult = null;
  }

  buildPayload(): DbConfigDto {
    if (this.selectedTab === 'postgres') {
      return {
        type: 'postgres',
        host: this.pgHost?.trim() || 'localhost',
        port: this.pgPort || 5432,
        database: this.pgDatabase?.trim() || 'frc_gourmet',
        username: this.pgUsername?.trim() || 'postgres',
        password: this.pgPassword,
        schema: this.pgSchema?.trim() || undefined,
        ssl: this.pgSsl,
      };
    }
    return {
      type: 'sqlite',
      path: this.sqlitePathDefault ? 'default' : this.sqliteCustomPath?.trim() || 'default',
    };
  }

  async test(): Promise<void> {
    this.testing = true;
    this.testResult = null;
    try {
      const r = await this.svc.testConnection(this.buildPayload());
      this.testResult = { ok: !!r.success, msg: r.message || (r.success ? 'OK' : 'Error desconocido') };
    } catch (e) {
      this.testResult = { ok: false, msg: this.errMsg(e) };
    } finally {
      this.testing = false;
    }
  }

  async saveAndRestart(): Promise<void> {
    const payload = this.buildPayload();
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Guardar y reiniciar',
        message:
          payload.type === 'postgres'
            ? `Se guardara la configuracion para conectarse a Postgres @ ${payload.host}:${payload.port}/${payload.database} y la app se reiniciara. Continuar?`
            : payload.path === 'default'
            ? 'Se restablecera SQLite default y la app se reiniciara. Continuar?'
            : `Se guardara SQLite custom @ ${payload.path} y la app se reiniciara. Continuar?`,
        confirmText: 'Guardar y reiniciar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.saving = true;
    try {
      const saveRes = await this.svc.save(payload);
      if (!saveRes.success) {
        this.snack.open('Error guardando: ' + (saveRes.message || ''), 'OK', { duration: 4000 });
        return;
      }
      this.snack.open('Guardado. Reiniciando...', '', { duration: 1500 });
      // pequeño delay para que el toast se vea
      setTimeout(() => {
        this.svc.restartApp();
      }, 800);
    } catch (e) {
      this.snack.open('Error: ' + this.errMsg(e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  async initPostgres(): Promise<void> {
    const dialogData: InitPostgresDialogData = {
      host: this.pgHost?.trim() || 'localhost',
      port: this.pgPort || 5432,
      ssl: this.pgSsl,
      targetUsername: this.pgUsername?.trim() || 'frc_user',
      targetDatabase: this.pgDatabase?.trim() || 'frc_gourmet',
    };

    const ref = this.dialog.open<InitPostgresDialogComponent, InitPostgresDialogData, InitPostgresDialogResult>(
      InitPostgresDialogComponent,
      { data: dialogData, width: '520px', disableClose: true },
    );

    const result = await ref.afterClosed().toPromise();
    if (!result) return;

    this.initializing = true;
    this.initResult = null;
    try {
      const r = await this.svc.initPostgres({
        host: result.host,
        port: result.port,
        ssl: result.ssl,
        superuserUsername: result.superuserUsername,
        superuserPassword: result.superuserPassword,
        targetUsername: result.targetUsername,
        targetPassword: result.targetPassword,
        targetDatabase: result.targetDatabase,
      });
      this.initResult = { ok: !!r.success, msg: r.message || (r.success ? 'OK' : 'Error desconocido') };
      if (r.success) {
        // Reflejar en el form para que el operador no tenga que retipear
        this.pgHost = result.host;
        this.pgPort = result.port;
        this.pgDatabase = result.targetDatabase;
        this.pgUsername = result.targetUsername;
        this.pgPassword = result.targetPassword;
        this.pgSsl = !!result.ssl;
        this.snack.open('Inicializacion OK. Ahora podes Probar conexion y Guardar.', 'OK', { duration: 4000 });
      }
    } catch (e) {
      this.initResult = { ok: false, msg: this.errMsg(e) };
    } finally {
      this.initializing = false;
    }
  }

  private errMsg(e: any): string {
    return e instanceof Error ? e.message : String(e);
  }
}
