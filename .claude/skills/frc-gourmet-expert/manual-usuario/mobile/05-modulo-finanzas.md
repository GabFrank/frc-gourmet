# Módulo Finanzas

Entrás tocando **Finanzas** (💵) en la navegación. Combina **consulta** (revisar el estado
financiero desde el celular) con dos cosas que **sí podés operar**: las **Categorías de
gasto** y la **Caja Mayor** (registrar gastos, ingresos, ajustes y anulaciones).

> Repasá [Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md) para el uso general de listas.
> La sección de Finanzas en la barra solo aparece si tu usuario tiene permiso financiero.

---

## A. Lo que podés gestionar

### Categorías de gasto

Las categorías con las que se clasifican los gastos del negocio (ALQUILER, SERVICIOS,
INSUMOS…). Sirven para ordenar y reportar los egresos.

- **Campos:** Nombre, Activo.
- **Permiso:** `CAJA_MAYOR_OPERAR`.
- Podés crear, editar y eliminar (con confirmación), igual que cualquier lista.

### Caja Mayor

La Caja Mayor de cada caja/local: su **saldo en efectivo** (por moneda y forma de pago),
las **cuentas bancarias** visibles y el **historial de movimientos**. Desde mobile podés
**operar** sobre una caja que esté **abierta**:

1. En **Finanzas → Caja Mayor** ves la lista de cajas con sus saldos y su estado
   (Abierta / Cerrada).
2. Tocá una caja para entrar a su **detalle**: saldos, cuentas bancarias y movimientos
   (con un interruptor **"Ver anulaciones"** y botón **"Cargar más"**).
3. Si la caja está **abierta** y tenés permiso, al pie aparecen dos botones:
   - **Ingreso** → **Entrada varia** (un ingreso de dinero) o **Ajuste positivo**.
   - **Egreso** → **Gasto** (egreso categorizado) o **Ajuste negativo**.
4. Cada movimiento que se puede anular muestra un menú **⋮ → Anular** (pide confirmación).

- **Permiso:** `CAJA_MAYOR_OPERAR`. Sin él, ves la Caja Mayor en **solo lectura** (saldos y
  movimientos, sin botones de Ingreso/Egreso ni Anular).
- **Nota:** en mobile, un gasto o entrada se registra con **una sola moneda y forma de
  pago**; el reparto multi-moneda más complejo queda para el escritorio.

---

## B. Sub-módulos de solo consulta

### Cajas

Las cajas del sistema (cajas de PdV, caja chica, etc.) con su estado. Te deja revisar qué
cajas existen y su situación sin abrir el escritorio.

### Cuentas por Cobrar (CxC)

Los créditos que el negocio le dio a clientes (lo que te deben). Cada tarjeta muestra el
cliente y el saldo. Sirve para consultar cuánto debe cada quién.

> El **cobro** de una cuenta por cobrar se hace desde el escritorio (Caja Mayor). En mobile
> solo la consultás.

### Comisiones

Tres listas de consulta relacionadas con el sistema de comisiones de ventas:

| Sub-módulo | Qué muestra |
|---|---|
| **Reglas de comisión** | Las reglas configuradas (porcentajes, condiciones) |
| **Equipos de comisión** | Los equipos/grupos a los que se asignan comisiones |
| **Liq. de comisión** | Las liquidaciones de comisión generadas, con su monto |

La **creación y liquidación** de comisiones se maneja en el escritorio.

---

## C. Lo que todavía no está (aparece como "pronto")

Dentro de Finanzas vas a ver una tarjeta atenuada con la etiqueta **"pronto"**:

- **Monedas** — el alta/edición de monedas no está disponible en mobile.

Ver el detalle en [Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

---

## Errores comunes

- **No puedo crear/editar categorías de gasto:** te falta el permiso `CAJA_MAYOR_OPERAR`.
- **No veo los botones de Ingreso/Egreso en la Caja Mayor:** o la caja está **cerrada**, o
  te falta el permiso `CAJA_MAYOR_OPERAR` (la verías en solo lectura).
- **Quiero cobrar una cuenta por cobrar y no encuentro el botón:** el cobro es una
  operación del escritorio; en mobile la cuenta es solo de lectura.

---

**Próximo capítulo →** [Módulo Compras](06-modulo-compras.md)
