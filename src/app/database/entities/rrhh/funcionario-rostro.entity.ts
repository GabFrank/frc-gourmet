import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';

/**
 * Rostro registrado (enrollment) de un funcionario para reconocimiento facial.
 *
 * Guarda el embedding (descriptor facial) generado on-device por @vladmandic/human,
 * NO la imagen. Se guardan varios rostros por funcionario (3-5) para mejorar el recall.
 * El match 1:N en el fichaje se hace en JS plano contra estos vectores.
 *
 * `modelo` versiona el modelo que generó el embedding: si se cambia de modelo, los
 * embeddings viejos son incomparables y hay que re-enrolar.
 */
@Entity('funcionario_rostros')
@Index(['funcionario'])
export class FuncionarioRostro extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  /** JSON.stringify(number[]) del descriptor facial. text en SQLite / jsonb en Postgres. */
  @Column({ type: 'text' })
  embedding!: string;

  /** Longitud del vector (ej. 1024 para faceres de human). */
  @Column({ type: 'integer' })
  dimension!: number;

  /** Modelo que generó el embedding, UPPERCASE. Ej: 'HUMAN-FACERES-1024'. */
  @Column()
  modelo!: string;

  /** Thumbnail de auditoría opcional (app://...). No se usa para el match. */
  @Column({ name: 'thumbnail_url', nullable: true })
  thumbnailUrl?: string;

  @Column({ default: true })
  activo!: boolean;
}
