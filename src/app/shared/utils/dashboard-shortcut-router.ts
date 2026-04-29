import { TabsService } from 'src/app/services/tabs.service';

/**
 * Abre el componente correspondiente al shortcut según su targetType + targetData.
 * Usa imports dinámicos para no acoplar todos los componentes a este archivo
 * (evita ciclos y reduce el bundle inicial).
 */
export async function abrirShortcut(shortcut: any, tabsService: TabsService): Promise<void> {
  const data: any = parseTargetData(shortcut.targetData);
  const titulo = shortcut.titulo || 'Acceso directo';

  switch (shortcut.targetType) {
    case 'CAJA_MAYOR_DETALLE': {
      const mod = await import('src/app/pages/financiero/caja-mayor/caja-mayor-detalle/caja-mayor-detalle.component');
      const repoMod = await import('src/app/database/repository.service');
      // Para abrir el detalle necesitamos el cajaMayor entity, no solo el id.
      // Como TabsService espera datos serializables, pasamos el id y el componente
      // hace el lookup en setData.
      tabsService.openTab(titulo, mod.CajaMayorDetalleComponent, { cajaMayorIdShortcut: data.cajaMayorId });
      // Nota: el componente debe manejar `cajaMayorIdShortcut` en setData.
      void repoMod;
      break;
    }
    case 'ACREDITACIONES_POS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/pos/acreditaciones/list-acreditaciones-pos.component');
      tabsService.openTab(titulo, mod.ListAcreditacionesPosComponent);
      break;
    }
    case 'CUENTAS_POR_PAGAR': {
      const mod = await import('src/app/pages/financiero/caja-mayor/cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component');
      tabsService.openTab(titulo, mod.ListCuentasPorPagarComponent);
      break;
    }
    case 'CUENTAS_BANCARIAS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/bancos/list-cuentas-bancarias/list-cuentas-bancarias.component');
      tabsService.openTab(titulo, mod.ListCuentasBancariasComponent);
      break;
    }
    case 'GASTOS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/gastos/list-gastos/list-gastos.component');
      tabsService.openTab(titulo, mod.ListGastosComponent);
      break;
    }
    case 'ENTRADAS_VARIAS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/entradas-varias/list-entradas-varias/list-entradas-varias.component');
      tabsService.openTab(titulo, mod.ListEntradasVariasComponent);
      break;
    }
    case 'OPERACIONES_FINANCIERAS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/operaciones-financieras/list-operaciones-financieras/list-operaciones-financieras.component');
      tabsService.openTab(titulo, mod.ListOperacionesFinancierasComponent);
      break;
    }
    case 'CHEQUERAS': {
      const mod = await import('src/app/pages/financiero/caja-mayor/cheques/list-chequeras/list-chequeras.component');
      tabsService.openTab(titulo, mod.ListChequerasComponent);
      break;
    }
    case 'CHEQUES': {
      const mod = await import('src/app/pages/financiero/caja-mayor/cheques/list-cheques/list-cheques.component');
      tabsService.openTab(titulo, mod.ListChequesComponent);
      break;
    }
    default:
      console.warn('Shortcut targetType no soportado:', shortcut.targetType);
  }
}

function parseTargetData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
