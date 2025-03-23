import { Component, OnInit } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { TabsService } from '../../services/tabs.service';
import { TabContentComponent } from './tab-content.component';

@Component({
  selector: 'app-tab-container',
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    TabContentComponent
  ]
})
export class TabContainerComponent implements OnInit {
  // Directly expose tabs from the service
  get tabs() {
    return this.tabsService.tabs;
  }
  
  // Directly expose active tab index
  get selectedTabIndex() {
    return this.tabsService.currentIndex;
  }

  constructor(public tabsService: TabsService) {}

  ngOnInit(): void {
    // No need for explicit subscriptions - the service maintains state
  }

  // Handle tab change event from the mat-tab-group
  tabChanged(event: any): void {
    this.tabsService.tabChanged(event.index);
  }

  // Close a tab
  removeTab(index: number): void {
    this.tabsService.removeTab(index);
  }

  // Close tab by id for backward compatibility
  closeTab(tabId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.tabsService.removeTabById(tabId);
  }
} 