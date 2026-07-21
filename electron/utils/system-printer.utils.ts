/**
 * Driver de impresión por el spooler del sistema operativo.
 *
 * Usa el módulo nativo `@thiagoelg/node-printer` como `driver` de
 * node-thermal-printer (interface `printer:<Nombre>`), que envía los bytes
 * ESC/POS en RAW al spooler vía `printDirect`. Esto permite imprimir a una
 * impresora instalada localmente (p. ej. USB en Windows) por su NOMBRE, sin
 * paths de dispositivo, sin red, sin LPD/share/ANONYMOUS LOGON.
 *
 * El require es perezoso y tolerante a fallos: en dev/Linux o si el binario
 * nativo no está compilado, no rompe la carga del módulo — solo falla (con un
 * mensaje claro) cuando realmente se intenta imprimir por esta vía.
 */
let cachedDriver: any = null;
let attempted = false;
let loadError: string | null = null;

export function getSystemPrinterDriver(): any {
  if (cachedDriver) return cachedDriver;
  if (attempted && loadError) {
    throw new Error(loadError);
  }
  attempted = true;
  try {
    // require dinámico: evita que TypeScript exija los tipos y que el bundler
    // intente resolver el binario nativo en tiempo de build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    cachedDriver = require('@thiagoelg/node-printer');
    return cachedDriver;
  } catch (e: any) {
    loadError =
      'El módulo de impresión del sistema (@thiagoelg/node-printer) no está disponible en este equipo. ' +
      'Reinstalá la aplicación o elegí otro tipo de conexión para la impresora. Detalle: ' +
      (e?.message || String(e));
    throw new Error(loadError);
  }
}

/** ¿Está disponible el driver del spooler? (no lanza) */
export function isSystemPrinterDriverAvailable(): boolean {
  try {
    getSystemPrinterDriver();
    return true;
  } catch {
    return false;
  }
}
