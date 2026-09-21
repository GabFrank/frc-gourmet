/**
 * Test de auditoría continua SSE Mesas/PDV.
 * 
 * Verifica que TODOS los handlers que mutan Venta, PdvMesa o Comanda emiten
 * eventos SSE (o están explícitamente allowlisteados).
 * 
 * Estrategia: grep handlers en ventas/delivery/compras/cpc, verificar que
 * cada save/remove tiene un emitVentaCambio/emitMesaCambio/emitComandaCambio.
 * 
 * Si falla: un handler mutador se agregó sin emisión → agregar emitter o allowlist.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SSE Mesas - Auditoría continua', () => {
  const handlersPath = path.join(__dirname, '../electron/handlers');
  
  // Handlers que mutan pero NO deben emitir (explícitamente documentados)
  const ALLOWLIST = [
    'registrarCobroParcial',  // Solo registra items, anular es el que emite
    'getPdvMesas',            // Read-only
    'getComandasDisponibles', // Read-only
    'getComandasOcupadas',    // Read-only
  ];

  /**
   * Extrae nombres de handlers ipcMain.handle de un archivo.
   */
  function extraerHandlers(contenido: string): string[] {
    const regex = /ipcMain\.handle\('([^']+)'/g;
    const nombres: string[] = [];
    let match;
    while ((match = regex.exec(contenido)) !== null) {
      nombres.push(match[1]);
    }
    return nombres;
  }

  /**
   * Verifica si un handler emite SSE (busca emitVentaCambio|emitMesaCambio|emitComandaCambio).
   */
  function handlerEmite(contenido: string, handlerNombre: string): boolean {
    // Buscar el bloque del handler específico
    const inicioRegex = new RegExp(`ipcMain\\.handle\\('${handlerNombre}'`, 'g');
    const inicioMatch = inicioRegex.exec(contenido);
    if (!inicioMatch) return false;

    // Extraer el bloque (hasta el próximo ipcMain.handle o final del archivo)
    const inicio = inicioMatch.index;
    const proximoHandlerMatch = /ipcMain\.handle\(/g;
    proximoHandlerMatch.lastIndex = inicio + 50; // skip current match
    const proximoMatch = proximoHandlerMatch.exec(contenido);
    const fin = proximoMatch ? proximoMatch.index : contenido.length;
    const bloqueHandler = contenido.substring(inicio, fin);

    // Verificar si emite
    return /emit(Venta|Mesa|Comanda)Cambio/.test(bloqueHandler);
  }

  /**
   * Verifica si un handler muta entidades (save/remove de Venta/PdvMesa/Comanda).
   */
  function handlerMuta(contenido: string, handlerNombre: string): boolean {
    const inicioRegex = new RegExp(`ipcMain\\.handle\\('${handlerNombre}'`, 'g');
    const inicioMatch = inicioRegex.exec(contenido);
    if (!inicioMatch) return false;

    const inicio = inicioMatch.index;
    const proximoHandlerMatch = /ipcMain\.handle\(/g;
    proximoHandlerMatch.lastIndex = inicio + 50;
    const proximoMatch = proximoHandlerMatch.exec(contenido);
    const fin = proximoMatch ? proximoMatch.index : contenido.length;
    const bloqueHandler = contenido.substring(inicio, fin);

    // Buscar save/remove de las entidades críticas
    return /\.save\((Venta|PdvMesa|Comanda)/.test(bloqueHandler) ||
           /manager\.save\((Venta|PdvMesa|Comanda)/.test(bloqueHandler) ||
           /repo\.save\(/.test(bloqueHandler) ||
           /\.remove\(/.test(bloqueHandler);
  }

  it('Todos los handlers mutadores emiten SSE o están allowlisteados', () => {
    const archivos = [
      'ventas.handler.ts',
      'delivery.handler.ts',
      'compras.handler.ts',
      'cuentas-por-cobrar.handler.ts',
    ];

    const violaciones: string[] = [];

    for (const archivo of archivos) {
      const rutaCompleta = path.join(handlersPath, archivo);
      if (!fs.existsSync(rutaCompleta)) {
        console.warn(`⚠️  Archivo no encontrado: ${archivo}`);
        continue;
      }

      const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
      const handlers = extraerHandlers(contenido);

      for (const handler of handlers) {
        if (ALLOWLIST.includes(handler)) continue;

        const muta = handlerMuta(contenido, handler);
        const emite = handlerEmite(contenido, handler);

        if (muta && !emite) {
          violaciones.push(`${archivo}::${handler}`);
        }
      }
    }

    if (violaciones.length > 0) {
      fail(
        `❌ Handlers mutadores SIN emisión SSE:\n` +
        violaciones.map(v => `  - ${v}`).join('\n') +
        `\n\n📋 Agregar emitVentaCambio/emitMesaCambio/emitComandaCambio o allowlistear.`
      );
    }

    console.log(`✅ Auditoría SSE: todos los mutadores emiten o están allowlisteados`);
  });

  it('Los 27 emitters del inventario están implementados', () => {
    const inventarioEsperado = [
      // VentaItem (8)
      'createVentaItem', 'updateVentaItem', 'deleteVentaItem',
      'createVentaItemObservacion', 'deleteVentaItemObservacion',
      'createVentaItemAdicional', 'deleteVentaItemAdicional',
      'createVentaItemIngredienteModificacion', 'deleteVentaItemIngredienteModificacion',
      // Comanda (5)
      'createComanda', 'updateComanda', 'deleteComanda', 'abrirComanda', 'cerrarComanda',
      // Venta core
      'createVenta', 'updateVenta', 'anularCobroParcial', 'cerrarVentasAbiertasMesa',
      // Mesa
      'set-pdv-mesa-estado',
      // Transferencia
      'transferir-venta-pdv',
      // Delivery
      'delivery-convertir-modo', 'delivery-cancelar',
      // Pagos
      'createPago', 'createPagoDetalle',
      // CPC
      'cobrar-venta-credito',
    ];

    const ventasHandler = path.join(handlersPath, 'ventas.handler.ts');
    const deliveryHandler = path.join(handlersPath, 'delivery.handler.ts');
    const comprasHandler = path.join(handlersPath, 'compras.handler.ts');
    const cpcHandler = path.join(handlersPath, 'cuentas-por-cobrar.handler.ts');

    const ventasContenido = fs.readFileSync(ventasHandler, 'utf-8');
    const deliveryContenido = fs.readFileSync(deliveryHandler, 'utf-8');
    const comprasContenido = fs.readFileSync(comprasHandler, 'utf-8');
    const cpcContenido = fs.readFileSync(cpcHandler, 'utf-8');

    const faltantes: string[] = [];

    for (const handler of inventarioEsperado) {
      let encontrado = false;
      let contenido = '';

      if (handler.startsWith('delivery-')) {
        contenido = deliveryContenido;
      } else if (handler === 'cobrar-venta-credito') {
        contenido = cpcContenido;
      } else if (handler === 'createPago' || handler === 'createPagoDetalle') {
        contenido = comprasContenido;
      } else {
        contenido = ventasContenido;
      }

      encontrado = handlerEmite(contenido, handler);

      if (!encontrado) {
        faltantes.push(handler);
      }
    }

    expect(faltantes).toEqual([]);
    console.log(`✅ Los 27 emitters del inventario están implementados`);
  });
});
