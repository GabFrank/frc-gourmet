# Workflow: agregar una nueva entidad de punta a punta

Patrón estándar para crear entidad + CRUD + UI completos.

> ⚠️ **`synchronize: false`** — la app NO auto-crea tablas. Toda entidad nueva (o cambio de columna) **exige una migración**. Sin migración la tabla/columna no existe en runtime y el handler falla al hacer `dataSource.getRepository(...)`. El paso 3 (migración) es obligatorio, no opcional.

Pasos:
1. Entity en `src/app/database/entities/<dominio>/`.
2. Registrarla en `getEntitiesList()` de `database.config.ts`.
3. **Crear migración** driver-aware y registrarla en `getMigrations()` de `database.config.ts`.
4. Handler IPC + registrarlo en `main.ts`.
5. Exponer en `preload.ts` (`window.api`).
6. Métodos en `RepositoryService` (abstract + impl IPC/HTTP — ver paso 6).
7. Componentes Angular standalone (`list-*`, `create-edit-*`).
8. Tab opener en `app.component.ts` + item de menú con `*appHasPermission`.

## 1. Entity (TypeORM)

**Archivo**: `src/app/database/entities/<dominio>/<nombre>.entity.ts`

```typescript
import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { OtraEntidad } from '../<otro-dominio>/otra-entidad.entity';

/**
 * Entity representing a [descripción]
 */
@Entity('nombre_tabla')   // snake_case
export class MiEntidad extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @ManyToOne('OtraEntidad', { nullable: false })
  @JoinColumn({ name: 'otra_entidad_id' })
  otraEntidad!: OtraEntidad;
}
```

## 2. Registrar en database.config.ts

```typescript
// src/app/database/database.config.ts
import { MiEntidad } from './entities/<dominio>/mi-entidad.entity';

// ...

function getEntitiesList(): any[] {
  return [
    // existentes
    MiEntidad,  // ← AGREGAR
  ];
}
```

**Sin esto**, TypeORM no conoce la entidad: el `DataSource` falla al validar metadata o el handler falla al hacer `dataSource.getRepository(MiEntidad)`. Registrar la entidad **no** crea la tabla (ver paso 3) — `synchronize` está en `false`.

## 3. Crear la migración (OBLIGATORIO)

`synchronize: false` → la tabla no se crea sola. Hay que generar/escribir una migración y registrarla.

### Generar desde el diff de entities

```bash
# El nombre se prefija con el timestamp epoch-ms automáticamente
npm run migration:generate -- src/app/database/migrations/AddMiEntidad
```

Esto compara las entities contra el `DataSource` de CLI (`src/app/database/datasource.ts`, SQLite por default) y emite el SQL del diff. Para regenerar la baseline Postgres se usan variables de entorno (no hay script `:postgres`):

```bash
FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_gourmet_baseline_pg \
  npm run migration:generate -- src/app/database/migrations/MiCambioPostgres
```

En la práctica, para una entidad nueva conviene escribir **una sola migración driver-aware** a mano (un archivo) que cree la tabla en ambos drivers.

### Reglas de la migración

- **Nombre del archivo:** `<epoch-millis>-<Descripcion>.ts`, clase `Descripcion<epoch-millis>` (ej. `1782606189440-AddMiEntidad.ts` → `class AddMiEntidad1782606189440`).
- **Timestamp = epoch-ms real.** Obtenelo con `date +%s%3N` (o dejá que `migration:generate` lo asigne). **NUNCA un número redondeado** a mano (ej. `1780500000000`): los redondeados colisionan entre ramas no mergeadas. ⚠️ Las migraciones viejas del repo usan números redondeados — **no las imites**.
- **Driver-aware:** ramificar por `queryRunner.connection.options.type === 'postgres'` cuando el SQL difiera entre SQLite y Postgres.
- **Aditiva:** sin `DROP`/`RENAME` sin estrategia de 2 versiones. Preferir `IF NOT EXISTS`.
- Editar SOLO el `.ts` (el `.js` se genera). Nunca modificar una migración ya mergeada — agregar una nueva.

Guía completa: `docs/MIGRATIONS.md`.

### Registrar la migración

En `database.config.ts`, dentro de `getMigrations(driverType)`, importar la clase y agregarla **al final** del array de incrementales (después de la baseline):

