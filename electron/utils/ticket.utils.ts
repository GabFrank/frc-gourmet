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

export function ticketText(text: string, opts: Omit<Extract<TicketLine, { type: 'text' }>, 'type' | 'text'> = {}): TicketLine {
  return { type: 'text', text, ...opts };
}

export function ticketSeparador(char: string = '-'): TicketLine {
  return { type: 'separator', char };
}

export function ticketBlank(count: number = 1): TicketLine {
  return { type: 'blank', count };
}

export function ticketKv(key: string, value: string, bold = false): TicketLine {
  return { type: 'kv', key, value, bold };
}

export function ticketColumns(cols: { text: string; width: number; align?: TicketAlign }[]): TicketLine {
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
  const codigo = String(moneda.codigo || '').toUpperCase();
  switch (codigo) {
    case 'PYG': return 'Gs.';
    case 'USD': return '$';
    case 'BRL': return 'R$';
    case 'ARS': return '$';
    case 'EUR': return 'EUR';
    default:
      return codigo || String(moneda.nombre || 'Gs.').toUpperCase().slice(0, 6);
  }
}

/**
 * Crea un `ThermalPrinter` desde una row `Printer` de BD.
 */
function buildThermalPrinter(printer: any): ThermalPrinter {
  let interfaceConfig: string;
  if (printer.connectionType === 'network') {
    interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
  } else if (printer.connectionType === 'bluetooth') {
    interfaceConfig = `bt:${printer.address}`;
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
    options: { timeout: 5000 },
    width: printerWidthToChars(printer.width),
    characterSet: (printer.characterSet ? getCharacterSet(printer.characterSet) : CharacterSet.PC437_USA) as CharacterSet,
    removeSpecialCharacters: false,
  });
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

    const connected = await tp.isPrinterConnected();
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
