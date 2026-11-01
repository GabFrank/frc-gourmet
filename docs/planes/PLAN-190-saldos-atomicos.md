# PLAN #190 — saldos de CuentaBancaria y Cliente sin «lost update»

Issue: #190 (follow-up de M-02). Rama: `bot/ceo-frc-gourmet/fix-190-saldos-atomicos` desde `origin/develop` (75c06383).

## Problema

`cuentas_bancarias.saldo`, `cuentas_bancarias.saldo_reservado` y `clientes.saldo_actual` se actualizan
con read-modify-write en ~57 sitios de 12 archivos:

```ts
const cb = await repo.findOne({ where: { id } });   // lee saldo = 100
cb.saldo = Number(cb.saldo) + monto;                // calcula en memoria
await repo.save(cb);                                // UPDATE ... SET saldo = 150
```

En Postgres (Don Franco, modo server con varias PC) dos transacciones que leen el mismo saldo antes
de que la otra haga commit se pisan: se pierde un movimiento. El saldo deja de coincidir con
`movimientos_bancarios` / `movimientos_cliente`.

## Decisión de diseño: incremento atómico en vez de `FOR UPDATE`

La issue propone `lockSaldo()` con `FOR UPDATE` + orden canónico de locks. Propongo otra vía,
más chica y sin riesgo nuevo de deadlock:

**`UPDATE tabla SET col = ROUND(col + $delta, 2) WHERE id = $id RETURNING col`**

- Es atómico en ambos motores: Postgres re-evalúa `col` con la versión commiteada al tomar el lock de
  fila del UPDATE (READ COMMITTED), así que dos deltas concurrentes se suman los dos.
- El lock de fila se toma **en el mismo momento que hoy** (el `save()` ya hace UPDATE sobre esa fila y
  lo mantiene hasta el commit). No se adelanta ningún lock → el riesgo de deadlock queda **igual que
  hoy**, no mayor. Con `FOR UPDATE` al leer se alargarían las ventanas de lock y haría falta el orden
  canónico en ~57 sitios.
- No hay ningún control de «saldo insuficiente» basado en la lectura previa (verificado con grep): todos
  los sitios son deltas ciegos, así que no se pierde ninguna validación.
- Sin migración.

### Helper nuevo: `electron/utils/saldo-atomico.utils.ts`

```ts
export async function ajustarSaldoCuentaBancaria(manager, cuentaId, delta): Promise<number>
export async function ajustarSaldoReservadoCuentaBancaria(manager, cuentaId, delta, { minCero }): Promise<number>
export async function ajustarSaldoCliente(manager, clienteId, delta): Promise<number>
```

- Driver-aware: Postgres `$1` + `RETURNING`; SQLite `?` + `RETURNING` (SQLite ≥ 3.35, el de
  better-sqlite3/sqlite3 de la app lo soporta; si no, fallback `UPDATE` + `SELECT` en la misma conexión,
  que en SQLite es atómico porque hay un solo escritor).
- `ROUND(..., 2)` replica los `toFixed(2)` / `round2` actuales (las columnas son decimal(14|18,2)).
- `saldoReservado` con `minCero` replica los `Math.max(0, …)` actuales (`GREATEST(0, …)` / `MAX(0, …)`).
- Lanza si la fila no existe (0 filas afectadas) — hoy esos sitios ya lanzan o no llegan ahí.
- Delta 0 o no finito → no hace UPDATE y devuelve el saldo leído (no cambia el comportamiento).

### Cómo se aplica en cada sitio (cambio mecánico)

```ts
cb.saldo = await ajustarSaldoCuentaBancaria(manager, cb.id, monto);   // antes: Number(cb.saldo) + monto
await manager.save(CuentaBancaria, cb);                               // se deja: guarda el valor fresco
```

Se usa **el mismo `manager`** del sitio (queryRunner.manager si está en transacción, dataSource.manager si
no). Se mantiene el `save()` porque varios sitios cambian otras columnas del mismo objeto; como `cb.saldo`
ya tiene el valor recién devuelto por el UPDATE y la fila está lockeada por nuestra transacción, el `save`
reescribe el mismo valor (TypeORM solo manda las columnas cambiadas). Fuera de transacción hay una ventana
mínima entre el UPDATE atómico y el save; para cerrarla, en los sitios **sin** transacción se quita
`saldo` del save (se guarda con `update()` de las otras columnas o se elimina el save si solo cambiaba
el saldo).

### Sitios que NO son deltas (se tratan aparte)

- `cuentas-por-cobrar.handler.ts` ~823 `recalcular-saldo-cliente`: fija el saldo desde los movimientos
  (herramienta de reparación). Se deja como SET absoluto, pero dentro de transacción con `FOR UPDATE` de la
  fila del cliente (join-free) para no pisar un delta concurrente.
- `cuentas-por-pagar.handler.ts` ~229 (`esPrestamoFuncionario ? +monto : −monto`): es un delta con signo,
  se convierte.
- Lecturas para mostrar (`caja-mayor.handler.ts` 2993/3034, `movimientos-cliente`) no cambian.

## Inventario (grep `\.saldo =|saldoReservado =|saldoActual =` en electron/handlers y utils)

