# Manual de Usuario — Capítulo 0: Introducción

## ¿Qué es FRC Gourmet?

FRC Gourmet es un software de gestión integral para restaurantes y negocios gastronómicos. Te permite:

- Vender en mostrador o mesa con un Punto de Venta moderno (PdV)
- Gestionar productos, recetas, sabores, combos y promociones
- Comprar mercadería a proveedores con control de stock y costo
- Manejar caja diaria + Caja Mayor (contabilidad central)
- Pagar y cobrar a crédito (cuentas por pagar / por cobrar)
- Operar con bancos, cheques y máquinas POS
- Gestionar empleados (RRHH): asistencias, vales, sueldos, vacaciones, comisiones
- Imprimir tickets y comandas en impresoras térmicas
- Generar reportes y dashboards

Todo en una sola aplicación de escritorio que corre en tu PC (Windows / macOS / Linux).

## ¿A quién está dirigido?

- **Dueño / Gerente**: ve el panorama financiero completo, configura todo el sistema.
- **Cajero / Mozo**: usa el PdV diariamente para vender.
- **Encargado de Compras**: registra compras y maneja proveedores.
- **Contador / Administrador**: gestiona Caja Mayor, gastos, pagos, cobros, RRHH.
- **Cocinero**: consulta comandas (en el futuro, con KDS).

## Capítulos del manual

1. [Login y navegación general](01-login-y-navegacion.md)
2. [Configuración inicial (orden recomendado)](02-configuracion-inicial.md)
3. [Personas, usuarios y clientes](03-personas-y-clientes.md)
4. [Productos, presentaciones y precios](04-productos-presentaciones-precios.md)
5. [Recetas, sabores y variaciones (multi-sabor pizza)](05-recetas-sabores-variaciones.md)
6. [PdV — uso diario (apertura, ventas, mesas, comandas, delivery, cierre)](06-pdv-uso-diario.md)
7. [Compras y proveedores](07-compras-y-proveedores.md)
8. [Caja Mayor: gastos, retiros, entradas, anulaciones](08-caja-mayor-financiero.md)
9. [Bancos, cheques y máquinas POS](09-bancos-cheques-pos.md)
10. [CPP / CPC — créditos a clientes y proveedores](10-cpp-cpc-creditos.md)
11. [RRHH — funcionarios, cargos, salarios, documentos](11-rrhh-funcionarios.md)
12. [RRHH — asistencias, turnos, feriados, horas extra, penalizaciones](12-rrhh-asistencias-turnos.md)
13. [RRHH — vales y préstamos a funcionarios](13-rrhh-vales-prestamos.md)
14. [RRHH — liquidaciones de sueldo, aguinaldos, bonos](14-rrhh-liquidacion-sueldo.md)
15. [RRHH — vacaciones y liquidación final (egresos)](15-rrhh-vacaciones-egresos.md)
16. [Comisiones — reglas, equipos, liquidación](16-comisiones.md)
17. [Reportes y dashboards](17-reportes-y-dashboards.md)
18. [Solución de problemas comunes](18-solucion-de-problemas.md)
19. [Glosario](19-glosario.md)
20. [Importación de facturas con IA (OCR)](20-importacion-facturas-ia.md)

## Cómo leer este manual

**Si sos nuevo**: leé los capítulos en orden. El sistema tiene dependencias (no podés cargar productos sin antes haber configurado monedas y categorías).

**Si ya lo conocés**: usá el índice para saltar al tema específico.

**Cada capítulo termina con**:
- Pasos verificables (cómo confirmar que algo funcionó).
- Errores comunes y soluciones.
- Limitaciones conocidas (qué falta o no funciona aún).

## Antes de empezar

Tu administrador o instalador ya hizo:
- Instaló FRC Gourmet en tu PC.
- Creó tu usuario administrador inicial.
- Configuró las monedas y formas de pago básicas.

Si esto no fue hecho, consultá [02-configuracion-inicial.md](02-configuracion-inicial.md) — explica cómo configurar todo desde cero.

## Convenciones del manual

- **PdV** = Punto de Venta.
- **CPP** = Cuentas por Pagar (deudas que tiene el negocio).
- **CPC** = Cuentas por Cobrar (créditos que dio el negocio a clientes).
- **CM** = Caja Mayor.
- **UB** = Unidad Base (la unidad de medida de un producto: KILOGRAMO, LITRO, UNIDAD).
- **RRHH** = Recursos Humanos.
- **PYG** = Guaraní paraguayo.

## Limitación importante

⚠️ **Esta versión está optimizada para uso local single-user**. No está pensada para entornos multi-usuario simultáneos en distintas máquinas. Cada PC tiene su propia base de datos (`frc-gourmet.db`) en la carpeta de usuario del sistema.

Si necesitás varios cajeros simultáneamente, hay que evaluar setup específico (servidor central + clientes thin) — fuera del scope actual.

## Licencia y soporte

Software propietario. Contacto: contactar al equipo de desarrollo.

---

**Próximo capítulo →** [01 — Login y navegación](01-login-y-navegacion.md)
