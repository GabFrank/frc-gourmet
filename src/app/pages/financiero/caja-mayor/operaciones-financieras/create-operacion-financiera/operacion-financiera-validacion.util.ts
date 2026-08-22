/**
 * Reglas de validación del formulario de Operación Financiera, extraídas como
 * datos puros para poder testearlas sin Angular. Fuente ÚNICA para el diálogo
 * de escritorio, la pantalla de la PWA mobile y el test de invariantes.
 *
 * ## Principio
 *
 * Un control entra en la validación (`Validators.required`) sólo si el tipo de
 * operación lo usa de verdad **y** existe una fuente que lo puebla:
 *
 * | Fuente            | Qué significa                                          |
 * |-------------------|--------------------------------------------------------|
 * | `UI`              | el usuario lo elige/escribe en un campo visible         |
 * | `CUENTA_BANCARIA` | se hereda de la cuenta bancaria elegida                 |
 * | `EFECTIVO`        | tramo contra Caja Mayor ⇒ forma de pago EFECTIVO fija   |
 *
 * Si un campo es requerido y `fuenteDelCampo()` devuelve `null`, el formulario
 * queda inválido para siempre y el botón "Registrar" no se habilita nunca — es
 * la familia de bugs que este archivo existe para prevenir. El test
 * `scripts/test-operacion-financiera-validacion-e2e.ts` recorre el invariante
 * campo por campo y tipo por tipo.
 *
 * ## Bugs históricos que motivaron estas estructuras
 *
 * 1. **DEPOSITO/RETIRO (PR #199):** la moneda no se elige en la UI (se hereda de
 *    la cuenta bancaria) pero al elegir la cuenta se seteaba sólo UNA de las dos
 *    monedas, dejando la requerida del otro lado en `null`.
 *    → `monedasDesdeCuentaBancaria()` setea AMBAS.
 * 2. **CAMBIO_DIVISA (PWA):** `formaPagoDestinoId` es requerido (el handler lo
 *    usa para el movimiento de INGRESO y para `actualizarSaldo`), pero la PWA lo
 *    seteaba sólo cuando había un select de *caja destino*. En un cambio de
 *    divisa el ingreso vuelve a la MISMA caja, así que no hay tal select y la
 *    forma de pago quedaba `null` → formulario inválido para siempre.
 *    → `LADOS_CAJA_MAYOR` responde la pregunta correcta: "¿este lado mueve caja
 *    mayor?", que NO es lo mismo que "¿se muestra un select de caja?"
 *    (`CAJAS_EN_UI`).
 */

export type TipoOperacionFinanciera =
  | 'CAMBIO_DIVISA'
  | 'DEPOSITO_BANCARIO'
  | 'RETIRO_BANCARIO'
  | 'TRANSFERENCIA_ENTRE_CAJAS'
  | 'TRANSFERENCIA_BANCARIA';

/** Los dos lados de toda operación financiera. */
export type LadoOperacion = 'origen' | 'destino';

/** Flag por lado (origen/destino). */
export interface PorLado {
  origen: boolean;
  destino: boolean;
}

export const TIPOS_OPERACION: TipoOperacionFinanciera[] = [
  'CAMBIO_DIVISA',
  'DEPOSITO_BANCARIO',
  'RETIRO_BANCARIO',
  'TRANSFERENCIA_ENTRE_CAJAS',
  'TRANSFERENCIA_BANCARIA',
];

/** Controles con `Validators.required` por tipo (además de descripcion/fecha). */
export const CAMPOS_REQUERIDOS: Record<TipoOperacionFinanciera, string[]> = {
  CAMBIO_DIVISA: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cotizacion',
  ],
  DEPOSITO_BANCARIO: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'cuentaBancariaDestinoId', 'montoDestino',
  ],
  RETIRO_BANCARIO: [
    'cuentaBancariaOrigenId', 'montoOrigen',
    'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino',
  ],
  TRANSFERENCIA_ENTRE_CAJAS: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino',
  ],
  // Banco → banco. Las monedas se heredan de cada cuenta (una por lado, no
  // necesariamente la misma), por eso NO se listan como requeridas: se setean
  // automáticamente al elegir cada cuenta. La cotización solo aplica cuando las
  // monedas difieren (opcional), y `montoDestino` ya trae el monto convertido.
  TRANSFERENCIA_BANCARIA: [
    'cuentaBancariaOrigenId', 'montoOrigen',
    'cuentaBancariaDestinoId', 'montoDestino',
  ],
};

