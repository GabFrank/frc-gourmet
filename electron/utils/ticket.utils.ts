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
 * Mapea el campo `printer.width` (interpretado como **mm físicos**, según
 * el label "Width (mm)" de la UI) al número de caracteres por línea que
 * usan los templates ESC/POS.
 *
 * Convención estándar para impresoras térmicas (Font A, default):
 *   - 58mm → 32 chars
 *   - 80mm → 48 chars
 *   - 76mm → 42 chars (raro)
 *
 * Si el valor recibido ya está en rango de chars (>=20 y <=80), se asume
 * que el usuario puso chars directos y se respeta — pero la convención
 * de la UI es mm.
 */
export function printerWidthToChars(width?: number | null): number {
  const w = Number(width || 0);
  if (!w || w <= 0) return 48; // default
  if (w >= 75 && w <= 85) return 48;   // 80mm
  if (w >= 70 && w < 75) return 42;    // 76mm raro
  if (w >= 50 && w < 70) return 32;    // 58mm
  if (w < 50) return 32;               // < 58mm asume 58mm safe default
  // > 85: probable que el usuario haya puesto chars directo
  return Math.min(64, Math.max(20, w));
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
      for (const line of spec.lines) {
        await applyLine(tp, line, width);
      }
      if (spec.cutAtEnd !== false) tp.cut({ verticalTabAmount: 0 });
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

    for (const line of spec.lines) {
      await applyLine(tp, line, width);
    }
    if (spec.cutAtEnd !== false) tp.cut({ verticalTabAmount: 0 });
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
