# Plan: cliente desde la factura + mesa que no se ocupa

Estado: propuesta, pendiente de auditoría.
Fecha: 2026-08-20.
Rama: `fix/pdv-cliente-factura-y-mesa`.

Dos cosas independientes que van en el mismo PR porque ambas viven en el PdV.

---

# Parte A — La mesa no se marca como ocupada

## Diagnóstico (verificado en código)

Cargar el primer ítem a una mesa libre dispara **tres llamadas IPC separadas y sin
transacción común** desde `pdv.component.ts`:

| Llamada | Handler | Permiso |
|---|---|---|
| `createVenta` | `ventas.handler.ts:706` | `VENTAS_PDV` |
| `createVentaItem` | `ventas.handler.ts:1096` | `VENTAS_PDV` |
| `updatePdvMesa({estado: OCUPADO})` | `ventas.handler.ts:1970` | **`VENTAS_PDV_CONFIGURAR`** |

En el seed de roles (`electron/utils/seed-system.ts:480`), `VENTAS_PDV_CONFIGURAR`
lo tiene **sólo GERENTE**. Ni CAJERO ni MOZO. La tercera llamada se rechaza con
`FORBIDDEN`, y el error muere acá:

```ts
// pdv.component.ts:1821-1831
private updateMesaEstado(mesa: PdvMesa, estado: PdvMesaEstado): void {
  mesa.estado = estado;                       // mutación local optimista
  this.repositoryService.updatePdvMesa(mesa.id!, mesa).subscribe(
    updatedMesa => { console.log(...); },
    error => { console.error('Error updating mesa estado:', error); },   // <-- se traga
  );
}
```

El polling de mesas cada segundo (`pdv.component.ts:500`) pisa `mesaLocal.estado`
con el de la base **incondicionalmente**, así que el cambio optimista dura menos
de un segundo y el usuario no ve ni un parpadeo.

**La hipótesis del reporte era correcta en el fondo pero no en el detalle: no es
"mozo que no es cajero", es todo el mundo salvo GERENTE/ADMIN.**

### El mismo permiso rompe liberar la mesa

`updatePdvMesa` con `estado: DISPONIBLE` se usa en 5 lugares más
(`pdv.component.ts` líneas 1939, 2000, 2093, 2294, 2490): cobrar, cancelar,
transferir mesa, mover ítems. Con un cajero, **ninguno libera la mesa**.

Eso explica el bug ya anotado en `reference/known-bugs.md:160` como *"Mesas
colgadas en OCUPADO — causa: posible race condition o bug en flujo de
cancelación"*. No es una race condition: es el mismo permiso.

## Solución

**A1. `createVenta` marca la mesa OCUPADO en la misma transacción.**
Es exactamente lo que ya hace `abrirComanda` (`ventas.handler.ts:2170-2206`) para
el flujo de comandas: ahí el estado nunca falla porque viaja con la venta. Se
replica para el flujo directo. Permiso: el que ya tiene, `VENTAS_PDV`.

Sólo marca cuando la venta trae mesa y la mesa está `DISPONIBLE`; nunca degrada
una mesa ya ocupada.

**A2. Handler nuevo `set-pdv-mesa-estado(mesaId, estado)` con `VENTAS_PDV`.**
Para los casos que no nacen con una venta: liberar al cobrar/cancelar,
transferir mesa, mover ítems, transferir comanda. Sólo toca `estado` — no puede
renombrar la mesa, cambiarla de sector ni tocar nada estructural.

`updatePdvMesa` **queda como está**, con `VENTAS_PDV_CONFIGURAR`: es el ABM real
de mesas y bajarle el permiso le daría a un mozo la estructura del PdV.

**A3. Los 6 sitios del frontend pasan a usar el handler nuevo**, y dejan de
tragarse el error: si falla, snackbar. Un mozo tiene que enterarse de que la mesa
no se ocupó, no descubrirlo cuando el salón está lleno.

