import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Convenio: agrupa clientes que pertenecen a una empresa/entidad externa con la
 * que se tiene un acuerdo (ej. "FUNCIONARIOS BODEGA FRANCO", "BENEFICIARIOS LG").
 * A fin de mes la empresa puede pagar de forma consolidada la deuda de todos sus
 * clientes (cobro consolidado) y luego descontarla a cada uno internamente.
 *
 * Relacion M2M con Cliente (un cliente puede estar en varios convenios). El lado
 * dueno del JoinTable es Cliente (`cliente.convenios`).
 */
@Entity('convenios')
export class Convenio extends BaseModel {
  @Column({ type: 'varchar', length: 160 })
  nombre!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descripcion?: string;

  // Datos opcionales de la empresa que paga (para el reporte / recibo).
  @Column({ type: 'varchar', length: 40, nullable: true })
  ruc?: string;

  @Column({ type: 'varchar', length: 160, name: 'contacto', nullable: true })
  contacto?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @ManyToMany('Cliente', 'convenios')
  clientes?: any[];
}
