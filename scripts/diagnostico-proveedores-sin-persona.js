#!/usr/bin/env node

/**
 * Script de diagnóstico: Proveedores sin persona vinculada
 * 
 * PROPÓSITO:
 * Verificar cuántos proveedores activos NO tienen persona_id antes de implementar
 * Fase 1 de Cuentas Bancarias Destino. Si >10%, la feature será inutilizable sin
 * migración previa.
 * 
 * HALLAZGO AUDIT B: Proveedor.persona es nullable en código real. Diagnóstico
 * previo OBLIGATORIO antes de Fase 1.
 * 
 * USO:
 * node scripts/diagnostico-proveedores-sin-persona.js
 * 
 * OUTPUT:
 * - Total de proveedores activos
 * - Cuántos tienen persona_id = NULL
 * - % sin persona
 * - Lista de proveedores sin persona (nombre, ruc, id)
 * - Recomendación: si >10%, agregar handler vincular-persona en Fase 1
 */

const { DataSource } = require('typeorm');
const path = require('path');

async function main() {
  console.log('='.repeat(60));
  console.log('DIAGNÓSTICO: Proveedores sin persona vinculada');
  console.log('='.repeat(60));
  console.log('');

  // Crear DataSource simplificado (solo para query)
  const dataSource = new DataSource({
    type: 'sqlite',
    database: path.join(process.env.HOME || process.env.USERPROFILE, 'frc-gourmet.db'),
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Conectado a BD:', dataSource.options.database);
    console.log('');

    // Query 1: Total de proveedores activos
    const totalActivos = await dataSource.query(
      `SELECT COUNT(*) as count FROM proveedores WHERE activo = 1`
    );
    const total = totalActivos[0].count;

    // Query 2: Proveedores activos SIN persona
    const sinPersona = await dataSource.query(`
      SELECT COUNT(*) as count
      FROM proveedores
      WHERE activo = 1 AND persona_id IS NULL
    `);
    const sinPersonaCount = sinPersona[0].count;

    // Query 3: Lista de proveedores sin persona
    const lista = await dataSource.query(`
      SELECT id, nombre, ruc
      FROM proveedores
      WHERE activo = 1 AND persona_id IS NULL
      ORDER BY nombre
    `);

    const porcentaje = total > 0 ? ((sinPersonaCount / total) * 100).toFixed(2) : 0;

    console.log('📊 RESULTADOS:');
    console.log('─'.repeat(60));
    console.log(`Total proveedores activos:     ${total}`);
    console.log(`Proveedores SIN persona:       ${sinPersonaCount}`);
    console.log(`Porcentaje sin persona:        ${porcentaje}%`);
    console.log('');

    if (lista.length > 0) {
      console.log('📋 LISTA DE PROVEEDORES SIN PERSONA:');
      console.log('─'.repeat(60));
      lista.forEach((p, i) => {
        console.log(`${i + 1}. [ID: ${p.id}] ${p.nombre}${p.ruc ? ` (RUC: ${p.ruc})` : ''}`);
      });
      console.log('');
    }

    console.log('💡 RECOMENDACIÓN:');
    console.log('─'.repeat(60));
    if (sinPersonaCount === 0) {
      console.log('✅ Todos los proveedores tienen persona vinculada.');
      console.log('   Fase 1 se puede implementar sin mitigación adicional.');
    } else if (porcentaje <= 10) {
      console.log('⚠️  Menos del 10% sin persona. Mitigación OPCIONAL en Fase 1.');
      console.log('   Opción 1: Vincular manualmente desde UI antes de usar feature.');
      console.log('   Opción 2: Agregar handler quick-create persona + vinculación atómica.');
    } else {
      console.log('🔴 MÁS DEL 10% SIN PERSONA. Mitigación OBLIGATORIA en Fase 1.');
      console.log('   DEBE agregar handler vincular-persona-a-proveedor (quick-create).');
      console.log('   UI: badge ROJO + botón "Vincular persona" en ficha proveedor.');
      console.log('   Sin esto, la feature será inutilizable para estos proveedores.');
    }
    console.log('');

    await dataSource.destroy();
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  }
}

main();