**A4. `refreshMesasSilent` no pisa la mesa seleccionada.** Hoy sobrescribe
`estado` de todas las mesas; para `venta` ya excluye la seleccionada
(`pdv.component.ts:503`) justamente para no pisar lo que se está editando. Se
aplica el mismo criterio a `estado`. Sin esto, cualquier fallo futuro vuelve a
ser invisible durante menos de un segundo.

> **Los roles NO se tocan.** Dar `VENTAS_PDV_CONFIGURAR` a MOZO/CAJERO arreglaría
> el síntoma en instalaciones nuevas y en ninguna existente: el seed de roles es
> idempotente y no reasigna permisos a roles ya creados. Además le daría acceso
> de configuración a quien no corresponde.

## Tests (Parte A)

`npm run test:mesa-ocupacion` — e2e sobre SQLite con handlers reales:

1. Usuario con **sólo `VENTAS_PDV`** (simula MOZO): `createVenta` con mesa deja
   la mesa en `OCUPADO`. **Este es el test que hoy falla.**
2. Ese mismo usuario libera la mesa con `set-pdv-mesa-estado`.
3. `updatePdvMesa` **sigue rechazando** a ese usuario (no aflojamos el ABM).
4. `createVenta` sin mesa no explota.
5. Una mesa ya `OCUPADO` por otra venta no se pisa.
6. `set-pdv-mesa-estado` rechaza un estado inválido.

---

# Parte B — Guardar el cliente al facturar y autocompletar por RUC

## Situación actual (verificada)

- El receptor se pide en `FacturarDialogComponent`
  (`src/app/pages/facturacion/facturas/facturar-dialog/`), con el orden
  **razón social → RUC**.
- `create-factura` (`electron/handlers/facturacion.handler.ts:271`) guarda el
  receptor **denormalizado** en `Factura` (`nombreCliente`, `ruc`, `direccion`,
  `email`) y **nunca toca `Cliente`/`Persona`**. Si el usuario no usó el botón
  "Buscar cliente", la factura queda con `cliente_id = null`.
- El RUC puede vivir en **dos lugares** y no están unificados: `clientes.ruc` y
  `personas.documento` (+ `personas.tipoDocumento`). El buscador de clientes ya
  mira los dos. **No hay índice ni unique sobre ninguno.**
- `telefono` se tipea en el formulario pero **no se persiste**: `Factura` no
  tiene esa columna. Hoy sólo se usa para el PDF. Al guardarlo en el cliente
  deja de perderse.

## Solución

**B1. Invertir el orden del formulario: RUC primero, razón social después.**
Es el orden de la operación real: se pregunta el RUC y a partir de ahí se
resuelve todo lo demás.

**B2. Lookup por RUC que autocompleta.** Al salir del campo RUC (o tras 500 ms
sin tipear), busca el cliente por RUC. Si lo encuentra: completa razón social,
dirección, email y teléfono, y vincula el `clienteId` — reusando
`aplicarCliente()`, que ya existe (`facturar-dialog.component.ts:184-197`). Si no
lo encuentra, no hace nada: se creará al confirmar.

> Es un lookup puntual, no un autocomplete con desplegable. La regla del repo
> pide filtros explícitos y no filtrado en vivo; acá el pedido fue justamente
> "con sólo ingresar el RUC ya se carga el cliente", así que el disparo por RUC
> es lo pedido, pero se resuelve con una búsqueda exacta y no con una lista que
> se filtra tecla a tecla.

**B3. Handler nuevo `get-cliente-por-ruc(ruc)`.** Búsqueda **exacta**
(normalizada: sin espacios, mayúsculas) sobre `clientes.ruc` **y**
`personas.documento`. Devuelve el cliente con su persona, o `null`.
`get-clientes({ruc})` existente hace `LIKE %...%` y sirve para buscar, no para
resolver una identidad.

**B4. `create-factura` hace el upsert del cliente, en su misma transacción.**

