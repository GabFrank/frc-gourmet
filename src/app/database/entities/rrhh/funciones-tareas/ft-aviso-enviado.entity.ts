import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { FtTarea } from './ft-tarea.entity';
import { FtCanalAviso, FtEstadoAviso, FtMomentoAvisoRegistro } from './ft.enums';

/**
 * Registro y dedupe de avisos: se inserta ANTES de enviar (UNIQUE clave `ft:<tarea>:<momento>:<nivel>:r<regla>`; ausente: `ft:<tarea>:AUSENTE:1`).
 * Con canal GERENTE la app no envía: queda PARA_GERENTE y el bot Gerente lo lee con `ft-avisos`.
 */
@Entity('ft_aviso_enviado')
@Index('UQ_ft_aviso_enviado_clave', ['clave'], { unique: true })
export class FtAvisoEnviado extends BaseModel {
  @Column({ type: 'varchar', length: 120 })
  clave!: string;

  @ManyToOne(() => FtTarea, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tarea_id' })
  tarea?: FtTarea | null;

  @Column({ type: 'text', enum: FtMomentoAvisoRegistro })
  momento!: FtMomentoAvisoRegistro;

  @Column({ type: 'integer', default: 1 })
  nivel!: number;

  @Column({ type: 'text', enum: FtCanalAviso })
  canal!: FtCanalAviso;

  @Column({ type: 'text', enum: FtEstadoAviso, default: FtEstadoAviso.PENDIENTE })
  estado!: FtEstadoAviso;

  @Column({ type: 'text', nullable: true })
  destino?: string | null;

  @Column({ type: 'text', nullable: true })
  mensaje?: string | null;

  @Column({ type: 'integer', default: 0 })
  intentos!: number;

  /** Por qué no salió (FALLIDO): sin destino, NOTIF_GLOBAL_ACTIVO apagado, error del proveedor… */
  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ name: 'enviado_en', nullable: true })
  enviadoEn?: Date;
}
