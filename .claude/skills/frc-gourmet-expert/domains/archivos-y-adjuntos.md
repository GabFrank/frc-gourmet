# Archivos y adjuntos — sistema unificado

> Refactor del **2026-05-07** (branch `feat/files-imagenes-adjuntos`). Antes había manejo fragmentado: `Persona.imageUrl` con util propio, `FuncionarioDocumento` solo con descarga, `PdvCategoriaItem.imagen` en base64 dentro de la BD, y 3 entities con `comprobanteUrl varchar` sin UI ni validación. Este doc es el contrato a seguir para **cualquier nueva feature** que necesite subir o mostrar archivos.

## 1. Convención de storage

```
userData/
  profile-images/          ← fotos de Persona
  producto-images/         ← imágenes de Producto/Presentación/Sabor
  funcionario-documentos/  ← docs RRHH (CONTRATO, CEDULA, ...)
    {funcionarioId}/<file>
  factura-imports/         ← PDFs/imágenes de OCR de compras
  adjuntos/                ← entity polimórfica (release 2)
```

Acceso desde el renderer: `app://<carpeta>/<file>`. El custom protocol está en `main.ts:registerAppProtocol()` y mapea cualquier ruta `app://<X>/<Y>` → `userData/<X>/<Y>`. **Nunca** sirvas archivos por base64 inline si podés usar `app://`.

## 2. Helpers backend

### `electron/utils/image-handler.utils.ts` (legacy)
- `saveProfileImage`, `deleteProfileImage`, `saveProductoImage`, `deleteProductoImage`. Mantenidos por compat con `save-profile-image` IPC.

### `electron/utils/document-handler.utils.ts`
- `saveFuncionarioDocumento(funcionarioId, base64, fileName, mimeType)` → `{ rutaRelativa, tamanoBytes, mimeType }`.
- `deleteFuncionarioDocumento(rutaRelativa)`, `readFuncionarioDocumentoBase64(rutaRelativa)`.

### `electron/utils/image-resize.utils.ts` (NUEVO 2026-05-07)
- `generateImageDerivatives(absolutePath)` → genera `<base>.thumb.jpg` (96×96, q80%) y `<base>.medium.jpg` (400×400, q85%) usando `@napi-rs/canvas`. Si el original es ≤ 96 o ≤ 400 px, copia bytes (no re-encodea, evita pérdida).
- `deleteImageDerivatives(absolutePath)` — borra ambas derivadas si existen, silencioso si no.

## 3. IPCs genéricos (`electron/handlers/files.handler.ts` — NUEVO)

| IPC | Input | Output |
|---|---|---|
| `save-file` | `{ carpeta, base64, fileName, generateThumbnails? }` | `{ url, fileName, mimeType, tamanoBytes, thumbUrl?, mediumUrl? }` |
| `delete-file` | `{ url }` | `{ ok }` (también borra derivadas) |
| `read-file-base64` | `{ url }` | `{ base64, mimeType }` |
| `open-file-with-system` | `{ url }` | `{ ok, error? }` (usa `shell.openPath`) |

`carpeta` ∈ `'profile-images' | 'producto-images' | 'funcionario-documentos' | 'factura-imports' | 'adjuntos'`. Cualquier otra es rechazada.

`save-file` para imágenes genera thumbnails por default. Para PDFs/docs el flag es ignorado.

`delete-file` cuando borra una imagen también borra `<base>.thumb.jpg` y `<base>.medium.jpg`.

## 4. Componentes shared frontend

### `<app-file-upload>` (`src/app/shared/components/file-upload/`)

Standalone. Maneja todo el ciclo: validación de tipo/tamaño, conversión a base64, llamada al IPC, preview, delete con confirmación.

```html
<app-file-upload
  accept="image/*"
  carpeta="producto-images"
  [currentUrl]="form.get('imageUrl')?.value"
  [maxSizeMB]="5"
  label="Subir imagen"
  hint="JPG, PNG hasta 5MB"
  (uploaded)="onUploaded($event)"
  (removed)="onRemoved()">
</app-file-upload>
```

Outputs: `(uploaded)` con `{ url, fileName, mimeType, tamanoBytes, thumbUrl?, mediumUrl? }`. `(removed)` sin payload.

### `<app-document-viewer>` dialog (`src/app/shared/components/document-viewer-dialog/`)

