/**
 * Helpers para construir y renderizar tickets térmicos (80mm/58mm).
 *
 * El flujo es:
 *   1. Construir un `TicketSpec` (lista estructurada de líneas) usando los
 *      helpers `ticketHeaderEmpresa`, `ticketKv`, etc. — no es texto plano,
 *      tiene tipos para alineación, tamaño, separadores, QR, imágenes, etc.
 *   2. Llamar `printTicketSpec(printerCfg, spec)` que abre el `ThermalPrinter`
 *      del paquete `node-thermal-printer` e interpreta el spec emitiendo
 *      comandos ESC/POS (no texto plano).
 *   3. Para impresoras CUPS (Linux/macOS) cuando el address empieza con
 *      `ticket-` se hace fallback a `renderTicketToPlainText` + comando `lp`.
 *
 * **Por qué un spec intermedio:** evita texto con padding hardcodeado y permite
 * cambiar de librería sin reescribir cada documento. Si en el futuro pasamos a
 * `escpos` o `printer-driver-rastertopdfwhatever`, solo cambia el intérprete.
 *
 * **Width convencional:** 48 chars para 80mm, 32 chars para 58mm. Lo declara
 * la entity `Printer.width`.
 */

import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DataSource } from 'typeorm';
import { Empresa } from '../../src/app/database/entities/sistema/empresa.entity';
import { getPrinterType, getCharacterSet } from './printer.utils';
import { sendLprJob, parseLprAddress } from './lpr.utils';
import { getSystemPrinterDriver } from './system-printer.utils';
import { probeTcp } from './network-printer-scan.utils';

// ============================================================
// SPEC
// ============================================================

export type TicketAlign = 'L' | 'C' | 'R';
export type TicketSize = 'normal' | 'tall' | 'wide' | 'big';

export type TicketLine =
  | { type: 'text'; text: string; align?: TicketAlign; bold?: boolean; size?: TicketSize; invert?: boolean; underline?: boolean }
  | { type: 'separator'; char?: string }              // línea de '-' por todo el ancho
  | { type: 'blank'; count?: number }                 // saltos de línea
  | { type: 'kv'; key: string; value: string; bold?: boolean }   // 'Total ........... 15.000'
  | { type: 'columns'; cols: { text: string; width: number; align?: TicketAlign }[] }
  | { type: 'cut' }
  | { type: 'qr'; data: string; size?: number }       // size 1..8 (default 6)
  | { type: 'image'; path: string }                   // path absoluto local
  | { type: 'beep' };

export interface TicketSpec {
  printerWidth: number;          // 48 (80mm) o 32 (58mm)
  lines: TicketLine[];
  cutAtEnd?: boolean;            // default true
  beepAtEnd?: boolean;           // default false
}

// ============================================================
// BUILDERS (composición de specs)
// ============================================================

/**
 * Deja el texto en algo que una impresora térmica pueda imprimir de verdad.
 *
 * El charset por defecto es **CP437**, y todo lo que no entra ahí la librería
 * lo manda como `?`. Es un fallo silencioso: el ticket sale, nadie ve un error,
 * y en el papel aparece un signo de pregunta donde iba un carácter.
 *
 * Verificado contra CP437 el 2026-08-25:
 * - Se pierden: `×` `—` `–` `→` `€` `₲` `✓` y **`Á`**.
 * - Sobreviven: `á é í ó ú ñ Ñ ü É ¿ ¡ · º °`.
 *
 * El `·` entra en esa lista pero igual se degrada a `-`: existe en CP437, pero
 * en térmica de 203dpi queda casi invisible, y el separador de variación
 * («GRANDE · BACON») es justo donde tiene que leerse.
 *
 * Lo de `Á` es lo que más muerde, porque **todos los strings van en
 * UPPERCASE**: un cliente llamado «Ángel» se imprimía «?NGEL». No es un caso
 * de borde, es cualquier nombre con tilde en la primera letra.
 *
 * Estrategia: primero un mapa explícito para los tipográficos (donde hay un
 * equivalente ASCII obvio y mejor que perder el carácter), y después
 * descomposición Unicode para las vocales acentuadas que el charset no tiene —
 * «ÁNGEL» sale «ANGEL», que se lee, en vez de «?NGEL», que no.
 *
 * No se usa `iconv` para decidir qué se pierde a propósito: sería exacto pero
 * ata este helper a una dependencia transitiva de la librería de impresión.
 */
const REEMPLAZOS_TICKET: Record<string, string> = {
  '×': 'x', '·': '-', '—': '-', '–': '-', '‑': '-',
  '→': '->', '←': '<-', '…': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'", '«': '"', '»': '"',
  '€': 'EUR', '₲': 'Gs.', '✓': 'OK', '✗': 'X', '•': '*',
};

