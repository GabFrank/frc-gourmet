# Pitfalls — TypeORM, Electron, Angular

Bugs sutiles ya encontrados en este proyecto. Evitar repetir.

## electron-updater 6.x: `verifyUpdateCodeSignature` es FUNCION, no boolean

Para builds unsigned (sin SignPath/CSC) hay que desactivar la verificación de firma del instalador descargado, sino `electron-updater` lo rechaza con *"publisher names do not match"* (especialmente si `package.json:nsis.publisherName` está seteado).

**❌ NO funciona** en electron-updater 6.x (la propiedad cambió de tipo; asignarle `false` queda ignorado y se mantiene la función default que invoca PowerShell `Get-AuthenticodeSignature`, choca con ExecutionPolicy):
```typescript
autoUpdater.verifyUpdateCodeSignature = false;
```

**✅ Sí funciona** — asignar una función que retorna `null` (= "verificación OK"):
```typescript
autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);
```

Source: `node_modules/electron-updater/out/NsisUpdater.js:19` documenta la firma `(publisherNames: string[], path: string) => Promise<string | null>`.

**Historial doloroso**: v1.1.1 → v1.1.2 → v1.2.0 → v1.3.0 — el fix se "aplicó" 3 veces sin tomar efecto antes de descubrir que la propiedad era función. v1.3.0 fue la primera versión que se auto-actualizó sin intervención manual (validado end-to-end con v1.4.0).

## Bundle Electron: drivers nativos NO van a `optionalDependencies`

El workflow `release.yml` corre `npm ci --legacy-peer-deps --omit=optional --no-audit --no-fund` para evitar compilar `canvas` (transitivo de `pdfjs-dist`, requiere headers nativos de Cairo que no hay en runners). Pero `--omit=optional` omite **todas** las optional, incluidas las propias del `package.json`.

**Síntoma del bug histórico (v1.1.0):** `pg` estaba en `optionalDependencies` → al instalar el `.exe` empaquetado en un PC con Postgres y configurar la conexión, la app tiraba **"postgres package has not been found"**. La función SI funcionaba en `npm start` (dev), porque ahí los optional sí se instalan. Solo se reveló en el primer deploy real a un cliente.

**Regla:** todo paquete runtime que la app pueda llegar a usar va a `dependencies`, NO a `optionalDependencies`. `@types/*` van a `devDependencies` (no se bundlean). Las únicas optional aceptables son las que de verdad son opcionales para el funcionamiento (raras en este proyecto).

**Validación:** después de empaquetar el `.exe`, revisar que el módulo esté presente en el bundle:
```bash
# Linux/macOS — extraer asar y buscar el módulo
npx asar list release/win-unpacked/resources/app.asar | grep "node_modules/pg/"
```

Fix histórico: PR #24 movió `pg` a `dependencies`, salió en v1.1.1.

## TypeORM: usar `null` explícito para nulear columnas

Asignar `undefined` a un campo nullable **NO** genera `UPDATE`:

```typescript
// ❌ NO funciona
vale.liquidacionId = undefined;
cuota.fechaPago = undefined;
await repo.save(vale);  // TypeORM ignora estos campos

// ✅ Funciona
(vale as any).liquidacionId = null;
(cuota as any).fechaPago = null;
await repo.save(vale);
```

El cast `as any` es necesario porque las entities tipan los campos como `Type | undefined` (con `?`). TypeScript se quejaría de `null`.

**Bug original**: en `anular-liquidacion-sueldo`, los vales quedaban en estado DESCONTADO sin liquidación asociada porque el `liquidacionId = undefined` no se nuleaba en BD. (`feedback_typeorm_null_undefined`)

## TypeORM: `@Column()` sin `type` sobre un tipo unión rompe Postgres

Corolario del pitfall anterior. Si para poder nulear una columna se tipa el campo como unión, hay que declarar el `type` de la columna a mano:

