import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Iconos SVG inline (trazo, estilo Lucide/MIT) para el storefront.
 * Reemplazan a los emojis: se ven consistentes en todos los navegadores,
 * heredan el color (`currentColor`) y escalan por `size`.
 *
 * Uso: `<sf-icon name="cart"></sf-icon>` · `<sf-icon name="pin" [size]="30"></sf-icon>`
 */
@Component({
  selector: 'sf-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         [ngSwitch]="name" class="sf-ic" aria-hidden="true" focusable="false">
      <ng-container *ngSwitchCase="'search'"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></ng-container>
      <ng-container *ngSwitchCase="'receipt'"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6"/><path d="M16 12h-6"/></ng-container>
      <ng-container *ngSwitchCase="'user'"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></ng-container>
      <ng-container *ngSwitchCase="'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></ng-container>
      <ng-container *ngSwitchCase="'pin'"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></ng-container>
      <ng-container *ngSwitchCase="'pencil'"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></ng-container>
      <ng-container *ngSwitchCase="'cash'"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></ng-container>
      <ng-container *ngSwitchCase="'cart'"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.4 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H5.1"/></ng-container>
      <ng-container *ngSwitchCase="'x'"><path d="M18 6 6 18M6 6l12 12"/></ng-container>
      <ng-container *ngSwitchCase="'back'"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></ng-container>
      <ng-container *ngSwitchCase="'bag'"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></ng-container>
      <ng-container *ngSwitchCase="'bike'"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></ng-container>
      <ng-container *ngSwitchCase="'plus'"><path d="M12 5v14M5 12h14"/></ng-container>
      <ng-container *ngSwitchCase="'minus'"><path d="M5 12h14"/></ng-container>
      <ng-container *ngSwitchCase="'check'"><path d="M20 6 9 17l-5-5"/></ng-container>
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
    .sf-ic { display: block; }
  `],
})
export class IconComponent {
  @Input() name = '';
  @Input() size = 20;
}
