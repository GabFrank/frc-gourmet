# Patrón IPC — Las 4 capas

Toda comunicación entre Angular (renderer) y la base de datos viaja por las **4 capas Entity → Handler → Preload → RepositoryService**. Cualquier dato que veas en pantalla pasó por estas 4 piezas.

## Diagrama

```
┌────────────────────────────────────────────────────────────────────┐
│ ANGULAR (renderer process)                                         │
│                                                                    │
│  Componente ──► RepositoryService.getProducto(id): Observable<T>  │
│                       │                                            │
│                       │  from(window.api.getProducto(id))         │
│                       ▼                                            │
│  ───────────── window.api expuesto por preload ─────────────────  │
└────────────────────────────────────────────────────────────────────┘
                            │ IPC (contextBridge)
                            ▼
┌────────────────────────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS                                              │
│                                                                    │
│  preload.ts:  ipcRenderer.invoke('get-producto', id)              │
│                       │                                            │
│  ipcMain.handle('get-producto', async (_event, id) => {           │
│       const repo = dataSource.getRepository(Producto);            │
│       return await repo.findOne({ where: { id }, relations: ... })│
│  })                                                                │
│                                                                    │
│  Handler usa TypeORM directamente sobre el DataSource SQLite.     │
└────────────────────────────────────────────────────────────────────┘
```

## Las 4 capas, paso a paso

### 1. Entity (TypeORM)

**Ubicación:** `src/app/database/entities/<dominio>/<entity-name>.entity.ts`

Toda entidad extiende `BaseModel` (`src/app/database/entities/base.entity.ts`):
- `id` (PK auto)
- `createdAt` (col `created_at`, auto)
- `updatedAt` (col `updated_at`, auto)
- `createdBy` (ManyToOne Usuario, col `created_by`, nullable)
- `updatedBy` (ManyToOne Usuario, col `updated_by`, nullable)

```typescript
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('productos')
export class Producto extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'enum', enum: ProductoTipo })
  tipo!: ProductoTipo;

  @ManyToOne('Subfamilia', { nullable: false })
  @JoinColumn({ name: 'subfamilia_id' })
  subfamilia!: any;
}
```

**Después de crear/modificar**, registrar en `src/app/database/database.config.ts` en el array `entities`. Sin eso, `synchronize: true` no la conoce.

### 2. Handler (Electron main)

**Ubicación:** `electron/handlers/<dominio>.handler.ts`

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

export function registerProductosHandlers(
  dataSource: DataSource,
  getCurrentUser?: () => Usuario | null,
) {
  // GET
  ipcMain.handle('get-producto', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      return await repo.findOne({
        where: { id },
        relations: ['subfamilia', 'presentaciones', 'preciosCosto'],
      });
    } catch (error) {
      console.error('Error get-producto:', error);
      throw error;  // Re-lanza: preload lo recibe como Promise rejection
    }
  });

  // CREATE
  ipcMain.handle('create-producto', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const entity = repo.create({
        nombre: (data.nombre || '').toString().toUpperCase(),  // ← UPPERCASE OBLIGATORIO
        tipo: data.tipo,
        // ...
      });
      const userId = getCurrentUser?.()?.id;
      await setEntityUserTracking(dataSource, entity, userId, false);  // isUpdate=false
      return await repo.save(entity);
    } catch (error) {
      console.error('Error create-producto:', error);
      throw error;
    }
  });

  // ... update-producto, delete-producto, etc.
}
```

**Reglas críticas:**
- Strings UPPERCASE antes de guardar.
- `setEntityUserTracking(...)` para popular `createdBy` / `updatedBy`.
- Operaciones complejas (multi-entity, contra-mov) usar **QueryRunner con transacción atómica**.
- Error handling: dos patrones coexisten. `throw error` (preferido) o `return { success: false, error: msg }`. **Inconsistencia conocida** — chequear el handler antes de cambiar.

**Registro en main.ts:**
```typescript
// main.ts líneas 87-122 ya lo tienen. Si añadís handler nuevo:
registerXxxHandlers(dataSource, getCurrentUser);
```

### 3. Preload (contextBridge)

**Ubicación:** `preload.ts` (~3.700 líneas, compila a `preload.js` ~98 KB).

```typescript
// preload.ts
const api = {
  // ...
  getProducto: async (id: number): Promise<Producto> => {
    return await ipcRenderer.invoke('get-producto', id);
  },
  createProducto: async (data: any): Promise<Producto> => {
    return await ipcRenderer.invoke('create-producto', data);
  },
};
contextBridge.exposeInMainWorld('api', api);  // Disponible como window.api
```

Adicionalmente hay una interfaz TypeScript que tipea `window.api` (la versión más completa vive duplicada como `ElectronAPI` dentro de `repository.service.ts`).

### 4. RepositoryService (Angular)

**Ubicación:** `src/app/database/repository.service.ts`. ~3700 líneas. Es el ÚNICO lugar desde donde el código Angular debería tocar la BD.

```typescript
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  private api = (window as any).api as ElectronAPI;

  getProducto(id: number): Observable<Producto> {
    return from(this.api.getProducto(id));
  }

  createProducto(data: Partial<Producto>): Observable<Producto> {
    return from(this.api.createProducto(data));
  }
}
```

**Patrón:** todos los métodos devuelven `Observable<T>` envolviendo `from(promise)`. Los componentes consumen con `.subscribe(...)` o `firstValueFrom(...)`.

## Cómo añadir una nueva operación IPC

→ Ver checklist completo en [workflows/add-new-entity.md](../workflows/add-new-entity.md). Resumen:

1. **Entity** + registro en `database.config.ts`.
2. **Handler** en `electron/handlers/<dominio>.handler.ts` (CRUD + paginated si aplica).
3. **Preload** método en `preload.ts` (`getX`, `createX`, etc.).
4. **RepositoryService** método público que envuelve el `window.api.X` en `Observable`.
5. **Tipo TypeScript** en `ElectronAPI` interface (al inicio de `repository.service.ts`).
6. (UI) Componente consume `repositoryService.X(...).subscribe(...)`.
7. **Reiniciar la app** — porque cambios en `electron/handlers/`, `preload.ts`, `main.ts` no son hot-reload. Avisarle al usuario.

## Reglas de oro

- **Nunca** instanciar TypeORM en el renderer (Angular). El DataSource vive solo en main process.
- **Nunca** hacer queries SQL desde el renderer. Solo handlers.
- **Nunca** llamar `window.api.*` directamente desde un componente — usar `RepositoryService` para consistencia y testabilidad.
- **`getCurrentUser`** se inyecta desde main.ts a cada `registerXxxHandlers(dataSource, getCurrentUser)`. Es función, no objeto, porque el currentUser cambia con login/logout.
- **Sesión** se guarda en main.ts (`let currentUser: Usuario | null`) y se persiste en `localStorage` del renderer (token, usuario, sessionId). El renderer puede llamar `setCurrentUser` (setea en main) pero hay un `console.warn` señalando que es potencialmente peligroso.
