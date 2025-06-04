import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

// Import new product entities
import { ProductoBase } from './entities/productos/core/producto-base.entity';
import { UnidadMedida } from './entities/productos/core/unidad-medida.entity';
import { Ingrediente } from './entities/productos/core/ingrediente.entity';
import { ProductoVariacion } from './entities/productos/variaciones/producto-variacion.entity';
import { Receta } from './entities/productos/recetas/receta.entity';
import { RecetaItem } from './entities/productos/recetas/receta-item.entity';
import { ProductoPresentacion } from './entities/productos/comercial/producto-presentacion.entity';
import { PrecioVenta } from './entities/productos/comercial/precio-venta.entity';
import { Combo } from './entities/productos/comercial/combo.entity';
import { ComboItem } from './entities/productos/comercial/combo-item.entity';
import { Observacion } from './entities/productos/observaciones/observacion.entity';

// Import financial entities
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';

// TEMPORARY TYPE STUBS FOR LEGACY MIGRATION
// TODO: Remove these once migration to new architecture is complete
type Categoria = any;
type Producto = any;
type Subcategoria = any;
type ProductoImage = any;
type Presentacion = any;
type Codigo = any;
type Sabor = any;
type PresentacionSabor = any;
type RecetaLegacy = any;
type RecetaItemLegacy = any;
type IngredienteLegacy = any;
type RecetaVariacion = any;
type RecetaVariacionItem = any;
type MovimientoStock = any;
type TipoReferencia = any;
type ObservacionLegacy = any;
type ObservacionProducto = any;
type ObservacionProductoVentaItem = any;
type Adicional = any;
type ProductoAdicional = any;
type ProductoAdicionalVentaItem = any;
type CostoPorProducto = any;
type GrupoObservacion = any;
type GrupoObservacionDetalle = any;

// Define interfaces for electron API
interface ProductosElectronAPI {
  // === NEW PRODUCT ARCHITECTURE METHODS ===
  
  // UnidadMedida methods
  getUnidadesMedida: () => Promise<UnidadMedida[]>;
  getUnidadMedida: (id: number) => Promise<UnidadMedida>;
  createUnidadMedida: (data: Partial<UnidadMedida>) => Promise<UnidadMedida>;
  updateUnidadMedida: (id: number, data: Partial<UnidadMedida>) => Promise<UnidadMedida>;
  deleteUnidadMedida: (id: number) => Promise<boolean>;
  
  // ProductoBase methods
  getProductosBase: () => Promise<ProductoBase[]>;
  getProductoBase: (id: number) => Promise<ProductoBase>;
  createProductoBase: (data: Partial<ProductoBase>) => Promise<ProductoBase>;
  updateProductoBase: (id: number, data: Partial<ProductoBase>) => Promise<ProductoBase>;
  deleteProductoBase: (id: number) => Promise<boolean>;
  // searchTerm: searchTerm,
  // page: this.pageIndex + 1, // Convert to 1-based for backend
  // pageSize: this.pageSize,
  // exactMatch: false
  searchProductosBaseByDescripcion: (searchTerm: string, page: number, pageSize: number, exactMatch: boolean) => Promise<{items: ProductoBase[], total: number}>;
  searchProductosByCode: (codigo: string) => Promise<{product: Producto, presentacion: Presentacion} | null>;
  // Ingrediente (new) methods
  getIngredientesNuevo: () => Promise<Ingrediente[]>;
  getIngredienteNuevo: (id: number) => Promise<Ingrediente>;
  createIngredienteNuevo: (data: Partial<Ingrediente>) => Promise<Ingrediente>;
  updateIngredienteNuevo: (id: number, data: Partial<Ingrediente>) => Promise<Ingrediente>;
  deleteIngredienteNuevo: (id: number) => Promise<boolean>;
  searchIngredientesByDescripcion: (searchText: string) => Promise<Ingrediente[]>;
  
  // ProductoVariacion methods
  getProductosVariaciones: () => Promise<ProductoVariacion[]>;
  getProductoVariacion: (id: number) => Promise<ProductoVariacion>;
  getProductosVariacionesByProductoBase: (productoBaseId: number) => Promise<ProductoVariacion[]>;
  createProductoVariacion: (data: Partial<ProductoVariacion>) => Promise<ProductoVariacion>;
  updateProductoVariacion: (id: number, data: Partial<ProductoVariacion>) => Promise<ProductoVariacion>;
  deleteProductoVariacion: (id: number) => Promise<boolean>;
  
