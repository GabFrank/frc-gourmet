import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { MovimientoClienteTipo } from './cuentas-por-cobrar-enums';
import { Cliente } from '../personas/cliente.entity';
import { Usuario } from '../personas/usuario.entity';

@Entity('movimientos_cliente')
export class MovimientoCliente extends BaseModel {
  @ManyToOne(() => Cliente, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({
    type: 'varchar',
    enum: MovimientoClienteTipo
  })
  tipo!: MovimientoClienteTipo;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ type: 'datetime' })
  fecha!: Date;

  @Column({ name: 'venta_id', type: 'int', nullable: true })
  ventaId?: number;

  @Column({ name: 'cuenta_por_cobrar_id', type: 'int', nullable: true })
  cuentaPorCobrarId?: number;

  @Column({ name: 'cuenta_por_cobrar_cuota_id', type: 'int', nullable: true })
  cuentaPorCobrarCuotaId?: number;

  @Column({ name: 'caja_mayor_movimiento_id', type: 'int', nullable: true })
  cajaMayorMovimientoId?: number;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @ManyToOne(() => Usuario, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'registrado_por_id' })
  registradoPor?: Usuario;
}