- Si la factura ya viene con `cliente` vinculado → no se crea nada.
- Si no, busca por RUC:
  - **No existe** → crea `Persona` + `Cliente` (mismo patrón que
    `crear-cliente-mesa`, `personas.handler.ts:881`). El RUC se escribe en
    **`clientes.ruc` y en `personas.documento` con `tipoDocumento = RUC`**, para
    que lo encuentren tanto el buscador viejo como el lookup nuevo.
  - **Existe** → lo vincula y **completa sólo los campos vacíos** (dirección,
    email, teléfono). Nunca pisa datos ya cargados: un tipeo apurado en el PdV no
    puede degradar un cliente curado desde el módulo de Clientes.
- En ambos casos, `factura.cliente` queda seteado.

Si el upsert falla, **la factura igual se emite**: es un documento legal con
numeración de timbrado y no se puede perder por un problema al guardar un
cliente. El fallo se registra en log.

**B5. Índice NO único** sobre `clientes.ruc` y sobre `personas.documento`.
Un `UNIQUE` sería lo correcto a futuro, pero no sé qué datos hay en producción:
si ya existen RUCs repetidos, la migración falla al aplicarse y **bloquea el
arranque de la app**, porque las migraciones corren en el boot. Con índice
simple, la búsqueda es rápida y nada se rompe. Si hay más de un cliente con el
mismo RUC, el lookup toma el de `id` menor (determinístico) — queda anotado en
el backlog resolver los duplicados y recién después endurecer el índice.

**B6. La venta no se toca.** `Venta.cliente` ya existe y no es nullable: toda
venta arranca con un cliente. Cambiarlo desde la factura podría afectar crédito y
CPC. Se vincula el cliente a la **factura**, no a la venta.

## Tests (Parte B)

`npm run test:factura-cliente` — e2e sobre SQLite con handlers reales:

1. Facturar con un RUC que no existe → crea `Persona` + `Cliente`, con el RUC en
   los dos lugares y `tipoDocumento = RUC`, y la factura queda vinculada.
2. Facturar de nuevo con el **mismo** RUC → **no** crea un segundo cliente y
   reusa el existente.
3. Cliente existente con dirección cargada → facturar con otra dirección **no la
   pisa**; un campo que estaba vacío **sí** se completa.
4. `get-cliente-por-ruc` encuentra por `clientes.ruc` y también por
   `personas.documento`.
5. RUC con espacios y minúsculas resuelve al mismo cliente (normalización).
6. Factura que ya viene con `cliente` vinculado → no se crea nada.
7. Si el upsert falla, la factura se emite igual y conserva su numeración.

---

## Fases

| # | Contenido | Cierra con |
|---|---|---|
| **F1** | Migración: índices no únicos sobre `clientes.ruc` y `personas.documento` | commit + push |
| **F2** | Backend mesa: `createVenta` atómico + `set-pdv-mesa-estado` + capas IPC | commit + push |
| **F3** | Frontend mesa: los 6 sitios usan el handler nuevo, con snackbar; `refreshMesasSilent` respeta la mesa seleccionada | commit + push |
| **F4** | Backend factura: `get-cliente-por-ruc` + upsert en `create-factura` + capas IPC | commit + push |
| **F5** | Frontend factura: orden RUC → razón social, lookup y autocompletado | commit + push |
| **F6** | `test:mesa-ocupacion` + `test:factura-cliente`, batería completa, AOT, auditoría por agentes, prueba en navegador, docs y backlog, PR | PR + CI verde |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Marcar la mesa dentro de `createVenta` cambia el comportamiento de un handler muy usado | Sólo actúa si la venta trae mesa y está `DISPONIBLE`; el test cubre el caso sin mesa y el de mesa ya ocupada |
| El upsert de cliente ensucia la base si alguien tipea cualquier cosa | Es el pedido explícito. Se crea sólo si hay RUC y razón social, que ya son `required` en el formulario |
| Duplicados de RUC preexistentes en producción | No se agrega `UNIQUE`; el lookup es determinístico y los duplicados quedan en el backlog |
| Un `UNIQUE` mal puesto bloquearía el arranque | Por eso no se pone: las migraciones corren en el boot de la app |
| Todo se verifica en SQLite | El job de Postgres del CI es el gate real |