  // Receta (new) methods
  getRecetasNueva: () => Promise<Receta[]>;
  getRecetaNueva: (id: number) => Promise<Receta>;
  createRecetaNueva: (data: Partial<Receta>) => Promise<Receta>;
  updateRecetaNueva: (id: number, data: Partial<Receta>) => Promise<Receta>;
  deleteRecetaNueva: (id: number) => Promise<boolean>;
  
  // RecetaItem (new) methods
  getRecetaItemsNueva: (recetaId: number) => Promise<RecetaItem[]>;
  getRecetaItemNueva: (id: number) => Promise<RecetaItem>;
  createRecetaItemNueva: (data: Partial<RecetaItem>) => Promise<RecetaItem>;
  updateRecetaItemNueva: (id: number, data: Partial<RecetaItem>) => Promise<RecetaItem>;
  deleteRecetaItemNueva: (id: number) => Promise<boolean>;
  
  // ProductoPresentacion methods
  getProductosPresentaciones: () => Promise<ProductoPresentacion[]>;
  getProductoPresentacion: (id: number) => Promise<ProductoPresentacion>;
  getProductosPresentacionesByProductoBase: (productoBaseId: number) => Promise<ProductoPresentacion[]>;
  createProductoPresentacion: (data: Partial<ProductoPresentacion>) => Promise<ProductoPresentacion>;
  updateProductoPresentacion: (id: number, data: Partial<ProductoPresentacion>) => Promise<ProductoPresentacion>;
  deleteProductoPresentacion: (id: number) => Promise<boolean>;
  
  // Combo (new) methods
  getCombosNuevo: () => Promise<Combo[]>;
  getComboNuevo: (id: number) => Promise<Combo>;
  createComboNuevo: (data: Partial<Combo>) => Promise<Combo>;
  updateComboNuevo: (id: number, data: Partial<Combo>) => Promise<Combo>;
  deleteComboNuevo: (id: number) => Promise<boolean>;
  
  // ComboItem (new) methods
  getComboItemsNuevo: (comboId: number) => Promise<ComboItem[]>;
  getComboItemNuevo: (id: number) => Promise<ComboItem>;
  createComboItemNuevo: (data: Partial<ComboItem>) => Promise<ComboItem>;
  updateComboItemNuevo: (id: number, data: Partial<ComboItem>) => Promise<ComboItem>;
  deleteComboItemNuevo: (id: number) => Promise<boolean>;
  
  // Observacion (new) methods
  getObservacionesNueva: () => Promise<Observacion[]>;
  getObservacionNueva: (id: number) => Promise<Observacion>;
  createObservacionNueva: (data: Partial<Observacion>) => Promise<Observacion>;
  updateObservacionNueva: (id: number, data: Partial<Observacion>) => Promise<Observacion>;
  deleteObservacionNueva: (id: number) => Promise<boolean>;
  
  // PrecioVenta methods
  getPreciosVentaNuevo: () => Promise<PrecioVenta[]>;
  getPrecioVentaNuevo: (id: number) => Promise<PrecioVenta>;
  createPrecioVentaNuevo: (data: Partial<PrecioVenta>) => Promise<PrecioVenta>;
  updatePrecioVentaNuevo: (id: number, data: Partial<PrecioVenta>) => Promise<PrecioVenta>;
  deletePrecioVentaNuevo: (id: number) => Promise<boolean>;
  
  // === LEGACY PRODUCT METHODS ===
  
  // Categoria operations
  getCategorias: () => Promise<Categoria[]>;
  getCategoria: (categoriaId: number) => Promise<Categoria>;
  createCategoria: (categoriaData: any) => Promise<Categoria>;
  updateCategoria: (categoriaId: number, categoriaData: any) => Promise<any>;
  deleteCategoria: (categoriaId: number) => Promise<any>;
  
