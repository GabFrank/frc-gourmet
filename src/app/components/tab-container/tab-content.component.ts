import { Component, OnInit, Input, ViewChild, ComponentFactoryResolver } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContentContainerDirective } from './content-container.directive';
import { Tab } from '../../services/tabs.service';

@Component({
  selector: 'app-tab-content',
  template: '<ng-template tabContentContainer></ng-template>',
  standalone: true,
  imports: [CommonModule, ContentContainerDirective]
})
export class TabContentComponent implements OnInit {
  @Input() tab!: Tab;
  private componentCreated = false;

  @ViewChild(ContentContainerDirective, { static: true })
  contentContainer!: ContentContainerDirective;

  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  ngOnInit() {
    if (!this.tab) return;

    // Only create the component once
    if (!this.componentCreated) {
      try {
        // Create component for this tab
        const componentFactory = this.componentFactoryResolver.resolveComponentFactory(this.tab.componentType);
        const viewContainerRef = this.contentContainer.viewContainerRef;
        
        const componentRef = viewContainerRef.createComponent(componentFactory);
        
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