```typescript
// ❌ Arranca bien en SQLite y explota en Postgres
@Column({ nullable: true })
escenaPreferida?: string | null;

// ✅
@Column({ type: 'varchar', nullable: true })
escenaPreferida?: string | null;
```

Sin `type`, TypeORM infiere la columna del metadata de decoradores de TypeScript, y de una **unión** ese metadata emite `Object`. Postgres lo rechaza al **validar las entidades**, antes de correr una sola migración:

```
DataTypeNotSupportedError: Data type "Object" in
"BloqueProgramacion.escenaPreferida" is not supported by "postgres"
```

**Por qué es traicionero:** SQLite lo tolera, así que la app dev, `npm run build`, `npm run check` y los tests e2e sobre SQLite pasan todos. El único que lo ve es el job de CI **"Migration run (Postgres baseline + incrementales)"** — y falla al conectar, no en la migración, así que el mensaje no apunta a la columna nueva de forma obvia.

Los campos que ya usaban `| null` (`maxPorArtista?: number | null`, `factorDuracion?: number | null`) no fallaban porque siempre declararon `type: 'int'` / `type: 'float'`.

**Bug original**: PR #234 (música, clasificación semántica). Tres revisores y toda la batería local en SQLite lo dejaron pasar; lo atajó el CI.

## TypeORM: leftJoin a tabla sin relación @ManyToOne

Si una entidad tiene **columna plana** (`compraId: int`) pero no `@ManyToOne compra`, no se puede hacer `leftJoinAndSelect('cpp.compra', ...)`. Hay que joinear con la tabla raw:

```typescript
qb.leftJoin('compras', 'compra', 'compra.id = cpp.compra_id')
  .addSelect('compra.numero_nota', 'compraNumeroNota')   // snake_case en raw select
  .addSelect('compra.fecha_compra', 'compraFechaCompra');
```

**Aplicado en:** `cuentas-por-pagar.handler` para enriquecer CPP con datos de la compra origen.

## Migraciones: columna NOT NULL nueva con datos legacy

> **Importante:** el proyecto usa `synchronize: false` — NO hay auto-DDL. Toda columna nueva se agrega vía **migración** (driver-aware), no por TypeORM. Las migraciones corren al arranque.

Al agregar una columna NOT NULL a una tabla con filas existentes, el `ALTER TABLE ADD COLUMN` falla si no hay valor para las filas viejas. Soluciones (en la migración y/o el `@Column`):

1. **Default value**: `@Column({ type: 'decimal', default: 0 })` + `ADD COLUMN ... DEFAULT 0` — rellena las filas existentes.
2. **Nullable**: `@Column({ type: 'int', nullable: true })` — permite NULL en datos legacy.
3. **Backfill en la migración**: `ADD COLUMN nullable` → `UPDATE` para poblar → (opcional) `SET NOT NULL` en una migración posterior.

**Aplicado en compras** (refactor 2026-05-04): `costoUnitarioPresentacion` y `cantidad` necesitaron `default: 0`. FK `producto` en CompraDetalle y ProveedorProducto fueron relajadas a nullable.

## SQLite: índices únicos con NULL

`@Index([col1, col2], { unique: true })` no funciona como esperás si una de las columnas es nullable. SQLite trata cada NULL como distinto, así que múltiples filas con `NULL` no fallan la unicidad.

**Aplicado en ProveedorProducto**: se removió el `@Index unique` y la unicidad se valida en el handler (`upsertProveedorProducto`).

## Fechas: `new Date('YYYY-MM-DD')` en zona local UTC-3

```typescript
new Date('2026-05-04')  // → 2026-05-03 21:00 en zona Asunción (UTC-3)
```

`new Date(string)` interpreta `'YYYY-MM-DD'` como UTC midnight. En Asunción, eso cae el día anterior. Cuando TypeORM guarda en columna `date` (sin hora), queda corrida un día.

**Solución**: helper `parseLocalDate`:
```typescript
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);  // Constructor con números → zona local
}
```

