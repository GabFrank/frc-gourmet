import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity polimórfica para adjuntar archivos a CUALQUIER otra entity vía
 * `(entidadTipo, entidadId)`. Reemplaza el patrón de `comprobanteUrl varchar`
 * disperso en distintas tablas y permite N archivos por registro.
 *
 * **Estado**: schema declarado en release 1, **no usado** todavía. Los handlers
 * genéricos (`get-adjuntos`, `create-adjunto`, `delete-adjunto`) se construyen
 * en release 2 cuando se adopten los dominios financieros (gastos, vales, CPP,
 * cheques, retiros, operaciones financieras, depósitos, etc.).
 *
 * Convenciones:
 * - `entidadTipo` siempre UPPERCASE: `'GASTO' | 'VALE' | 'PRESTAMO_FUNCIONARIO'
 *   | 'CPP' | 'CPP_CUOTA' | 'CPC' | 'CPC_CUOTA' | 'CHEQUE' | 'RETIRO_CAJA'
 *   | 'ENTRADA_VARIA' | 'OPERACION_FINANCIERA' | 'MOVIMIENTO_BANCARIO'
 *   | 'ACREDITACION_POS' | 'COMPRA' | 'VENTA' | 'ASISTENCIA'`.
 * - `tipo` describe el rol del archivo dentro de su entidad:
 *   `'COMPROBANTE' | 'FACTURA' | 'CONTRATO' | 'RECIBO' | 'OTRO'`.
 * - `archivoUrl` siempre `app://adjuntos/<file>` (un solo bucket dedicado).
 */
@Entity('adjuntos')
@Index(['entidadTipo', 'entidadId'])
export class Adjunto extends BaseModel {
  @Column({ type: 'varchar', length: 50 })
  entidadTipo!: string;

  @Column({ type: 'int' })
  entidadId!: number;

  @Column({ type: 'varchar', length: 30, default: 'OTRO' })
  tipo!: string;

  @Column({ type: 'varchar', length: 500 })
  archivoUrl!: string;

  @Column({ type: 'varchar', length: 255 })
  nombreArchivo!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  @Column({ type: 'int', nullable: true })
  tamanoBytes?: number;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