/** Los no-ASCII que CP437 SÍ tiene y conviene conservar. */
const SEGUROS_CP437 = 'áéíóúñÑüÉ¿¡ºÀÂÄÅÇÈÊËÌÎÏÔÖÒÙÛÜßæÆôöòûùÿÖÜ¢£¥₧ƒªí°';

export function sanitizarParaTicket(texto: string): string {
  if (!texto) return texto;
  let out = '';
  for (const ch of texto) {
    if (ch.charCodeAt(0) < 128) { out += ch; continue; }
    if (REEMPLAZOS_TICKET[ch] !== undefined) { out += REEMPLAZOS_TICKET[ch]; continue; }
    if (SEGUROS_CP437.includes(ch)) { out += ch; continue; }
    // Última chance: sacarle el acento. `Á` → `A`, que se lee.
    const plano = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += plano.charCodeAt(0) < 128 ? plano : '?';
  }
  return out;
}

/**
 * La cantidad de un ítem, con la `x` separada del número.
 *
 * `1x   PIZZA` pega la x al número y se lee como parte de él; `1  x   PIZZA`
 * la deja como lo que es, un separador entre la cantidad y el producto. En un
 * ticket angosto y leído de reojo, esa distancia es la diferencia entre ver
 * «uno por pizza» y ver «1x» como un código.
 *
 * Devuelve un bloque de ancho fijo para que las cantidades queden alineadas
 * entre sí en columna: la `x` cae siempre en la misma posición, aunque una
 * línea diga 1 y la siguiente 12.
 */
export function ticketCantidad(qty: number | string, ancho: number = 6): string {
  const n = String(qty);
  // La x va después del número, dejando al menos un espacio, y el resto se
  // rellena a la derecha. Con una cantidad larga (12) el bloque no se rompe:
  // empuja la x un lugar en vez de desbordar la columna.
  const posX = Math.max(n.length + 1, Math.floor(ancho / 2));
  return (n.padEnd(posX, ' ') + 'x').padEnd(ancho, ' ');
}

export function ticketText(text: string, opts: Omit<Extract<TicketLine, { type: 'text' }>, 'type' | 'text'> = {}): TicketLine {
  text = sanitizarParaTicket(text);
  return { type: 'text', text, ...opts };
}

export function ticketSeparador(char: string = '-'): TicketLine {
  return { type: 'separator', char };
}

export function ticketBlank(count: number = 1): TicketLine {
  return { type: 'blank', count };
}

export function ticketKv(key: string, value: string, bold = false): TicketLine {
  key = sanitizarParaTicket(key);
  value = sanitizarParaTicket(value);
  return { type: 'kv', key, value, bold };
}

export function ticketColumns(cols: { text: string; width: number; align?: TicketAlign }[]): TicketLine {
  // Sanear ANTES de medir: `→` pasa a `->` y `…` a `...`, así que hacerlo
  // después del cálculo de padding correría las columnas.
  cols = cols.map((c) => ({ ...c, text: sanitizarParaTicket(c.text) }));
  return { type: 'columns', cols };
}

export function ticketCut(): TicketLine { return { type: 'cut' }; }
export function ticketBeep(): TicketLine { return { type: 'beep' }; }

/** Renderiza líneas de firma — útil para retiros, vales, recibos térmicos. */
export function ticketLineasFirma(width: number, label: string): TicketLine[] {
  return [
    ticketBlank(2),
    ticketText('_'.repeat(Math.min(width - 4, 30)), { align: 'C' }),
    ticketText(label.toUpperCase(), { align: 'C' }),
  ];
}

/** Header con datos de empresa (cacheado igual que pdf.utils — TTL 60s). */
let _empresaCache: { data: Empresa | null; expires: number } = { data: null, expires: 0 };

export function invalidateTicketEmpresaCache(): void {
  _empresaCache = { data: null, expires: 0 };
}

async function getEmpresaCached(dataSource: DataSource): Promise<Empresa | null> {
  const now = Date.now();
  if (_empresaCache.expires > now && _empresaCache.data) return _empresaCache.data;
  let empresa: Empresa | null = null;
  try {
    empresa = await dataSource.getRepository(Empresa).findOne({ where: { id: 1 } as any });
  } catch (e) {
    console.warn('ticket.utils: no se pudo cargar Empresa', e);
  }
  _empresaCache = { data: empresa, expires: now + 60_000 };
  return empresa;
}

export interface TicketHeaderOpts {
  showLogo?: boolean;
  showTimbrado?: boolean;
  showLogoImagePath?: string;  // path absoluto a un PNG monocromo del logo
}

