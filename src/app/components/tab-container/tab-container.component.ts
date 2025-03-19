import { Component, OnInit, OnDestroy, ViewChild, ViewContainerRef, ComponentRef, ComponentFactoryResolver, AfterViewInit, ViewEncapsulation, NgZone, ChangeDetectorRef } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { TabsService, Tab } from '../../services/tabs.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tab-container',
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule
  ]
})
export class TabContainerComponent implements OnInit, OnDestroy, AfterViewInit {
  tabs: Tab[] = [];
  activeTabIndex = 0;
  private subscription = new Subscription();
  private componentRefs = new Map<string, ComponentRef<any>>();
  private previousTabId: string | null = null;
  private wasEmptyBefore = false;

  @ViewChild('tabContent', { read: ViewContainerRef, static: false })
  tabContentContainer!: ViewContainerRef;

  constructor(
    private tabsService: TabsService,
    private componentFactoryResolver: ComponentFactoryResolver,
    private ngZone: NgZone,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to tabs changes
    this.subscription.add(
      this.tabsService.tabs$.subscribe(tabs => {
        // Check if we're transitioning from empty to non-empty state
        if (this.tabs.length === 0 && tabs.length > 0 ) {
          this.wasEmptyBefore = true;
        }
        
        // Check if any tabs were removed and destroy their components
        const currentTabs = new Set(tabs.map(tab => tab.id));
        const previousTabs = new Set(this.tabs.map(tab => tab.id));
        
        // Find tabs that were in previous array but not in current array
        for (const tabId of previousTabs) {
          if (!currentTabs.has(tabId)) {
            this.destroyComponentRef(tabId);
          }
        }
        
        this.tabs = tabs;
        
        // Find active tab index
        const activeTabIndex = this.tabs.findIndex(tab => tab.active);
        if (activeTabIndex !== -1) {
          // Run outside Angular's change detection to avoid ExpressionChangedAfterItHasBeenCheckedError
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              this.activeTabIndex = activeTabIndex;
              this.cd.detectChanges();
            });
          });
        }
        
        // If coming from empty state, we need to refresh component
        if (this.wasEmptyBefore && tabs.length > 0) {
          this.wasEmptyBefore = false;
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              this.forceReloadActiveComponent();
              this.cd.detectChanges();
            });
          });
        }
      })
    );

    // Subscribe to active tab changes
    this.subscription.add(
      this.tabsService.activeTab$.subscribe(activeTabId => {
        if (activeTabId) {
          const tabIndex = this.tabs.findIndex(tab => tab.id === activeTabId);
          if (tabIndex !== -1) {
            // Run outside Angular's change detection to avoid ExpressionChangedAfterItHasBeenCheckedError
            this.ngZone.runOutsideAngular(() => {
              setTimeout(() => {
                this.activeTabIndex = tabIndex;
                this.loadComponentForActiveTab();
                this.cd.detectChanges();
              });
            });
          }
        } else {
          // No active tabs - clear container
          if (this.tabContentContainer) {
            this.tabContentContainer.clear();
            this.previousTabId = null;
          }
        }
      })
    );
  }

  ngAfterViewInit(): void {
    // Initial loading of component after view is initialized
    setTimeout(() => this.loadComponentForActiveTab(), 0);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscription.unsubscribe();
    
    // Destroy all component references
    this.componentRefs.forEach(ref => {
      this.safeDestroyComponentRef(ref);
    });
    this.componentRefs.clear();
  }

  // Handle tab change event
  onTabChange(index: number): void {
    const selectedTab = this.tabs[index];
    if (selectedTab) {
      // Run outside Angular's change detection to avoid ExpressionChangedAfterItHasBeenCheckedError
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => {
          this.tabsService.setActiveTab(selectedTab.id);
          this.cd.detectChanges();
        });
      });
    }
  }

  // Close a tab
  closeTab(tabId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    // First destroy the component ref before removing the tab
    this.destroyComponentRef(tabId);
    
    // Then remove the tab
    this.tabsService.removeTab(tabId);

    // If this was the last tab, mark the container as empty
    if (this.tabs.length === 1) {
      this.wasEmptyBefore = true;
    }
  }

  // Safely destroy a component reference
  private destroyComponentRef(tabId: string): void {
    const componentRef = this.componentRefs.get(tabId);
    if (componentRef) {
      this.safeDestroyComponentRef(componentRef);
      this.componentRefs.delete(tabId);
    }
  }

  // Safely destroy a component reference to avoid errors
  private safeDestroyComponentRef(ref: ComponentRef<any>): void {
    try {
      if (ref && !ref.hostView.destroyed) {
        ref.destroy();
      }
    } catch (err) {
      console.warn('Error destroying component reference', err);
    }
  }

  // Force reload the active component
  private forceReloadActiveComponent(): void {
    if (!this.tabs || this.tabs.length === 0) return;
    
    const activeTab = this.tabs.find(tab => tab.active);
    if (activeTab) {
      // Force recreation of the component by removing it first
      this.destroyComponentRef(activeTab.id);
      this.loadComponent(activeTab);
      this.previousTabId = activeTab.id;
    }
  }

  private loadComponentForActiveTab(): void {
    if (!this.tabs || this.tabs.length === 0) {
      // Clear container when there are no tabs
      if (this.tabContentContainer) {
        this.tabContentContainer.clear();
      }
      this.previousTabId = null;
      return;
    }
    
    const activeTab = this.tabs.find(tab => tab.active);
    if (activeTab) {
      // Always reload the component when:
      // 1. The active tab has changed
      // 2. Or when previousTabId was null (all tabs were closed)
      if (this.previousTabId !== activeTab.id || this.previousTabId === null) {
        this.loadComponent(activeTab);
        this.previousTabId = activeTab.id;
      }
    }
  }

  // Load component for a specific tab
  private loadComponent(tab: Tab): void {
    if (!this.tabContentContainer) return;
    
    // Clear the container
    this.tabContentContainer.clear();
    
    // Create a fresh component instance
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(tab.componentType);
    const componentRef = this.tabContentContainer.createComponent(componentFactory);
    
    // Store the component reference
    this.componentRefs.set(tab.id, componentRef);
    
    // Set the component's data
    if (componentRef.instance.setData && tab.data) {
      componentRef.instance.setData(tab.data);
    }
  }
} 