# Manual de pruebas — Ocupación de mesa y cliente al facturar

Dos cambios en el PdV:

1. **La mesa se marca ocupada aunque no seas gerente.** Antes, marcar y liberar
   mesas pasaba por un handler que exigía `VENTAS_PDV_CONFIGURAR`, permiso que en
   el seed tiene **sólo GERENTE**. A un mozo o cajero le fallaba en silencio.
2. **Al facturar se guarda el cliente**, y la próxima vez alcanza con tipear el
   RUC para que se complete solo.

> ⚠️ **Estas pruebas hay que hacerlas con un usuario de rol MOZO o CAJERO, NO con
> el admin.** El bug sólo aparece cuando el usuario **no** tiene
> `VENTAS_PDV_CONFIGURAR`. Probando como admin todo funciona y no se detecta nada.
> Si no hay un mozo creado: Personas → Usuarios → nuevo usuario con rol MOZO.

Reiniciar la app antes de empezar: hay handlers nuevos y una migración.

---

## 0. Antes de nada: la migración liberó las mesas colgadas

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir el PdV después de actualizar | Cualquier mesa que estaba en OCUPADO **sin** venta abierta ni comanda activa ahora aparece **libre**. La migración las reconcilia sola. |
| 0.2 | Una mesa que sí tiene una venta abierta | Sigue **ocupada**. No se toca. |

---

## 1. Ocupar la mesa (el bug)

**Con sesión de MOZO:**

| # | Paso | Esperado |
|---|---|---|
| 1.1 | Elegir una mesa **libre** y agregar el primer ítem | La mesa pasa a **OCUPADA** y **se queda así**. Antes volvía a libre en menos de un segundo. |
| 1.2 | Esperar unos segundos sin tocar nada | Sigue ocupada (el refresco automático ya no la revierte). |
| 1.3 | Salir del PdV y volver a entrar | Sigue ocupada: quedó guardada en la base, no sólo en pantalla. |
| 1.4 | Abrir el PdV en otro dispositivo | La mesa figura ocupada también ahí. |

## 2. Liberar la mesa

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Cobrar la venta completa | La mesa vuelve a **DISPONIBLE**. |
| 2.2 | En otra mesa con ítems, cancelar la venta | Vuelve a DISPONIBLE. |
| 2.3 | Cobro rápido | Vuelve a DISPONIBLE. |
| 2.4 | Con una venta **abierta**, intentar liberar la mesa por otro camino | Se rechaza con un mensaje que dice cuántas ventas y comandas activas quedan. No deja una mesa fantasma. |

## 3. Transferir y mover

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Transferir una mesa con consumo a una mesa libre | Origen **DISPONIBLE**, destino **OCUPADA**. |
| 3.2 | Mover ítems seleccionados a otra mesa, vaciando la de origen | Origen DISPONIBLE, destino OCUPADA. |
| 3.3 | Mover sólo **algunos** ítems | La de origen **sigue ocupada** (le quedan ítems). |
| 3.4 | Transferir una comanda a una mesa libre | La mesa destino queda OCUPADA. |
| 3.5 | En una mesa recién seleccionada sin ítems, guardar un nombre de cliente | La mesa pasa a OCUPADA. |

## 4. Comandas: la mesa no se ocupa sola

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Con *Ocupar mesa al vincular comanda* **apagado** (default, en Configurar del PdV), abrir una comanda con mesa vinculada y cargarle un ítem | La mesa física **NO** se ocupa. Esa decisión es del config, no del alta de la venta. |
| 4.2 | Encender esa opción y repetir | Ahora sí se ocupa, al vincular la comanda. |

## 5. El ABM de mesas sigue cerrado

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Como **MOZO**, intentar renombrar una mesa o cambiarla de sector | **Rechazado** por permiso. Se aflojó ocupar/liberar, no la configuración del PdV. |
| 5.2 | Como GERENTE, lo mismo | Funciona. |

## 6. Si algo falla, ahora se avisa

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Provocar un fallo (por ejemplo, quitarle `VENTAS_PDV` al usuario y agregar un ítem) | Aparece un **snackbar** con el error. Antes moría en la consola y la mesa quedaba mal sin que nadie se enterara. |

## 7. La PWA mobile

Con la misma sesión de MOZO, desde el celular (`http://<ip>:<puerto>`):

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Tomar pedido en una mesa libre y agregar un ítem | La mesa queda OCUPADA, y también se ve ocupada desde el PdV de escritorio. |
| 7.2 | Transferir una mesa desde el detalle | Origen libre, destino ocupada. |

---

## 8. Cliente al facturar

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Cobrar una venta y elegir **Facturar** | En el formulario, el **RUC va primero** y la razón social después. |
| 8.2 | Tipear un RUC que **no existe**, completar razón social y dirección, y confirmar | La factura se emite. |
| 8.3 | Ir a Personas → Clientes | **El cliente fue creado**, con ese RUC y esa razón social. |
| 8.4 | Facturar de nuevo y tipear el **mismo RUC**. Salir del campo (Tab) | Se completan solos razón social, dirección, email y teléfono, y aparece "Cliente encontrado". |
| 8.5 | Confirmar esa segunda factura | **No se creó un cliente duplicado.** |
| 8.6 | Tipear el mismo RUC **sin el guion** | Encuentra el mismo cliente. Tampoco duplica. |
| 8.7 | Con un cliente que ya tiene dirección cargada, facturar con **otra** dirección | La dirección del cliente **no se pisa**. Un dato que estaba vacío (teléfono) **sí** se completa. |
| 8.8 | Tipear un RUC, esperar el match, y después **corregir** el RUC a otro distinto | El vínculo se corta: deja de mostrar "Cliente encontrado". La factura no queda pegada al cliente anterior. |
| 8.8b | Con un cliente vinculado, **agregar o sacar el guion** del RUC (mismo RUC) | El vínculo **se mantiene**: `80012345-6` y `800123456` son el mismo RUC. |
| 8.8c | Con un cliente vinculado, tocar **"Quitar vínculo"** y salir del campo sin cambiar el RUC | El vínculo **no se vuelve a enganchar solo**. |
| 8.9 | Facturar con un RUC nuevo pero **sin** razón social | La factura se emite igual, con su número. No se crea cliente. |
| 8.10 | Revisar la numeración de las facturas emitidas | Correlativa y sin repetidos. |
