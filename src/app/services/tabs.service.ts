import { Injectable, Type, EventEmitter } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { CreateEditProductoComponent } from '../pages/productos/productos/create-edit-producto.component';
import { ListRecetasComponent } from '../pages/productos/recetas/list-recetas.component';
import { ListIngredientesComponent } from '../pages/productos/ingredientes/list-ingredientes.component';

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

  // Public properties similar to the example
  tabs: Tab[] = [];
  currentIndex = -1;
  tabChangedEvent = new EventEmitter<any>();

  tabs$ = this.tabsSubject.asObservable();
  activeTab$ = this.activeTabSubject.asObservable();

  constructor() {
    // initialize with @ListRecetasComponent
    // this.addTab('Ingredientes', ListIngredientesComponent, { source: 'navigation' }, 'ingredientes-tab', true);
    this.addTab('Recetas', ListRecetasComponent, { source: 'navigation' }, 'recetas-tab', true);
  }

  /**
   * Get the current tabs array
   */
  getCurrentTabs(): Tab[] {
    return this.tabs;
  }

  /**
   * Get the active tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabSubject.getValue();
  }

  /**
   * Tab changed event handler
   */
  tabChanged(index: number): void {
    this.tabChangedEvent.emit(index);
    this.setTabActive(index);
  }

  /**
   * Get current tab
   */
  currentTab(): Tab | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.tabs.length) {
      return this.tabs[this.currentIndex];
    }
    return null;
  }

  /**
   * Set the active tab by index
   */
  setTabActive(index: number): void {
    if (this.tabs.length === 0) return;

    // Deactivate all tabs first
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].active = false;
    }

    // Activate the specified tab if it exists
    if (index >= 0 && index < this.tabs.length) {
      this.tabs[index].active = true;
      this.currentIndex = index;

      // Update the subjects
      this.tabsSubject.next([...this.tabs]);
      this.activeTabSubject.next(this.tabs[index].id);
    }
  }

  /**
   * Remove a tab by index
   */
  removeTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;

    // Store if current tab is being closed
    const isClosingActive = this.currentIndex === index;

    // Remove the tab
    this.tabs.splice(index, 1);

    // If closing active tab and there are still tabs
    if (isClosingActive && this.tabs.length > 0) {
      // Select the previous tab or the first one
      const newIndex = Math.max(0, index - 1);
      this.setTabActive(newIndex);
    } else if (this.tabs.length === 0) {
      // No tabs left
      this.currentIndex = -1;
      this.activeTabSubject.next(null);
    } else if (index < this.currentIndex) {
      // If a tab was removed before the current one, adjust current index
      this.currentIndex--;
    }

    // Notify subscribers
    this.tabsSubject.next([...this.tabs]);
  }

  /**
   * Remove a tab by id
   */
  removeTabById(tabId: string): void {
    const index = this.tabs.findIndex(tab => tab.id === tabId);
    if (index !== -1) {
      this.removeTab(index);
    }
  }

  /**
   * Add a new tab
   */
  addTab(title: string, componentType: Type<any>, data?: any, id?: string, closable = true): number {
    const tabId = id || uuidv4();

    // Check for existing tab with same title
    const duplicateIndex = this.tabs.findIndex(tab => tab.title === title);
    if (duplicateIndex !== -1) {
      // Just activate existing tab
      this.setTabActive(duplicateIndex);
      return duplicateIndex;
    }

    // Create new tab
    const newTab: Tab = {
      id: tabId,
      title,
      componentType,
      active: false,
      data,
      closable
    };

    // Add to tabs array
    this.tabs.push(newTab);
    const newIndex = this.tabs.length - 1;

    // Set as active
    this.setTabActive(newIndex);

    // Notify subscribers
    this.tabsSubject.next([...this.tabs]);

    return newIndex;
  }

  /**
   * Clear all tabs
   */
  removeAllTabs(): void {
    this.tabs = [];
    this.currentIndex = -1;
    this.tabsSubject.next([]);
    this.activeTabSubject.next(null);
  }

  /**
   * Go to tab by name
   */
  onGoToTab(name: string): void {
    const index = this.tabs.findIndex(t => t.title === name);
    if (index !== -1) {
      this.setTabActive(index);
    }
  }

  /**
   * Get tab index by name
   */
  getIndexByName(name: string): number {
    return this.tabs.findIndex(t => t.title === name);
  }

  /**
   * Change current tab name
   */
  changeCurrentTabName(name: string): void {
    if (this.currentIndex >= 0 && this.currentIndex < this.tabs.length) {
      this.tabs[this.currentIndex].title = name;
      this.tabsSubject.next([...this.tabs]);
    }
  }

  /**
   * Open a tab with the specified component and data
   */
  openTab(title: string, componentType: Type<any>, data: any = {}, id?: string, closable = true): number {
    return this.addTab(title, componentType, data, id, closable);
  }

  /**
   * Open a tab with data, or focus an existing tab.
   * If a tab with the same title exists, set it active and update its data.
   * Otherwise, create a new tab with the specified data.
   */
  openTabWithData(title: string, componentType: Type<any>, data: any = {}, id?: string, closable = true): number {
    const tabId = id || uuidv4();

    // Check for existing tab with the same id or title
    const existingTabIndex = id
      ? this.tabs.findIndex(tab => tab.id === id)
      : this.tabs.findIndex(tab => tab.title === title);

    if (existingTabIndex !== -1) {
      // Update existing tab's data
      this.tabs[existingTabIndex].data = data;

      // Activate the tab
      this.setTabActive(existingTabIndex);

      // Notify subscribers of the update
      this.tabsSubject.next([...this.tabs]);

      return existingTabIndex;
    }

    // Create a new tab with the provided data
    return this.addTab(title, componentType, data, tabId, closable);
  }
}