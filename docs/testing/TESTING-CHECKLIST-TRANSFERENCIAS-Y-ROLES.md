# Manual de pruebas — Transferencias del PdV y permisos por rol

> **Probar con el usuario correcto es la mitad de la prueba.** Todo lo de acá es
> invisible con el ADMIN: tiene todos los permisos. Los bugs que este manual
> cubre aparecieron justamente porque siempre se probaba con admin.

## Preparación

```bash
npm run seed:dev-roles -- --confirmar
```

Crea (idempotente) tres usuarios sobre la base de **este** equipo:

| Usuario | Roles | Password |
|---|---|---|
| `TEST_MOZO` | MOZO | `123` |
| `TEST_CAJERO` | CAJERO + MOZO | `123` |
| `TEST_GERENTE` | GERENTE + CAJERO + MOZO | `123` |

El prefijo `TEST_` no es cosmético: el script **resetea la password** del usuario
que encuentra con ese nickname. Si ya existiera uno que no creó él, aborta en vez
de pisarlo.

Además verifica monedas y billetes, se asegura de que haya un dispositivo de caja
y deja una caja ABIERTA si no hay ninguna.

⚠️ El script exige `--confirmar` porque escribe sobre la base que usa la app de
este equipo. **No correrlo contra producción.**

Después de correrlo, **reiniciar la app**: los permisos nuevos
(`VENTAS_COBRAR`, `FINANCIERO_CAJA_OPERAR`) los crea el seed del sistema al
arrancar, y `seedRolesPlantilla` se los asigna a los roles.

---

## A. Transferencias del PdV

La matriz completa son 8 celdas: mesa y comanda como origen y como destino,
cada una completa o por ítems. Alcanza con recorrer las marcadas ▶ para cubrir
los caminos distintos; las demás son simétricas.

### ▶ A1. Mesa completa → mesa libre (re-apunte)

1. Con `TEST_MOZO`, abrí una mesa y cargale 2 ítems.
2. **TRANSFERIR** → chip **MESAS** → elegí una mesa verde (libre) → confirmar.

**Esperado:** snackbar "2 item(s) transferidos a MESA N". La mesa origen queda
**verde**, la destino **naranja** con los 2 ítems. Es la *misma* venta, sólo
cambió de mesa.

> Que un MOZO pueda hacer esto es parte de la prueba. Si falla con un error de
> permisos, es el bug de siempre.

### ▶ A2. Mesa completa → mesa que ya tiene cuenta (fusión)

1. Dos mesas, cada una con ítems.
2. Transferí la primera a la segunda.

**Esperado:** la mesa destino queda con **todos** los ítems de las dos. La origen
se libera. La venta de origen queda CANCELADA (se ve en Historial de ventas).

### ▶ A3. Ítems de mesa → comanda libre

1. Mesa con 3 ítems.
2. **MOVER ITEMS** → tildá **uno solo** → **CONFIRMAR MOVER (1)**.
3. Chip **COMANDAS** → elegí una comanda **sin** marca de persona → confirmar.

**Esperado:** la comanda pasa a ocupada y, al abrirla, muestra **"Mesa N"** en su
cabecera: quedó vinculada a la mesa de origen (misma mesa, cuenta separada). La
mesa sigue ocupada con los 2 ítems restantes.

### ▶ A4. Comanda completa → mesa, y la mesa original NO queda colgada

Encadena A3 y descubre un bug que sólo aparece con las dos transferencias juntas.

1. Partiendo de A3, transferí **toda** la mesa a esa misma comanda (TRANSFERIR →
   COMANDAS → la comanda de A3). La mesa queda **naranja**: la comanda vive encima.
2. Ahora seleccioná esa comanda → **TRANSFERIR** → chip **MESAS** → una mesa libre.

**Esperado:** la comanda vuelve a libre, la mesa nueva queda ocupada, y **la mesa
original vuelve a verde**. Si queda naranja sin ítems ni comanda, es una mesa
fantasma: otro cajero la va a poder ocupar encima.

### ▶ A5. La cuenta con cobro parcial no se fusiona

1. Mesa con 2 ítems. **COBRAR** → cobrá **parcialmente** (un ítem).
2. Volvé y transferí la mesa completa a **otra mesa que ya tenga cuenta abierta**.

**Esperado:** error legible — *"La cuenta de origen tiene cobros parciales y el
destino ya tiene una cuenta abierta…"*. **No** se mueve nada.

3. Ahora transferila a una mesa **libre**.

**Esperado:** funciona. El cobro parcial viaja con la venta; el ítem cobrado sigue
marcado PAGADO en el destino.

### ▶ A6. Ítems ya cobrados no se seleccionan

Con una mesa que tenga un ítem cobrado parcialmente, entrá en **MOVER ITEMS**.