```typescript
import { AddMiEntidad1782606189440 } from './migrations/1782606189440-AddMiEntidad';

function getMigrations(driverType: 'sqlite' | 'postgres'): Function[] {
  const baseline = driverType === 'postgres' ? BaselinePostgres... : Baseline...;
  return [
    baseline,
    // ... incrementales existentes
    AddMiEntidad1782606189440,  // ← AGREGAR al final
  ];
}
```

`DatabaseService` corre `runMigrations` (con backup previo) en cada arranque. La tabla se crea ahí.

## 4. Handler IPC

**Archivo**: si existe handler del dominio, agregar dentro. Si no, crear `electron/handlers/<dominio>.handler.ts`.

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource, Not } from 'typeorm';
import { MiEntidad } from '../../src/app/database/entities/<dominio>/mi-entidad.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

export function registerMiDominioHandlers(
  dataSource: DataSource,
  getCurrentUser?: () => Usuario | null,
) {
  // GET ALL
  ipcMain.handle('get-mi-entidades', async () => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      return await repo.find({
        where: { activo: true },
        relations: ['otraEntidad'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error get-mi-entidades:', error);
      throw error;
    }
  });

  // GET ONE
  ipcMain.handle('get-mi-entidad', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      return await repo.findOne({ where: { id }, relations: ['otraEntidad'] });
    } catch (error) {
      console.error('Error get-mi-entidad:', error);
      throw error;
    }
  });

  // CREATE
  ipcMain.handle('create-mi-entidad', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      const otraRepo = dataSource.getRepository(OtraEntidad);

      const otra = await otraRepo.findOneBy({ id: data.otraEntidadId });
      if (!otra) return { success: false, message: 'Entidad relacionada no encontrada' };

      const entity = repo.create({
        nombre: (data.nombre || '').toString().toUpperCase(),  // ← UPPERCASE
        descripcion: data.descripcion,
        activo: data.activo !== undefined ? data.activo : true,
        otraEntidad: otra,
      });

      const userId = getCurrentUser?.()?.id;
      await setEntityUserTracking(dataSource, entity, userId, false);

      const saved = await repo.save(entity);
      return await repo.findOne({ where: { id: saved.id }, relations: ['otraEntidad'] });
    } catch (error) {
      console.error('Error create-mi-entidad:', error);
      throw error;
    }
  });

  // UPDATE
  ipcMain.handle('update-mi-entidad', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      const entity = await repo.findOne({ where: { id }, relations: ['otraEntidad'] });
      if (!entity) return { success: false, message: 'No encontrada' };

      if (data.nombre !== undefined) entity.nombre = data.nombre.toString().toUpperCase();
      if (data.descripcion !== undefined) entity.descripcion = data.descripcion;
      if (data.activo !== undefined) entity.activo = data.activo;

      if (data.otraEntidadId !== undefined) {
        const otra = await dataSource.getRepository(OtraEntidad).findOneBy({ id: data.otraEntidadId });
        if (!otra) return { success: false, message: 'Relación no encontrada' };
        entity.otraEntidad = otra;
      }

      const userId = getCurrentUser?.()?.id;
      await setEntityUserTracking(dataSource, entity, userId, true);

      return await repo.save(entity);
    } catch (error) {
      console.error('Error update-mi-entidad:', error);
      throw error;
    }
  });

  // DELETE (soft delete por default)
  ipcMain.handle('delete-mi-entidad', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      const result = await repo.update(id, { activo: false });
      return result.affected ? { success: true } : { success: false, message: 'No encontrada' };
    } catch (error) {
      console.error('Error delete-mi-entidad:', error);
      throw error;
    }
  });

  // PAGINATED (opcional pero recomendado)
  ipcMain.handle('get-mi-entidades-paginated', async (_event, page: number, pageSize: number, filters: any = {}) => {
    try {
      const repo = dataSource.getRepository(MiEntidad);
      const qb = repo.createQueryBuilder('e').leftJoinAndSelect('e.otraEntidad', 'otra');

      if (filters.nombre) {
        qb.andWhere('LOWER(e.nombre) LIKE LOWER(:n)', { n: `%${filters.nombre}%` });
      }
      if (filters.activo !== undefined && filters.activo !== '') {
        qb.andWhere('e.activo = :a', { a: filters.activo === 'true' || filters.activo === true });
      }

      const total = await qb.getCount();
      qb.orderBy('e.nombre', 'ASC').skip(page * pageSize).take(pageSize);
      const items = await qb.getMany();

      return { items, total };
    } catch (error) {
      console.error('Error paginated:', error);
      throw error;
    }
  });
}
```

## 5. Registrar handler en main.ts

```typescript
// main.ts (en initializeDatabase().then())
import { registerMiDominioHandlers } from './electron/handlers/mi-dominio.handler';

