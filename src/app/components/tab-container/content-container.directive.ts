import { Directive, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[tabContentContainer]',
  standalone: true
})
export class ContentContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
} 