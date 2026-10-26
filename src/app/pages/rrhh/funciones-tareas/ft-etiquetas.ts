/**
 * Etiquetas en español claro para los valores de enum de Funciones y tareas.
 * Los templates siguen usando el valor del enum como `value`; esto es solo para mostrar.
 */
import { Pipe, PipeTransform } from '@angular/core';

export const FT_ETIQUETAS: Record<string, string> = {
  // Tipo
  SIMPLE: 'Simple',
  CHECKLIST: 'Checklist',
  // Recurrencia
  DIARIA: 'Diaria',
  DIAS_SEMANA: 'Días de la semana',
  MENSUAL: 'Mensual',
  UNICA: 'Única vez',
  EVENTO: 'Por evento',
  // Eventos
  CAJA_ABIERTA: 'Apertura de caja',
  CAJA_CERRADA: 'Cierre de caja',
  COMPRA_RECIBIDA: 'Compra recibida',
  // Ancla
  INICIO_TURNO: 'Inicio del turno',
  FIN_TURNO: 'Fin del turno',
  HORA_FIJA: 'Hora fija',
  // Evidencia
  NINGUNA: 'Ninguna',
  NOTA: 'Nota',
  FOTO: 'Foto',
  // Momentos de aviso
  ANTES_INICIO: 'Antes de empezar',
  ANTES_VENCER: 'Antes de vencer',
  AL_VENCER: 'Al vencer',
  ESCALAMIENTO: 'Escalamiento',
  AUSENTE: 'Ausente',
  // Canales
  APP: 'Solo en la app',
  WHATSAPP: 'WhatsApp (lo manda la app)',
  AMBOS: 'App y WhatsApp',
  GERENTE: 'Lo manda el Gerente (WhatsApp)',
  // Estados de tarea
  PENDIENTE: 'Pendiente',
  HECHA: 'Hecha',
  VERIFICADA: 'Verificada',
  VENCIDA: 'Vencida',
  NO_APLICA: 'No aplica',
  RECHAZADA: 'Rechazada',
  // Estados de aviso
  ENVIADO: 'Enviado',
  FALLIDO: 'Fallido',
  PARA_GERENTE: 'Para el Gerente',
  // Estados de propuesta
  REGISTRADA: 'Registrada',
  DESCARTADA: 'Descartada',
  // Tipo de sucursal
  PDV: 'Caja del PdV',
  MAYOR: 'Caja mayor',
};

/** Etiqueta legible de un valor de enum; si no se conoce, devuelve el valor tal cual. */
export function ftEtiqueta(valor: string | null | undefined): string {
  if (valor == null || valor === '') return '';
  return FT_ETIQUETAS[valor] ?? String(valor);
}

@Pipe({ name: 'ftEtiqueta', standalone: true })
export class FtEtiquetaPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    return ftEtiqueta(valor);
  }
}