/** Todos los controles de moneda del formulario. */
export const CAMPOS_MONEDA = ['monedaOrigenId', 'monedaDestinoId'];

/** Todos los controles de forma de pago del formulario. */
export const CAMPOS_FORMA_PAGO = ['formaPagoOrigenId', 'formaPagoDestinoId'];

/** Controles de moneda que el usuario elige DIRECTAMENTE en la UI, por tipo. */
export const MONEDAS_EN_UI: Record<TipoOperacionFinanciera, string[]> = {
  CAMBIO_DIVISA: ['monedaOrigenId', 'monedaDestinoId'],
  DEPOSITO_BANCARIO: [],            // se heredan de la cuenta bancaria
  RETIRO_BANCARIO: [],              // se heredan de la cuenta bancaria
  TRANSFERENCIA_ENTRE_CAJAS: ['monedaOrigenId', 'monedaDestinoId'],
  TRANSFERENCIA_BANCARIA: [],       // cada moneda se hereda de su cuenta bancaria
};

/**
 * ¿Qué lado MUEVE saldo de Caja Mayor? Ese lado genera un `CajaMayorMovimiento`
 * y su forma de pago es EFECTIVO fija (regla de negocio: el saldo de caja se
 * mueve en efectivo).
 *
 * ⚠️ NO confundir con `CAJAS_EN_UI`. En CAMBIO_DIVISA los DOS lados mueven caja
 * mayor (egreso en una moneda + ingreso en otra) pero es la MISMA caja, así que
 * la UI muestra un solo select de caja (el de origen). Usar la visibilidad del
 * select para decidir la forma de pago dejaba `formaPagoDestinoId` en null.
 */
export const LADOS_CAJA_MAYOR: Record<TipoOperacionFinanciera, PorLado> = {
  CAMBIO_DIVISA: { origen: true, destino: true },     // egreso + ingreso en la MISMA caja
  DEPOSITO_BANCARIO: { origen: true, destino: false }, // sale de la caja, entra al banco
  RETIRO_BANCARIO: { origen: false, destino: true },   // sale del banco, entra a la caja
  TRANSFERENCIA_ENTRE_CAJAS: { origen: true, destino: true },
  TRANSFERENCIA_BANCARIA: { origen: false, destino: false }, // banco → banco, no toca caja
};

/** ¿Qué selects de CAJA MAYOR muestra la UI, por tipo? */
export const CAJAS_EN_UI: Record<TipoOperacionFinanciera, PorLado> = {
  // El ingreso vuelve a la misma caja del egreso: un solo select.
  CAMBIO_DIVISA: { origen: true, destino: false },
  DEPOSITO_BANCARIO: { origen: true, destino: false },
  RETIRO_BANCARIO: { origen: false, destino: true },
  TRANSFERENCIA_ENTRE_CAJAS: { origen: true, destino: true },
  TRANSFERENCIA_BANCARIA: { origen: false, destino: false },
};

/** ¿Qué selects de CUENTA BANCARIA muestra la UI, por tipo? */
export const CUENTAS_EN_UI: Record<TipoOperacionFinanciera, PorLado> = {
  CAMBIO_DIVISA: { origen: false, destino: false },
  DEPOSITO_BANCARIO: { origen: false, destino: true },
  RETIRO_BANCARIO: { origen: true, destino: false },
  TRANSFERENCIA_ENTRE_CAJAS: { origen: false, destino: false },
  TRANSFERENCIA_BANCARIA: { origen: true, destino: true },
};