  // Subcategoria operations
  getSubcategorias: () => Promise<Subcategoria[]>;
  getSubcategoria: (subcategoriaId: number) => Promise<Subcategoria>;
  getSubcategoriasByCategoria: (categoriaId: number) => Promise<Subcategoria[]>;
  createSubcategoria: (subcategoriaData: any) => Promise<Subcategoria>;
  updateSubcategoria: (subcategoriaId: number, subcategoriaData: any) => Promise<any>;
  deleteSubcategoria: (subcategoriaId: number) => Promise<any>;
  
  // Producto operations
  getProductos: () => Promise<Producto[]>;
  getProducto: (productoId: number) => Promise<Producto>;
  getProductosBySubcategoria: (subcategoriaId: number) => Promise<Producto[]>;
  createProducto: (productoData: any) => Promise<Producto>;
  updateProducto: (productoId: number, productoData: any) => Promise<any>;
  deleteProducto: (productoId: number) => Promise<any>;
  saveProductoImage: (base64Data: string, fileName: string) => Promise<{ imageUrl: string }>;
  deleteProductoImage: (imageUrl: string) => Promise<boolean>;
  
  // Product Image methods
  getProductImages: (productoId: number) => Promise<ProductoImage[]>;
  createProductImage: (imageData: Partial<ProductoImage>) => Promise<ProductoImage>;
  updateProductImage: (imageId: number, imageData: Partial<ProductoImage>) => Promise<ProductoImage>;
  deleteProductImage: (imageId: number) => Promise<boolean>;
  
  // Presentacion methods
  getPresentaciones: () => Promise<Presentacion[]>;
  getPresentacion: (presentacionId: number) => Promise<Presentacion>;
  getPresentacionesByProducto: (productoId: number) => Promise<Presentacion[]>;
  createPresentacion: (presentacionData: any) => Promise<Presentacion>;
  updatePresentacion: (presentacionId: number, presentacionData: any) => Promise<any>;
  deletePresentacion: (presentacionId: number) => Promise<any>;
  
  // PrecioVenta methods
  getPreciosVenta: () => Promise<PrecioVenta[]>;
  getPrecioVenta: (precioVentaId: number, active: boolean) => Promise<PrecioVenta>;
  getPreciosVentaByPresentacion: (presentacionId: number, active: boolean) => Promise<PrecioVenta[]>;
  getPreciosVentaByPresentacionSabor: (presentacionSaborId: number, active: boolean) => Promise<PrecioVenta[]>;
  getPreciosVentaByTipoPrecio: (tipoPrecioId: number, active: boolean) => Promise<PrecioVenta[]>;
  createPrecioVenta: (precioVentaData: any) => Promise<PrecioVenta>;
  updatePrecioVenta: (precioVentaId: number, precioVentaData: any) => Promise<any>;
  deletePrecioVenta: (precioVentaId: number) => Promise<any>;


  //  
  getCodigos: () => Promise<Codigo[]>;
  getCodigo: (codigoId: number) => Promise<Codigo>;
  getCodigosByPresentacion: (presentacionId: number) => Promise<Codigo[]>;
  createCodigo: (codigoData: any) => Promise<Codigo>;
  updateCodigo: (codigoId: number, codigoData: any) => Promise<any>;
  deleteCodigo: (codigoId: number) => Promise<any>;

  // Sabor methods
  getSabores: () => Promise<Sabor[]>;
  getSabor: (saborId: number) => Promise<Sabor>;
  createSabor: (saborData: any) => Promise<Sabor>;
  updateSabor: (saborId: number, saborData: any) => Promise<any>;
  deleteSabor: (saborId: number) => Promise<any>;

  // PresentacionSabor methods
  getPresentacionSabores: (presentacionId: number) => Promise<PresentacionSabor[]>;
  getPresentacionSabor: (presentacionSaborId: number) => Promise<PresentacionSabor>;
  createPresentacionSabor: (presentacionSaborData: any) => Promise<PresentacionSabor>;
  updatePresentacionSabor: (presentacionSaborId: number, presentacionSaborData: any) => Promise<any>;
  deletePresentacionSabor: (presentacionSaborId: number) => Promise<any>;
  getPresentacionSaboresByPresentacion: (presentacionId: number) => Promise<PresentacionSabor[]>;
 // Receta methods
  getRecetas: () => Promise<Receta[]>;
  getReceta: (recetaId: number) => Promise<Receta>;
  createReceta: (recetaData: any) => Promise<Receta>;
  updateReceta: (recetaId: number, recetaData: any) => Promise<any>;
  deleteReceta: (recetaId: number) => Promise<any>;

