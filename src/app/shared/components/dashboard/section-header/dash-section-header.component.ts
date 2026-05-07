import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type DashBadgeColor = 'default' | 'success' | 'warning' | 'error' | 'info';

@Component({
  selector: 'app-dash-section-header',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './dash-section-header.component.html',
})
export class DashSectionHeaderComponent {
  @Input() icon = '';
  @Input() title = '';
  @Input() badge: string | number | null = null;
  @Input() badgeColor: DashBadgeColor = 'default';
}