/** Cuándo se muestra (y aplica) el campo de cotización. */
export const COTIZACION_EN_UI: Record<TipoOperacionFinanciera, 'SIEMPRE' | 'SI_MONEDAS_DISTINTAS' | 'NUNCA'> = {
  CAMBIO_DIVISA: 'SIEMPRE',
  DEPOSITO_BANCARIO: 'NUNCA',
  RETIRO_BANCARIO: 'NUNCA',
  TRANSFERENCIA_ENTRE_CAJAS: 'NUNCA',
  TRANSFERENCIA_BANCARIA: 'SI_MONEDAS_DISTINTAS',
};

/**
 * ¿El tipo usa UNA cuenta bancaria de la que se hereda la MISMA moneda a ambos
 * lados? (depósito/retiro en efectivo). NO incluye TRANSFERENCIA_BANCARIA, que
 * usa DOS cuentas con monedas potencialmente distintas — ver `usaDosCuentasBancarias`.
 */
export function usaCuentaBancaria(tipo: TipoOperacionFinanciera): boolean {
  return tipo === 'DEPOSITO_BANCARIO' || tipo === 'RETIRO_BANCARIO';
}

/**
 * ¿El tipo usa DOS cuentas bancarias (origen y destino), cada una con su propia
 * moneda? Solo TRANSFERENCIA_BANCARIA (banco → banco, posible multi-moneda).
 */
export function usaDosCuentasBancarias(tipo: TipoOperacionFinanciera): boolean {
  return tipo === 'TRANSFERENCIA_BANCARIA';
}

/**
 * Monedas a setear cuando se elige una cuenta bancaria. Setea AMBOS lados con la
 * misma moneda (depósito/retiro en efectivo = misma divisa origen y destino).
 */
export function monedasDesdeCuentaBancaria(monedaId: number): { monedaOrigenId: number; monedaDestinoId: number } {
  return { monedaOrigenId: monedaId, monedaDestinoId: monedaId };
}

/** ¿La forma de pago de este lado es EFECTIVO fija (tramo contra Caja Mayor)? */
export function formaPagoEsEfectivoFijo(tipo: TipoOperacionFinanciera, lado: LadoOperacion): boolean {
  return LADOS_CAJA_MAYOR[tipo][lado];
}

/** ¿La moneda de este lado se hereda de una cuenta bancaria? */
export function monedaSeHeredaDeCuenta(tipo: TipoOperacionFinanciera, lado: LadoOperacion): boolean {
  if (usaCuentaBancaria(tipo)) return true;               // una sola cuenta ⇒ misma moneda a ambos lados
  if (usaDosCuentasBancarias(tipo)) return CUENTAS_EN_UI[tipo][lado]; // cada cuenta setea SU lado
  return false;
}

/** De dónde sale el valor de un control, o `null` si nada puede poblarlo. */
export type FuenteCampo = 'UI' | 'CUENTA_BANCARIA' | 'EFECTIVO' | null;

const LADO_DE: Record<string, LadoOperacion> = {
  cajaMayorOrigenId: 'origen', cajaMayorDestinoId: 'destino',
  cuentaBancariaOrigenId: 'origen', cuentaBancariaDestinoId: 'destino',
  monedaOrigenId: 'origen', monedaDestinoId: 'destino',
  formaPagoOrigenId: 'origen', formaPagoDestinoId: 'destino',
  montoOrigen: 'origen', montoDestino: 'destino',
};

/**
 * Invariante central: ¿qué puebla este control para este tipo de operación?
 * Devuelve `null` cuando NADA lo puebla — si además es requerido, el formulario
 * es imposible de completar.
 */
export function fuenteDelCampo(tipo: TipoOperacionFinanciera, campo: string): FuenteCampo {
  const lado = LADO_DE[campo];
  if (campo === 'cajaMayorOrigenId' || campo === 'cajaMayorDestinoId') {
    return CAJAS_EN_UI[tipo][lado] ? 'UI' : null;
  }
  if (campo === 'cuentaBancariaOrigenId' || campo === 'cuentaBancariaDestinoId') {
    return CUENTAS_EN_UI[tipo][lado] ? 'UI' : null;
  }
  if (CAMPOS_MONEDA.includes(campo)) {
    if (MONEDAS_EN_UI[tipo].includes(campo)) return 'UI';
    return monedaSeHeredaDeCuenta(tipo, lado) ? 'CUENTA_BANCARIA' : null;
  }
  if (CAMPOS_FORMA_PAGO.includes(campo)) {
    // El escritorio ofrece un select restringido a efectivo; la PWA lo setea
    // sola. En ambos casos el valor existe si (y sólo si) el lado mueve caja.
    return LADOS_CAJA_MAYOR[tipo][lado] ? 'EFECTIVO' : null;
  }
  if (campo === 'montoOrigen' || campo === 'montoDestino') return 'UI';
  if (campo === 'cotizacion') return COTIZACION_EN_UI[tipo] === 'NUNCA' ? null : 'UI';
  return null;
}

