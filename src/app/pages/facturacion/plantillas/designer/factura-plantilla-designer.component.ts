import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { FacturaPlantilla } from '../../../../database/entities/facturacion/factura-plantilla.entity';
import {
  CATALOGO_COLUMNAS_ITEM,
  CATALOGO_VARIABLES,
  PlantillaConfig,
  PlantillaElemento,
  VariableCatalogo,
  emptyPlantillaConfig,
} from '../plantilla-design.model';
import { buildDocDefinition, loadPdfMake, resolveVariable, FacturaRenderContext } from '../plantilla-render.util';

@Component({
  selector: 'app-factura-plantilla-designer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatExpansionModule,
    MatSnackBarModule,
  ],
  templateUrl: './factura-plantilla-designer.component.html',
  styleUrls: ['./factura-plantilla-designer.component.scss'],
})
export class FacturaPlantillaDesignerComponent {
  /** Recibido por el host de tabs vía setData (no por @Input). */
  data: any;

  plantilla?: FacturaPlantilla;
  config: PlantillaConfig = emptyPlantillaConfig();
  selected?: PlantillaElemento;

  /** Escala del lienzo: pixeles por milimetro (fijo, sin zoom por ahora). */
  pxPerMm = 3;
  isSaving = false;

  /** Dimensiones del lienzo en px (precomputadas; sin getters en template). */
  pageWidthPx = 210 * 3;
  pageHeightPx = 297 * 3;

  /** Posicion libre (px) por elemento para cdkDragFreeDragPosition. */
  freePos: { [id: string]: { x: number; y: number } } = {};

  /** Estilo (px) de la imagen de fondo (independiente del tamano de pagina). */
  bgWidthPx = 0;
  bgLeftPx = 0;
  bgTopPx = 0;

  /** Texto de previsualizacion por elemento (id -> texto). */
  previews: { [id: string]: string } = {};

  /** Filas demo por columna de items (id -> celdas) para el lienzo. */
  colRows: { [id: string]: string[] } = {};

  /** Variables agrupadas para la paleta. */
  grupos: { nombre: string; variables: VariableCatalogo[] }[] = [];

  /** Catalogo plano para el selector de variable en propiedades. */
  allVariables: VariableCatalogo[] = CATALOGO_VARIABLES;

  /** Campos de item disponibles para columnas individuales. */
  columnasItem = CATALOGO_COLUMNAS_ITEM;

