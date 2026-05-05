# Capítulo 9 — Bancos, cheques y POS

## 1. Cuentas bancarias

**Menu → Financiero → Caja Mayor → Bancos**.

Crear cada cuenta:
- **Nombre** (ej "Banco Itaú Cta Cte 12345").
- **Banco**.
- **Número de cuenta**.
- **Tipo**: CORRIENTE / AHORRO.
- **Moneda**.
- **Saldo inicial** (cargar el saldo real al momento de creación).
- **Titular**, **Alias** (opcionales).

### Tres saldos visibles

| Concepto | Cómo se calcula |
|---|---|
| **Saldo** | Disponible. Se actualiza con movimientos directos (depósitos, retiros, cobros). |
| **Saldo reservado** | Cheques diferidos emitidos pero no cobrados. |
| **Saldo futuro** | Suma de `montoEsperado` de acreditaciones POS pendientes (estado PENDIENTE). |

## 2. Movimiento bancario manual

Para anotar movimientos no rastreados automáticamente (ej: cargo bancario, intereses cobrados):

**Menu → Financiero → Caja Mayor → Bancos → click cuenta → Movimientos → "Nuevo"**.

- Tipo: ENTRADA_MANUAL / SALIDA_MANUAL / AJUSTE_POSITIVO / AJUSTE_NEGATIVO.
- Monto, fecha, comprobante.

⚠️ Estos movimientos **no afectan Caja Mayor** — son solo del banco. Conciliación manual con extracto.

## 3. Chequeras

**Menu → Financiero → Caja Mayor → Cheques → Chequeras**.

Crear:
- Cuenta bancaria.
- Número inicial / final (rango de cheques físicos).
- Siguiente número (auto-incrementa al emitir).
- Estado: ACTIVA.

Cuando `siguienteNumero > numeroFinal` → estado AGOTADA, no se pueden emitir más.

## 4. Emitir cheque

**Menu → Financiero → Caja Mayor → Cheques → "Emitir cheque"**.

- **Chequera** (debe estar ACTIVA).
- **Número de cheque** (auto del `siguienteNumero` de la chequera).
- **Beneficiario**: a quién va.
- **Proveedor** (opcional, vincula a un proveedor existente).
- **Monto, moneda**.
- **Fecha de emisión**.
- **Es diferido** (✅): cheque postfechado.
- **Fecha de pago** (si diferido): cuándo se puede cobrar.
- **Caja Mayor** + **Forma de pago**: si querés que afecte caja al emitir.

### Al emitir

- Cheque estado: EMITIDO (al día) o DIFERIDO (postfechado).
- Si **NO diferido**: genera `EGRESO_CHEQUE` en Caja Mayor + descuenta saldo de Caja Mayor.
- Si **DIFERIDO**: incrementa `cuentaBancaria.saldoReservado += monto`. Caja Mayor NO se afecta hasta el cobro.
- Avanza `chequera.siguienteNumero`.

## 5. Cobrar cheque

Cuando el cheque se hace efectivo:

**Click cheque → "Cobrar"**.

- Cheque estado → COBRADO.
- Resta de `cuentaBancaria.saldo`.
- Si era DIFERIDO: libera `saldoReservado` (ya descontado).

## 6. Anular cheque

Click → "Anular".

- Si era EMITIDO: contra-mov AJUSTE_POSITIVO en caja mayor (revierte el egreso).
- Si era DIFERIDO: libera `saldoReservado`.

## 7. Máquinas POS (terminales de tarjeta)

**Menu → Financiero → Caja Mayor → POS**.

Crear cada terminal:
- **Nombre** (ej "Visa Banco Itaú").
- **Proveedor** (Visa, Itaú, etc.).
- **Cuenta bancaria** donde se acreditan las ventas.
- **Porcentaje de comisión** (ej 2.50%).
- **Minutos de acreditación**: cuánto tarda el banco en acreditar (ej 1440 = 24 hs, 4320 = 3 días).

## 8. Acreditaciones POS

Cuando vendés con tarjeta, el sistema crea automáticamente una `AcreditacionPos` PENDIENTE con:
- Monto original (la venta).
- Monto comisión (calculado %).
- Monto esperado (original - comisión).
- Fecha esperada de acreditación = ahora + minutosAcreditacion.

### Procesador automático (cada 5 min)

Background scheduler en main process: cada 5 min revisa acreditaciones con `fechaEsperada ≤ now`. Para cada una:
- Suma `montoEsperado` a `cuentaBancaria.saldo`.
- Marca como ACREDITADO_AUTO.

### Verificación manual

Cuando llega tu extracto bancario, podés comparar:

**Menu → Financiero → Caja Mayor → POS → Acreditaciones → click**:
- Ingresar `montoAcreditado` real.
- Si difiere del esperado: estado → CON_DIFERENCIA.
- Si igual: estado → VERIFICADO.

## 9. Errores comunes

### "Mi cuenta bancaria muestra saldo incorrecto"

- Conciliar con extracto bancario.
- Si hay diferencia, agregar `MovimientoBancario` AJUSTE_POSITIVO/NEGATIVO con observación explicativa.
- Si la diferencia viene de una acreditación POS no procesada: verificar `AcreditacionPos` con estado PENDIENTE.

### "No puedo emitir cheque — chequera AGOTADA"

- La chequera consumió todos los números. Crear una nueva.

### "Cheque diferido no cobrado todavía"

- El saldo de la cuenta NO bajó hasta que se cobre.
- El `saldoReservado` muestra cuánto está comprometido.

### "Acreditación POS pendiente hace mucho"

- Verificar configuración de `minutosAcreditacion` en la máquina POS.
- Si pasaron y no se acreditó automáticamente: posiblemente la app estuvo cerrada cuando vencía. Al reabrir, el scheduler lo procesa al primer ciclo.
- Verificación manual posible.

---

**Próximo capítulo →** [10 — CPP / CPC: créditos](10-cpp-cpc-creditos.md)
