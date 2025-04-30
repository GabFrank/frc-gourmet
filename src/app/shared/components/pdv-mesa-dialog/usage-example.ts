/**
 * Example of how to use the PdvMesaDialogComponent
 * 
 * This is not a functional component, just a reference for how to use the dialog
 */

import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PdvMesaDialogComponent } from './pdv-mesa-dialog.component';

@Component({
  selector: 'app-example',
  template: `
    <button mat-raised-button color="primary" (click)="openMesasDialog()">
      <mat-icon>table_restaurant</mat-icon> Gestionar Mesas
    </button>
  `
})
export class ExampleComponent {
  constructor(private dialog: MatDialog) {}

  /**
   * Open the dialog to manage PDV Mesas
   * 
   * The dialog provides functionality to:
   * - Create individual mesas with specific settings
   * - Create multiple mesas at once with automatic numbering
   * - Filter and view existing mesas
   * - Update mesa status (active/inactive, reserved/available)
   * - Delete mesas
   */
  openMesasDialog(): void {
    // Open the dialog with 80% width and height
    const dialogRef = this.dialog.open(PdvMesaDialogComponent, {
      width: '80%',
      height: '80%',
      maxWidth: '100vw',
      maxHeight: '100vh',
      data: {} // You can pass data to the dialog if needed
    });

    // Handle the dialog close event if needed
    dialogRef.afterClosed().subscribe(result => {
      console.log('Mesa dialog closed with result:', result);
      // Perform any actions needed after dialog is closed
    });
  }
}

/**
 * To use this component in your app module, add it to your imports:
 * 
 * import { PdvMesaDialogComponent } from './path/to/pdv-mesa-dialog.component';
 * 
 * @NgModule({
 *   declarations: [
 *     AppComponent,
 *     // other components...
 *   ],
 *   imports: [
 *     BrowserModule,
 *     // other modules...
 *     PdvMesaDialogComponent
 *   ],
 *   // ...
 * })
 * export class AppModule { }
 * 
 * Or, if using standalone components, just import directly in your component:
 * 
 * import { PdvMesaDialogComponent } from './path/to/pdv-mesa-dialog.component';
 * 
 * @Component({
 *   selector: 'app-my-component',
 *   standalone: true,
 *   imports: [
 *     // other imports...
 *     PdvMesaDialogComponent
 *   ],
 *   // ...
 * })
 * export class MyComponent { }
 */ 