| Archivo | Sitios |
|---|---|
| caja-mayor.handler.ts | 15 |
| cuentas-por-cobrar.handler.ts | 11 |
| banking.handler.ts | 10 (incl. 3 saldoReservado) |
| cuentas-por-pagar.handler.ts | 5 |
| liquidacion-sueldo.handler.ts | 4 |
| vales.handler.ts | 3 |
| acreditaciones-pos-reglas, convenios, pago-consolidado | 2 c/u |
| ventas.handler.ts, venta-reversa.utils.ts, liquidacion-final.handler.ts | 1 c/u |

`CajaMayorSaldo` ya tiene lock (PR #185) y queda fuera.

## Tests

1. **Nuevo `test:saldos-atomicos-pg`** (Postgres real, autosaltea sin PG, como `test:locks-pg`):
   - A: 20 transacciones concurrentes (2 conexiones mínimo, `Promise.all`) con +10 sobre la misma
     cuenta → saldo final = inicial + 200. **Con el patrón viejo (read-modify-write) el mismo test pierde
     updates** — se incluye la variante vieja como control para demostrar que el test discrimina.
   - B: lo mismo para `clientes.saldo_actual` y `saldo_reservado` con `minCero`.
   - C: rollback: un ajuste dentro de una transacción que falla no deja rastro.
   - D: transferencia cruzada A→B y B→A concurrente (patrón de `caja-mayor` transferencias entre
     cuentas) termina sin deadlock-timeout y con saldos correctos (o, si PG detecta deadlock, que sea
     igual que hoy: se documenta).
2. **SQLite**: el mismo helper contra better-sqlite3 en memoria (redondeo, minCero, fila inexistente).
3. `test:all` sin fallas nuevas (línea base 9). Los e2e existentes de banking/caja-mayor/CPC/CPP/vales
   cubren que los saldos finales siguen dando lo mismo.
4. **Prueba real en clon de la copia de Don Franco** (toca cobro: `acreditar-transferencia` se llama
   desde el cobro del PdV, y `ventas.handler` anula ventas a crédito): cobrar una venta con transferencia a
   cuenta bancaria, cobrar una cuota de CPC, un retiro de caja mayor a banco y anular una venta a crédito;
   comparar saldo de la cuenta/cliente contra sus movimientos antes y después.

## Riesgos

- Un sitio que lee `cb.saldo` después y lo usa (p. ej. para devolver `saldoActual`): queda con el valor
  fresco del RETURNING, mejor que hoy.
- Un sitio fuera de transacción que haga `save(cb)` completo tras el ajuste: cubierto por la regla de
  quitar `saldo` de ese save; la auditoría del diff lo revisa sitio por sitio.
- Decimal como string en PG: el helper devuelve `Number(...)`.

## Entrega

Un PR `fix(saldos): ajustes atómicos de saldo en cuentas bancarias y clientes (#190)`. Merge solo con CI
4/4, test:all = línea base, auditoría del diff sin objeciones serias y la prueba real del punto 4.
Sin tocar datos de producción (no se recalculan saldos viejos: eso sería retroactivo).


## Revisión tras la auditoría del plan (A: OBJETADO, B: APROBADO C/OBS) — cambios aplicados

1. **CRÍTICO (A1) — se quita el `save()` posterior.** TypeORM 0.3 relee la fila y reescribe toda columna
   que difiera de la entidad cargada antes: pisaba la *otra* columna de saldo (`saldo` ↔ `saldo_reservado`)
   ajustada por otra PC. Se eliminaron los 55 `save()` que seguían a un ajuste (ninguno cambiaba otras
   columnas: verificado línea por línea por el script de conversión, que solo borra el save inmediato del
   mismo objeto). El test F incluye el CONTROL que demuestra el pisado con save y la versión sin save.
2. **Guardia estática (B)**: el test G falla si vuelve a aparecer un `.saldo =` / `.saldoReservado =` /
   `.saldoActual =` calculado en memoria en `electron/`.
3. **Helper vs. plan (A8/B)**: delta 0 sí hace UPDATE (inofensivo: el save de antes también lockeaba la
   fila); delta no finito **lanza** (antes guardaba NaN). SQLite es `sqlite3` 5.1.6 (3.44.2), no
   better-sqlite3; usa UPDATE + SELECT porque el query runner manda los UPDATE por `run()`.
4. **Límite de crédito (A3/B)**: `cobrar-venta-credito` valida contra el saldo leído; es un aviso
   confirmable, queda como limitación conocida. El ajuste usa el delta `montoTotal`.
5. **Fuera de este PR → issue de seguimiento** (los dos auditores coinciden en dividir):
   - `update-cuenta-bancaria`: el diálogo manda siempre el `saldo` que leyó al abrirse y el handler lo
     aplica (pisa movimientos entrados mientras estaba abierto). El campo es editable a propósito, así que
     cambiarlo es una decisión de producto (¿se sigue editando el saldo a mano o va por ajuste?).
   - `personas.handler` editar/desactivar cliente: save del cliente entero (ventana de ms).
   - `acreditar-transferencia-bancaria` sin transacción (saldo y movimiento no atómicos entre sí). Con
     este PR el saldo ya no pierde updates; falta envolver con el movimiento.
   - `recalcular-saldo-cliente`: lock del cliente ANTES de sumar movimientos, con rama SQLite.
6. **Deadlocks (test E)**: transferencias cruzadas A→B / B→A simultáneas pueden abortar una por deadlock,
   **igual que hoy** (el save lockeaba en el mismo punto). Se conserva la plata (la abortada se revierte).
