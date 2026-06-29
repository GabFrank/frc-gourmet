/**
 * Modelo del diseno de plantilla de factura producido por el disenador visual.
 *
 * El diseno se serializa a JSON y se guarda en `FacturaPlantilla.config`.
 * El mismo modelo lo consume el renderizador (plantilla-render.util) para
 * generar el PDF, tanto para el modo pre-impreso (solo posiciona texto sobre
 * la hoja ya impresa) como para auto-impreso A4 (dibuja todo el documento).
 *
 * Todas las coordenadas y tamanos estan en milimetros para ser independientes
 * del zoom del disenador y mapear directo a la pagina fisica.
 */

export type ElementoTipo = 'text' | 'variable' | 'line' | 'box' | 'image' | 'itemsTable' | 'itemColumn';

export type Alineacion = 'left' | 'center' | 'right';

export interface ItemColumna {
  /** Campo del item a mostrar (ver CATALOGO_COLUMNAS_ITEM). */
  field: string;
  header: string;
  /** Ancho de la columna en mm. */
  wMm: number;
  align?: Alineacion;
}

export interface PlantillaElemento {
  id: string;
  type: ElementoTipo;
  /** Posicion (esquina superior izquierda) en mm. */
  xMm: number;
  yMm: number;
  /** Tamano en mm (opcional segun tipo). */
  wMm?: number;
  hMm?: number;
  /** Texto fijo (type='text'). */
  text?: string;
  /** Clave de variable (type='variable'; ver CATALOGO_VARIABLES). */
  variable?: string;
  /** URL/base64 de imagen (type='image'). */
  imageUrl?: string;
  fontSize?: number; // pt
  bold?: boolean;
  align?: Alineacion;
  /** Columnas (type='itemsTable'). */
  columns?: ItemColumna[];
  /** Mostrar fila de encabezados (type='itemsTable'). Default false: la hoja
   *  pre-impresa ya trae los titulos de columna. */
  showHeader?: boolean;
  /** Campo del item a renderizar (type='itemColumn'; ver CATALOGO_COLUMNAS_ITEM). */
  field?: string;
  /** Alto de fila en mm (type='itemColumn'): separacion vertical entre items. */
  rowHeightMm?: number;
  /** Cantidad de filas guia a dibujar en el disenador (type='itemColumn'). */
  rows?: number;
}

/**
 * Transformacion de la imagen de fondo de referencia. Independiente del tamano
 * de pagina: permite usar un escaneo A4 (con 2 facturas) como referencia
 * mientras la plantilla mide media hoja, ajustando ancho y desplazamiento para
 * alinear el sector deseado del escaneo.
 */
export interface BackgroundTransform {
  /** Ancho con el que se dibuja la imagen, en mm (el alto se ajusta por aspecto). */
  widthMm: number;
  /** Desplazamiento horizontal en mm (puede ser negativo para "pan"). */
  offsetXMm: number;
  /** Desplazamiento vertical en mm (puede ser negativo). */
  offsetYMm: number;
}

export interface PlantillaConfig {
  version: number;
  elementos: PlantillaElemento[];
  /** Ajuste de la imagen de fondo de referencia (solo diseno; ver TipoPlantilla). */
  background?: BackgroundTransform;
  /**
   * Alto de fila (mm) UNICO para todas las columnas de items (type='itemColumn').
   * Asegura que las filas queden alineadas y con separacion consistente. Si
   * esta definido, tiene prioridad sobre el rowHeightMm por columna.
   */
  itemRowHeightMm?: number;
}

/** Variable bindeable disponible en el disenador. */
export interface VariableCatalogo {
  key: string;
  label: string;
  grupo: string;
  ejemplo: string;
}

/**
 * Catalogo de variables que el usuario puede arrastrar al diseno. El
 * renderizador resuelve estas claves contra el contexto de la factura.
 */