Standalone dialog con render según mime:
- `image/*` → `<img>` simple.
- `application/pdf` → `pdfjs-dist` v3 inline con paginación + zoom (worker desde `assets/pdfjs/pdf.worker.min.js`).
- `text/*` → `<pre>` con base64 leído por IPC.
- Otros → mensaje + botón "Abrir con sistema" (`shell.openPath`).

```ts
this.dialog.open(DocumentViewerDialogComponent, {
  width: '80vw', maxWidth: '1100px',
  height: '85vh', maxHeight: '900px',
  data: { url: 'app://...', fileName, mimeType, title },
});
```

### `src/app/shared/utils/image-url.util.ts`

```ts
thumbUrl(url) → 'app://producto-images/abc.thumb.jpg'
mediumUrl(url) → 'app://producto-images/abc.medium.jpg'
```

**En BD se guarda solo la URL del original**. Las derivadas se infieren con regex. Si una derivada no existe (legacy), `<img>` falla y el componente debe caer al original con `(error)`.

## 5. Entity polimórfica `Adjunto` (release 1: solo schema; release 2: handlers + UI)

`src/app/database/entities/shared/adjunto.entity.ts`. Indexada por `(entidadTipo, entidadId)`.

```ts
@Entity('adjuntos')
@Index(['entidadTipo', 'entidadId'])
export class Adjunto extends BaseModel {
  entidadTipo: string;  // 'GASTO' | 'VALE' | 'CPP_CUOTA' | ...
  entidadId: number;
  tipo: string;         // 'COMPROBANTE' | 'FACTURA' | 'CONTRATO' | 'OTRO'
  archivoUrl: string;   // 'app://adjuntos/<file>'
  nombreArchivo: string;
  mimeType?: string;
  tamanoBytes?: number;
  observacion?: string;
}
```

**Convención `entidadTipo`** (UPPERCASE): `GASTO`, `VALE`, `PRESTAMO_FUNCIONARIO`, `CPP`, `CPP_CUOTA`, `CPC`, `CPC_CUOTA`, `CHEQUE`, `RETIRO_CAJA`, `ENTRADA_VARIA`, `OPERACION_FINANCIERA`, `MOVIMIENTO_BANCARIO`, `ACREDITACION_POS`, `COMPRA`, `VENTA`, `ASISTENCIA`.

## 6. Patrón "una imagen principal" (Producto, Persona, Presentación, Sabor)

Para entidades donde la foto se consulta mucho en listados (PDV, lista de productos), usamos columna `imageUrl varchar(500) nullable` directo en la entity. Es **la imagen destacada**. Si en el futuro la entidad necesita **galería**, usamos `Adjunto(entidadTipo='PRODUCTO', entidadId=X)` para las secundarias y la columna queda como destacada. Es el patrón de Shopify/Odoo/Magento.

**Cuando hagas update**: hay que borrar el archivo del filesystem viejo. Patrón en `productos.handler.ts:update-producto` y `personas.handler.ts:update-persona`.

## 7. Reglas duras

1. **Ningún archivo en base64 dentro de la BD.** Si encontrás uno (ej `PdvCategoriaItem.imagen` legacy), migralo a filesystem.
2. **Una sola fuente de URL**: la columna en la entity. Las derivadas son inferidas, no se guardan.
3. **Validá `carpeta` en IPC**: cualquier IPC que reciba carpeta debe rechazar valores fuera de `ALLOWED_CARPETAS`.
4. **El handler de update borra archivo viejo**: si la columna cambia, borrá del disco antes de guardar el nuevo URL. Sino acumulás basura en `userData/`.
5. **Para mostrar imágenes en listas usá `thumbUrl(...)`**, no la URL original. Si no hay thumb (legacy), cae al original via `(error)`.
6. **Para mostrar documentos no-imagen usá `<app-document-viewer>`** — nunca descargues a `<a>` salvo que sea explícitamente "descargar a disco".

## 8. Pendientes (release 2 y siguientes)

Ver [workflows/todos-pendientes.md](../workflows/todos-pendientes.md) sección "Acciones inmediatas":
- Adoptar `Adjunto` polimórfico en gastos, vales, préstamos, CPP, CPC, cheques, retiros, operaciones financieras, movimientos bancarios, acreditaciones POS, ventas (comprobante de transferencia), asistencias.
- UI de imagen en Presentación + Sabor (columnas ya existen).
- Migrar `create-edit-persona` a `<app-file-upload>`.
- Migrar `PdvCategoriaItem.imagen` base64 → `app://`.
- Backup/restore extendido a carpetas `userData/`.
