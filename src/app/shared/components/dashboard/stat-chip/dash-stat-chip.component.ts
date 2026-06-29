import { Component, EventEmitter, Input, Output } from '@angular/core';
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
  // Si es clickable, muestra cursor/realce y emite chipClick al hacer click.
  @Input() clickable = false;
  @Output() chipClick = new EventEmitter<void>();

  onClick(): void {
    if (this.clickable) {
      this.chipClick.emit();
    }
  }
}