/**
 * Header con datos de empresa para ticket térmico. No incluye separator final.
 * Para logo bitmap usar `showLogoImagePath` (PNG monocromo) — el Empresa.logoUrl
 * normal es color, no sirve sin pre-procesar.
 */
export async function ticketHeaderEmpresa(
  dataSource: DataSource,
  width: number,
  opts: TicketHeaderOpts = {}
): Promise<TicketLine[]> {
  const empresa = await getEmpresaCached(dataSource);
  const lines: TicketLine[] = [];

  if (opts.showLogoImagePath && fs.existsSync(opts.showLogoImagePath)) {
    lines.push({ type: 'image', path: opts.showLogoImagePath });
  }

  if (empresa) {
    const nombre = (empresa.razonSocial || empresa.nombre || '').toUpperCase();
    if (nombre) lines.push(ticketText(nombre, { align: 'C', bold: true, size: 'tall' }));
    if (empresa.ruc) lines.push(ticketText(`RUC: ${empresa.ruc}`, { align: 'C' }));
    if (empresa.direccion) lines.push(ticketText(empresa.direccion, { align: 'C' }));
    if (empresa.telefono) lines.push(ticketText(`Tel: ${empresa.telefono}`, { align: 'C' }));
    if (opts.showTimbrado && empresa.timbradoNumero) {
      lines.push(ticketText(`Timbrado: ${empresa.timbradoNumero}`, { align: 'C' }));
      if (empresa.puntoExpedicion) {
        lines.push(ticketText(`Pto. Exp.: ${empresa.puntoExpedicion}`, { align: 'C' }));
      }
    }
  }
  return lines;
}

/**
 * Bloque de totales tipo 'Subtotal............. 15.000' al final del ticket.
 * Cada item se imprime con padding entre key y value para llenar el ancho.
 */
export function ticketTotales(items: { label: string; monto: string; bold?: boolean }[]): TicketLine[] {
  return items.map(it => ticketKv(it.label, it.monto, !!it.bold));
}

// ============================================================
// RENDER → THERMAL PRINTER (ESC/POS)
// ============================================================

/**
 * Devuelve la cantidad de **caracteres por línea (columnas)** que usan los
 * templates ESC/POS, a partir del campo `printer.width`.
 *
 * La cantidad de columnas NO se puede deducir de forma confiable del ancho
 * físico en mm, porque depende de la tecnología de la impresora y de la
 * fuente activa. Ejemplos reales:
 *   - Térmica 58mm  (Font A) → 32 columnas
 *   - Térmica 80mm  (Font A) → 48 columnas
 *   - Matriz de punto 9 pines 76mm (ej. Epson TM-U220, Font A) → 40 columnas
 *
 * Por eso la UI configura **directamente la cantidad de columnas** y ese es
 * el valor que se guarda en `printer.width` (32, 40, 42, 48...).
 *
 * Interpretación del valor guardado (retrocompatible):
 *   - `< 50`  → ya es cantidad de columnas configurada directamente (nuevo).
 *   - `>= 50` → valor legacy expresado en mm; se mapea a columnas por densidad
 *               térmica estándar (58mm→32, 80mm→48).
 */
export function printerWidthToChars(width?: number | null): number {
  const w = Number(width || 0);
  if (!w || w <= 0) return 48; // default 80mm térmica

  // Nuevo: el valor es la cantidad de columnas configurada directamente.
  if (w < 50) return Math.max(20, Math.round(w)); // 32, 40, 42, 48...

  // Legacy: el valor está en mm → mapear a columnas (densidad térmica).
  if (w <= 68) return 32;   // 58mm
  if (w < 76) return 42;    // 70-75mm
  if (w <= 85) return 48;   // 76-80mm
  return Math.min(64, Math.round(w));
}

/**
 * Devuelve un símbolo de moneda **ASCII-safe** para imprimir en térmicas
 * con character sets limitados (PC437, PC850, etc. que no incluyen ₲, R$).
 *
 * Convención:
 *   - PYG / Guaraní → "Gs."
 *   - USD / Dolar   → "$"
 *   - BRL / Real    → "R$"
 *   - cualquier otro → el código de moneda (3 letras) en mayúsculas.
 *
 * Recibe la entity Moneda (con campos `simbolo`, `codigo`, `nombre`).
 * Nunca devuelve caracteres Unicode no-ASCII para evitar el bug del "?".
 */
