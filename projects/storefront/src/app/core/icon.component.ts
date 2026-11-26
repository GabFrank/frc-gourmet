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
      <ng-container *ngSwitchCase="'card'"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></ng-container>
      <ng-container *ngSwitchCase="'qr'"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></ng-container>
      <ng-container *ngSwitchCase="'transfer'"><path d="M4 7h13l-3-3M20 17H7l3 3"/></ng-container>
      <ng-container *ngSwitchCase="'chevron-down'"><path d="m6 9 6 6 6-6"/></ng-container>
      <ng-container *ngSwitchCase="'cart'"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.4 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H5.1"/></ng-container>
      <ng-container *ngSwitchCase="'x'"><path d="M18 6 6 18M6 6l12 12"/></ng-container>
      <ng-container *ngSwitchCase="'back'"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></ng-container>
      <ng-container *ngSwitchCase="'bag'"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></ng-container>
      <ng-container *ngSwitchCase="'bike'"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></ng-container>
      <ng-container *ngSwitchCase="'plus'"><path d="M12 5v14M5 12h14"/></ng-container>
      <ng-container *ngSwitchCase="'minus'"><path d="M5 12h14"/></ng-container>
      <ng-container *ngSwitchCase="'phone'"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></ng-container>
      <ng-container *ngSwitchCase="'mail'"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></ng-container>
      <ng-container *ngSwitchCase="'check'"><path d="M20 6 9 17l-5-5"/></ng-container>
      <ng-container *ngSwitchCase="'share'"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></ng-container>
      <ng-container *ngSwitchCase="'repeat'"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></ng-container>
      <ng-container *ngSwitchCase="'copy'"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></ng-container>
      <ng-container *ngSwitchCase="'call'"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></ng-container>
      <ng-container *ngSwitchCase="'chat'"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5Z"/></ng-container>
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
