"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Preload script that will be executed before rendering the application
const { contextBridge, ipcRenderer } = require('electron');
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
    // Database operations
    getCategories: async () => {
        return await ipcRenderer.invoke('get-categories');
    },
    getProducts: async () => {
        return await ipcRenderer.invoke('get-products');
    },
    getProductsByCategory: async (categoryId) => {
        return await ipcRenderer.invoke('get-products-by-category', categoryId);
    },
    createProduct: async (productData) => {
        return await ipcRenderer.invoke('create-product', productData);
    },
    updateProduct: async (productId, productData) => {
        return await ipcRenderer.invoke('update-product', productId, productData);
    },
    createOrder: async (orderData) => {
        return await ipcRenderer.invoke('create-order', orderData);
    },
    getOrders: async () => {
        return await ipcRenderer.invoke('get-orders');
    },
    getOrderDetails: async (orderId) => {
        return await ipcRenderer.invoke('get-order-details', orderId);
    },
    updateOrderStatus: async (orderId, status) => {
        return await ipcRenderer.invoke('update-order-status', orderId, status);
    },
    // Persona operations
    getPersonas: async () => {
        return await ipcRenderer.invoke('get-personas');
    },
    getPersona: async (personaId) => {
        return await ipcRenderer.invoke('get-persona', personaId);
    },
    createPersona: async (personaData, currentUserId) => {
        return await ipcRenderer.invoke('create-persona', personaData, currentUserId);
    },
    updatePersona: async (personaId, personaData, currentUserId) => {
        return await ipcRenderer.invoke('update-persona', personaId, personaData, currentUserId);
    },
    deletePersona: async (personaId, currentUserId) => {
        return await ipcRenderer.invoke('delete-persona', personaId, currentUserId);
    },
    // Auth operations
    login: async (loginData) => {
        return await ipcRenderer.invoke('login', loginData);
    },
    logout: async (sessionId) => {
        return await ipcRenderer.invoke('logout', sessionId);
    },
    updateSessionActivity: async (sessionId) => {
        return await ipcRenderer.invoke('updateSessionActivity', sessionId);
    },
    getLoginSessions: async (usuarioId) => {
        return await ipcRenderer.invoke('getLoginSessions', usuarioId);
    },
    getCurrentUser: async () => {
        return await ipcRenderer.invoke('getCurrentUser');
    },
    setCurrentUser: async (usuario) => {
        return await ipcRenderer.invoke('setCurrentUser', usuario);
    },
    // Printer operations
    getPrinters: async () => {
        return await ipcRenderer.invoke('get-printers');
    },
    addPrinter: async (printer) => {
        return await ipcRenderer.invoke('add-printer', printer);
    },
    updatePrinter: async (printerId, printer) => {
        return await ipcRenderer.invoke('update-printer', printerId, printer);
    },
    deletePrinter: async (printerId) => {
        return await ipcRenderer.invoke('delete-printer', printerId);
    },
    printReceipt: async (orderId, printerId) => {
        return await ipcRenderer.invoke('print-receipt', orderId, printerId);
    },
    printTestPage: async (printerId) => {
        return await ipcRenderer.invoke('print-test-page', printerId);
    },
    // Usuario operations
    getUsuarios: async () => {
        return await ipcRenderer.invoke('get-usuarios');
    },
    getUsuario: async (usuarioId) => {
        return await ipcRenderer.invoke('get-usuario', usuarioId);
    },
    createUsuario: async (usuarioData) => {
        return await ipcRenderer.invoke('create-usuario', usuarioData);
    },
    updateUsuario: async (usuarioId, usuarioData) => {
        return await ipcRenderer.invoke('update-usuario', usuarioId, usuarioData);
    },
    deleteUsuario: async (usuarioId) => {
        return await ipcRenderer.invoke('delete-usuario', usuarioId);
    },
    getUsuariosPaginated: async (page, pageSize, filters) => {
        console.log('Preload.ts sending filters:', JSON.stringify(filters));
        return await ipcRenderer.invoke('get-usuarios-paginated', page, pageSize, filters);
    },
    // Role operations
    getRoles: async () => {
        return await ipcRenderer.invoke('get-roles');
    },
    getRole: async (roleId) => {
        return await ipcRenderer.invoke('get-role', roleId);
    },
    createRole: async (roleData) => {
        return await ipcRenderer.invoke('create-role', roleData);
    },
    updateRole: async (roleId, roleData) => {
        return await ipcRenderer.invoke('update-role', roleId, roleData);
    },
    deleteRole: async (roleId) => {
        return await ipcRenderer.invoke('delete-role', roleId);
    },
    // UsuarioRole operations
    getUsuarioRoles: async (usuarioId) => {
        return await ipcRenderer.invoke('get-usuario-roles', usuarioId);
    },
    assignRoleToUsuario: async (usuarioId, roleId) => {
        return await ipcRenderer.invoke('assign-role-to-usuario', usuarioId, roleId);
    },
    removeRoleFromUsuario: async (usuarioRoleId) => {
        return await ipcRenderer.invoke('remove-role-from-usuario', usuarioRoleId);
    },
    // TipoCliente operations
    getTipoClientes: async () => {
        return await ipcRenderer.invoke('get-tipo-clientes');
    },
    getTipoCliente: async (tipoClienteId) => {
        return await ipcRenderer.invoke('get-tipo-cliente', tipoClienteId);
    },
    createTipoCliente: async (tipoClienteData) => {
        return await ipcRenderer.invoke('create-tipo-cliente', tipoClienteData);
    },
    updateTipoCliente: async (tipoClienteId, tipoClienteData) => {
        return await ipcRenderer.invoke('update-tipo-cliente', tipoClienteId, tipoClienteData);
    },
    deleteTipoCliente: async (tipoClienteId) => {
        return await ipcRenderer.invoke('delete-tipo-cliente', tipoClienteId);
    },
    // Cliente operations
    getClientes: async () => {
        return await ipcRenderer.invoke('get-clientes');
    },
    getCliente: async (clienteId) => {
        return await ipcRenderer.invoke('get-cliente', clienteId);
    },
    createCliente: async (clienteData) => {
        return await ipcRenderer.invoke('create-cliente', clienteData);
    },
    updateCliente: async (clienteId, clienteData) => {
        return await ipcRenderer.invoke('update-cliente', clienteId, clienteData);
    },
    deleteCliente: async (clienteId) => {
        return await ipcRenderer.invoke('delete-cliente', clienteId);
    },
    // Profile image operations
    saveProfileImage: async (base64Data, fileName) => {
        return await ipcRenderer.invoke('save-profile-image', { base64Data, fileName });
    },
    deleteProfileImage: async (imageUrl) => {
        return await ipcRenderer.invoke('delete-profile-image', imageUrl);
    },
    // Utility functions
    on: (channel, callback) => {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (_event, data) => callback(data));
    },
    // Categoria operations
    getCategorias: async () => {
        return await ipcRenderer.invoke('getCategorias');
    },
    getCategoria: async (categoriaId) => {
        return await ipcRenderer.invoke('getCategoria', categoriaId);
    },
    createCategoria: async (categoriaData) => {
        return await ipcRenderer.invoke('createCategoria', categoriaData);
    },
    updateCategoria: async (categoriaId, categoriaData) => {
        return await ipcRenderer.invoke('updateCategoria', categoriaId, categoriaData);
    },
    deleteCategoria: async (categoriaId) => {
        return await ipcRenderer.invoke('deleteCategoria', categoriaId);
    },
    // Subcategoria operations
    getSubcategorias: async () => {
        return await ipcRenderer.invoke('getSubcategorias');
    },
    getSubcategoria: async (subcategoriaId) => {
        return await ipcRenderer.invoke('getSubcategoria', subcategoriaId);
    },
    getSubcategoriasByCategoria: async (categoriaId) => {
        return await ipcRenderer.invoke('getSubcategoriasByCategoria', categoriaId);
    },
    createSubcategoria: async (subcategoriaData) => {
        return await ipcRenderer.invoke('createSubcategoria', subcategoriaData);
    },
    updateSubcategoria: async (subcategoriaId, subcategoriaData) => {
        return await ipcRenderer.invoke('updateSubcategoria', subcategoriaId, subcategoriaData);
    },
    deleteSubcategoria: async (subcategoriaId) => {
        return await ipcRenderer.invoke('deleteSubcategoria', subcategoriaId);
    },
    // Producto operations
    getProductos: async () => {
        return await ipcRenderer.invoke('getProductos');
    },
    getProducto: async (productoId) => {
        return await ipcRenderer.invoke('getProducto', productoId);
    },
    getProductosBySubcategoria: async (subcategoriaId) => {
        return await ipcRenderer.invoke('getProductosBySubcategoria', subcategoriaId);
    },
    createProducto: async (productoData) => {
        return await ipcRenderer.invoke('createProducto', productoData);
    },
    updateProducto: async (productoId, productoData) => {
        return await ipcRenderer.invoke('updateProducto', productoId, productoData);
    },
    deleteProducto: async (productoId) => {
        return await ipcRenderer.invoke('deleteProducto', productoId);
    },
    saveProductoImage: async (base64Data, fileName) => {
        return await ipcRenderer.invoke('saveProductoImage', { base64Data, fileName });
    },
    deleteProductoImage: async (imageUrl) => {
        return await ipcRenderer.invoke('deleteProductoImage', imageUrl);
    },
    // Product Image methods
    getProductImages: async (productoId) => {
        return await ipcRenderer.invoke('getProductImages', productoId);
    },
    createProductImage: async (imageData) => {
        return await ipcRenderer.invoke('createProductImage', imageData);
    },
    updateProductImage: async (imageId, imageData) => {
        return await ipcRenderer.invoke('updateProductImage', imageId, imageData);
    },
    deleteProductImage: async (imageId) => {
        return await ipcRenderer.invoke('deleteProductImage', imageId);
    },
    // Presentacion methods
    getPresentaciones: async () => {
        return await ipcRenderer.invoke('getPresentaciones');
    },
    getPresentacion: async (presentacionId) => {
        return await ipcRenderer.invoke('getPresentacion', presentacionId);
    },
    getPresentacionesByProducto: async (productoId) => {
        return await ipcRenderer.invoke('getPresentacionesByProducto', productoId);
    },
    createPresentacion: async (presentacionData) => {
        return await ipcRenderer.invoke('createPresentacion', presentacionData);
    },
    updatePresentacion: async (presentacionId, presentacionData) => {
        return await ipcRenderer.invoke('updatePresentacion', presentacionId, presentacionData);
    },
    deletePresentacion: async (presentacionId) => {
        return await ipcRenderer.invoke('deletePresentacion', presentacionId);
    },
    // Codigo methods
    getCodigos: async () => {
        return await ipcRenderer.invoke('getCodigos');
    },
    getCodigo: async (codigoId) => {
        return await ipcRenderer.invoke('getCodigo', codigoId);
    },
    getCodigosByPresentacion: async (presentacionId) => {
        return await ipcRenderer.invoke('getCodigosByPresentacion', presentacionId);
    },
    createCodigo: async (codigoData) => {
        return await ipcRenderer.invoke('createCodigo', codigoData);
    },
    updateCodigo: async (codigoId, codigoData) => {
        return await ipcRenderer.invoke('updateCodigo', codigoId, codigoData);
    },
    deleteCodigo: async (codigoId) => {
        return await ipcRenderer.invoke('deleteCodigo', codigoId);
    },
    // Moneda methods
    getMonedas: async () => {
        return await ipcRenderer.invoke('getMonedas');
    },
    getMoneda: async (monedaId) => {
        return await ipcRenderer.invoke('getMoneda', monedaId);
    },
    createMoneda: async (monedaData) => {
        return await ipcRenderer.invoke('createMoneda', monedaData);
    },
    updateMoneda: async (monedaId, monedaData) => {
        return await ipcRenderer.invoke('updateMoneda', monedaId, monedaData);
    },
    deleteMoneda: async (monedaId) => {
        return await ipcRenderer.invoke('deleteMoneda', monedaId);
    },
    // TipoPrecio methods
    getTipoPrecios: async () => {
        return await ipcRenderer.invoke('getTipoPrecios');
    },
    getTipoPrecio: async (tipoPrecioId) => {
        return await ipcRenderer.invoke('getTipoPrecio', tipoPrecioId);
    },
    createTipoPrecio: async (tipoPrecioData) => {
        return await ipcRenderer.invoke('createTipoPrecio', tipoPrecioData);
    },
    updateTipoPrecio: async (tipoPrecioId, tipoPrecioData) => {
        return await ipcRenderer.invoke('updateTipoPrecio', tipoPrecioId, tipoPrecioData);
    },
    deleteTipoPrecio: async (tipoPrecioId) => {
        return await ipcRenderer.invoke('deleteTipoPrecio', tipoPrecioId);
    },
    // PrecioVenta methods
    getPreciosVenta: async () => {
        return await ipcRenderer.invoke('getPreciosVenta');
    },
    getPrecioVenta: async (precioVentaId) => {
        return await ipcRenderer.invoke('getPrecioVenta', precioVentaId);
    },
    getPreciosVentaByPresentacion: async (presentacionId) => {
        return await ipcRenderer.invoke('getPreciosVentaByPresentacion', presentacionId);
    },
    createPrecioVenta: async (precioVentaData) => {
        return await ipcRenderer.invoke('createPrecioVenta', precioVentaData);
    },
    updatePrecioVenta: async (precioVentaId, precioVentaData) => {
        return await ipcRenderer.invoke('updatePrecioVenta', precioVentaId, precioVentaData);
    },
    deletePrecioVenta: async (precioVentaId) => {
        return await ipcRenderer.invoke('deletePrecioVenta', precioVentaId);
    },
    // Sabor methods
    getSabores: async () => {
        return await ipcRenderer.invoke('getSabores');
    },
    getSabor: async (saborId) => {
        return await ipcRenderer.invoke('getSabor', saborId);
    },
    createSabor: async (saborData) => {
        return await ipcRenderer.invoke('createSabor', saborData);
    },
    updateSabor: async (saborId, saborData) => {
        return await ipcRenderer.invoke('updateSabor', saborId, saborData);
    },
    deleteSabor: async (saborId) => {
        return await ipcRenderer.invoke('deleteSabor', saborId);
    },
    // PresentacionSabor methods
    getPresentacionSaboresByPresentacion: async (presentacionId) => {
        return await ipcRenderer.invoke('getPresentacionSaboresByPresentacion', presentacionId);
    },
    getPresentacionSabor: async (presentacionSaborId) => {
        return await ipcRenderer.invoke('getPresentacionSabor', presentacionSaborId);
    },
    createPresentacionSabor: async (presentacionSaborData) => {
        return await ipcRenderer.invoke('createPresentacionSabor', presentacionSaborData);
    },
    updatePresentacionSabor: async (presentacionSaborId, presentacionSaborData) => {
        return await ipcRenderer.invoke('updatePresentacionSabor', presentacionSaborId, presentacionSaborData);
    },
    deletePresentacionSabor: async (presentacionSaborId) => {
        return await ipcRenderer.invoke('deletePresentacionSabor', presentacionSaborId);
    },
    // Receta methods
    getRecetas: async () => {
        return await ipcRenderer.invoke('getRecetas');
    },
    getReceta: async (recetaId) => {
        return await ipcRenderer.invoke('getReceta', recetaId);
    },
    createReceta: async (recetaData) => {
        return await ipcRenderer.invoke('createReceta', recetaData);
    },
    updateReceta: async (recetaId, recetaData) => {
        return await ipcRenderer.invoke('updateReceta', recetaId, recetaData);
    },
    deleteReceta: async (recetaId) => {
        return await ipcRenderer.invoke('deleteReceta', recetaId);
    },
    // RecetaItem methods
    getRecetaItems: async (recetaId) => {
        return await ipcRenderer.invoke('getRecetaItems', recetaId);
    },
    getRecetaItem: async (recetaItemId) => {
        return await ipcRenderer.invoke('getRecetaItem', recetaItemId);
    },
    createRecetaItem: async (recetaItemData) => {
        return await ipcRenderer.invoke('createRecetaItem', recetaItemData);
    },
    updateRecetaItem: async (recetaItemId, recetaItemData) => {
        return await ipcRenderer.invoke('updateRecetaItem', recetaItemId, recetaItemData);
    },
    deleteRecetaItem: async (recetaItemId) => {
        return await ipcRenderer.invoke('deleteRecetaItem', recetaItemId);
    },
    // Ingrediente methods
    getIngredientes: async () => {
        return await ipcRenderer.invoke('getIngredientes');
    },
    getIngrediente: async (ingredienteId) => {
        return await ipcRenderer.invoke('getIngrediente', ingredienteId);
    },
    createIngrediente: async (ingredienteData) => {
        return await ipcRenderer.invoke('createIngrediente', ingredienteData);
    },
    updateIngrediente: async (ingredienteId, ingredienteData) => {
        return await ipcRenderer.invoke('updateIngrediente', ingredienteId, ingredienteData);
    },
    deleteIngrediente: async (ingredienteId) => {
        return await ipcRenderer.invoke('deleteIngrediente', ingredienteId);
    },
    searchIngredientesByDescripcion: async (searchText) => {
        return await ipcRenderer.invoke('searchIngredientesByDescripcion', searchText);
    },
});
//# sourceMappingURL=preload.js.map