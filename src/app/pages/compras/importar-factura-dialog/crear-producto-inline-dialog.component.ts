import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { inferirPresentacion } from 'src/app/shared/utils/producto-inference.util';

@Component({
  selector: 'app-crear-producto-inline-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">add_box</mat-icon>
      Crear producto rápido
    </h2>
    <mat-dialog-content>
      <p class="hint">
        Cargá los datos mínimos. Quedará marcado como
        <strong>registro parcial</strong> para que lo completes luego (clasificación, precios de venta, recetas).
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre del producto</mat-label>
        <input matInput [(ngModel)]="nombre" required />
      </mat-form-field>

      <div class="row">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="tipo">
            <mat-option [value]="'RETAIL'">RETAIL (reventa)</mat-option>
            <mat-option [value]="'RETAIL_INGREDIENTE'">RETAIL + INGREDIENTE</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="iva">
          <mat-label>IVA (%)</mat-label>
          <mat-select [(ngModel)]="iva">
            <mat-option [value]="10">10%</mat-option>
            <mat-option [value]="5">5%</mat-option>
            <mat-option [value]="0">Exento (0%)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Unidad base</mat-label>
          <mat-select [(ngModel)]="unidadBase">
            <mat-option value="UNIDAD">UNIDAD</mat-option>
            <mat-option value="KG">KG</mat-option>
            <mat-option value="LITRO">LITRO</mat-option>
            <mat-option value="GRAMO">GRAMO</mat-option>
            <mat-option value="MILILITRO">MILILITRO</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="full-width" *ngIf="codigoBarra">
        <mat-label>Código de barras detectado</mat-label>
        <input matInput [(ngModel)]="codigoBarra" />
        <mat-icon matSuffix matTooltip="Detectado del OCR (cod. del proveedor con formato GTIN)">qr_code_2</mat-icon>
      </mat-form-field>

      <mat-divider class="divisor"></mat-divider>
      <h4>Presentación principal</h4>
      <div class="row">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Nombre presentación</mat-label>
          <input matInput [(ngModel)]="presentacionNombre" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="qty">
          <mat-label>Cantidad</mat-label>
          <input matInput type="number" [(ngModel)]="presentacionCantidad" />
        </mat-form-field>
      </div>

      <mat-divider class="divisor"></mat-divider>
      <div class="toggles">
        <mat-slide-toggle [(ngModel)]="esVendible" color="primary">Vendible en PdV</mat-slide-toggle>
        <mat-slide-toggle [(ngModel)]="controlaStock" color="primary">Controla stock</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="saving || !nombre">
        <mat-icon>save</mat-icon>
        <span *ngIf="!saving">Crear (parcial)</span>
        <mat-spinner *ngIf="saving" diameter="18"></mat-spinner>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .title-icon { vertical-align: middle; margin-right: 6px; color: var(--accent, #ef6c00); }
    .hint {
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--surface-variant, rgba(255,255,255,0.05));
      padding: 8px 10px;
      border-radius: 4px;
      margin: 0 0 12px 0;
      strong { color: var(--text-primary); }
    }
    .full-width { width: 100%; display: block; margin-bottom: 4px; }
    .row { display: flex; gap: 12px; }
    .grow { flex: 1; }
    .qty { width: 140px; }
    .iva { width: 130px; }
    h4 { margin: 4px 0; color: var(--text-secondary); font-size: 13px; }
    .toggles { display: flex; gap: 24px; padding: 8px 0; flex-wrap: wrap; }
    .divisor { margin: 12px 0; }
  `],
})
export class CrearProductoInlineDialogComponent {
  nombre = '';
  tipo: string = 'RETAIL';
  unidadBase = 'UNIDAD';
  iva = 10;
  presentacionNombre = 'UNIDAD';
  presentacionCantidad = 1;
  codigoBarra = '';
  esVendible = true;
  controlaStock = true;
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: {
      descripcionOcr?: string;
      codigoProveedorOcr?: string | null;
      ivaOcr?: number | null;
      presentacionInferidaOcr?: any;
      unidadMedidaOcr?: string | null;
    },
    private repo: RepositoryService,
    private dialogRef: MatDialogRef<CrearProductoInlineDialogComponent>,
    private snackBar: MatSnackBar,
  ) {
    if (data?.descripcionOcr) {
      const desc = data.descripcionOcr.toUpperCase();
      const inf = inferirPresentacion(
        desc,
        data.codigoProveedorOcr || null,
        data.presentacionInferidaOcr || null,
        data.unidadMedidaOcr || null,
      );
      // Nombre LIMPIO (sin notacion de pack); fallback a desc original.
      this.nombre = inf.nombreProductoSugerido || desc;
      this.unidadBase = inf.unidadBase;
      this.presentacionNombre = inf.nombrePresentacion;
      this.presentacionCantidad = inf.cantidadPresentacion;
      if (inf.posibleGtin) {
        this.codigoBarra = inf.posibleGtin;
      }
    }
    // IVA del OCR si vino y es valido
    const ivaOcr = data?.ivaOcr;
    if (ivaOcr != null && [0, 5, 10].includes(Number(ivaOcr))) {
      this.iva = Number(ivaOcr);
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  guardar(): void {
    if (!this.nombre?.trim()) return;
    this.saving = true;
    this.repo.createProducto({
      nombre: this.nombre.trim().toUpperCase(),
      tipo: this.tipo as ProductoTipo,
      unidadBase: this.unidadBase,
      iva: Number(this.iva),
      esVendible: !!this.esVendible,
      esComprable: true,
      esIngrediente: this.tipo === 'RETAIL_INGREDIENTE',
      controlaStock: !!this.controlaStock,
      activo: true,
      registroCompleto: false,
      // subfamilia se deja null — el usuario clasifica luego desde gestion-producto
    } as any).subscribe({
      next: (prod: any) => {
        this.repo.createPresentacion({
          producto: { id: prod.id } as any,
          nombre: (this.presentacionNombre || 'UNIDAD').toUpperCase(),
          cantidad: Number(this.presentacionCantidad) || 1,
          principal: true,
          activo: true,
        } as any).subscribe({
          next: (pres: any) => {
            // Si hay GTIN, registrar también el código de barra
            if (this.codigoBarra?.trim()) {
              this.repo.createCodigoBarra({
                presentacion: { id: pres.id } as any,
                codigo: this.codigoBarra.trim(),
                principal: true,
                activo: true,
              } as any).subscribe({
                next: () => {
                  this.saving = false;
                  this.dialogRef.close({ producto: prod, presentacion: pres });
                },
                error: () => {
                  this.saving = false;
                  this.snackBar.open('Producto creado, falló registrar código de barra.', 'Cerrar', { duration: 5000 });
                  this.dialogRef.close({ producto: prod, presentacion: pres });
                },
              });
            } else {
              this.saving = false;
              this.dialogRef.close({ producto: prod, presentacion: pres });
            }
          },
          error: (err) => {
            this.saving = false;
            this.snackBar.open('Producto creado, error al crear presentación: ' + err?.message, 'Cerrar', { duration: 6000 });
            this.dialogRef.close({ producto: prod, presentacion: null });
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Error al crear producto: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