registerMiDominioHandlers(dataSource, getCurrentUser);
```

## 6. Preload

`preload.ts`. Agregar dentro del objeto `api` que se expone con `contextBridge.exposeInMainWorld('api', api)`:

```typescript
const api = {
  // ... otros métodos

  getMiEntidades: async (): Promise<MiEntidad[]> => {
    return await ipcRenderer.invoke('get-mi-entidades');
  },
  getMiEntidad: async (id: number): Promise<MiEntidad> => {
    return await ipcRenderer.invoke('get-mi-entidad', id);
  },
  createMiEntidad: async (data: any): Promise<{ success: boolean, entity?: MiEntidad, message?: string }> => {
    return await ipcRenderer.invoke('create-mi-entidad', data);
  },
  updateMiEntidad: async (id: number, data: any): Promise<{ success: boolean, entity?: MiEntidad, message?: string }> => {
    return await ipcRenderer.invoke('update-mi-entidad', id, data);
  },
  deleteMiEntidad: async (id: number): Promise<{ success: boolean, message?: string }> => {
    return await ipcRenderer.invoke('delete-mi-entidad', id);
  },
  getMiEntidadesPaginated: async (page: number, pageSize: number, filters?: any): Promise<{ items: MiEntidad[], total: number }> => {
    return await ipcRenderer.invoke('get-mi-entidades-paginated', page, pageSize, filters);
  },
};
```

Si tipás explícitamente `ElectronAPI` en preload (recomendado), agregar también las firmas a esa interfaz.

## 7. RepositoryService (abstract + impl IPC/HTTP)

> ⚠️ **`RepositoryService` ya NO es una clase concreta única.** Tras el refactor cliente/servidor (F1–F5) es una **clase abstracta** que actúa como token DI (`src/app/database/repository.service.ts`), con **dos implementaciones**:
> - `repository-ipc.service.ts` — modo `standalone`/`server`: invoca `window.api.*` (Electron IPC), envuelve en `Observable` con `from()`.
> - `repository-http.service.ts` — modo `client`: hace HTTP contra el server remoto (`/api/...`).
>
> La factory en `app.module.ts` elige la implementación según el modo. **Cada método nuevo debe existir en las tres**: la firma `abstract` en `repository.service.ts` y la implementación concreta en `repository-ipc.service.ts` y `repository-http.service.ts`.

La clase abstracta (`repository.service.ts`) se **autogenera** con `scripts/generate-repository-abstract.py` a partir de la implementación IPC. El flujo práctico:

(a) Implementar los métodos en `repository-ipc.service.ts` (es la fuente de la generación). Dentro de la clase se usa `this.api` (= `window.api`):
```typescript
import { MiEntidad } from './entities/<dominio>/mi-entidad.entity';

