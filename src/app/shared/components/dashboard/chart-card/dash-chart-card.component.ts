import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { NgChartsModule } from 'ng2-charts';
import type { ChartConfiguration, ChartData, ChartType } from 'chart.js';

@Component({
  selector: 'app-dash-chart-card',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDividerModule, NgChartsModule],
  templateUrl: './dash-chart-card.component.html',
})
export class DashChartCardComponent {
  @Input() title = '';
  @Input() icon = 'trending_up';
  @Input() chartType: ChartType = 'line';
  @Input() chartData: ChartData = { labels: [], datasets: [] };
  @Input() chartOptions: ChartConfiguration['options'] = {};
  @Input() height = 280;
}