export function monedaSimboloAscii(moneda?: any): string {
  if (!moneda) return 'Gs.';
  // La entidad Moneda no tiene `codigo`/`nombre`: los campos reales son
  // `countryCode` (PY/US/BR...), `simbolo` (puede ser no-ASCII, ej. '₲') y
  // `denominacion`. Mapear por countryCode da un símbolo ASCII estable para la
  // impresora térmica; si no matchea, se usa el símbolo guardado sanitizado a
  // ASCII y, como último recurso, la denominación.
  const cc = String(moneda.countryCode || '').toUpperCase();
  switch (cc) {
    case 'PY': return 'Gs.';
    case 'US': return '$';
    case 'BR': return 'R$';
    case 'AR': return '$';
    case 'EU':
    case 'ES': return 'EUR';
  }
  const sim = String(moneda.simbolo || '').replace(/[^\x20-\x7E]/g, '').trim();
  if (sim) return sim;
  return String(moneda.denominacion || 'Gs.').toUpperCase().slice(0, 6);
}

/**
 * Crea un `ThermalPrinter` desde una row `Printer` de BD.
 */
function buildThermalPrinter(printer: any): ThermalPrinter {
  let interfaceConfig: string;
  let driver: any;
  if (printer.connectionType === 'network') {
    interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
  } else if (printer.connectionType === 'bluetooth') {
    interfaceConfig = `bt:${printer.address}`;
  } else if (printer.connectionType === 'system') {
    // Impresora instalada en el SO: se imprime RAW por el spooler usando el
    // nombre. Requiere el driver nativo (@thiagoelg/node-printer).
    interfaceConfig = `printer:${printer.address}`;
    driver = getSystemPrinterDriver();
  } else if (printer.connectionType === 'lpr') {
    // Dummy interface: solo se usa el ThermalPrinter para acumular bytes
    // en su buffer interno y extraerlos con getBuffer() — nunca se llama
    // a isPrinterConnected() ni execute() en este branch.
    interfaceConfig = 'tcp://127.0.0.1:1';
  } else {
    interfaceConfig = printer.address;
  }

  return new ThermalPrinter({
    type: getPrinterType(printer.type) as PrinterTypes,
    interface: interfaceConfig,
    driver,
    options: { timeout: 5000 },
    width: printerWidthToChars(printer.width),
    characterSet: (printer.characterSet ? getCharacterSet(printer.characterSet) : CharacterSet.PC437_USA) as CharacterSet,
    removeSpecialCharacters: false,
  } as any);
}

/**
 * Aplica un `TicketLine` al `ThermalPrinter`. No hace `execute`.
 */
async function applyLine(tp: ThermalPrinter, line: TicketLine, width: number): Promise<void> {
  switch (line.type) {
    case 'text': {
      if (line.align === 'C') tp.alignCenter();
      else if (line.align === 'R') tp.alignRight();
      else tp.alignLeft();

      if (line.bold) tp.bold(true);
      if (line.underline) tp.underline(true);
      if (line.invert) tp.invert(true);

      if (line.size === 'tall') tp.setTextDoubleHeight();
      else if (line.size === 'wide') tp.setTextDoubleWidth();
      else if (line.size === 'big') tp.setTextQuadArea();
      else tp.setTextNormal();

      tp.println(line.text);

      // reset
      if (line.bold) tp.bold(false);
      if (line.underline) tp.underline(false);
      if (line.invert) tp.invert(false);
      if (line.size && line.size !== 'normal') tp.setTextNormal();
      break;
    }
    case 'separator': {
      tp.alignLeft();
      tp.println((line.char || '-').repeat(width));
      break;
    }
    case 'blank': {
      for (let i = 0; i < (line.count || 1); i++) tp.newLine();
      break;
    }
    case 'kv': {
      tp.alignLeft();
      if (line.bold) tp.bold(true);
      const padding = Math.max(1, width - line.key.length - line.value.length);
      tp.println(line.key + ' '.repeat(padding) + line.value);
      if (line.bold) tp.bold(false);
      break;
    }
    case 'columns': {
      tp.alignLeft();
      const out: string[] = [];
      for (const c of line.cols) {
        const text = String(c.text || '').slice(0, c.width);
        const pad = c.width - text.length;
        if (c.align === 'R') out.push(' '.repeat(pad) + text);
        else if (c.align === 'C') out.push(' '.repeat(Math.floor(pad / 2)) + text + ' '.repeat(Math.ceil(pad / 2)));
        else out.push(text + ' '.repeat(pad));
      }
      tp.println(out.join(''));
      break;
    }
    case 'cut': {
      tp.cut({ verticalTabAmount: 0 });
      break;
    }
    case 'qr': {
      tp.alignCenter();
      tp.printQR(line.data, { cellSize: line.size || 6 } as any);
      break;
    }
    case 'image': {
      try {
        await tp.printImage(line.path);
      } catch (e) {
        console.warn('ticket image print failed:', line.path, e);
      }
      break;
    }
    case 'beep': {
      tp.beep();
      break;
    }
  }
}