getMiEntidades(): Observable<MiEntidad[]> {
  return from(this.api.getMiEntidades());
}
getMiEntidad(id: number): Observable<MiEntidad> {
  return from(this.api.getMiEntidad(id));
}
createMiEntidad(data: Partial<MiEntidad>): Observable<MiEntidad> {
  return from(this.api.createMiEntidad(data));
}
updateMiEntidad(id: number, data: Partial<MiEntidad>): Observable<any> {
  return from(this.api.updateMiEntidad(id, data));
}
deleteMiEntidad(id: number): Observable<any> {
  return from(this.api.deleteMiEntidad(id));
}
getMiEntidadesPaginated(page: number, pageSize: number, filters?: any): Observable<{items: MiEntidad[], total: number}> {
  return from(this.api.getMiEntidadesPaginated(page, pageSize, filters));
}
```
Agregar también las firmas a la interface `ElectronAPI` declarada en `repository-ipc.service.ts`.

(b) Implementar los mismos métodos en `repository-http.service.ts` (versión HTTP para `mode=client`).

(c) Regenerar la clase abstracta:
```bash
python3 scripts/generate-repository-abstract.py
```
Esto reescribe `repository.service.ts` con las firmas `abstract`. Si preferís, podés agregar la firma `abstract` a mano, pero mantené las tres en sync.

Los componentes Angular inyectan `RepositoryService` (el token abstracto) y no saben qué implementación reciben.

## 8. Componentes Angular

Convención de naming:
- `src/app/pages/<dominio>/list-mi-entidades/list-mi-entidades.component.{ts,html,scss}`
- `src/app/pages/<dominio>/create-edit-mi-entidad/create-edit-mi-entidad.component.{ts,html,scss}`

**Standalone por default**. Importar Material modules necesarios y `ConfirmationDialogComponent`. Usar Reactive Forms (no `ngModel` dentro de `formGroup`). Patrón full-height para listas con scroll local. Acciones en `mat-menu`.

## 9. Tab opener en AppComponent

```typescript
// app.component.ts
import { ListMiEntidadesComponent } from './pages/<dominio>/list-mi-entidades/list-mi-entidades.component';

openMiEntidadesTab() {
  this.tabsService.openTab(
    'Mis Entidades',
    ListMiEntidadesComponent,
    { source: 'navigation' },
    'mi-entidades-tab',     // id estable evita duplicados
    true                     // closable
  );
  this.closeMenu();
}
```

```html
<!-- app.component.html, dentro del expansion-panel del dominio -->
<!-- Usar *appHasPermission para gatear la entrada por permiso (directiva del proyecto) -->
<a mat-list-item (click)="openMiEntidadesTab()" *appHasPermission="'MI_ENTIDAD_VER'">
  <mat-icon matListItemIcon>category</mat-icon>
  <span matListItemTitle *ngIf="isMenuExpanded">Mis Entidades</span>
</a>
```

Si la funcionalidad requiere permisos, agregarlos al catálogo `SEED_PERMISOS` en `electron/handlers/permissions.handler.ts` (`{ codigo, descripcion, modulo }`) y chequearlos también en el handler con `ensurePermission`.

## 10. Reiniciar la app

Cambios en `electron/handlers/`, `preload.ts`, `main.ts`, nueva entidad, nueva migración o `database.config.ts` requieren **reinicio completo de la app** (el usuario lo hace manualmente; ver [conventions/coding-rules.md](../conventions/coding-rules.md)). Al reiniciar corre la migración nueva.

## 11. Verificar

1. `npm run build` para chequear que TypeScript compila. (`npm run check` para el AOT de producción antes de pushear.)
2. Reiniciar la app. Buscar en consola que las migraciones corrieron sin error y la conexión se inicializó.
3. Abrir el tab nuevo desde el sidenav.
4. Crear un registro. Verificar en BD que la tabla existe y tiene la fila. Path del `.db` SQLite por OS → [verificacion-bd-sqlite.md](verificacion-bd-sqlite.md). Ej. Linux:
   `sqlite3 ~/.config/frc-gourmet/frc-gourmet.db "SELECT * FROM nombre_tabla;"`
5. Editar y eliminar.

## Checklist resumen

- [ ] Entity creada con `BaseModel`, decoradores, relaciones
- [ ] Registrada en `getEntitiesList()` de `database.config.ts`
- [ ] **Migración** creada (timestamp epoch-ms real, driver-aware) y registrada en `getMigrations()`
- [ ] Handler con CRUD + paginated, UPPERCASE, `setEntityUserTracking`, `ensurePermission` si aplica
- [ ] Handler registrado en `main.ts`
- [ ] Preload expone métodos en `window.api`
- [ ] Métodos en `repository-ipc.service.ts` + `repository-http.service.ts` + firma abstract en `repository.service.ts` (regenerar con el script)
- [ ] Componente list y create-edit standalone
- [ ] Tab opener en AppComponent + item de menú con `*appHasPermission`
- [ ] Permisos seedeados en `permissions.handler.ts` si aplica
- [ ] Pruebas manuales pasaron
- [ ] Avisar al usuario para reiniciar
