import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type DashStatChipColor = 'primary' | 'success' | 'warning' | 'error' | 'info';

@Component({
  selector: 'app-dash-stat-chip',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dash-stat-chip.component.html',
})
export class DashStatChipComponent {
  @Input() icon = 'insights';
  @Input() value: string | number = '';
  @Input() label = '';
  @Input() color: DashStatChipColor = 'primary';
  @Input() loading = false;
}
