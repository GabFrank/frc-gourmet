import { Injectable, Type } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export interface Tab {
  id: string;
  title: string;
  componentType: Type<any>;
  active: boolean;
  data?: any;
  closable?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TabsService {
  private tabsSubject = new BehaviorSubject<Tab[]>([]);
  private activeTabSubject = new BehaviorSubject<string | null>(null);

  tabs$ = this.tabsSubject.asObservable();
  activeTab$ = this.activeTabSubject.asObservable();

  constructor() { }

  /**
   * Get the current tabs array
   */
  getCurrentTabs(): Tab[] {
    return this.tabsSubject.getValue();
  }

  /**
   * Get the active tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabSubject.getValue();
  }

  /**
   * Add a new tab
   */
  addTab(title: string, componentType: Type<any>, data?: any, id?: string, setActive: boolean = true): string {
    const tabs = this.getCurrentTabs();
    const tabId = id || uuidv4();
    
    // If the tab already exists, update it and set active
    const existingTabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (existingTabIndex >= 0) {
      if (setActive) {
        this.setActiveTab(tabId);
      }
      return tabId;
    }
    
    // Create new tab
    const newTab: Tab = {
      id: tabId,
      title,
      componentType,
      active: false,
      data,
      closable: true
    };
    
    // Add to tabs array
    tabs.push(newTab);
    this.tabsSubject.next([...tabs]); // Create a new array to ensure change detection
    
    // Set as active if required
    if (setActive) {
      this.setActiveTab(tabId);
    }
    
    return tabId;
  }

  /**
   * Remove a tab
   */
  removeTab(tabId: string): void {
    const tabs = this.getCurrentTabs();
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    
    if (tabIndex === -1) {
      return;
    }
    
    const isActive = tabs[tabIndex].active;
    const tabToRemove = tabs[tabIndex];
    const updatedTabs = tabs.filter(tab => tab.id !== tabId);
    
    // If the removed tab was active, activate another tab
    if (isActive && updatedTabs.length > 0) {
      // Activate the previous tab or the first one
      const newActiveIndex = Math.max(0, tabIndex - 1);
      updatedTabs[newActiveIndex].active = true;
      this.activeTabSubject.next(updatedTabs[newActiveIndex].id);
    } else if (updatedTabs.length === 0) {
      // No tabs left
      this.activeTabSubject.next(null);
      
      // When removing last tab, make sure the BehaviorSubject gets a completely new array
      // This is important for the TabContainer to detect the change properly
      this.tabsSubject.next([]);
      
      console.log('All tabs closed');
    }
    
    if (updatedTabs.length > 0) {
      this.tabsSubject.next(updatedTabs);
    }
  }

  /**
   * Set the active tab
   */
  setActiveTab(tabId: string): void {
    const tabs = this.getCurrentTabs();
    
    // If the tab doesn't exist, do nothing
    if (!tabs.some(tab => tab.id === tabId)) {
      return;
    }
    
    // Update active state
    const updatedTabs = tabs.map(tab => ({
      ...tab,
      active: tab.id === tabId
    }));
    
    this.tabsSubject.next(updatedTabs);
    this.activeTabSubject.next(tabId);
    
    // Find the activated tab to resend its data (this helps ensure data is properly passed)
    const activatedTab = tabs.find(tab => tab.id === tabId);
    if (activatedTab && activatedTab.data) {
      // Short delay to allow the component to be properly initialized
      setTimeout(() => {
        console.log(`[TabsService] Resending data on tab activation for '${activatedTab.title}'`);
        this.updateTabData(tabId, activatedTab.data);
      }, 100);
    }
  }

  /**
   * Update a tab's data
   */
  updateTabData(tabId: string, data: any): void {
    const tabs = this.getCurrentTabs();
    const updatedTabs = tabs.map(tab => 
      tab.id === tabId ? { ...tab, data } : tab
    );
    
    if (JSON.stringify(tabs) !== JSON.stringify(updatedTabs)) {
      this.tabsSubject.next(updatedTabs);
    }
  }

  /**
   * Update a tab's title
   */
  updateTabTitle(tabId: string, title: string): void {
    const tabs = this.getCurrentTabs();
    const updatedTabs = tabs.map(tab => 
      tab.id === tabId ? { ...tab, title } : tab
    );
    
    if (JSON.stringify(tabs) !== JSON.stringify(updatedTabs)) {
      this.tabsSubject.next(updatedTabs);
    }
  }

  /**
   * Set whether a tab can be closed
   */
  setTabClosable(tabId: string, closable: boolean): void {
    const tabs = this.getCurrentTabs();
    const updatedTabs = tabs.map(tab => 
      tab.id === tabId ? { ...tab, closable } : tab
    );
    
    if (JSON.stringify(tabs) !== JSON.stringify(updatedTabs)) {
      this.tabsSubject.next(updatedTabs);
    }
  }

  /**
   * Clear all tabs
   */
  clearTabs(): void {
    this.tabsSubject.next([]);
    this.activeTabSubject.next(null);
  }

  /**
   * Opens a tab with the specified component. If a tab with matching ID or component type already exists,
   * it will be activated instead of creating a new one.
   * 
   * @param title The display title of the tab
   * @param componentType The component to render in the tab
   * @param data Optional data to pass to the component
   * @param id Optional unique identifier for the tab
   * @param closable Whether the tab can be closed by the user (default: true)
   * @returns The ID of the tab
   */
  openTab(
    title: string,
    componentType: Type<any>,
    data: any = {},
    id?: string,
    closable: boolean = true
  ): string {
    // First check if a tab with this ID already exists
    const tabs = this.getCurrentTabs();
    
    // Check for existing tab by ID if provided
    let existingTab = id ? tabs.find(tab => tab.id === id) : null;
    
    // If no ID match and we have tabs open, check by component type 
    if (!existingTab && tabs.length > 0) {
      existingTab = tabs.find(tab => tab.componentType === componentType);
    }

    if (existingTab) {
      // If tab exists, just activate it and update its data
      if (existingTab.data !== data) {
        this.updateTabData(existingTab.id, data);
      }
      this.setActiveTab(existingTab.id);
      return existingTab.id;
    } else {
      // Create a new tab - first generate ID if not provided
      const tabId = id || uuidv4();
      
      // Create a new tab object
      const newTab: Tab = {
        id: tabId,
        title,
        componentType,
        active: false,
        data,
        closable
      };
      
      // Add to tabs array
      const updatedTabs = [...tabs, newTab];
      this.tabsSubject.next(updatedTabs);
      
      // Set as active
      this.setActiveTab(tabId);
      
      return tabId;
    }
  }

  /**
   * Opens a tab with the specified component and ensures data is passed to the component.
   * Adds a delayed data update to ensure the component is fully initialized before receiving data.
   * 
   * @param title The display title of the tab
   * @param componentType The component to render in the tab
   * @param data Optional data to pass to the component
   * @param id Optional unique identifier for the tab
   * @param closable Whether the tab can be closed by the user (default: true)
   * @returns The ID of the tab
   */
  openTabWithData(
    title: string,
    componentType: Type<any>,
    data: any = {},
    id?: string,
    closable: boolean = true
  ): string {
    console.log(`[TabsService] Opening tab '${title}' with data:`, data);
    
    // First open the tab normally
    const tabId = this.openTab(title, componentType, data, id, closable);
    
    // Add a delayed data update to ensure the component is ready
    if (data) {
      setTimeout(() => {
        console.log(`[TabsService] Updating tab data after delay for tab '${title}' (ID: ${tabId})`);
        this.updateTabData(tabId, data);
      }, 300); // 300ms delay should be enough for most components to initialize
    }
    
    return tabId;
  }
} 