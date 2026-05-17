import { Column, Entity } from 'typeorm';
import { BaseModel } from './base.entity';

@Entity('printers')
export class Printer extends BaseModel {
  @Column()
  name!: string;

  @Column()
  type!: string;

  @Column({ name: 'connection_type' })
  connectionType!: string;

  @Column()
  address!: string;

  @Column({ nullable: true })
  port?: number;

  @Column({ nullable: true })
  dpi?: number;

  @Column({ nullable: true })
  width?: number;

  @Column({ name: 'character_set', nullable: true })
  characterSet?: string;

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ nullable: true, type: 'text' })
  options?: string;

  /**
   * Rol preferido global de la impresora — atajo cuando NO se quiere pasar
   * por la M2M `SectorImpresora`. Ej. una impresora con `rol='TICKET_VENTA'`
   * y `isDefault=true` se usa para todos los tickets de venta del sistema
   * sin configurar sectores. Valores típicos:
   * `TICKET_VENTA | COMANDA | PRECUENTA | OFICINA | null`.
   *
   * La M2M `SectorImpresora` sigue siendo el mecanismo principal de
   * enrutamiento por sector — este campo es solo el fallback global.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  rol?: string;
}
