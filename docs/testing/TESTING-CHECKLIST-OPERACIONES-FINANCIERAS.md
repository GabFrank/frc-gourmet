# Checklist de pruebas manuales — Operaciones Financieras (validación de campos)

Cubre el fix de los campos obligatorios que la UI nunca poblaba. Aplica a las dos
superficies: **PWA mobile** (Gestión de Caja Mayor → Operaciones financieras →
Nueva) y **escritorio** (Caja Mayor → Registrar egreso/ingreso → Operación
financiera).

**Permiso necesario:** `CAJA_MAYOR_OPERAR`.
**Precondiciones:** al menos una caja mayor ABIERTA, dos monedas activas (una
principal), una forma de pago EFECTIVO activa que mueva caja, y dos cuentas
bancarias activas de monedas distintas.

Tests automáticos que cubren lo mismo:

```bash
npm run test:operacion-financiera     # invariante de validación (122 asserts)
npm run test:mobile                   # specs de la pantalla PWA
npm run test:transferencia-bancaria   # flujo banco→banco + anulación
```

---

## 1. El bug reportado: cambio de divisa en la PWA

| # | Paso | Resultado esperado |
|---|---|---|
| 1.1 | PWA → Caja Mayor → una caja abierta → Operaciones financieras → **Nueva** | Abre el formulario en *Cambio de divisa* |
| 1.2 | Completar sólo: Descripción, Caja mayor origen, Moneda origen (Gs), Monto origen, Moneda destino (US$), Cotización | El **Monto destino se calcula solo** (Gs / cotización) |
| 1.3 | Tocar **Registrar** | **Guarda**. Antes quedaba trabado con "Completá los campos requeridos" sin marcar ningún campo |
| 1.4 | Abrir la caja mayor y ver los movimientos | Dos movimientos de la **misma caja**: EGRESO en Gs y INGRESO en US$, ambos con forma de pago **Efectivo** |
| 1.5 | Verificar los saldos por moneda+forma de pago | Bajó el saldo en Gs/Efectivo, subió el de US$/Efectivo |

## 2. Cambiar de tipo después de cargar datos

Éste es el otro caso reportado: el formulario quedaba inválido tras alternar de
operación.

| # | Paso | Resultado esperado |
|---|---|---|
| 2.1 | Elegir **Retiro bancario** y seleccionar la cuenta bancaria en US$ | Aparece el hint "Moneda: US$ … Efectivo" del lado destino |
| 2.2 | Cambiar a **Transferencia bancaria** (sin tocar nada más) | La cuenta origen se mantiene seleccionada |
| 2.3 | Volver a **Retiro bancario** | La moneda sigue heredada de la cuenta. **Registrar** funciona sin volver a elegir la cuenta |
| 2.4 | Idem con **Depósito bancario** ↔ **Transferencia bancaria** (cuenta destino) | Igual: la moneda no se pierde |
| 2.5 | En **Depósito bancario** elegir una cuenta destino y luego cambiar a **Cambio de divisa** | La cuenta destino se limpia; la operación guardada NO queda vinculada a esa cuenta |
| 2.6 | Alternar entre los 5 tipos varias veces y completar el último | Ningún tipo queda bloqueado; el botón siempre responde |

## 3. Mensajes de error concretos

| # | Paso | Resultado esperado |
|---|---|---|
| 3.1 | En *Cambio de divisa*, completar sólo descripción, caja, moneda origen y monto origen → **Registrar** | Mensaje: **"Faltan completar: Moneda destino, Cotización"** (nombra los campos; antes decía sólo "campos requeridos") |
| 3.2 | Elegir la **misma moneda** en origen y destino de un cambio de divisa, completar todo → **Registrar** | Mensaje: "En un cambio de divisa la moneda de origen y la de destino deben ser distintas." y **no guarda** |
| 3.3 | En *Transferencia entre cajas*, elegir la **misma caja** como origen y destino | Mensaje: "La caja mayor de origen y la de destino no pueden ser la misma." |
| 3.4 | En *Transferencia bancaria*, elegir la **misma cuenta** en ambos lados | Mensaje: "La cuenta bancaria de origen y la de destino no pueden ser la misma." (antes explotaba recién en el backend) |
| 3.5 | Poner Monto origen en 0 | Reclama "Monto origen" como incompleto |

