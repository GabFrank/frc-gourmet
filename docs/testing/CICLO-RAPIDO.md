# Ciclo de implementación sin perder tiempo

Reglas del propietario (03/11/2026) para que un cambio no tarde de más. Complementan el
ciclo de implementación de la skill (`.claude/skills/frc-gourmet-expert/workflows/ciclo-implementacion.md`):
no lo reemplazan ni saltean ningún paso, cambian **cuándo** y **cómo** se corre cada cosa.

Origen: en una tarea de 40 minutos, 11 se fueron esperando `test:all` con `sleep`.

## Pruebas

- **Mientras programás, sólo las suites de lo que tocaste** (`npm run test:<dominio>`).
  `test:all` no se corre en cada fase.
- **`test:all` va una sola vez**, con el cambio terminado y antes de la auditoría de la
  implementación (paso 8 del ciclo).
- **En paralelo:** `npm run test:all -- --jobs 3` (máquina de 4 CPU; secuencial tarda
  varias veces más).
  - `--desde test:m` retoma una corrida cortada (sólo las suites posteriores en orden alfabético).
  - `--timeout M` fija los minutos máximos por suite (default 7); la que se pasa cuenta como falla.
- **En primer plano y con timeout.** Nunca en segundo plano esperando con `sleep`: lo que
  queda de fondo se corta cuando termina la sesión.
- **Con `--jobs`, una suite que falla se re-corre sola** antes de darla por falla nueva:
  algunas comparten recursos.
- **Línea base:** se mide una vez, con el mismo comando sobre `origin/develop`, y se compara
  contra esa lista. develop ya tiene suites rojas conocidas (de entorno o preexistentes); la
  regla es que **el PR no sume fallas nuevas**. La lista depende de la máquina (Electron,
  Chromium, Postgres instalados o no): medila donde vas a correr.
- Si algo falla después de corregir, re-corré sólo las suites que fallaron. El `test:all`
  completo se repite sólo si el arreglo toca código compartido.

## Compilación

- **No recompiles las tres apps en cada cambio.** Para iterar: `npm start` (recarga en
  caliente) o compilá sólo la app que tocaste (`npx ng build mobile`, `npx ng build storefront`).
- `npm run build` y `npm run check` completos van una vez, al final.
- Con poca memoria: `NG_BUILD_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=2500`.

## Auditorías

- **Plan aprobado con observaciones menores:** no se rehace para otra auditoría. Se aplican
  al implementar y se nombran al pedir el OK. Se vuelve a auditar sólo si cambia el *qué* o
  el *cómo*.
- **Antes de la auditoría de la implementación, repasá que hiciste todas las pruebas que pide
  el plan**, en especial cobrar y facturar de verdad si el cambio toca PdV, cobro o factura.
  Si falta una, la auditoría la objeta y es otra vuelta.
- Si el plan y sus auditorías ya existen (trabajo retomado de otra sesión), no se rehacen:
  se revisan los hallazgos que quedaron abiertos.