  /** Contexto de ejemplo para previsualizar variables en el lienzo. */
  private demoCtx: FacturaRenderContext = {
    factura: { numeroCompleto: '001-001-0000123', fecha: new Date(), condicionVenta: 'CONTADO' },
    cliente: { nombre: 'JUAN PEREZ', ruc: '1234567-8', direccion: 'AV. SIEMPRE VIVA 123', email: 'cliente@mail.com' },
    timbrado: { numero: '12345678', vigencia: '01/01/2026 - 31/12/2026' },
    totales: { gravada10: 100000, gravada5: 0, exenta: 0, iva10: 9091, iva5: 0, totalIva: 9091, descuento: 0, total: 100000, totalEnLetras: 'CIEN MIL GUARANIES' },
    empresa: { nombre: 'MI EMPRESA S.A.', ruc: '80012345-6', direccion: 'CENTRO, ASUNCIÓN' },
    items: [
      { id: 101, cantidad: 1, descripcion: 'PRODUCTO DEMO 10%', precioUnitario: 100000, total: 100000, gravada10: 100000 },
      { id: 102, cantidad: 2, descripcion: 'PRODUCTO DEMO EXENTO', precioUnitario: 25000, total: 50000, exenta: 50000 },
    ],
  };

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    const map = new Map<string, VariableCatalogo[]>();
    for (const v of CATALOGO_VARIABLES) {
      if (!map.has(v.grupo)) map.set(v.grupo, []);
      map.get(v.grupo)!.push(v);
    }
    this.grupos = Array.from(map.entries()).map(([nombre, variables]) => ({ nombre, variables }));
  }

  /** Invocado por TabContentComponent al crear el tab (ver tab-content.component). */
  setData(data: any): void {
    this.data = data;
    const id = data?.plantillaId;
    if (id) this.load(id);
  }

  async load(id: number): Promise<void> {
    try {
      const p = await firstValueFrom(this.repositoryService.getFacturaPlantilla(id));
      this.plantilla = p;
      this.config = p?.config ? JSON.parse(p.config) : emptyPlantillaConfig();
      if (!this.config.elementos) this.config.elementos = [];
      this.recomputePage();
      this.ensureBackground();
      this.recomputeBg();
      this.refreshPreviews();
      for (const el of this.config.elementos) this.setFreePos(el);
    } catch (error) {
      console.error('Error loading plantilla:', error);
      this.snackBar.open('Error al cargar la plantilla', 'Cerrar', { duration: 4000 });
    }
  }

  // -------- helpers de escala --------
  recomputePage(): void {
    this.pageWidthPx = (Number(this.plantilla?.anchoMm) || 210) * this.pxPerMm;
    this.pageHeightPx = (Number(this.plantilla?.altoMm) || 297) * this.pxPerMm;
  }

  setFreePos(el: PlantillaElemento): void {
    this.freePos[el.id] = { x: (el.xMm || 0) * this.pxPerMm, y: (el.yMm || 0) * this.pxPerMm };
  }

  /** Asegura que exista la config de fondo (ancho = pagina por defecto). */
  private ensureBackground(): void {
    if (!this.config.background) {
      this.config.background = {
        widthMm: Number(this.plantilla?.anchoMm) || 210,
        offsetXMm: 0,
        offsetYMm: 0,
      };
    }
  }

  /** Recalcula el estilo px de la imagen de fondo segun su transform. */
  recomputeBg(): void {
    const b = this.config.background;
    this.bgWidthPx = (Number(b?.widthMm) || Number(this.plantilla?.anchoMm) || 210) * this.pxPerMm;
    this.bgLeftPx = (Number(b?.offsetXMm) || 0) * this.pxPerMm;
    this.bgTopPx = (Number(b?.offsetYMm) || 0) * this.pxPerMm;
  }

  private genId(): string {
    return 'el-' + Math.random().toString(36).slice(2, 9);
  }

  private refreshPreviews(): void {
    this.previews = {};
    for (const el of this.config.elementos) this.updatePreview(el);
  }

  updatePreview(el: PlantillaElemento): void {
    if (el.type === 'variable') {
      this.previews[el.id] = resolveVariable(el.variable || '', this.demoCtx) || `{${el.variable}}`;
    } else if (el.type === 'text') {
      this.previews[el.id] = el.text || 'Texto';
    } else if (el.type === 'itemsTable') {
      this.previews[el.id] = 'Tabla de ítems';
    } else if (el.type === 'itemColumn') {
      const found = this.columnasItem.find((c) => c.field === el.field);
      this.previews[el.id] = found?.header || el.field || 'Columna';
      this.colRows[el.id] = this.demoCtx.items.map((it) => {
        const raw = (it as any)[el.field || ''];
        if (el.field === 'descripcion' || el.field === 'id') return raw != null ? String(raw) : '';
        return raw == null || raw === '' ? '' : Number(raw).toLocaleString('es-PY');
      });
    } else {
      this.previews[el.id] = '';
    }
  }

  // -------- agregar elementos --------
  addVariable(v: VariableCatalogo): void {
    const el: PlantillaElemento = {
      id: this.genId(), type: 'variable', variable: v.key,
      xMm: 10, yMm: 10, fontSize: 9, bold: false, align: 'left',
    };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  addText(): void {
    const el: PlantillaElemento = {
      id: this.genId(), type: 'text', text: 'Nuevo texto',
      xMm: 10, yMm: 10, fontSize: 9, bold: false, align: 'left',
    };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  addLine(): void {
    const el: PlantillaElemento = { id: this.genId(), type: 'line', xMm: 10, yMm: 20, wMm: 60 };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  addBox(): void {
    const el: PlantillaElemento = { id: this.genId(), type: 'box', xMm: 10, yMm: 20, wMm: 40, hMm: 15 };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  addItemsTable(): void {
    const el: PlantillaElemento = {
      id: this.genId(), type: 'itemsTable', xMm: 10, yMm: 60, wMm: 150, hMm: 80, fontSize: 8,
      columns: [
        { field: 'id', header: 'ID', wMm: 12, align: 'center' },
        { field: 'cantidad', header: 'Cant.', wMm: 15, align: 'right' },
        { field: 'descripcion', header: 'Descripción', wMm: 70, align: 'left' },
        { field: 'precioUnitario', header: 'P. Unit.', wMm: 25, align: 'right' },
        { field: 'total', header: 'Total', wMm: 28, align: 'right' },
      ],
    };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  private colWidthFor(field: string): number {
    const map: { [k: string]: number } = {
      id: 12, cantidad: 15, descripcion: 70, precioUnitario: 25,
      descuento: 20, exenta: 22, gravada5: 22, gravada10: 22, total: 28,
    };
    return map[field] || 25;
  }

  private colAlignFor(field: string): 'left' | 'center' | 'right' {
    if (field === 'descripcion') return 'left';
    if (field === 'id') return 'center';
    return 'right';
  }

  /** Agrega una columna de items individual (posicionable y redimensionable). */
  addItemColumn(field: string): void {
    const el: PlantillaElemento = {
      id: this.genId(), type: 'itemColumn', field,
      xMm: 10, yMm: 60, wMm: this.colWidthFor(field), rowHeightMm: 5, rows: 6,
      fontSize: 8, align: this.colAlignFor(field),
    };
    this.config.elementos.push(el);
    this.setFreePos(el);
    this.updatePreview(el);
    this.selected = el;
  }

  // -------- seleccion / drag --------
  select(el: PlantillaElemento, ev: MouseEvent): void {
    ev.stopPropagation();
    this.selected = el;
  }

  clearSelection(): void {
    this.selected = undefined;
  }

  onDragEnded(el: PlantillaElemento, ev: CdkDragEnd): void {
    const pos = ev.source.getFreeDragPosition();
    el.xMm = Math.max(0, Math.round((pos.x / this.pxPerMm) * 10) / 10);
    el.yMm = Math.max(0, Math.round((pos.y / this.pxPerMm) * 10) / 10);
  }

  deleteSelected(): void {
    if (!this.selected) return;
    this.config.elementos = this.config.elementos.filter((e) => e.id !== this.selected!.id);
    delete this.previews[this.selected.id];
    this.selected = undefined;
  }

  onBackgroundSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.plantilla) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.plantilla!.backgroundImageUrl = reader.result as string;
      this.ensureBackground();
      this.recomputeBg();
    };
    reader.readAsDataURL(file);
  }

  clearBackground(): void {
    if (this.plantilla) this.plantilla.backgroundImageUrl = undefined;
  }

  // -------- guardar / previsualizar --------
  async save(): Promise<void> {
    if (!this.plantilla?.id) return;
    this.isSaving = true;
    try {
      // Serializa solo campos conocidos del modelo.
      const clean: PlantillaConfig = {
        version: this.config.version || 1,
        elementos: this.config.elementos.map((e) => ({
          id: e.id, type: e.type, xMm: e.xMm, yMm: e.yMm, wMm: e.wMm, hMm: e.hMm,
          text: e.text, variable: e.variable, imageUrl: e.imageUrl,
          fontSize: e.fontSize, bold: e.bold, align: e.align, columns: e.columns,
          showHeader: e.showHeader, field: e.field, rowHeightMm: e.rowHeightMm, rows: e.rows,
        })),
        background: this.config.background,
      };
      await firstValueFrom(this.repositoryService.updateFacturaPlantilla(this.plantilla.id, {
        config: JSON.stringify(clean),
        anchoMm: this.plantilla.anchoMm,
        altoMm: this.plantilla.altoMm,
        backgroundImageUrl: this.plantilla.backgroundImageUrl,
      }));
      this.snackBar.open('Diseño guardado', 'Cerrar', { duration: 2500 });
    } catch (error: any) {
      this.snackBar.open(error?.message || 'Error al guardar el diseño', 'Cerrar', { duration: 4000 });
    } finally {
      this.isSaving = false;
    }
  }

  async preview(): Promise<void> {
    if (!this.plantilla) return;
    try {
      const pdfMake = await loadPdfMake();
      // En pre-impreso NO se imprime el fondo (la hoja ya esta impresa); en A4 si.
      const includeBg = String(this.plantilla.tipo) !== 'PRE_IMPRESO' && !!this.plantilla.backgroundImageUrl;
      const dd = buildDocDefinition(
        { anchoMm: Number(this.plantilla.anchoMm), altoMm: Number(this.plantilla.altoMm) },
        this.config,
        this.demoCtx,
        includeBg ? { background: this.plantilla.backgroundImageUrl, backgroundTransform: this.config.background } : undefined,
      );
      pdfMake.createPdf(dd).open();
    } catch (error: any) {
      console.error('Error preview:', error);
      this.snackBar.open('No se pudo generar la vista previa', 'Cerrar', { duration: 4000 });
    }
  }
}
