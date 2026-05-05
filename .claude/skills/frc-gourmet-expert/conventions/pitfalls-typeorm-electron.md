# Pitfalls — TypeORM, Electron, Angular

Bugs sutiles ya encontrados en este proyecto. Evitar repetir.

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

## TypeORM: leftJoin a tabla sin relación @ManyToOne

Si una entidad tiene **columna plana** (`compraId: int`) pero no `@ManyToOne compra`, no se puede hacer `leftJoinAndSelect('cpp.compra', ...)`. Hay que joinear con la tabla raw:

```typescript
qb.leftJoin('compras', 'compra', 'compra.id = cpp.compra_id')
  .addSelect('compra.numero_nota', 'compraNumeroNota')   // snake_case en raw select
  .addSelect('compra.fecha_compra', 'compraFechaCompra');
```

**Aplicado en:** `cuentas-por-pagar.handler` para enriquecer CPP con datos de la compra origen.

## SQLite: `synchronize: true` con `NOT NULL` y datos legacy

Al agregar columna NEW NOT NULL a una tabla con datos existentes, TypeORM falla con `NOT NULL constraint failed`. Soluciones:

1. **Default value**: `@Column({ type: 'decimal', default: 0 })` — TypeORM rellena 0 en filas existentes.
2. **Nullable**: `@Column({ type: 'int', nullable: true })` — permite NULL en datos legacy.
3. **Backfill manual**: query SQL `UPDATE` antes de aplicar `synchronize` (no escalable, sólo para una sola vez).

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

Esta corre en cada arranque. Es idempotente (la próxima vez el WHERE está vacío). Patrón aceptable para data fixes simples cuando no querés hacer una migración formal.

## TypeORM cascade en BaseModel.createdBy/updatedBy

`createdBy: Usuario` con `@ManyToOne('Usuario', { nullable: true })`. Si se borra el usuario, las FKs **no se nulean automáticamente**. Si bien las entidades quedan con `created_by_id` apuntando a un usuario inexistente, las queries con `relations: ['createdBy']` pueden fallar o devolver `null`.

Solución actual: usuarios no se borran, se hacen `activo = false`. Soft delete preserva integridad referencial.