## 4. Diferencia (sólo donde hay caja mayor)

| # | Paso | Resultado esperado |
|---|---|---|
| 4.1 | Elegir **Transferencia bancaria** | La sección **Diferencia no aparece** (el backend no tiene caja donde imputarla y la descartaba en silencio) |
| 4.2 | Cargar una diferencia en *Transferencia entre cajas* y luego cambiar a *Transferencia bancaria* | El monto de diferencia vuelve a 0 y el destino a "Ignorar" |
| 4.3 | En *Cambio de divisa*, cargar diferencia con destino **Gasto** y registrar | Se crea el movimiento de ajuste correspondiente en la caja |

## 5. Los 5 tipos, punta a punta

Registrar uno de cada uno y verificar movimientos/saldos:

| # | Tipo | Verificar |
|---|---|---|
| 5.1 | Cambio de divisa | Egreso + ingreso en la misma caja, ambos en efectivo |
| 5.2 | Depósito bancario | Egreso de caja + suma al saldo de la cuenta bancaria (movimiento bancario ENTRADA_MANUAL) |
| 5.3 | Retiro bancario | Resta del saldo bancario (SALIDA_MANUAL) + ingreso a la caja destino |
| 5.4 | Transferencia entre cajas | Salida en la caja origen + entrada en la destino, misma moneda |
| 5.5 | Transferencia bancaria (monedas distintas) | Aparece la cotización, el monto destino se convierte, se mueven las dos cuentas y **no** se toca ninguna caja |
| 5.6 | Anular cualquiera de las anteriores | Revierte ambos lados (ver `anularOperacionFinancieraTx`) |

## 6. Escritorio (mismas reglas)

| # | Paso | Resultado esperado |
|---|---|---|
| 6.1 | Abrir el diálogo desde Caja Mayor → Registrar egreso → Operación financiera | Los tramos contra caja traen la **forma de pago efectivo preseleccionada** |
| 6.2 | Elegir *Depósito*, seleccionar la cuenta destino, y cambiar a *Cambio de divisa* | Se limpian la cuenta y las monedas heredadas: no se guarda una relación de la operación anterior |
| 6.3 | Registrar con campos faltantes | El snackbar **nombra** los campos que faltan |
| 6.4 | Cambiar de tipo y volver | La caja mayor del contexto se vuelve a preseleccionar como origen donde corresponde |

## 7. Configuración degradada

| # | Paso | Resultado esperado |
|---|---|---|
| 7.1 | Desactivar todas las formas de pago (entorno de prueba) y abrir el formulario | Aviso visible: "No hay una forma de pago EFECTIVO configurada…". Antes el formulario quedaba inválido sin explicación |
| 7.2 | Reactivar la forma de pago EFECTIVO | El aviso desaparece y los tramos de caja vuelven a completarse solos |

---

## Qué mirar si algo falla

- **El botón no responde y no aparece mensaje:** revisar la consola; `guardar()`
  siempre debería mostrar un snackbar con los campos faltantes o el error de
  coherencia.
- **Un campo requerido que no se ve en pantalla:** es exactamente el bug que se
  corrigió. `npm run test:operacion-financiera` falla si un tipo exige un campo
  que ninguna fuente puebla (UI, cuenta bancaria o efectivo fijo).
- **Saldos que no cuadran:** verificar que el movimiento tenga moneda **y** forma
  de pago; `CajaMayorSaldo` está indexado por caja+moneda+formaPago.
