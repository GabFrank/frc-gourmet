import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NgxCurrencyModule } from 'ngx-currency';

// Angular Material Imports
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { PaginatorIntlEs } from './shared/utils/paginator-intl-es';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AppRoutingModule } from './app-routing.module';

// Tab navigation components
import { TabContainerComponent } from './components/tab-container/tab-container.component';

// Services
import { DatabaseService } from './services/database.service';
import { TabsService } from './services/tabs.service';
import { GestionarProductoComponent } from './pages/productos/gestionar-producto/gestionar-producto.component';
import { ProductoInformacionGeneralComponent } from './pages/productos/gestionar-producto/components/producto-informacion-general/producto-informacion-general.component';
import { ProductoPresentacionesPreciosComponent } from './pages/productos/gestionar-producto/components/producto-presentaciones-precios/producto-presentaciones-precios.component';
import { ProductoPreciosCostoComponent } from './pages/productos/gestionar-producto/components/producto-precios-costo/producto-precios-costo.component';
import { ProductoStockComponent } from './pages/productos/gestionar-producto/components/producto-stock/producto-stock.component';
import { ProductoRecetaComponent } from './pages/productos/gestionar-producto/components/producto-receta/producto-receta.component';
import { ProductoResumenComponent } from './pages/productos/gestionar-producto/components/producto-resumen/producto-resumen.component';
import { ProductoPreciosVentaComponent } from './pages/productos/gestionar-producto/components/producto-precios-venta/producto-precios-venta.component';
// Nuevos componentes de variaciones/sabores
import { ProductoSaboresComponent } from './pages/productos/gestionar-producto/components/producto-sabores/producto-sabores.component';
import { ProductoComboComponent } from './pages/productos/gestionar-producto/components/producto-combo/producto-combo.component';
import { ProductoObservacionesComponent } from './pages/productos/gestionar-producto/components/producto-observaciones/producto-observaciones.component';

import { SaborDialogComponent } from './pages/productos/gestionar-producto/dialogs/sabor-dialog/sabor-dialog.component';
import { VariacionDialogComponent } from './pages/productos/gestionar-producto/dialogs/variacion-dialog/variacion-dialog.component';
import { PrecioVentaDialogComponent } from './pages/productos/gestionar-producto/components/precio-venta-dialog/precio-venta-dialog.component';

// Gestion Recetas Module
import { GestionRecetasModule } from './pages/gestion-recetas/gestion-recetas.module';

// Shared directives standalone
import { CurrencyInputDirective } from './shared/directives/currency-input.directive';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    NgxCurrencyModule,
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatCardModule,
    MatGridListModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDialogModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatStepperModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatBadgeModule,
    MatDividerModule,
    MatTabsModule,
    MatCheckboxModule,
    MatRadioModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatChipsModule,
    MatProgressBarModule,
    AppRoutingModule,
    TabContainerComponent,
    GestionRecetasModule,
    CurrencyInputDirective,
  ],
  declarations: [
    // No declarations since all components are standalone

    GestionarProductoComponent,
    ProductoInformacionGeneralComponent,
    ProductoPresentacionesPreciosComponent,
    ProductoPreciosCostoComponent,
    ProductoStockComponent,
    ProductoRecetaComponent,
    ProductoResumenComponent,
    ProductoPreciosVentaComponent,
    // Declaraciones nuevas
    ProductoSaboresComponent,
    ProductoComboComponent,
    ProductoObservacionesComponent,
    SaborDialogComponent,
    VariacionDialogComponent,
    PrecioVentaDialogComponent
  ],
  providers: [
    DatabaseService,
    DatePipe,
    TabsService,
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        subscriptSizing: 'dynamic'
      }
    },
    { provide: MatPaginatorIntl, useClass: PaginatorIntlEs }
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule { }
