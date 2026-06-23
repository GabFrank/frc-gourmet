# Capítulo 5 — Módulo Finanzas

Entrás tocando **Finanzas** (💵) en la navegación. Es un módulo principalmente de
**consulta**: te permite revisar el estado financiero desde el celular. La única gestión
disponible por ahora es la de **Categorías de gasto**.

> Repasá [Capítulo 3](03-como-usar-listas-y-formularios.md) para el uso general de listas.

---

## A. Lo que podés gestionar

### Categorías de gasto

Las categorías con las que se clasifican los gastos del negocio (ALQUILER, SERVICIOS,
INSUMOS…). Sirven para ordenar y reportar los egresos.

- **Campos:** Nombre, Activo.
- **Permiso:** `CAJA_MAYOR_OPERAR`.
- Podés crear, editar y eliminar (con confirmación), igual que cualquier lista.

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

Dentro de Finanzas vas a ver dos tarjetas atenuadas con la etiqueta **"pronto"**:

- **Monedas** — el alta/edición de monedas no está disponible en mobile.
- **Caja Mayor** — los movimientos, egresos, ingresos y anulaciones de la Caja Mayor se
  hacen en el escritorio.

Ver el detalle en [Capítulo 10](10-limitaciones-y-version-escritorio.md).

---

## Errores comunes

- **No puedo crear/editar categorías de gasto:** te falta el permiso `CAJA_MAYOR_OPERAR`.
- **Quiero cobrar una cuenta por cobrar y no encuentro el botón:** el cobro es una
  operación del escritorio; en mobile la cuenta es solo de lectura.

---

**Próximo capítulo →** [06 — Módulo Compras](06-modulo-compras.md)
