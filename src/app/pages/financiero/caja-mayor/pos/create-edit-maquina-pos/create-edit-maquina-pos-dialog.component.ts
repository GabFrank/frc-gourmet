import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-maquina-pos-dialog',
  templateUrl: './create-edit-maquina-pos-dialog.component.html',
  styleUrls: ['./create-edit-maquina-pos-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ]
})
export class CreateEditMaquinaPosDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  isEditing = false;
  maquinaId: number | null = null;
  cuentas: any[] = [];

  /** Reglas por medio (issue #320). Solo se editan con la máquina ya creada. */
  reglas: ReglaFila[] = [];
  readonly medios = [
    { valor: 'CREDITO', label: 'Crédito' },
    { valor: 'DEBITO', label: 'Débito' },
    { valor: 'QR', label: 'QR' },
  ];
  readonly proveedoresObservados = ['BANCARD', 'UPAY'];
  proveedorCarga = 'BANCARD';
  guardandoRegla = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateEditMaquinaPosDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.maquinaId = this.data?.maquinaPosId || null;
    this.isEditing = !!this.maquinaId;

    this.form = this.fb.group({
      nombre: ['', Validators.required],
      cuentaBancariaId: [null, Validators.required],
      proveedor: [''],
      porcentajeComision: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      minutosAcreditacion: [0, [Validators.required, Validators.min(0)]],
      autoAcreditar: [true],
      activo: [true],
    });

    this.loadLookups();
  }

  async loadLookups(): Promise<void> {
    try {
      const cuentas = await firstValueFrom(this.repositoryService.getCuentasBancarias());
      this.cuentas = (cuentas || []).filter((c: any) => c.activo !== false);
      if (this.isEditing && this.maquinaId) {
        const m = await firstValueFrom(this.repositoryService.getMaquinaPos(this.maquinaId));
        if (m) {
          this.form.patchValue({
            nombre: m.nombre,
            cuentaBancariaId: m.cuentaBancaria?.id,
            proveedor: m.proveedor || '',
            porcentajeComision: Number(m.porcentajeComision),
            minutosAcreditacion: Number(m.minutosAcreditacion),
            autoAcreditar: m.autoAcreditar !== false,
            activo: m.activo,
          });
          const prov = String(m.proveedor || '').toUpperCase();
          if (this.proveedoresObservados.includes(prov)) this.proveedorCarga = prov;
        }
        await this.cargarReglas();
      }
    } catch (error) { console.error(error); }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const f = this.form.value;
      const data: any = {
        nombre: f.nombre,
        cuentaBancaria: { id: f.cuentaBancariaId },
        proveedor: f.proveedor || null,
        porcentajeComision: f.porcentajeComision,
        minutosAcreditacion: f.minutosAcreditacion,
        autoAcreditar: f.autoAcreditar,
        activo: f.activo,
      };
      if (this.isEditing && this.maquinaId) {
        await firstValueFrom(this.repositoryService.updateMaquinaPos(this.maquinaId, data));
        this.snackBar.open('Maquina POS actualizada', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createMaquinaPos(data));
        this.snackBar.open('Maquina POS creada', 'Cerrar', { duration: 3000 });
      }
      this.dialogRef?.close(true);
    } catch (error) {
      console.error(error);
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }

  // ── Reglas por medio ──
  async cargarReglas(): Promise<void> {
    if (!this.maquinaId) return;
    const rs = await firstValueFrom(this.repositoryService.getMaquinaPosReglas(this.maquinaId));
    this.reglas = (rs || []).map((r: any) => this.aFila(r));
  }

  private aFila(r: any): ReglaFila {
    const fila: ReglaFila = {
      id: r.id ?? null,
      medio: r.medio ?? 'CREDITO',
      plazoDias: Number(r.plazoDias ?? 0),
      tipoDias: r.tipoDias ?? 'HABILES',
      base: r.base ?? 'PROCESO',
      correrAHabil: r.correrAHabil !== false,
      porcentajeComision: Number(r.porcentajeComision ?? 0),
      redondeoComision: Number(r.redondeoComision ?? 0),
      porcentajeIvaComision: Number(r.porcentajeIvaComision ?? 0),
      porcentajeRetRenta: Number(r.porcentajeRetRenta ?? 0),
      porcentajeRetIva: Number(r.porcentajeRetIva ?? 0),
      divisorIvaVenta: Number(r.divisorIvaVenta ?? 11),
      modo: r.modo ?? 'NETO',
      verificada: !!r.verificada,
      activo: r.activo !== false,
      observacion: r.observacion ?? '',
      ejemplo: '',
    };
    fila.ejemplo = this.ejemplo(fila);
    return fila;
  }

  /** Texto de ejemplo con ₲ 100.000 (aproximado, sin redondeos), para que se entienda la regla. */
  private ejemplo(f: ReglaFila): string {
    const b = 100000;
    const com = (b * f.porcentajeComision) / 100;
    const desc = com + (com * f.porcentajeIvaComision) / 100 + (b * f.porcentajeRetRenta) / 100
      + (f.divisorIvaVenta > 0 ? ((b / f.divisorIvaVenta) * f.porcentajeRetIva) / 100 : 0);
    const neto = Math.round(b - desc).toLocaleString('es-PY');
    const plazo = `${f.plazoDias} día(s) ${f.tipoDias === 'HABILES' ? 'hábiles' : 'corridos'}`;
    return f.modo === 'NETO'
      ? `₲ 100.000 → acredita ₲ ${neto} a ${plazo}`
      : `₲ 100.000 → acredita el bruto a ${plazo}; descuentos (₲ ${Math.round(desc).toLocaleString('es-PY')}) aparte`;
  }

  onReglaCambio(f: ReglaFila): void {
    f.ejemplo = this.ejemplo(f);
  }

  agregarRegla(): void {
    const usados = new Set(this.reglas.map((r) => r.medio));
    const libre = this.medios.find((m) => !usados.has(m.valor));
    if (!libre) {
      this.snackBar.open('Ya hay una regla para cada medio', 'Cerrar', { duration: 3000 });
      return;
    }
    this.reglas = [...this.reglas, this.aFila({ medio: libre.valor, activo: false })];
  }

  async guardarRegla(f: ReglaFila): Promise<void> {
    if (!this.maquinaId) return;
    this.guardandoRegla = true;
    try {
      const guardada = await firstValueFrom(this.repositoryService.saveMaquinaPosRegla({ ...f, maquinaPosId: this.maquinaId }));
      Object.assign(f, this.aFila(guardada));
      this.snackBar.open('Regla guardada', 'Cerrar', { duration: 2500 });
    } catch (e: any) {
      const msg = String(e?.message || '');
      this.snackBar.open(
        msg.includes('REGLA_DUPLICADA') ? 'Ya hay una regla para ese medio' : msg.includes('FUERA_DE_RANGO') ? 'Hay un valor fuera de rango' : 'Error al guardar la regla',
        'Cerrar', { duration: 4000 });
    } finally {
      this.guardandoRegla = false;
    }
  }

  async eliminarRegla(f: ReglaFila): Promise<void> {
    if (f.id) await firstValueFrom(this.repositoryService.deleteMaquinaPosRegla(f.id));
    this.reglas = this.reglas.filter((r) => r !== f);
  }

  async cargarObservadas(): Promise<void> {
    if (!this.maquinaId) return;
    const r = await firstValueFrom(this.repositoryService.cargarReglasObservadasPos(this.maquinaId, this.proveedorCarga));
    await this.cargarReglas();
    this.snackBar.open(
      r?.creadas ? `${r.creadas} regla(s) cargadas. Las «sin verificar» quedan apagadas hasta confirmarlas con un extracto.` : 'No había reglas nuevas para cargar',
      'Cerrar', { duration: 5000 });
  }
}

interface ReglaFila {
  id: number | null;
  medio: string;
  plazoDias: number;
  tipoDias: string;
  base: string;
  correrAHabil: boolean;
  porcentajeComision: number;
  redondeoComision: number;
  porcentajeIvaComision: number;
  porcentajeRetRenta: number;
  porcentajeRetIva: number;
  divisorIvaVenta: number;
  modo: string;
  verificada: boolean;
  activo: boolean;
  observacion: string;
  ejemplo: string;
}
