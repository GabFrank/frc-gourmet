# Backup/Restore Postgres + envío por WhatsApp

_Feature agregada 2026-08. Rama `claude/frc-postgres-backup-whatsapp-*`._

## Qué cambió

El módulo **Configuración → Backup y Restauración** era exclusivamente para SQLite
(copiaba el archivo `frc-gourmet.db`). Ahora es **driver-aware**: si la BD activa
es Postgres (`app-settings.json → database.type === 'postgres'`), toda la pantalla
opera contra Postgres automáticamente, sin configuración extra por parte del
usuario. Además, cualquier backup puede **enviarse por WhatsApp** (como documento)
a un número configurable, reusando la conexión Evolution API de Notificaciones.

## Cómo funciona

### Detección de driver

`getDbType(userData)` lee `app-settings.database.type`. El handler `backup-get-info`
devuelve `dbType`; el frontend setea `isPostgres` y renderiza la UI específica
(panel de conexión, selector de formato, etc.). No hay que elegir nada manualmente.

### Backup Postgres (`electron/utils/pg-backup.utils.ts`)

- **`pg_dump`** genera el backup. Dos formatos, elegibles en la pestaña *Auto-backup*:
  - **Comprimido (`.dump`, `-Fc`)** — recomendado, más chico, restaura con `pg_restore`.
  - **SQL plano (`.sql`, `-Fp`)** — texto legible, restaura con `psql`.
- Se dumpea la **base completa** (sin `-n`): un dump full no emite `CREATE SCHEMA public`,
  así restaura limpio sobre un schema recreado.
- Los binarios (`pg_dump`/`pg_restore`/`psql`) se **autodetectan** en el PATH y en
  rutas típicas por SO (Windows `C:\Program Files\PostgreSQL\<ver>\bin`, Linux
  `/usr/lib/postgresql/<ver>/bin`, etc.). Si no están, se puede configurar la
  **carpeta de binarios** manualmente en *Auto-backup*.
- La password de la BD se lee de **keytar** (`postgres-password`), nunca de disco.

### Backup completo (`.frcbak`)

El contenedor `.frcbak` (BD + imágenes de perfil/producto) ahora es genérico: el
manifest guarda `dbType` + `dbFileName` (el dump para Postgres, `frc-gourmet.db`
para SQLite). Los `.frcbak` viejos (sin `dbType`) se asumen SQLite (retrocompatible).

### Restore

- **Postgres**: safety dump previo → si no se puede crear, **se aborta** (no se
  toca la BD). Reset del schema (`DROP SCHEMA ... CASCADE` + `CREATE SCHEMA`) y
  `pg_restore`/`psql`. Si falla, rollback automático desde el safety dump. Para
  `.frcbak` se restaura la BD primero y **recién después** se vuelcan las imágenes
  (no se pisan si la BD falla). Reinicia la app.
- **SQLite**: igual que antes (copia del archivo), pero ahora se cierra la BD
  **antes** de copiar el safety (checkpoint del WAL).
- Restaurar un backup del driver equivocado (ej. `.db` de SQLite estando en
  Postgres) se **rechaza** con un mensaje claro.

### Reset

- **Postgres**: safety dump + `DROP SCHEMA public CASCADE` + `CREATE SCHEMA`. Al
  reiniciar, corren migraciones y seeds (BD limpia).
- **SQLite**: borra `frc-gourmet.db` + sidecar `-wal`/`-shm`.

### Envío por WhatsApp

- Handler **`backup-send-whatsapp`** (permiso `SISTEMA_BACKUP`): valida que el
  archivo esté dentro del directorio de backups y que no supere 100 MB, y lo
  envía como **documento** vía Evolution API (`sendWhatsappDocumentFile`).
- El **número destino** se configura en la pestaña *Auto-backup* (campo
  "WhatsApp destino"). Reusa la config de Evolution API de
  *Configuración → Notificaciones* (URL, instancia, apikey en keytar).
- Botón **"Enviar por WhatsApp"** en el menú de cada backup del listado.

### Retención de safety backups

`pruneSafetyBackups` deja solo los 5 `pre-restore-*` / `pre-reset-*` más nuevos
(los dumps Postgres completos pueden ser grandes).

## Configuración (persistida en `app-settings.json → backup`)

| Clave | Descripción |
|---|---|
| `pgFormat` | `'custom'` (.dump) o `'plain'` (.sql). Default `custom`. |
| `pgBinDir` | Carpeta de binarios Postgres si no están en PATH. Vacío = autodetect. |
| `whatsappDestino` | Número/JID de WhatsApp para enviar backups. Vacío = deshabilitado. |

## Manual de pruebas manuales

> El envío por WhatsApp requiere Evolution API configurada y conectada en
> *Configuración → Notificaciones* (mismo mecanismo que el resumen de cierre de caja).

### A) Con BD SQLite (regresión — nada debe cambiar)

1. Abrir *Configuración → Backup y Restauración*. El panel debe mostrar
   **Motor de BD: SQLITE** y "Última modificación".
2. Crear "Backup rápido (solo BD)" → aparece un `.db` en el listado.
3. Crear "Backup completo" → aparece un `.frcbak`.
4. Restaurar uno desde el listado → confirma, la app reinicia, los datos vuelven.
5. Menú de un backup → **Enviar por WhatsApp** sin número configurado → error claro.

### B) Con BD Postgres

Requiere la app configurada en modo Postgres (*Sistema → Configuración de BD*).

1. Abrir la pantalla. El panel muestra **Motor de BD: POSTGRESQL**, la conexión
   (`usuario@host:puerto/base`) y el tamaño de la BD. Si Postgres está caído,
   "BD accesible: No" + el error.
2. En *Auto-backup*, elegir **Formato del dump** = Comprimido. Guardar.
3. "Backup rápido (solo BD)" → aparece un `.dump` en el listado (chip BD + IMG =
   "SOLO BD"). Verificar que el archivo existe en la carpeta de backups.
4. Cambiar formato a **SQL plano**, guardar, crear otro → aparece un `.sql`.
5. "Backup completo (BD + imágenes)" → `.frcbak`.
6. "Exportar BD a archivo..." → guardar en otra carpeta → se genera el `.dump`/`.sql`.
7. **Restaurar** el `.dump` del paso 3 → confirmar → se crea un `pre-restore-*.dump`
   de seguridad, la BD se restaura y la app reinicia. Verificar datos.
8. **Restaurar el `.frcbak`** → verificar que vuelven BD **y** las imágenes.
9. **Enviar por WhatsApp**: configurar el número en *Auto-backup*, guardar. Menú
   de un backup → *Enviar por WhatsApp* → confirmar → llega el archivo al número.
10. **Reset**: pestaña *Avanzado* → Resetear (escribir RESET) → se crea
    `pre-reset-*.dump`, se dropea el schema, la app reinicia con datos iniciales.
11. **Binarios ausentes**: si `pg_dump` no está en PATH, configurar la carpeta de
    binarios en *Auto-backup*; sin ella, crear backup da un error claro.

### C) Test automatizado

`npm run test:pg-backup` — levanta un Postgres temporal (initdb/pg_ctl) y ejercita
dump/restore de ambos formatos, reset de schema, el contenedor `.frcbak`
generalizado, los modos de unpack, la protección anti path-traversal y la poda de
safety backups. Se saltea automáticamente si no hay binarios Postgres en el equipo.
