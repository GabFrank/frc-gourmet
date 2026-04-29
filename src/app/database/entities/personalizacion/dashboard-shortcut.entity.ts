import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Acceso directo configurable por dashboard. Permite al usuario agregar
 * cards extra en cualquier dashboard apuntando a una entidad/acción concreta.
 */
@Entity('dashboard_shortcuts')
export class DashboardShortcut extends BaseModel {
  /** Dashboard donde aparece el shortcut: HOME, FINANCIERO, VENTAS, COMPRAS, CAJA_MAYOR, etc. */
  @Column({ type: 'varchar', length: 50, name: 'dashboard_key' })
  dashboardKey!: string;

  @Column({ type: 'varchar', length: 150 })
  titulo!: string;

  @Column({ type: 'varchar', length: 50, default: 'star' })
  icono!: string;

  @Column({ type: 'varchar', length: 20, default: '#1976d2' })
  color!: string;

  /** Tipo de target: CAJA_MAYOR_DETALLE, ACREDITACIONES_POS, CUENTAS_POR_PAGAR, etc. */
  @Column({ type: 'varchar', length: 80, name: 'target_type' })
  targetType!: string;

  /** JSON serializado con parámetros para el target (ej. {cajaMayorId: 1}). */
  @Column({ type: 'text', nullable: true, name: 'target_data' })
  targetData?: string;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  /** Si está null = global (todos los usuarios lo ven). Si tiene usuario = personal. */
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ default: true })
  activo!: boolean;
}