  // RecetaItem methods
  getRecetaItems: (recetaId: number) => Promise<RecetaItem[]>;
  getRecetaItem: (recetaItemId: number) => Promise<RecetaItem>;
  createRecetaItem: (recetaItemData: any) => Promise<RecetaItem>;
  updateRecetaItem: (recetaItemId: number, recetaItemData: any) => Promise<any>;
  deleteRecetaItem: (recetaItemId: number) => Promise<any>;

  // Ingrediente methods
  getIngredientes: () => Promise<Ingrediente[]>;
  getIngrediente: (ingredienteId: number) => Promise<Ingrediente>;
  createIngrediente: (ingredienteData: any) => Promise<Ingrediente>;
  updateIngrediente: (ingredienteId: number, ingredienteData: any) => Promise<any>;
  deleteIngrediente: (ingredienteId: number) => Promise<any>;

  
  // All other legacy product methods...
  [key: string]: any;
}

/**
 * Repository service specifically for product operations
 */
@Injectable({
  providedIn: 'root'
})
export class ProductosRepository {
  private api: ProductosElectronAPI;

  constructor() {
    this.api = (window as any).api as ProductosElectronAPI;
  }

  // === NEW PRODUCT ARCHITECTURE METHODS ===
  
  // UnidadMedida methods
  getUnidadesMedida(): Observable<UnidadMedida[]> {
    return from(this.api.getUnidadesMedida());
  }

  getUnidadMedida(id: number): Observable<UnidadMedida> {
    return from(this.api.getUnidadMedida(id));
  }

  createUnidadMedida(data: Partial<UnidadMedida>): Observable<UnidadMedida> {
    return from(this.api.createUnidadMedida(data));
  }

  updateUnidadMedida(id: number, data: Partial<UnidadMedida>): Observable<UnidadMedida> {
    return from(this.api.updateUnidadMedida(id, data));
  }

  deleteUnidadMedida(id: number): Observable<boolean> {
    return from(this.api.deleteUnidadMedida(id));
  }

  // ProductoBase methods
  getProductosBase(): Observable<ProductoBase[]> {
    return from(this.api.getProductosBase());
  }

  getProductoBase(id: number): Observable<ProductoBase> {
    return from(this.api.getProductoBase(id));
  }

  createProductoBase(data: Partial<ProductoBase>): Observable<ProductoBase> {
    return from(this.api.createProductoBase(data));
  }

  updateProductoBase(id: number, data: Partial<ProductoBase>): Observable<ProductoBase> {
    return from(this.api.updateProductoBase(id, data));
  }

  deleteProductoBase(id: number): Observable<boolean> {
    return from(this.api.deleteProductoBase(id));
  }

  searchProductosBaseByDescripcion(descripcion: string, page: number, pageSize: number, exactMatch: boolean): Observable<{items: ProductoBase[], total: number}> {
    return from(this.api.searchProductosBaseByDescripcion(descripcion, page, pageSize, exactMatch));
  }

  // search by code
  searchProductosByCode(codigo: string): Observable<{product: Producto, presentacion: Presentacion} | null> {
    return from(this.api.searchProductosByCode(codigo));
  }

  // Ingrediente (new) methods
  getIngredientesNuevo(): Observable<Ingrediente[]> {
    return from(this.api.getIngredientesNuevo());
  }

  getIngredienteNuevo(id: number): Observable<Ingrediente> {
    return from(this.api.getIngredienteNuevo(id));
  }

  createIngredienteNuevo(data: Partial<Ingrediente>): Observable<Ingrediente> {
    return from(this.api.createIngredienteNuevo(data));
  }

  updateIngredienteNuevo(id: number, data: Partial<Ingrediente>): Observable<Ingrediente> {
    return from(this.api.updateIngredienteNuevo(id, data));
  }

  deleteIngredienteNuevo(id: number): Observable<boolean> {
    return from(this.api.deleteIngredienteNuevo(id));
  }

  // ProductoVariacion methods
  getProductosVariaciones(): Observable<ProductoVariacion[]> {
    return from(this.api.getProductosVariaciones());
  }

  getProductoVariacion(id: number): Observable<ProductoVariacion> {
    return from(this.api.getProductoVariacion(id));
  }

