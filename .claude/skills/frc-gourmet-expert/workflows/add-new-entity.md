# Workflow: agregar una nueva entidad de punta a punta

Patrón estándar para crear entidad + CRUD + UI completos. Adaptado de `.cursor/rules/create-new-entities.mdc`.

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

entities: [
  // existentes
  MiEntidad,  // ← AGREGAR
],
```

**Sin esto**, `synchronize: true` no la conoce y la tabla nunca se crea. La app arrancará pero el handler fallará al hacer `dataSource.getRepository(MiEntidad)`.

## 3. Handler IPC

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

## 4. Registrar handler en main.ts

```typescript
// main.ts (en initializeDatabase().then())
import { registerMiDominioHandlers } from './electron/handlers/mi-dominio.handler';

registerMiDominioHandlers(dataSource, getCurrentUser);
```

## 5. Preload

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

## 6. RepositoryService

`src/app/database/repository.service.ts`. Agregar:

(a) Firmas a la interface `ElectronAPI` al inicio:
```typescript
interface ElectronAPI {
  // ...
  getMiEntidades: () => Promise<MiEntidad[]>;
  getMiEntidad: (id: number) => Promise<MiEntidad>;
  createMiEntidad: (data: any) => Promise<MiEntidad>;
  updateMiEntidad: (id: number, data: any) => Promise<any>;
  deleteMiEntidad: (id: number) => Promise<any>;
  getMiEntidadesPaginated: (page: number, pageSize: number, filters?: any) => Promise<{items: MiEntidad[], total: number}>;
}
```

(b) Métodos públicos:
```typescript
import { MiEntidad } from './entities/<dominio>/mi-entidad.entity';

// Dentro de RepositoryService
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

## 7. Componentes Angular

Convención de naming:
- `src/app/pages/<dominio>/list-mi-entidades/list-mi-entidades.component.{ts,html,scss}`
- `src/app/pages/<dominio>/create-edit-mi-entidad/create-edit-mi-entidad.component.{ts,html,scss}`

**Standalone por default**. Importar Material modules necesarios y `ConfirmationDialogComponent`. Usar Reactive Forms (no `ngModel` dentro de `formGroup`). Patrón full-height para listas con scroll local. Acciones en `mat-menu`.

## 8. Tab opener en AppComponent

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
<a mat-list-item (click)="openMiEntidadesTab()">
  <mat-icon matListItemIcon>category</mat-icon>
  <span matListItemTitle *ngIf="isMenuExpanded">Mis Entidades</span>
</a>
```

## 9. Reiniciar la app

Cambios en `electron/handlers/`, `preload.ts`, `main.ts`, nueva entidad o `database.config.ts` requieren **reinicio completo de la app** (el usuario lo hace manualmente; ver [conventions/coding-rules.md](../conventions/coding-rules.md)).

## 10. Verificar

1. `npm run build` para chequear que TypeScript compila.
2. Reiniciar la app. Buscar en consola: `Database connection initialized`.
3. Abrir el tab nuevo desde el sidenav.
4. Crear un registro. Verificar en BD: `sqlite3 ~/Library/Application\ Support/frc-gourmet/frc-gourmet.db "SELECT * FROM nombre_tabla;"`.
5. Editar y eliminar.

## Checklist resumen

- [ ] Entity creada con `BaseModel`, decoradores, relaciones
- [ ] Registrada en `database.config.ts`
- [ ] Handler con CRUD + paginated, UPPERCASE, `setEntityUserTracking`
- [ ] Handler registrado en `main.ts`
- [ ] Preload expone métodos en `window.api`
- [ ] RepositoryService tiene métodos Observable
- [ ] Componente list y create-edit standalone
- [ ] Tab opener en AppComponent
- [ ] Pruebas manuales pasaron
- [ ] Avisar al usuario para reiniciar