export const CATALOGO_VARIABLES: VariableCatalogo[] = [
  { key: 'factura.numeroCompleto', label: 'Nº de factura', grupo: 'Factura', ejemplo: '001-001-0000123' },
  { key: 'factura.fecha', label: 'Fecha', grupo: 'Factura', ejemplo: '27/06/2026' },
  { key: 'factura.condicionVenta', label: 'Condición de venta', grupo: 'Factura', ejemplo: 'CONTADO' },
  { key: 'factura.marcaContado', label: 'Marca "X" si CONTADO', grupo: 'Factura', ejemplo: 'X' },
  { key: 'factura.marcaCredito', label: 'Marca "X" si CRÉDITO', grupo: 'Factura', ejemplo: '' },
  { key: 'cliente.nombre', label: 'Cliente / Razón social', grupo: 'Cliente', ejemplo: 'JUAN PEREZ' },
  { key: 'cliente.ruc', label: 'RUC / CI', grupo: 'Cliente', ejemplo: '1234567-8' },
  { key: 'cliente.direccion', label: 'Dirección', grupo: 'Cliente', ejemplo: 'AV. SIEMPRE VIVA 123' },
  { key: 'cliente.email', label: 'Email', grupo: 'Cliente', ejemplo: 'cliente@mail.com' },
  { key: 'timbrado.numero', label: 'Nº de timbrado', grupo: 'Timbrado', ejemplo: '12345678' },
  { key: 'timbrado.vigencia', label: 'Vigencia timbrado', grupo: 'Timbrado', ejemplo: '01/01/2026 - 31/12/2026' },
  { key: 'totales.exenta', label: 'Subtotal Exenta (IVA 0)', grupo: 'Totales', ejemplo: '0' },
  { key: 'totales.gravada5', label: 'Subtotal Gravada 5%', grupo: 'Totales', ejemplo: '0' },
  { key: 'totales.gravada10', label: 'Subtotal Gravada 10%', grupo: 'Totales', ejemplo: '100.000' },
  { key: 'totales.iva10', label: 'IVA 10%', grupo: 'Totales', ejemplo: '9.091' },
  { key: 'totales.iva5', label: 'IVA 5%', grupo: 'Totales', ejemplo: '0' },
  { key: 'totales.totalIva', label: 'Total IVA', grupo: 'Totales', ejemplo: '9.091' },
  { key: 'totales.descuento', label: 'Descuento', grupo: 'Totales', ejemplo: '0' },
  { key: 'totales.total', label: 'TOTAL', grupo: 'Totales', ejemplo: '100.000' },
  { key: 'totales.totalEnLetras', label: 'Total en letras', grupo: 'Totales', ejemplo: 'CIEN MIL GUARANIES' },
  { key: 'empresa.nombre', label: 'Empresa', grupo: 'Empresa', ejemplo: 'MI EMPRESA S.A.' },
  { key: 'empresa.ruc', label: 'RUC empresa', grupo: 'Empresa', ejemplo: '80012345-6' },
  { key: 'empresa.direccion', label: 'Dirección empresa', grupo: 'Empresa', ejemplo: 'CENTRO, ASUNCIÓN' },
];

/** Columnas disponibles para el bloque de tabla de items. */
export const CATALOGO_COLUMNAS_ITEM: { field: string; header: string }[] = [
  { field: 'id', header: 'ID' },
  { field: 'cantidad', header: 'Cant.' },
  { field: 'descripcion', header: 'Descripción' },
  { field: 'precioUnitario', header: 'Precio unit.' },
  { field: 'descuento', header: 'Descuento' },
  { field: 'exenta', header: 'Exenta' },
  { field: 'gravada5', header: 'Gravada 5%' },
  { field: 'gravada10', header: 'Gravada 10%' },
  { field: 'total', header: 'Total' },
];

export function emptyPlantillaConfig(): PlantillaConfig {
  return { version: 1, elementos: [] };
}