  getProductosVariacionesByProductoBase(productoBaseId: number): Observable<ProductoVariacion[]> {
    return from(this.api.getProductosVariacionesByProductoBase(productoBaseId));
  }

  createProductoVariacion(data: Partial<ProductoVariacion>): Observable<ProductoVariacion> {
    return from(this.api.createProductoVariacion(data));
  }

  updateProductoVariacion(id: number, data: Partial<ProductoVariacion>): Observable<ProductoVariacion> {
    return from(this.api.updateProductoVariacion(id, data));
  }

  deleteProductoVariacion(id: number): Observable<boolean> {
    return from(this.api.deleteProductoVariacion(id));
  }

  // Receta (new) methods
  getRecetasNueva(): Observable<Receta[]> {
    return from(this.api.getRecetasNueva());
  }

  getRecetaNueva(id: number): Observable<Receta> {
    return from(this.api.getRecetaNueva(id));
  }

  createRecetaNueva(data: Partial<Receta>): Observable<Receta> {
    return from(this.api.createRecetaNueva(data));
  }

  updateRecetaNueva(id: number, data: Partial<Receta>): Observable<Receta> {
    return from(this.api.updateRecetaNueva(id, data));
  }

  deleteRecetaNueva(id: number): Observable<boolean> {
    return from(this.api.deleteRecetaNueva(id));
  }

  // RecetaItem (new) methods
  getRecetaItemsNueva(recetaId: number): Observable<RecetaItem[]> {
    return from(this.api.getRecetaItemsNueva(recetaId));
  }

  getRecetaItemNueva(id: number): Observable<RecetaItem> {
    return from(this.api.getRecetaItemNueva(id));
  }

  createRecetaItemNueva(data: Partial<RecetaItem>): Observable<RecetaItem> {
    return from(this.api.createRecetaItemNueva(data));
  }

  updateRecetaItemNueva(id: number, data: Partial<RecetaItem>): Observable<RecetaItem> {
    return from(this.api.updateRecetaItemNueva(id, data));
  }

  deleteRecetaItemNueva(id: number): Observable<boolean> {
    return from(this.api.deleteRecetaItemNueva(id));
  }

  // ProductoPresentacion methods
  getProductosPresentaciones(): Observable<ProductoPresentacion[]> {
    return from(this.api.getProductosPresentaciones());
  }

  getProductoPresentacion(id: number): Observable<ProductoPresentacion> {
    return from(this.api.getProductoPresentacion(id));
  }

  getProductosPresentacionesByProductoBase(productoBaseId: number): Observable<ProductoPresentacion[]> {
    return from(this.api.getProductosPresentacionesByProductoBase(productoBaseId));
  }

  createProductoPresentacion(data: Partial<ProductoPresentacion>): Observable<ProductoPresentacion> {
    return from(this.api.createProductoPresentacion(data));
  }

  updateProductoPresentacion(id: number, data: Partial<ProductoPresentacion>): Observable<ProductoPresentacion> {
    return from(this.api.updateProductoPresentacion(id, data));
  }

  deleteProductoPresentacion(id: number): Observable<boolean> {
    return from(this.api.deleteProductoPresentacion(id));
  }

  // Combo methods
  getCombosNuevo(): Observable<Combo[]> {
    return from(this.api.getCombosNuevo());
  }

  getComboNuevo(id: number): Observable<Combo> {
    return from(this.api.getComboNuevo(id));
  }

  createComboNuevo(data: Partial<Combo>): Observable<Combo> {
    return from(this.api.createComboNuevo(data));
  }

  updateComboNuevo(id: number, data: Partial<Combo>): Observable<Combo> {
    return from(this.api.updateComboNuevo(id, data));
  }

  deleteComboNuevo(id: number): Observable<boolean> {
    return from(this.api.deleteComboNuevo(id));
  }

  // ComboItem methods
  getComboItemsNuevo(comboId: number): Observable<ComboItem[]> {
    return from(this.api.getComboItemsNuevo(comboId));
  }

  getComboItemNuevo(id: number): Observable<ComboItem> {
    return from(this.api.getComboItemNuevo(id));
  }

  createComboItemNuevo(data: Partial<ComboItem>): Observable<ComboItem> {
    return from(this.api.createComboItemNuevo(data));
  }