/** Etiquetas legibles para nombrar en pantalla los campos que faltan. */
export const ETIQUETAS_CAMPOS: Record<string, string> = {
  descripcion: 'Descripción',
  fecha: 'Fecha',
  cajaMayorOrigenId: 'Caja mayor origen',
  monedaOrigenId: 'Moneda origen',
  formaPagoOrigenId: 'Forma de pago origen',
  montoOrigen: 'Monto origen',
  cuentaBancariaOrigenId: 'Cuenta bancaria origen',
  cajaMayorDestinoId: 'Caja mayor destino',
  monedaDestinoId: 'Moneda destino',
  formaPagoDestinoId: 'Forma de pago destino',
  montoDestino: 'Monto destino',
  cuentaBancariaDestinoId: 'Cuenta bancaria destino',
  cotizacion: 'Cotización',
};

export function etiquetaDe(campo: string): string {
  return ETIQUETAS_CAMPOS[campo] || campo;
}

/** Campos numéricos que además deben ser > 0 para contar como completos. */
const CAMPOS_POSITIVOS = ['montoOrigen', 'montoDestino', 'cotizacion'];

/**
 * Qué campos requeridos están vacíos (o en 0, para montos y cotización).
 * Se usa para decirle al usuario EXACTAMENTE qué falta, en vez del genérico
 * "completá los campos requeridos" que no señalaba nada cuando el campo ni
 * siquiera se renderiza para ese tipo.
 */
export function camposFaltantes(
  tipo: TipoOperacionFinanciera,
  valores: Record<string, unknown>,
  camposBase: string[] = ['descripcion'],
): string[] {
  // `camposBase` son los requeridos comunes a todos los tipos, que dependen de la
  // superficie: el escritorio además tiene `fecha`, el mobile la resuelve solo.
  // Se pasa explícito para no inferirlo de la forma del objeto de valores.
  const requeridos = [...camposBase, ...(CAMPOS_REQUERIDOS[tipo] || [])];
  return requeridos.filter((campo) => {
    const v = valores[campo];
    if (v === null || v === undefined || v === '') return true;
    if (CAMPOS_POSITIVOS.includes(campo)) return !(Number(v) > 0);
    return false;
  });
}

/**
 * Errores semánticos que ningún `required` detecta: una operación con todos los
 * campos completos pero que no tiene sentido (o que el handler va a rechazar).
 */
export function validarCoherencia(
  tipo: TipoOperacionFinanciera,
  valores: Record<string, unknown>,
): string[] {
  const errores: string[] = [];
  const igual = (a: unknown, b: unknown) =>
    a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

  if (tipo === 'CAMBIO_DIVISA' && igual(valores['monedaOrigenId'], valores['monedaDestinoId'])) {
    errores.push('En un cambio de divisa la moneda de origen y la de destino deben ser distintas.');
  }
  if (tipo === 'TRANSFERENCIA_ENTRE_CAJAS' && igual(valores['cajaMayorOrigenId'], valores['cajaMayorDestinoId'])) {
    errores.push('La caja mayor de origen y la de destino no pueden ser la misma.');
  }
  // El handler ya lo rechaza; se adelanta acá para no perder lo cargado.
  if (tipo === 'TRANSFERENCIA_BANCARIA' && igual(valores['cuentaBancariaOrigenId'], valores['cuentaBancariaDestinoId'])) {
    errores.push('La cuenta bancaria de origen y la de destino no pueden ser la misma.');
  }
  return errores;
}
