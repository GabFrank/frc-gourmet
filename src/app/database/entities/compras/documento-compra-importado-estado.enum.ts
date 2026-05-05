export enum DocumentoCompraImportadoEstado {
  PENDIENTE = 'PENDIENTE',
  PROCESANDO = 'PROCESANDO',
  REQUIERE_REVISION = 'REQUIERE_REVISION',
  CONFIRMADO = 'CONFIRMADO',
  ERROR = 'ERROR',
  DESCARTADO = 'DESCARTADO',
}

export enum DocumentoCompraImportadoTipo {
  PDF = 'PDF',
  IMAGE = 'IMAGE',
}