**Aplicado en compras**. Pendiente sweep en otros handlers (`gastos`, `retiros-caja`, `caja-mayor`, `entradas-varias`, `cheques`, `cuentas-por-pagar`, `vacaciones`, `feriados`, `asistencias`, etc.). (`project_todo_fechas_local_timezone`)

Las columnas `datetime` no tienen el problema (guardan timestamp completo).

## TypeORM `find` con relations no carga columnas raw

Al usar `repo.find({ relations: ['proveedor'] })`, los campos `proveedor_id` (FK) no aparecen en el JSON. El proveedor está como objeto anidado.

Si necesitás ambos (rara vez), usá QueryBuilder con `select` explícito.

## Errores IPC: prefix de Electron

Cuando un handler `throw new Error('Cuota ya pagada')`, el renderer recibe:
```
Error: Error invoking remote method 'pagar-cuota': Error: Cuota ya pagada
```

Para mostrar mensaje limpio en snackbar:
```typescript
const extraerMensajeError = (e: any): string => {
  const raw = e?.message || String(e);
  const m = raw.match(/Error invoking remote method '[^']+': Error: (.*)/);
  return m ? m[1] : raw;
};
```

## Inconsistencia de error handling en handlers

Dos patrones coexisten:

```typescript
// Patrón A: throw → renderer recibe Promise rejection
ipcMain.handle('foo', async (_e, id) => {
  try {
    return await repo.findOne({ where: { id } });
  } catch (error) {
    console.error('Error foo:', error);
    throw error;
  }
});

// Patrón B: return objeto con success
ipcMain.handle('bar', async (_e, data) => {
  try {
    const saved = await repo.save(data);
    return { success: true, entity: saved };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
```

**Antes de cambiar un handler, chequear cómo lo consume el renderer.** Mezclarlos rompe.

## CajaMayorMovimiento.compraId sin FK constraint

`CajaMayorMovimiento.compraId` (y otros como `valeId`, `liquidacionSueldoId`, `cuentaPorPagarCuotaId`) son **columnas planas `int`** sin `@ManyToOne` ni FK constraint. Razones:
1. Permitir `null` cuando no aplica.
2. Evitar problemas de orden de creación en transacciones.
3. Permitir cargar vinculación lazy.

**Implicación**: si se borra la compra/vale/etc., el movimiento queda con id huérfano. La validación de "no anular si tiene FK" depende del handler chequear estos campos manualmente.

## ngModel dentro de [formGroup] = NG01350

Mezclar `[(ngModel)]` con `[formGroup]` rompe Angular con error `NG01350`. Migrar a Reactive Forms (`FormControl`, `FormArray`).

Patrón para tablas editables (mat-table + filas como FormGroup):
```typescript
// Component
itemsForm = this.fb.array([]);

addItem() {
  this.itemsForm.push(this.fb.group({
    cantidad: [1, [Validators.required, Validators.min(0.001)]],
    costoUnitario: [0, [Validators.required, Validators.min(0)]],
  }));
}
```

```html
<table mat-table [dataSource]="itemsForm.controls">
  <ng-container matColumnDef="cantidad">
    <th>Cantidad</th>
    <td *matCellDef="let it" [formGroup]="it">
      <input matInput formControlName="cantidad" type="number">
    </td>
  </ng-container>
</table>
```

Usar `form.disable()`/`group.disable()` en lugar de `[disabled]` en cada input para evitar warnings de Angular.

(`project_todo_ngmodel_to_reactive`)

## Image src con app:// y Angular sanitization

Si Angular sanitiza una URL `app://producto-images/foo.png`, podría quedar `unsafe:app://...`. Solución:

```typescript
constructor(private sanitizer: DomSanitizer) {}

safeUrl(url: string): SafeUrl {
  return this.sanitizer.bypassSecurityTrustUrl(url);
}
```

```html
<img [src]="safeUrl(producto.imageUrl)">
```