/**
 * Líneas en blanco que se alimentan al pie de TODO ticket antes del corte.
 * El cortante de las térmicas/matriciales está ~2-3 cm por encima del cabezal,
 * así que sin este feed las últimas líneas quedan por encima del corte (se
 * "comen"). Centralizado acá para que aplique a todos los tickets por igual.
 */
const BOTTOM_SAFE_FEED = 6;

/**
 * Líneas en blanco al inicio de cada ticket. Sin este margen, la primera línea
 * (típicamente el nombre de la empresa en doble alto) sale recortada por la
 * mitad, porque el papel no avanzó lo suficiente cuando arranca el cabezal.
 */
const TOP_SAFE_FEED = 2;

function feedTopSafeArea(tp: ThermalPrinter): void {
  for (let i = 0; i < TOP_SAFE_FEED; i++) tp.newLine();
}

function feedBottomSafeArea(tp: ThermalPrinter): void {
  for (let i = 0; i < BOTTOM_SAFE_FEED; i++) tp.newLine();
}

/**
 * Construye las líneas de una PRUEBA DE IMPRESIÓN diagnóstica: sirve para
 * verificar que la impresora esté configurada con la cantidad de columnas
 * correcta y que los márgenes superior/inferior no recorten el contenido.
 *
 * Incluye:
 *  - Datos de la impresora y columnas configuradas.
 *  - Una REGLA de caracteres (línea de unidades + decenas) para contar cuántas
 *    columnas entran realmente. Si la impresora hace wrap, las columnas
 *    configuradas superan la capacidad real → hay que bajarlas.
 *  - Muestras de alineación (izq/centro/der) y de tamaños (normal/alto/ancho/
 *    grande).
 *  - Una tabla de columnas (igual al comprobante) para verificar la separación.
 *  - Marcadores de inicio y fin para chequear los márgenes.
 */
export function buildTestTicketLines(printer: any): TicketLine[] {
  const width = printerWidthToChars(printer.width);

  // Regla de caracteres: unidades (1..0 repetido) y decenas (marca cada 10).
  let units = '';
  let tens = '';
  for (let i = 1; i <= width; i++) {
    units += String(i % 10);
    tens += (i % 10 === 0) ? String(Math.floor(i / 10) % 10) : ' ';
  }

  const tech = [printer.type, printer.connectionType].filter(Boolean).join(' / ');

  const lines: TicketLine[] = [
    ticketText('<< INICIO DEL TICKET >>', { align: 'C' }),
    ticketSeparador('='),
    ticketText('PRUEBA DE IMPRESION', { align: 'C', bold: true, size: 'tall' }),
    ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
    ticketSeparador('='),
    ticketText(`Impresora: ${(printer.name || '-').toUpperCase()}`),
    ticketText(`Tecnologia: ${tech || '-'}`),
    ticketText(`Columnas configuradas: ${width}`, { bold: true }),
    ticketSeparador('-'),
    ticketText('REGLA DE CARACTERES', { align: 'C', bold: true }),
    ticketText('Deben entrar sin cortar ni', { align: 'C' }),
    ticketText('pasar a otra linea:', { align: 'C' }),
    ticketText(tens),
    ticketText(units),
    ticketText('='.repeat(width)),
    ticketSeparador('-'),
    ticketText('ALINEACION', { align: 'C', bold: true }),
    ticketText('IZQUIERDA', { align: 'L' }),
    ticketText('CENTRO', { align: 'C' }),
    ticketText('DERECHA', { align: 'R' }),
    ticketSeparador('-'),
    ticketText('TAMANOS', { align: 'C', bold: true }),
    ticketText('NORMAL'),
    ticketText('ALTO', { size: 'tall' }),
    ticketText('ANCHO', { size: 'wide' }),
    ticketText('GRANDE', { size: 'big' }),
    ticketSeparador('-'),
    ticketText('TABLA DE COLUMNAS', { align: 'C', bold: true }),
  ];

  // Tabla igual a la del comprobante (misma lógica de anchos) para verificar
  // que CANT / DESCRIPCION / TOTAL queden separados y alineados.
  const totalW = 12;
  const cantW = Math.max(5, Math.min(6, Math.floor(width * 0.12)));
  const descW = width - cantW - totalW;
  lines.push(ticketColumns([
    { text: 'CANT', width: cantW, align: 'L' },
    { text: 'DESCRIPCION', width: descW, align: 'L' },
    { text: 'TOTAL', width: totalW, align: 'R' },
  ]));
  lines.push(ticketSeparador('-'));
  lines.push(ticketColumns([
    { text: '2', width: cantW, align: 'L' },
    { text: 'PRODUCTO DE PRUEBA', width: descW, align: 'L' },
    { text: '123.456', width: totalW, align: 'R' },
  ]));
  lines.push(ticketKv('TOTAL', 'Gs. 123.456', true));

  lines.push(ticketSeparador('='));
  lines.push(ticketText('Si ves esta linea completa,', { align: 'C' }));
  lines.push(ticketText('el margen inferior esta OK.', { align: 'C' }));
  lines.push(ticketText('<< FIN DEL TICKET >>', { align: 'C', bold: true }));

  return lines;
}

