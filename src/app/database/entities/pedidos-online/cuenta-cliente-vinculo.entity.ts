import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

export enum AccionVinculoCuenta {
  VINCULAR = 'VINCULAR',
  DESVINCULAR = 'DESVINCULAR',
}

/**
 * Historial de vínculos de una cuenta web con un `Cliente` interno (F8b). Quién lo hizo es
 * `createdBy`. No se borra: desvincular agrega una fila DESVINCULAR.
 */
@Entity('cuentas_cliente_vinculos')
export class CuentaClienteVinculo extends BaseModel {
  @Index()
  @Column({ name: 'cuenta_cliente_id', type: 'int' })
  cuentaClienteId!: number;

  @Column({ name: 'cliente_id', type: 'int' })
  clienteId!: number;

  @Column({ type: 'varchar', length: 20 })
  accion!: AccionVinculoCuenta;

  /** UPPERCASE. Opcional al vincular, recomendado al desvincular. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo?: string | null;
}