Si `app://` ya está registrado en allow-list de Angular (puede estar implícito), no necesita sanitize. Probar antes de añadir.

## Custom currency mask: PYG sin decimales

Cuando user ingresa `123456` en `ngx-currency` con `precision: 0` y `thousands: '.'`, se muestra `123.456` y se guarda como `123456`. Cuidado con conversiones que asuman 2 decimales.

```typescript
// Cuenta esto en código que mezcla monedas:
const monto = moneda.decimales === 0
  ? Math.round(valor)
  : parseFloat(valor.toFixed(moneda.decimales));
```

## Concurrencia: dos cajeros confirman mismo vale

`Vale.estado=SOLICITADO → CONFIRMADO` con check + transacción atómica:

```typescript
const vale = await qr.manager.findOne(Vale, { where: { id, estado: 'SOLICITADO' } });
if (!vale) throw new Error('Vale ya confirmado o no existe');
// ... resto en transacción
```

Si dos handlers corren en paralelo, el segundo `findOne` falla por estado != SOLICITADO. Pero si ambos llegan al mismo tiempo, ambos pueden confirmar. La unicidad real está en el `UPDATE ... WHERE estado = 'SOLICITADO'` que TypeORM no genera automáticamente.

**Mitigación actual**: las operaciones críticas usan transacciones, pero no hay locking optimista. En entornos de un solo operador (caso típico de FRC Gourmet) no es problema.

## Eager: true causa cargas costosas

`RecetaPresentacion → Receta` tiene `eager: true, cascade: true`. Cargar 100 RecetaPresentacion → 100 queries adicionales para Receta. En productos con muchas variaciones, esto suma.

Si performance es problema, considerar cambiar a lazy + carga explícita con `relations: ['receta']` solo cuando se necesita.

## Reset de PdvConfig

`PdvConfig` debería ser un único registro (singleton). Pero `getPdvConfig` retorna **array con 1 elemento** (legacy). El handler garantiza que sólo haya 1 fila.

Si por accidente hay dos: `DELETE FROM pdv_config WHERE id != (SELECT MIN(id) FROM pdv_config)`.

## Migración 1-vez en startup

```typescript
dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`)
  .catch((e: any) => console.warn('Migration vendedor_id:', e.message));