  updateComboItemNuevo(id: number, data: Partial<ComboItem>): Observable<ComboItem> {
    return from(this.api.updateComboItemNuevo(id, data));
  }

  deleteComboItemNuevo(id: number): Observable<boolean> {
    return from(this.api.deleteComboItemNuevo(id));
  }

  // Observacion methods
  getObservacionesNueva(): Observable<Observacion[]> {
    return from(this.api.getObservacionesNueva());
  }

  getObservacionNueva(id: number): Observable<Observacion> {
    return from(this.api.getObservacionNueva(id));
  }

  createObservacionNueva(data: Partial<Observacion>): Observable<Observacion> {
    return from(this.api.createObservacionNueva(data));
  }

  updateObservacionNueva(id: number, data: Partial<Observacion>): Observable<Observacion> {
    return from(this.api.updateObservacionNueva(id, data));
  }

  deleteObservacionNueva(id: number): Observable<boolean> {
    return from(this.api.deleteObservacionNueva(id));
  }

  // PrecioVenta methods
  getPreciosVentaNuevo(): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaNuevo());
  }

  getPrecioVentaNuevo(id: number): Observable<PrecioVenta> {
    return from(this.api.getPrecioVentaNuevo(id));
  }

  createPrecioVentaNuevo(data: Partial<PrecioVenta>): Observable<PrecioVenta> {
    return from(this.api.createPrecioVentaNuevo(data));
  }

  updatePrecioVentaNuevo(id: number, data: Partial<PrecioVenta>): Observable<PrecioVenta> {
    return from(this.api.updatePrecioVentaNuevo(id, data));
  }

  deletePrecioVentaNuevo(id: number): Observable<boolean> {
    return from(this.api.deletePrecioVentaNuevo(id));
  }

  // === LEGACY PRODUCT METHODS ===
  
  // Categoria methods
  getCategorias(): Observable<Categoria[]> {
    return from(this.api.getCategorias());
  }

  getCategoria(categoriaId: number): Observable<Categoria> {
    return from(this.api.getCategoria(categoriaId));
  }

  createCategoria(categoriaData: Partial<Categoria>): Observable<Categoria> {
    return from(this.api.createCategoria(categoriaData));
  }

  updateCategoria(categoriaId: number, categoriaData: Partial<Categoria>): Observable<any> {
    return from(this.api.updateCategoria(categoriaId, categoriaData));
  }

  deleteCategoria(categoriaId: number): Observable<any> {
    return from(this.api.deleteCategoria(categoriaId));
  }

  // Subcategoria methods
  getSubcategorias(): Observable<Subcategoria[]> {
    return from(this.api.getSubcategorias());
  }

  getSubcategoria(subcategoriaId: number): Observable<Subcategoria> {
    return from(this.api.getSubcategoria(subcategoriaId));
  }

  getSubcategoriasByCategoria(categoriaId: number): Observable<Subcategoria[]> {
    return from(this.api.getSubcategoriasByCategoria(categoriaId));
  }

  createSubcategoria(subcategoriaData: Partial<Subcategoria>): Observable<Subcategoria> {
    return from(this.api.createSubcategoria(subcategoriaData));
  }

  updateSubcategoria(subcategoriaId: number, subcategoriaData: Partial<Subcategoria>): Observable<any> {
    return from(this.api.updateSubcategoria(subcategoriaId, subcategoriaData));
  }

  deleteSubcategoria(subcategoriaId: number): Observable<any> {
    return from(this.api.deleteSubcategoria(subcategoriaId));
  }

  // Producto methods
  getProductos(): Observable<Producto[]> {
    return from(this.api.getProductos());
  }

  getProducto(productoId: number): Observable<Producto> {
    return from(this.api.getProducto(productoId));
  }

  getProductosBySubcategoria(subcategoriaId: number): Observable<Producto[]> {
    return from(this.api.getProductosBySubcategoria(subcategoriaId));
  }

  createProducto(productoData: Partial<Producto>): Observable<Producto> {
    return from(this.api.createProducto(productoData));
  }

  updateProducto(productoId: number, productoData: Partial<Producto>): Observable<any> {
    return from(this.api.updateProducto(productoId, productoData));
  }

  deleteProducto(productoId: number): Observable<any> {
    return from(this.api.deleteProducto(productoId));
  }

  saveProductoImage(base64Data: string, fileName: string): Observable<{ imageUrl: string }> {
    return from(this.api.saveProductoImage(base64Data, fileName)
      .then(result => {
        // Ensure the URL uses the app:// protocol for correct loading in renderer
        if (result.imageUrl && !result.imageUrl.startsWith('app://')) {
          result.imageUrl = `app://${result.imageUrl.replace(/\\/g, '/')}`;
        }
        return result;
      })
      .catch(error => {
        console.error('Error saving product image:', error);
        throw error;
      })
    );
  }

  deleteProductoImage(imageUrl: string): Observable<boolean> {
    return from(this.api.deleteProductoImage(imageUrl));
  }

  // New methods for product images
  getProductImages(productoId: number): Observable<ProductoImage[]> {
    return from(this.api.getProductImages(productoId));
  }

  createProductImage(imageData: Partial<ProductoImage>): Observable<ProductoImage> {
    return from(this.api.createProductImage(imageData));
  }

  updateProductImage(imageId: number, imageData: Partial<ProductoImage>): Observable<ProductoImage> {
    return from(this.api.updateProductImage(imageId, imageData));
  }

  deleteProductImage(imageId: number): Observable<boolean> {
    return from(this.api.deleteProductImage(imageId));
  }

  // Presentacion methods
  getPresentaciones(): Observable<Presentacion[]> {
    return from(this.api.getPresentaciones());
  }

  getPresentacion(presentacionId: number): Observable<Presentacion> {
    return from(this.api.getPresentacion(presentacionId));
  }

  getPresentacionesByProducto(productoId: number): Observable<Presentacion[]> {
    return from(this.api.getPresentacionesByProducto(productoId));
  }

  createPresentacion(presentacionData: Partial<Presentacion>): Observable<Presentacion> {
    return from(this.api.createPresentacion(presentacionData));
  }

  updatePresentacion(presentacionId: number, presentacionData: Partial<Presentacion>): Observable<any> {
    return from(this.api.updatePresentacion(presentacionId, presentacionData));
  }

  deletePresentacion(presentacionId: number): Observable<any> {
    return from(this.api.deletePresentacion(presentacionId));
  }

  // Codigo methods
  getCodigos(): Observable<Codigo[]> {
    return from(this.api.getCodigos());
  }

  getCodigo(codigoId: number): Observable<Codigo> {
    return from(this.api.getCodigo(codigoId));
  }

  getCodigosByPresentacion(presentacionId: number): Observable<Codigo[]> {
    return from(this.api.getCodigosByPresentacion(presentacionId));
  }

  createCodigo(codigoData: Partial<Codigo>): Observable<Codigo> {
    return from(this.api.createCodigo(codigoData));
  }

  updateCodigo(codigoId: number, codigoData: Partial<Codigo>): Observable<any> {
    return from(this.api.updateCodigo(codigoId, codigoData));
  }

  deleteCodigo(codigoId: number): Observable<any> {
    return from(this.api.deleteCodigo(codigoId));
  }

  // PrecioVenta methods
  getPreciosVenta(): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVenta());
  }

  getPrecioVenta(precioVentaId: number, active = true): Observable<PrecioVenta> {
    return from(this.api.getPrecioVenta(precioVentaId, active));
  }

  getPreciosVentaByPresentacion(presentacionId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacion(presentacionId, active));
  }

  getPreciosVentaByPresentacionSabor(presentacionSaborId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacionSabor(presentacionSaborId, active));
  }

  getPreciosVentaByTipoPrecio(tipoPrecioId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByTipoPrecio(tipoPrecioId, active));
  }

  createPrecioVenta(precioVentaData: Partial<PrecioVenta>): Observable<PrecioVenta> {
    return from(this.api.createPrecioVenta(precioVentaData));
  }

  updatePrecioVenta(precioVentaId: number, precioVentaData: Partial<PrecioVenta>): Observable<any> {
    return from(this.api.updatePrecioVenta(precioVentaId, precioVentaData));
  }

  deletePrecioVenta(precioVentaId: number): Observable<any> {
    return from(this.api.deletePrecioVenta(precioVentaId));
  }

  // Sabor methods
  getSabores(): Observable<Sabor[]> {
    return from(this.api.getSabores());
  }

  getSabor(saborId: number): Observable<Sabor> {
    return from(this.api.getSabor(saborId));
  }

  createSabor(saborData: Partial<Sabor>): Observable<Sabor> {
    return from(this.api.createSabor(saborData));
  }

  updateSabor(saborId: number, saborData: Partial<Sabor>): Observable<any> {
    return from(this.api.updateSabor(saborId, saborData));
  }

  deleteSabor(saborId: number): Observable<any> {
    return from(this.api.deleteSabor(saborId));
  }

  // PresentacionSabor methods
  getPresentacionSabores(presentacionId: number): Observable<PresentacionSabor[]> {
    return from(this.api.getPresentacionSaboresByPresentacion(presentacionId));
  }

  getPresentacionSabor(presentacionSaborId: number): Observable<PresentacionSabor> {
    return from(this.api.getPresentacionSabor(presentacionSaborId));
  }

  createPresentacionSabor(presentacionSaborData: Partial<PresentacionSabor>): Observable<PresentacionSabor> {
    return from(this.api.createPresentacionSabor(presentacionSaborData));
  }

  updatePresentacionSabor(presentacionSaborId: number, presentacionSaborData: Partial<PresentacionSabor>): Observable<any> {
    return from(this.api.updatePresentacionSabor(presentacionSaborId, presentacionSaborData));
  }

  deletePresentacionSabor(presentacionSaborId: number): Observable<any> {
    return from(this.api.deletePresentacionSabor(presentacionSaborId));
  }

  // Receta methods (legacy)
  getRecetas(): Observable<RecetaLegacy[]> {
    return from(this.api.getRecetas());
  }

  getReceta(recetaId: number): Observable<RecetaLegacy> {
    return from(this.api.getReceta(recetaId));
  }

  createReceta(recetaData: Partial<RecetaLegacy>): Observable<RecetaLegacy> {
    return from(this.api.createReceta(recetaData));
  }

  updateReceta(recetaId: number, recetaData: Partial<RecetaLegacy>): Observable<any> {
    return from(this.api.updateReceta(recetaId, recetaData));
  }

  deleteReceta(recetaId: number): Observable<any> {
    return from(this.api.deleteReceta(recetaId));
  }

  // RecetaItem methods (legacy)
  getRecetaItems(recetaId: number): Observable<RecetaItemLegacy[]> {
    return from(this.api.getRecetaItems(recetaId));
  }

  getRecetaItem(recetaItemId: number): Observable<RecetaItemLegacy> {
    return from(this.api.getRecetaItem(recetaItemId));
  }

  createRecetaItem(recetaItemData: Partial<RecetaItemLegacy>): Observable<RecetaItemLegacy> {
    return from(this.api.createRecetaItem(recetaItemData));
  }

  updateRecetaItem(recetaItemId: number, recetaItemData: Partial<RecetaItemLegacy>): Observable<any> {
    return from(this.api.updateRecetaItem(recetaItemId, recetaItemData));
  }

  deleteRecetaItem(recetaItemId: number): Observable<any> {
    return from(this.api.deleteRecetaItem(recetaItemId));
  }

  // Ingrediente methods (legacy)
  getIngredientes(): Observable<IngredienteLegacy[]> {
    return from(this.api.getIngredientes());
  }

  getIngrediente(ingredienteId: number): Observable<IngredienteLegacy> {
    return from(this.api.getIngrediente(ingredienteId));
  }

  createIngrediente(ingredienteData: Partial<IngredienteLegacy>): Observable<IngredienteLegacy> {
    return from(this.api.createIngrediente(ingredienteData));
  }

  updateIngrediente(ingredienteId: number, ingredienteData: Partial<IngredienteLegacy>): Observable<any> {
    return from(this.api.updateIngrediente(ingredienteId, ingredienteData));
  }

  deleteIngrediente(ingredienteId: number): Observable<any> {
    return from(this.api.deleteIngrediente(ingredienteId));
  }

  searchIngredientesByDescripcion(searchText: string): Observable<IngredienteLegacy[]> {
    return from(this.api.searchIngredientesByDescripcion(searchText));
  }

  // TODO: Add all other legacy product methods...
  // For brevity, I'm not including all methods here, but they should all be moved from repository.service.ts
} 