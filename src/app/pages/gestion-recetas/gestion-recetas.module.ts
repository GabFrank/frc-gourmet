import { NgModule } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Angular Material
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';

// Components
import { GestionRecetasComponent } from './gestion-recetas.component';
import { ListRecetasComponent } from './list-recetas/list-recetas.component';
import { RecetaDetalleComponent } from './receta-detalle/receta-detalle.component';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { RecetaDependenciesDialogComponent } from '../../shared/components/receta-dependencies-dialog/receta-dependencies-dialog.component';
import { IngredienteDialogComponent } from './dialogs/ingrediente-dialog/ingrediente-dialog.component';
import { GenericSearchDialogComponent } from '../../shared/components/generic-search-dialog/generic-search-dialog.component';
import { CreateEditAdicionalDialogComponent } from './dialogs/create-edit-adicional-dialog/create-edit-adicional-dialog.component';
import { VincularRecetaAdicionalDialogComponent } from './dialogs/vincular-receta-adicional-dialog/vincular-receta-adicional-dialog.component';
import { ListAdicionalesComponent } from './list-adicionales/list-adicionales.component';
import { PaginatedDropdownComponent } from '../../shared/components/paginated-dropdown/paginated-dropdown.component';
import { ConfirmarAgregarIngredienteDialogComponent } from './dialogs/confirmar-agregar-ingrediente-dialog/confirmar-agregar-ingrediente-dialog.component';
import { GestionarIngredienteMultiVariacionDialogComponent } from './dialogs/gestionar-ingrediente-multi-variacion-dialog/gestionar-ingrediente-multi-variacion-dialog.component';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { CurrencyInputDirective } from '../../shared/directives/currency-input.directive';

@NgModule({
  declarations: [
    GestionRecetasComponent,
    ListRecetasComponent,
    ListAdicionalesComponent,
    RecetaDetalleComponent,
    IngredienteDialogComponent,
    CreateEditAdicionalDialogComponent,
    VincularRecetaAdicionalDialogComponent,
    PaginatedDropdownComponent,
    ConfirmarAgregarIngredienteDialogComponent,
    GestionarIngredienteMultiVariacionDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ConfirmationDialogComponent,
    RecetaDependenciesDialogComponent,

    // Angular Material
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatCardModule,
    MatTabsModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatExpansionModule,
    MatDividerModule,
    MatListModule,
    MatBadgeModule,
    MatMenuModule,
    MatProgressBarModule,
    HasPermissionDirective,
    CurrencyInputDirective,
  ],
  providers: [CurrencyPipe]
})
export class GestionRecetasModule { }