**Esperado:** el ítem con chip PAGADO **no** se puede tildar.

### ▶ A7. Todos los ítems seleccionados

En **MOVER ITEMS**, tildá **todos** y confirmá.

**Esperado:** aparece la pregunta *"¿Desea transferir MESA N completa (incluyendo
cobros y datos del cliente)?"* con botones rotulados **TRANSFERIR COMPLETA** y
**SOLO ITEMS** — no "Sí"/"No". Probá las dos ramas: "SOLO ITEMS" tiene que abrir
igual el selector de destino y mover únicamente los ítems, dejando el cobro y el
nombre del cliente en el origen.

### ▶ A8. El mostrador no es destino ni origen

Con una **venta rápida** activa (sin mesa), mirá la barra inferior.

**Esperado:** **no** aparecen TRANSFERIR ni MOVER ITEMS. Antes TRANSFERIR se veía
habilitado y no hacía nada al tocarlo.

---

## B. Permisos por rol

### B1. `TEST_CAJERO` abre y cierra su caja

1. Entrá como `TEST_CAJERO` → *Financiero → Cajas* → **ABRIR CAJA**.
2. Cargá el conteo de apertura y guardá.
3. Cerrala con el conteo de cierre.

**Esperado:** las dos operaciones funcionan. Hasta 2026-08 el cajero no podía ni
abrir la caja — el turno no arrancaba.

**Y el reverso:** `TEST_CAJERO` **no** debe poder borrar una caja ni editar las
monedas habilitadas para el conteo (eso es del gerente).

### B2. `TEST_CAJERO` cobra una venta

Con la caja abierta, cargá una venta y cobrala:

- una línea en efectivo,
- una línea con **tarjeta** (forma de pago con máquina POS),
- una línea por **transferencia** (forma de pago con cuenta bancaria).

**Esperado:** las tres se agregan. El bug reportado era que el botón ✓ de
"Agregar" fallaba: el cajero no tenía el permiso de compras que pedía el handler.

### B3. `TEST_MOZO` **no** cobra

Con `TEST_MOZO`, abrí una mesa, cargá ítems y tocá **COBRAR** → intentá agregar una
línea de pago.

**Esperado:** falla con un error de permisos. El mozo toma pedidos y transfiere
mesas; la plata es del cajero.

### B4. `TEST_GERENTE` en el cajón del PdV

*Utilitarios* → pagar un vale, pagar una compra, y **anular** un egreso.

**Esperado:** las tres funcionan. Antes el gerente podía **menos** que el cajero
acá, y anular un egreso no lo podía hacer nadie salvo el ADMINISTRADOR.

---

## C. PWA mobile

Entrá desde el celular al QR que muestra el Home, o a `http://<ip>:7071/`.

### ▶ C1. Cambio de contraseña obligatorio

1. Creá un usuario nuevo desde el desktop (queda con contraseña temporal).
2. Entrá con él desde la PWA.

**Esperado:** te lleva a la pantalla de cambio obligatorio, **los tres campos
tienen icono de ojo** para ver lo que escribís, y al guardar **entra a la app**.
Antes tiraba un error y no había forma de pasar de esa pantalla.

También el login tiene ojo en su campo de contraseña.

### ▶ C2. Caja Mayor no le figura al cajero

Entrá con `TEST_CAJERO` a la PWA y mirá el Home.

**Esperado:** **no** aparecen las tarjetas de Caja Mayor. Con `TEST_GERENTE` sí.

### C3. Foto de perfil y adjuntos

Subí una foto de perfil desde la PWA y abrí un adjunto.

**Esperado:** funcionan. Son parte del mismo grupo de métodos que estaba roto
sobre HTTP por la forma de los argumentos.

---

## Qué mirar si algo falla

- Un error de permisos se ve como `PERMISO REQUERIDO: <CODIGO>`. Ese código dice
  exactamente qué falta y a qué rol hay que dárselo.
- Estado real de las mesas, sin pasar por la UI:

```sql
-- mesas ocupadas sin nada vivo encima (fantasmas)
SELECT m.numero FROM pdv_mesas m
WHERE m.estado = 'OCUPADO'
  AND m.id NOT IN (SELECT mesa_id FROM ventas
                   WHERE estado = 'ABIERTA' AND comanda_id IS NULL AND mesa_id IS NOT NULL)
  AND m.id NOT IN (SELECT pdv_mesa_id FROM comandas
                   WHERE estado = 'OCUPADO' AND activo = 1 AND pdv_mesa_id IS NOT NULL);
```

- Tests automáticos que cubren lo mismo: `npm run test:transferencia-pdv` (60
  asserts) y `npm run test:roles-pdv` (99). Si uno de estos falla, no hace falta
  probar a mano: el mensaje dice qué rol y qué operación.
