import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Configuración de una pantalla KDS. Cada Google TV / navegador elige qué
 * pantalla es; de ahí saca qué sectores mostrar y sus umbrales de semáforo.
 *
 * `sectores` se guarda como JSON de IDs (config de baja cardinalidad,
 * administrada desde el PdV) en vez de una M2M aparte.
 */
@Entity('kds_pantallas')
export class KdsPantalla extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  /** JSON array de sector ids, ej. "[1,3]". */
  @Column({ type: 'text', nullable: true })
  sectores?: string;

  @Column({ name: 'umbral_amarillo', type: 'int', default: 5 })
  umbralAmarillo!: number;

  @Column({ name: 'umbral_rojo', type: 'int', default: 10 })
  umbralRojo!: number;

  @Column({ name: 'sonido_nuevo', default: true })
  sonidoNuevo!: boolean;

  /** Columnas del grid; 0 = automático. */
  @Column({ type: 'int', default: 0 })
  columnas!: number;

  @Column({ default: true })
  activo!: boolean;
}
