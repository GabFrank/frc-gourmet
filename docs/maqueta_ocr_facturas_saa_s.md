# 🧾 Maqueta básica de implementación OCR + IA (Google Vision + OpenAI)

## 1. Flujo general

```text
Usuario sube foto/PDF
        ↓
Backend recibe archivo
        ↓
Guardar archivo temporalmente
        ↓
Google Vision extrae texto
        ↓
OpenAI interpreta el texto
        ↓
OpenAI devuelve JSON estándar
        ↓
Backend valida totales/campos
        ↓
Frontend muestra pantalla de revisión
        ↓
Usuario corrige/confirma
        ↓
Sistema registra compra + stock
```

---

## 2. Frontend Angular

### Pantalla: Importar factura

```text
[Seleccionar proveedor]
[Subir imagen o PDF]

Vista previa del documento

Botón:
[Procesar con IA]
```

### Resultado del procesamiento

```text
Datos detectados:
- Proveedor
- RUC
- Fecha
- Número de documento
- Total
- Moneda

Tabla de productos:
| Descripción detectada | Cantidad | Precio unitario | Total | Producto del sistema |

Botones:
[Reprocesar]
[Guardar borrador]
[Confirmar compra]
```

---

## 3. Backend

### Endpoint 1: Upload

```text
POST /api/documentos-compra/upload
```

Responsabilidades:

- Validar archivo
- Guardar temporalmente
- Crear registro con estado PENDIENTE

Estados:

```text
PENDIENTE
PROCESANDO
REQUIERE_REVISION
CONFIRMADO
ERROR
```

---

### Endpoint 2: Procesar

```text
POST /api/documentos-compra/{id}/procesar
```

Responsabilidades:

1. Leer archivo
2. Enviar a Google Vision
3. Obtener texto OCR
4. Enviar texto a OpenAI
5. Recibir JSON estructurado
6. Guardar resultado
7. Devolver al frontend

---

## 4. Google Vision

Función:

- Extraer texto completo
- Mantener orden del documento

Salida esperada:

```text
Factura Legal
Proveedor XYZ S.A.
RUC 80012345-6
Fecha 05/05/2026

Arroz 5kg     2     35000     70000
Aceite 1L     3     12000     36000

Total: 106000
```

---

## 5. OpenAI

Entrada:

- Texto OCR
- Reglas de formato
- JSON esperado

Salida:

JSON estructurado consistente

---

## 6. JSON estándar sugerido

```json
{
  "tipoDocumento": "FACTURA",
  "proveedor": {
    "nombre": "Proveedor XYZ S.A.",
    "ruc": "80012345-6"
  },
  "documento": {
    "numero": "001-001-0001234",
    "fecha": "2026-05-05",
    "moneda": "PYG"
  },
  "totales": {
    "subtotal": 106000,
    "iva": 9636,
    "total": 106000
  },
  "items": [
    {
      "descripcion": "Arroz 5kg",
      "cantidad": 2,
      "precioUnitario": 35000,
      "totalLinea": 70000
    }
  ],
  "confianza": {
    "general": 0.86,
    "requiereRevision": true
  }
}
```

---

## 7. Validaciones Backend

- Suma de items = total
- cantidad > 0
- precio > 0
- totalLinea = cantidad × precio
- formato de fecha válido

Si falla:

```text
requiereRevision = true
```

---

## 8. Pantalla de revisión

Permitir:

- Corregir proveedor
- Corregir fecha
- Corregir precios
- Vincular productos
- Crear productos nuevos

Ejemplo:

```text
OCR: ARROZ T1 5K
Sistema: [Arroz Tipo 1 5kg ▼]
```

---

## 9. Base de datos

### documento_compra_importado

```text
id
proveedor_id
archivo_url
texto_ocr
json_detectado
estado
fecha_upload
fecha_procesamiento
usuario_id
```

### documento_compra_importado_item

```text
id
documento_importado_id
descripcion_detectada
cantidad_detectada
precio_detectado
total_detectado
producto_id
cantidad_confirmada
precio_confirmado
```

---

## 10. Arquitectura final

```text
Angular
  ↓
Spring Boot
  ↓
Google Vision OCR
  ↓
OpenAI
  ↓
Validación
  ↓
UI revisión
  ↓
Confirmación
  ↓
Compra + Stock
```

---

## ✔️ Conclusión

Este sistema debe ser un asistente, no automatización completa.

El usuario siempre valida antes de impactar datos críticos.