/**
 * Imprime la prueba diagnóstica en la impresora, pasando por el mismo pipeline
 * (`printTicketSpec`) que los tickets reales: así valida columnas, tamaños,
 * corte y safe-area inferior tal como saldrán en producción.
 */
export async function printTestTicket(printer: any): Promise<{ ok: boolean; error?: string }> {
  const width = printerWidthToChars(printer.width);
  const spec: TicketSpec = {
    printerWidth: width,
    lines: buildTestTicketLines(printer),
    cutAtEnd: true,
    beepAtEnd: true,
  };
  return await printTicketSpec(printer, spec);
}

/**
 * Imprime un `TicketSpec` en una impresora térmica. Maneja:
 * - Impresoras CUPS (address que empieza con `ticket-`) → fallback texto plano + `lp`.
 * - Impresoras network/USB/bluetooth → comandos ESC/POS vía `node-thermal-printer`.
 *
 * Retorna `{ ok, error? }`. NUNCA hace throw — el caller decide si bloquear o continuar.
 */
/**
 * Prueba la conectividad de una configuración de impresora SIN imprimir.
 * Útil para validar antes de guardar (botón "Probar conexión").
 */
export async function probePrinterConnection(printer: any): Promise<{ ok: boolean; error?: string }> {
  try {
    if (printer.connectionType === 'lpr') {
      const { host, port } = parseLprAddress(printer.address || '');
      if (!host) return { ok: false, error: 'Falta el host en la dirección' };
      const ok = await probeTcp(host, port || printer.port || 515, 4000);
      return ok ? { ok: true } : { ok: false, error: `No se pudo conectar a ${host}:${port || printer.port || 515}` };
    }
    if (printer.connectionType === 'usb' && printer.address && printer.address.startsWith('ticket-')) {
      return { ok: true }; // CUPS: sin prueba simple, se asume disponible
    }
    if (printer.connectionType === 'usb' || printer.connectionType === 'serial' || printer.connectionType === 'bluetooth') {
      // Estas vías no tienen un chequeo de conectividad fiable previo a imprimir.
      return { ok: true };
    }
    // network / system: build + isPrinterConnected (throw-safe)
    const tp = buildThermalPrinter(printer);
    let connected = false;
    try {
      connected = await tp.isPrinterConnected();
    } catch {
      connected = false;
    }
    return connected ? { ok: true } : { ok: false, error: `La impresora "${printer.address}" no responde` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function printTicketSpec(
  printer: any,
  spec: TicketSpec
): Promise<{ ok: boolean; error?: string }> {
  try {
    // CUPS fallback
    if (printer.connectionType === 'usb' && printer.address && printer.address.startsWith('ticket-')) {
      const content = renderTicketToPlainText(spec);
      const tempDir = app.getPath('temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, `ticket-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, content, 'utf8');
      return new Promise(resolve => {
        exec(`lp -d ${printer.address} ${tempFile}`, (error, _stdout, stderr) => {
          try { fs.unlinkSync(tempFile); } catch {}
          if (error) {
            resolve({ ok: false, error: `CUPS: ${error.message}; ${stderr}` });
          } else {
            resolve({ ok: true });
          }
        });
      });
    }

    const tp = buildThermalPrinter(printer);
    const width = printerWidthToChars(printer.width);

    // LPR: armamos buffer ESC/POS en memoria y lo enviamos por LPR a la
    // cola compartida de un servidor LPD remoto (típicamente Windows con
    // "Servicios de impresión LPD" habilitado).
    if (printer.connectionType === 'lpr') {
      feedTopSafeArea(tp);
      for (const line of spec.lines) {
        await applyLine(tp, line, width);
      }
      if (spec.cutAtEnd !== false) {
        feedBottomSafeArea(tp);
        tp.cut({ verticalTabAmount: 0 });
      }
      if (spec.beepAtEnd) tp.beep();
      const buffer = (tp as any).getBuffer?.() as Buffer | undefined;
      if (!buffer || buffer.length === 0) {
        return { ok: false, error: 'No se pudo armar el buffer ESC/POS para LPR' };
      }
      const { host, port, queue } = parseLprAddress(printer.address || '');
      if (!host) return { ok: false, error: 'Impresora LPR sin host configurado en address' };
      return await sendLprJob(buffer, {
        host,
        port: port || printer.port || 515,
        queue,
        jobName: `frc-ticket-${Date.now()}`,
        timeoutMs: 5000,
      });
    }

    // isPrinterConnected puede lanzar (el interface 'printer:' hace `throw false`
    // cuando la impresora no está disponible); lo tratamos como no conectada.
    let connected = false;
    try {
      connected = await tp.isPrinterConnected();
    } catch {
      connected = false;
    }
    if (!connected) {
      return { ok: false, error: `Impresora "${printer.name}" no responde (${printer.address})` };
    }

    feedTopSafeArea(tp);
    for (const line of spec.lines) {
      await applyLine(tp, line, width);
    }
    if (spec.cutAtEnd !== false) {
      feedBottomSafeArea(tp);
      tp.cut({ verticalTabAmount: 0 });
    }
    if (spec.beepAtEnd) tp.beep();

    await tp.execute();
    return { ok: true };
  } catch (e: any) {
    console.error('printTicketSpec error:', e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// ============================================================
// RENDER → PLAIN TEXT (fallback CUPS y previews)
// ============================================================

/**
 * Renderiza el spec como texto plano (sin ESC/POS). Útil para:
 * - Fallback CUPS (`lp` no entiende ESC/POS).
 * - Preview en logs / pantalla.
 * - Tests sin hardware.
 */
export function renderTicketToPlainText(spec: TicketSpec): string {
  const width = spec.printerWidth || 48;
  const out: string[] = [];

  // Safe area superior (mismo criterio que el path ESC/POS).
  for (let i = 0; i < TOP_SAFE_FEED; i++) out.push('');

  for (const line of spec.lines) {
    switch (line.type) {
      case 'text': {
        const text = line.text || '';
        if (line.align === 'C') {
          const pad = Math.max(0, width - text.length);
          out.push(' '.repeat(Math.floor(pad / 2)) + text);
        } else if (line.align === 'R') {
          out.push(' '.repeat(Math.max(0, width - text.length)) + text);
        } else {
          out.push(text);
        }
        break;
      }
      case 'separator': {
        out.push((line.char || '-').repeat(width));
        break;
      }
      case 'blank': {
        for (let i = 0; i < (line.count || 1); i++) out.push('');
        break;
      }
      case 'kv': {
        const padding = Math.max(1, width - line.key.length - line.value.length);
        out.push(line.key + ' '.repeat(padding) + line.value);
        break;
      }
      case 'columns': {
        const segs: string[] = [];
        for (const c of line.cols) {
          const text = String(c.text || '').slice(0, c.width);
          const pad = c.width - text.length;
          if (c.align === 'R') segs.push(' '.repeat(pad) + text);
          else if (c.align === 'C') segs.push(' '.repeat(Math.floor(pad / 2)) + text + ' '.repeat(Math.ceil(pad / 2)));
          else segs.push(text + ' '.repeat(pad));
        }
        out.push(segs.join(''));
        break;
      }
      case 'qr':
      case 'image':
      case 'cut':
      case 'beep':
        // omitidos en texto plano
        break;
    }
  }
  // Safe area inferior: mismas líneas en blanco que el path ESC/POS, para que
  // el corte de CUPS/`lp` tampoco recorte el final del ticket.
  if (spec.cutAtEnd !== false) {
    for (let i = 0; i < BOTTOM_SAFE_FEED; i++) out.push('');
  }
  return out.join('\n') + '\n';
}

// ============================================================
// FORMATEO HELPERS (locales)
// ============================================================

export function ticketFmtMonto(n: number, decimals = 0): string {
  return Number(n || 0).toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function ticketFmtFecha(d?: Date | string | null): string {
  if (!d) return '';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
}

export function ticketFmtFechaHora(d?: Date | string | null): string {
  if (!d) return '';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString('es-PY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

// ============================================================
// MONTOS MULTIMONEDA EN UN TICKET
// ============================================================

/**
 * Formateadores por moneda para un ticket.
 *
 * Se arma una sola vez por ticket a partir de las `Moneda` de la base, y de ahí
 * salen tanto el símbolo ASCII (`₲` sale como `?` en una térmica) como la
 * cantidad de decimales de cada moneda.
 */
export interface FormateadorMonedas {
  /** "Gs. 150.000" — símbolo + monto. */
  fmt(monedaId: number, monto: number): string;
  /** "Gs." — sólo el símbolo ASCII. */
  simbolo(monedaId: number): string;
  /** "150.000" — sólo el monto, con los decimales de esa moneda. */
  monto(monedaId: number, monto: number): string;
}

/** Construye el formateador desde la lista de `Moneda` de la base. */
export function crearFormateadorMonedas(monedas: any[]): FormateadorMonedas {
  const info: { [id: number]: { decimales: number; simbolo: string } } = {};
  for (const m of monedas || []) {
    info[m.id] = { decimales: Number((m as any).decimales) || 0, simbolo: monedaSimboloAscii(m) };
  }
  return {
    fmt: (monedaId: number, monto: number) => {
      const i = info[monedaId] || { decimales: 0, simbolo: '' };
      return `${i.simbolo} ${ticketFmtMonto(monto, i.decimales)}`.trim();
    },
    simbolo: (monedaId: number) => info[monedaId]?.simbolo || '',
    monto: (monedaId: number, monto: number) => ticketFmtMonto(monto, info[monedaId]?.decimales ?? 0),
  };
}

/**
 * Renderiza un rubro etiquetado que puede tener montos en varias monedas.
 *
 *   - 1 moneda  → una sola línea:  `ETIQUETA .......... Gs. 5.300.000`
 *   - N monedas → la ETIQUETA va como encabezado y cada moneda indentada
 *     debajo, sin repetir la etiqueta:
 *
 *         ETIQUETA
 *           Gs. ................ 5.300.000
 *           $ ....................... 120
 *
 * Es **la** organización de forma de pago + moneda del proyecto: la usan el
 * resumen de cierre de caja (ticket y la imagen que se manda por WhatsApp) y,
 * desde 2026-08, el bloque de pagos registrados de los tickets de delivery.
 * Vivía embebida en `printCierreCajaInternal`; se extrajo acá para que las dos
 * no puedan divergir.
 *
 * `anchoClave` trunca la etiqueta: `ticketKv` no trunca, así que una forma de
 * pago larga ("TRANSFERENCIA BANCARIA BBVA") desbordaba las 32 columnas de una
 * impresora de 58mm y dejaba el importe huérfano en la línea siguiente.
 */
export function ticketRubroMultimoneda(
  label: string,
  montos: { monedaId: number; total: number }[],
  fmt: FormateadorMonedas,
  opts: { bold?: boolean; anchoClave?: number } = {},
): TicketLine[] {
  if (!montos || montos.length === 0) return [];
  const bold = opts.bold === true;
  const etiqueta = opts.anchoClave && label.length > opts.anchoClave
    ? label.slice(0, opts.anchoClave)
    : label;

  if (montos.length === 1) {
    return [ticketKv(etiqueta, fmt.fmt(montos[0].monedaId, montos[0].total), bold)];
  }
  const lines: TicketLine[] = [ticketText(etiqueta, { bold })];
  for (const m of montos) {
    lines.push(ticketKv(`  ${fmt.simbolo(m.monedaId)}`, fmt.monto(m.monedaId, m.total), bold));
  }
  return lines;
}

/**
 * Cotización (`compraLocal`) entre la moneda principal y otra: cuántos
 * principal vale 1 unidad de la otra moneda. Toma la más reciente (la lista de
 * `MonedaCambio` viene ordenada por `createdAt DESC`). Devuelve 0 si no hay.
 *
 * ⚠️ Trata el par como **simétrico**: usa `compraLocal` tanto para
 * principal→moneda como para moneda→principal. `moneda.utils.ts` sí distingue
 * los dos sentidos (`getCotizacionBidireccional`), pero es async y hace una
 * query por conversión — inservible acá, donde el ticket precarga los cambios
 * una sola vez y convierte N líneas. Se mantiene la semántica histórica del
 * ticket a propósito: cambiarla movería los totales impresos de todas las
 * ventas en moneda extranjera.
 *
 * Nombre distinto del de `moneda.utils.ts` justamente para que la colisión sea
 * imposible de cometer por accidente.
 */
export function tasaVsPrincipal(cambios: any[], principal: any, moneda: any): number {
  if (!principal || !moneda) return 0;
  const c = (cambios || []).find((x: any) =>
    (x.monedaOrigen?.id === principal.id && x.monedaDestino?.id === moneda.id) ||
    (x.monedaOrigen?.id === moneda.id && x.monedaDestino?.id === principal.id));
  return c ? Number(c.compraLocal || 0) : 0;
}

/** Convierte un valor expresado en `moneda` a la moneda principal. */
export function montoAPrincipal(valor: number, moneda: any, principal: any, cambios: any[]): number {
  if (!moneda || !principal || moneda.id === principal.id) return valor;
  const rate = tasaVsPrincipal(cambios, principal, moneda);
  return rate > 0 ? valor * rate : valor; // 1 moneda = rate principal
}
