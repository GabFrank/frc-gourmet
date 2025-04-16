import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContentContainerDirective } from './content-container.directive';
import { Tab } from '../../services/tabs.service';

@Component({
  selector: 'app-tab-content',
  template: '<ng-template tabContentContainer></ng-template>',
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      overflow: auto;
      height: 100%;
      width: 100%;
    }
  `],
  standalone: true,
  imports: [CommonModule, ContentContainerDirective]
})
export class TabContentComponent implements OnInit {
  @Input() tab!: Tab;
  private componentCreated = false;

  @ViewChild(ContentContainerDirective, { static: true })
  contentContainer!: ContentContainerDirective;

  ngOnInit() {
    if (!this.tab) return;

    // Only create the component once
    if (!this.componentCreated) {
      try {
        // Create component for this tab using the modern approach
        const viewContainerRef = this.contentContainer.viewContainerRef;

        const componentRef = viewContainerRef.createComponent(this.tab.componentType);

        // Set data if component supports it
        if (componentRef.instance.setData && this.tab.data) {
          componentRef.instance.setData(this.tab.data);
        }

        this.componentCreated = true;
      } catch (error) {
        console.error('Error creating tab content component:', error);
      }
    }
  }
}
