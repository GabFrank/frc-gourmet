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

---

# v2 — Correcciones de la auditoría

Dos agentes auditaron la v1. Verifiqué cada hallazgo contra el código antes de
aceptarlo. Lo que sigue **reemplaza** lo que contradiga de arriba.

## C1 [ALTA] A1 ignoraba una regla de negocio que ya existe

Hay un config `PdvConfig.ocuparMesaAlVincularComanda` (**default `false`**) que
decide si vincular una comanda a una mesa ocupa la mesa física. `abrirComanda` lo
respeta (`ventas.handler.ts:2199, 2231`). Mi condición ("la venta trae mesa y está
DISPONIBLE") lo pisaba: una venta de comanda con mesa vinculada habría ocupado la
mesa igual.

El propio mobile ya lo tiene claro, y lo dice en un comentario
(`tomar-pedido.page.ts:512-514`): *"La comanda ya quedó OCUPADA al abrirla, no se
toca acá"*.

**Corrección:** `createVenta` marca la mesa **sólo si `venta.mesa` está seteada y
`venta.comanda` NO**. El camino de comanda sigue siendo responsabilidad de
`abrirComanda`, que ya respeta el config.

## C2 [ALTA] El repo ya resolvió esta race condition y yo no la estaba usando

`materializarPedidoOnlineEnVenta` (`ventas.handler.ts:125-208`) marca la mesa
dentro de una **transacción real** y bajo un **lock por mesa**
(`withMesaMaterializeLock`, `:92-104`), cuyo comentario dice: *"Evita dos ventas
ABIERTAS para la misma mesa"*.

`createVenta` hoy es un `repo.save(entity)` pelado (`:706-722`). Hoy el race casi
no se manifiesta porque el `updatePdvMesa` falla igual por permiso; **arreglar el
permiso habilita la ruta donde el race sí aparece**.

**Corrección:** generalizar `withMesaMaterializeLock` a `withMesaLock` (mismo
código, nombre honesto) y envolver el nuevo bloque de `createVenta` en
`dataSource.transaction()` + ese lock, igual que el flujo online.

## C3 [ALTA] Son 9 sitios en desktop, no 6 — y 4 más en el mobile

Grep completo de `updatePdvMesa` / `updateMesaEstado` en `pdv.component.ts`:

| Línea | Estado | Flujo | ¿Estaba en la v1? |
|---|---|---|---|
| 869 | OCUPADO | Transferir comanda a mesa libre | **no** |
| 1807 | OCUPADO | Éxito de `createVenta` | sí → **se ELIMINA** |
| 1939 | DISPONIBLE | Cobro | sí |
| 2000 | DISPONIBLE | Cancelar venta | sí |
| 2093 | DISPONIBLE | Cobro rápido | sí |
| 2294 | DISPONIBLE | Transferir mesa (libera origen) | sí |
| 2297 | OCUPADO | Transferir mesa (ocupa destino) | **no** |
| 2469 | OCUPADO | Mover ítems (ocupa destino) | **no** |
| 2490 | DISPONIBLE | Mover ítems (vacía origen) | sí |
| 2808 | OCUPADO | Guardar nombre de cliente | **no** |

La línea 1807 **se elimina**, no se migra: con C1/C2 el backend ya marca la mesa
dentro de `createVenta`, así que esa llamada queda como un viaje redundante y
condenado a fallar para todo el que no sea gerente.

**Mobile (`projects/mobile`), 4 sitios que la v1 no contemplaba:**

- `ventas/mesas/tomar-pedido.page.ts:515` — OCUPADO al primer ítem. Ya viene con
  un `try/catch` vacío y el comentario *"el estado se reconcilia igual"* — una
  reconciliación que **no existe en ninguna parte**. Es la huella de alguien que
  chocó con este mismo FORBIDDEN y lo dio por perdido.
- `ventas/mesas/mesa-detalle.page.ts:633, 706, 707` — transferir mesa.

**Corrección:** los 8 sitios de desktop que quedan + los 4 de mobile migran al
handler nuevo. Sin esto el PR cerraría el bug sólo a medias.

> `pdv-mesa-dialog.component.ts:367` **queda como está**: es el ABM real
> (renombrar, cambiar de sector) y debe seguir pidiendo `VENTAS_PDV_CONFIGURAR`.

## C4 [ALTA] `create-factura` no puede hacer el upsert dentro de su transacción

`create-factura` corre **todo** dentro de `dataSource.transaction`
(`facturacion.handler.ts:275`), incluida la numeración atómica del timbrado
(`:300-308`). Si el upsert del cliente va ahí adentro y falla, hace rollback de
**la factura entera** — exactamente lo contrario de lo que la v1 prometía. Peor en
Postgres, donde una excepción aborta el bloque completo y todo statement posterior
falla hasta el rollback.

**Corrección:** el upsert corre **antes** de abrir la transacción, con su propio
`try/catch`. Si falla, se loguea y `clienteId` queda `null`: la factura se emite
igual, que es lo que corresponde para un documento legal con numeración.

## C5 [ALTA] Falta reconciliar las mesas ya colgadas

`workflows/verificacion-bd-sqlite.md:288-295` documenta un `UPDATE` manual para
liberar mesas colgadas en OCUPADO. Que exista ese remedio significa que el bug ya
tiene víctimas en instalaciones reales. El fix hace que **de acá en adelante**
todo funcione, pero una mesa ya trabada sigue trabada para siempre.

**Corrección:** la migración de F1 incluye una reconciliación idempotente que
libera las mesas `OCUPADO` que no tienen ni venta `ABIERTA` **ni comanda
`OCUPADO`** vinculada. Se auto-cura en el próximo arranque de cada instalación,
sin SQL a mano restaurante por restaurante.

> El SQL documentado sólo mira ventas. La migración además mira comandas, con el
> mismo criterio que `cerrarComanda` (`ventas.handler.ts:2231-2242`), para no
> liberar una mesa que tiene una comanda viva.

## C6 [MEDIA] `set-pdv-mesa-estado` tiene que validar antes de liberar

"Sólo toca `estado`" no alcanza: liberar una mesa que todavía tiene una venta
`ABIERTA` deja una mesa fantasma que otro cajero puede volver a ocupar, con dos
ventas vivas sobre la misma mesa física.

**Corrección:** al pedir `DISPONIBLE`, el handler verifica que no queden comandas
`OCUPADO` ni ventas `ABIERTA` sin comanda sobre esa mesa — el criterio que ya usa
`cerrarComanda`. Si quedan, no libera y devuelve error.

## C7 — Se descarta A4 (el polling)

La v1 proponía que `refreshMesasSilent` no pisara el estado de la mesa
seleccionada. Era un parche para proteger una mutación optimista que, una vez que
el backend persiste bien, **deja de existir**. Peor: dejaría la pantalla ciega a lo
que otro cajero hace sobre esa mesa desde otro dispositivo. **`refreshMesasSilent`
queda como está.**

## C8 [MEDIA] Editar el RUC después de un match dejaba el cliente viejo pegado

`aplicarCliente()` (`facturar-dialog.component.ts:184-197`) setea `clienteId` y no
hay camino para desvincularlo. Si el usuario corrige un typo del RUC después de un
match, la factura se emitiría vinculada al cliente equivocado — y el upsert de B4
ni lo intentaría, porque ve `cliente` ya seteado.

**Corrección:** al cambiar el RUC, si difiere del que produjo el match, se limpian
`clienteId` y `clienteLabel`.

Además, el disparo del lookup pasa a ser **sólo `blur`** (se descarta el debounce
de 500 ms): autocompletar mientras el cursor sigue en el campo es justo el patrón
de filtrado en vivo que la regla 11 del repo prohíbe, y encima puede dispararse
sobre un RUC a medio tipear.

## C9 [MEDIA] Desempate de RUC duplicado

Tomar el `id` menor puede resucitar un cliente **desactivado** a propósito
(duplicado, baja, morosidad) si justo tiene el id más bajo.

**Corrección:** el desempate prefiere `activo = true`; entre iguales, `id` menor.

## C10 [MEDIA] Faltaba regenerar el mapa de canales

`scripts/generate-mobile-api-map.js` escribe `API_CHANNEL_MAP` en
`src/app/web/api-channel-map.generated.ts` y en
`projects/mobile/src/app/core/data/api-channel-map.generated.ts`. Es lo que le
permite al shim HTTP resolver el método al canal. Si no se regenera, **compila
igual y pasa el AOT**, pero falla en runtime para todo cliente HTTP — la misma
firma de fallo que el bug que estamos arreglando.

**Corrección:** F2 y F4 enumeran las capas explícitamente: `preload.ts`,
`repository.service.ts` (abstracto), `repository-ipc.service.ts`,
`repository-http.service.ts`, y correr `node scripts/generate-mobile-api-map.js`.

`repository-http.service.ts` recibe **stubs**, igual que los ~763 métodos que ya
están así (`updatePdvMesa` incluido, `:852`). No se implementa HTTP real acá: sería
alcance nuevo y no es lo que se pidió.

## C11 [BAJA] Permiso del lookup

`get-cliente-por-ruc` es de sólo lectura y **no lleva `ensurePermission`**,
siguiendo el precedente de `get-clientes` (`personas.handler.ts:642`, sin guard).
Se deja dicho explícitamente: expone datos de contacto del cliente a cualquier
llamador autenticado de `/api/rpc`, igual que hoy.

## C12 — Consecuencia asumida de escribir el RUC en `personas.documento`

`create-edit-cliente-dialog.component.ts:316-319` exige `persona.documento` no
vacío para poder activar **crédito**, sin mirar el tipo de documento. Al escribir
el RUC ahí, una persona creada desde la factura pasa esa validación.

Es la opción elegida a conciencia (buscar y escribir en los dos lugares) y un RUC
**es** un documento de identidad de una empresa, así que no es incorrecto — pero
queda anotado en la doc para que nadie lo descubra por accidente.

## C13 [MEDIA] Documentación con afirmaciones ya falsas

Dos que el PR toca de cerca y hay que corregir de paso:

- `domains/facturacion.md:31` dice *"Sin permisos dedicados… Pendiente: agregar
  FACTURACION_*"*. **Falso**: `create-factura` ya exige `FACTURACION_EMITIR`
  (`facturacion.handler.ts:274`) y el permiso está en `SEED_PERMISOS` (`:96`).
- `domains/ventas-pdv.md:549` dice que `ensurePermission` en ese handler es
  *"selectivo — sólo en `cerrarVentasAbiertasMesa`, `updateVenta`, `deleteVenta`"*.
  **Falso**: `createVenta`, `createVentaItem`, `abrirComanda` y `updatePdvMesa`
  también lo tienen.

Docs a actualizar en F6, por nombre: `domains/ventas-pdv.md`,
`domains/facturacion.md`, `domains/personas-clientes.md` (dual-write del RUC y la
regla de "no pisa lo cargado"), `reference/known-bugs.md` (marcar resuelto
*"Mesas colgadas en OCUPADO"* con su causa real) y `workflows/todos-pendientes.md`
(duplicados de RUC e índice único diferido).

## C14 [MEDIA] El manual de pruebas tiene que probarse con un MOZO

`docs/testing/TESTING-CHECKLIST-PDV.md` no tiene un solo caso por rol: todo está
escrito como si lo probara un admin. **Este bug sólo aparece si NO sos gerente**,
así que una pasada como admin no lo detecta.

Se crea `docs/testing/TESTING-CHECKLIST-PDV-MESA-CLIENTE.md`, con los casos
corriendo **con un usuario de rol MOZO**: primer ítem ocupa la mesa · cobro libera ·
cancelar libera · cobro rápido libera · transferir mesa (origen y destino) · mover
ítems · transferir comanda a mesa libre · guardar nombre de cliente ocupa · el ABM
de mesas **sigue rechazado** para el mozo · y los mismos casos desde la PWA.

## Fases (v2)

| # | Contenido |
|---|---|
| **F1** | Migración: índices no únicos sobre `clientes.ruc` y `personas.documento` **+ reconciliación de mesas colgadas** (C5) |
| **F2** | Backend mesa: `withMesaLock` generalizado, `createVenta` transaccional y sin tocar comandas (C1, C2), `set-pdv-mesa-estado` con validación al liberar (C6), capas IPC completas + mapa de canales (C10) |
| **F3** | Frontend mesa: 8 sitios de desktop migrados y el 1807 **eliminado** (C3), snackbar en error |
| **F4** | Frontend mesa **mobile**: los 4 sitios de la PWA (C3) |
| **F5** | Backend factura: `get-cliente-por-ruc` (desempate por `activo`, C9, C11) + upsert **antes** de la transacción (C4) + capas IPC |
| **F6** | Frontend factura: orden RUC → razón social, lookup on blur, limpieza de vínculo al cambiar el RUC (C8) |
| **F7** | Tests, batería, AOT, auditoría del diff, prueba en navegador **con un usuario MOZO**, manual nuevo (C14), docs de C13, backlog, PR |

## Tests que se suman

- `test:mesa-ocupacion`: venta de **comanda** con mesa vinculada **no** ocupa la
  mesa cuando `ocuparMesaAlVincularComanda = false` (C1); `set-pdv-mesa-estado`
  **rechaza** liberar una mesa con venta abierta (C6); la reconciliación libera
  una mesa colgada y **no** toca una con comanda viva (C5).
- `test:factura-cliente`: si el upsert falla, la factura **se emite igual** y
  conserva su número (C4); el desempate prefiere el cliente activo (C9).