```

Corre en cada arranque (en el `then` de `DataSource.initialize`). Es idempotente (la próxima vez el WHERE está vacío). Patrón aceptable para data fixes simples; para cambios de esquema, usar una migración formal.

## Los `.js` compilados le ganan a los `.ts` en los tests ts-node

Los scripts `npm run test:*` corren con ts-node e importan los handlers por ruta
sin extensión (`require('../electron/handlers/ventas.handler')`). Node resuelve
`.js` **antes** que `.ts`, y `electron/**/*.js` está gitignorado pero **existe en
tu working copy** apenas corriste `npm start`, `npm run build`, `npm run check` o
el hook de pre-commit (todos ejecutan `tsc -p tsconfig.electron.json`, que emite).

Resultado: editás un handler, corrés su test y estás ejecutando **la versión
compilada vieja** — el test pasa (o falla) por motivos que no tienen nada que ver
con tu cambio. Pasó el 2026-08-17: un test nuevo "fallaba" contra el bug que
acababa de arreglarse, porque corría el `.js` de otra rama.

**No es sólo `electron/`.** Pasó otra vez el 2026-08-19 con un util nuevo en
`src/app/shared/utils/`: el hook de pre-commit emite el `.js` al lado de cada
`.ts` que toca, así que el test corría **la versión del último commit** en vez
de la del working tree. El síntoma es traicionero: el test pasa en verde con el
bug adentro, porque valida código viejo que todavía no tenía el bug (o al revés,
falla contra un fix que ya aplicaste). Un `.js` fechado más tarde que su `.ts`
es la pista.

**Regla:** agregá **`--prefer-ts-exts`** al script del test. Le dice a ts-node
que resuelva `.ts` antes que `.js` y el problema desaparece de raíz, sin
depender de acordarse de recompilar:

```json
"test:mi-cosa": "ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/test-mi-cosa.ts"
```

Los scripts viejos todavía no lo tienen. Si uno se comporta raro, esto primero.
Alternativa manual: correr `npm run electron:serve-tsc` antes del test (sólo
sirve para `electron/`), o borrar el `.js` que tapa. En CI no aplica (clona
limpio, no hay `.js`) — pero eso significa que **CI y local pueden diferir**:
si un test se comporta distinto en los dos, sospechá de esto primero.

Corolario: los `test:*` que corren ts-node **sin** `--transpile-only` (hoy sólo
`test:pedidos-online`) type-chequean los `.ts` en local sólo cuando no hay `.js`
que los tape.

## TypeORM cascade en BaseModel.createdBy/updatedBy

`createdBy: Usuario` con `@ManyToOne('Usuario', { nullable: true })`. Si se borra el usuario, las FKs **no se nulean automáticamente**. Si bien las entidades quedan con `created_by_id` apuntando a un usuario inexistente, las queries con `relations: ['createdBy']` pueden fallar o devolver `null`.

Solución actual: usuarios no se borran, se hacen `activo = false`. Soft delete preserva integridad referencial.


## `date +%s%3N` no funciona en macOS (timestamp de migraciones)

La convención dice que el prefijo de una migración es epoch en milisegundos reales.
`date +%s%3N` es sintaxis **GNU**: en macOS, BSD `date` no conoce `%3N` y devuelve
la `N` literal pegada al final —

```
$ date +%s%3N
17871698783N          # <- la N es parte de la salida
```

…lo que produce un archivo `17871698783N-Migracion.ts` y una clase
`Migracion17871698783N`, que ni siquiera es un identificador coherente.

En macOS:

```bash
python3 -c "import time;print(int(time.time()*1000))"
```

## `ADD COLUMN ... IF NOT EXISTS` es inválido en SQLite

`CREATE TABLE IF NOT EXISTS` funciona en los dos motores. `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` **no**: SQLite lo rechaza. El patrón del repo es consultar el
esquema antes:

```ts
const tabla = await queryRunner.getTable('cajas_mayor_movimientos');
if (tabla && !tabla.columns.find((c) => c.name === 'pago_consolidado_id')) {
  await queryRunner.query(`ALTER TABLE "cajas_mayor_movimientos" ADD COLUMN "pago_consolidado_id" integer NULL`);
}
```

## Entidades sin columna `activo`

`BaseModel` **no** trae `activo`: cada entidad la agrega si la necesita. `Gasto` y
`Vale`, por ejemplo, **no la tienen** — filtrar por `g.activo = true` revienta con
`no such column`. Su ciclo de vida se expresa en `estado`, no en un booleano.


## `matStepperNext` / `matStepperPrevious` sólo funcionan DENTRO del `<mat-stepper>`

Un footer fijo fuera del stepper (patrón común para que los botones no scrolleen
con el contenido) **no puede** usar esas directivas: inyectan el `CdkStepper` de
un ancestro, no lo encuentran, y los botones **no llegan a crearse** — sin error
visible en consola, simplemente no están en el DOM.

Fuera del stepper hay que navegar a mano:

```ts
@ViewChild('stepper') stepper?: MatStepper;
paso = 0;                                  // la vista lee esto, no stepper.selectedIndex
siguientePaso() { this.stepper?.next(); this.paso = this.stepper!.selectedIndex; }
```

Y en el template, `(selectionChange)="onPasoChange($event.selectedIndex)"` sobre
el `<mat-stepper>` para no perder el sincronismo si el usuario navega por los
encabezados.

> Relacionado: una variable de template (`#stepper`) declarada **dentro** de un
> `*ngIf` no es visible fuera de esa vista embebida. Si además existe una
> propiedad del componente con el mismo nombre, la vista resuelve a la propiedad
> y el bug queda camuflado.
