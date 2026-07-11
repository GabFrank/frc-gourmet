# Modelos de reconocimiento facial (@vladmandic/human)

Estos assets son los pesos de los modelos que usa el fichaje facial de asistencia.
**No se versionan en git** (son binarios de ~7–10 MB). Hay que descargarlos una vez
por máquina/deploy con:

```bash
npm run models:face
```

El script `scripts/download-face-models.js` los baja del repo oficial
`vladmandic.github.io/human-models` y los copia acá y en
`projects/mobile/src/assets/models/human/` (para la PWA).

Modelos descargados: `blazeface` (detección), `facemesh` (landmarks/alineación),
`faceres` (embedding 1024-D), `antispoof` y `liveness` (prueba de vida).

Sin estos archivos, la pantalla de fichaje/enrollment mostrará un error de carga
de modelos. Requiere conexión a internet **solo al descargar**; en runtime se
sirven localmente (LAN/offline).
