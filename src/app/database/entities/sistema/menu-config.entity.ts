import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Override de configuración de un nodo del menú, editable por el ADMIN.
 *
 * Una fila por `nodeId` (el `id` estable de un `MenuNode` de `menu-tree.ts`).
 * Los campos son **nullable**: `null` = "sin override, usar el default del
 * árbol". Así el ADMIN puede ocultar un ítem del sidenav o del buscador, o
 * reordenar, sin tocar código. El árbol (`MENU_TREE`) sigue siendo la fuente de
 * la estructura; esta tabla solo guarda diferencias.
 */
@Entity('menu_config')
export class MenuConfig extends BaseModel {
  /** id del MenuNode (rama u hoja) que se sobreescribe. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120, name: 'node_id' })
  nodeId!: string;

  /** Override de visibilidad en el sidenav. null = default del árbol. */
  @Column({ type: 'boolean', nullable: true, name: 'en_sidenav' })
  enSidenav?: boolean | null;

  /** Override de indexación en el buscador. null = default del árbol. */
  @Column({ type: 'boolean', nullable: true, name: 'en_buscador' })
  enBuscador?: boolean | null;

  /** Override de orden dentro de su nivel. null = orden del árbol. */
  @Column({ type: 'int', nullable: true })
  orden?: number | null;
}
