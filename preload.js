"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Preload script that will be executed before rendering the application
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('api', {
    // Database operations
    getCategories: async () => {
        return await electron_1.ipcRenderer.invoke('get-categories');
    },
    getProducts: async () => {
        return await electron_1.ipcRenderer.invoke('get-products');
    },
    getProductsByCategory: async (categoryId) => {
        return await electron_1.ipcRenderer.invoke('get-products-by-category', categoryId);
    },
    createProduct: async (productData) => {
        return await electron_1.ipcRenderer.invoke('create-product', productData);
    },
    updateProduct: async (productId, productData) => {
        return await electron_1.ipcRenderer.invoke('update-product', productId, productData);
    },
    createOrder: async (orderData) => {
        return await electron_1.ipcRenderer.invoke('create-order', orderData);
    },
    getOrders: async () => {
        return await electron_1.ipcRenderer.invoke('get-orders');
    },
    getOrderDetails: async (orderId) => {
        return await electron_1.ipcRenderer.invoke('get-order-details', orderId);
    },
    updateOrderStatus: async (orderId, status) => {
        return await electron_1.ipcRenderer.invoke('update-order-status', orderId, status);
    },
    // Persona operations
    getPersonas: async () => {
        return await electron_1.ipcRenderer.invoke('get-personas');
    },
    getPersona: async (personaId) => {
        return await electron_1.ipcRenderer.invoke('get-persona', personaId);
    },
    createPersona: async (personaData, currentUserId) => {
        return await electron_1.ipcRenderer.invoke('create-persona', personaData, currentUserId);
    },
    updatePersona: async (personaId, personaData, currentUserId) => {
        return await electron_1.ipcRenderer.invoke('update-persona', personaId, personaData, currentUserId);
    },
    deletePersona: async (personaId, currentUserId) => {
        return await electron_1.ipcRenderer.invoke('delete-persona', personaId, currentUserId);
    },
    // Auth operations
    login: async (loginData) => {
        return await electron_1.ipcRenderer.invoke('login', loginData);
    },
    logout: async (sessionId) => {
        return await electron_1.ipcRenderer.invoke('logout', sessionId);
    },
    updateSessionActivity: async (sessionId) => {
        return await electron_1.ipcRenderer.invoke('updateSessionActivity', sessionId);
    },
    getLoginSessions: async (usuarioId) => {
        return await electron_1.ipcRenderer.invoke('getLoginSessions', usuarioId);
    },
    getCurrentUser: async () => {
        return await electron_1.ipcRenderer.invoke('getCurrentUser');
    },
    setCurrentUser: async (usuario) => {
        return await electron_1.ipcRenderer.invoke('setCurrentUser', usuario);
    },
    // Printer operations
    getPrinters: async () => {
        return await electron_1.ipcRenderer.invoke('get-printers');
    },
    addPrinter: async (printer) => {
        return await electron_1.ipcRenderer.invoke('add-printer', printer);
    },
    updatePrinter: async (printerId, printer) => {
        return await electron_1.ipcRenderer.invoke('update-printer', printerId, printer);
    },
    deletePrinter: async (printerId) => {
        return await electron_1.ipcRenderer.invoke('delete-printer', printerId);
    },
    printReceipt: async (orderId, printerId) => {
        return await electron_1.ipcRenderer.invoke('print-receipt', orderId, printerId);
    },
    printTestPage: async (printerId) => {
        return await electron_1.ipcRenderer.invoke('print-test-page', printerId);
    },
    // Usuario operations
    getUsuarios: async () => {
        return await electron_1.ipcRenderer.invoke('get-usuarios');
    },
    getUsuario: async (usuarioId) => {
        return await electron_1.ipcRenderer.invoke('get-usuario', usuarioId);
    },
    createUsuario: async (usuarioData) => {
        return await electron_1.ipcRenderer.invoke('create-usuario', usuarioData);
    },
    updateUsuario: async (usuarioId, usuarioData) => {
        return await electron_1.ipcRenderer.invoke('update-usuario', usuarioId, usuarioData);
    },
    deleteUsuario: async (usuarioId) => {
        return await electron_1.ipcRenderer.invoke('delete-usuario', usuarioId);
    },
    getUsuariosPaginated: async (page, pageSize, filters) => {
        console.log('Preload.ts sending filters:', JSON.stringify(filters));
        return await electron_1.ipcRenderer.invoke('get-usuarios-paginated', page, pageSize, filters);
    },
    // Role operations
    getRoles: async () => {
        return await electron_1.ipcRenderer.invoke('get-roles');
    },
    getRole: async (roleId) => {
        return await electron_1.ipcRenderer.invoke('get-role', roleId);
    },
    createRole: async (roleData) => {
        return await electron_1.ipcRenderer.invoke('create-role', roleData);
    },
    updateRole: async (roleId, roleData) => {
        return await electron_1.ipcRenderer.invoke('update-role', roleId, roleData);
    },
    deleteRole: async (roleId) => {
        return await electron_1.ipcRenderer.invoke('delete-role', roleId);
    },
    // UsuarioRole operations
    getUsuarioRoles: async (usuarioId) => {
        return await electron_1.ipcRenderer.invoke('get-usuario-roles', usuarioId);
    },
    assignRoleToUsuario: async (usuarioId, roleId) => {
        return await electron_1.ipcRenderer.invoke('assign-role-to-usuario', usuarioId, roleId);
    },
    removeRoleFromUsuario: async (usuarioRoleId) => {
        return await electron_1.ipcRenderer.invoke('remove-role-from-usuario', usuarioRoleId);
    },
    // TipoCliente operations
    getTipoClientes: async () => {
        return await electron_1.ipcRenderer.invoke('get-tipo-clientes');
    },
    getTipoCliente: async (tipoClienteId) => {
        return await electron_1.ipcRenderer.invoke('get-tipo-cliente', tipoClienteId);
    },
    createTipoCliente: async (tipoClienteData) => {
        return await electron_1.ipcRenderer.invoke('create-tipo-cliente', tipoClienteData);
    },
    updateTipoCliente: async (tipoClienteId, tipoClienteData) => {
        return await electron_1.ipcRenderer.invoke('update-tipo-cliente', tipoClienteId, tipoClienteData);
    },
    deleteTipoCliente: async (tipoClienteId) => {
        return await electron_1.ipcRenderer.invoke('delete-tipo-cliente', tipoClienteId);
    },
    // Cliente operations
    getClientes: async () => {
        return await electron_1.ipcRenderer.invoke('get-clientes');
    },
    getCliente: async (clienteId) => {
        return await electron_1.ipcRenderer.invoke('get-cliente', clienteId);
    },
    createCliente: async (clienteData) => {
        return await electron_1.ipcRenderer.invoke('create-cliente', clienteData);
    },
    updateCliente: async (clienteId, clienteData) => {
        return await electron_1.ipcRenderer.invoke('update-cliente', clienteId, clienteData);
    },
    deleteCliente: async (clienteId) => {
        return await electron_1.ipcRenderer.invoke('delete-cliente', clienteId);
    },
    // Profile image operations
    saveProfileImage: async (base64Data, fileName) => {
        return await electron_1.ipcRenderer.invoke('save-profile-image', { base64Data, fileName });
    },
    deleteProfileImage: async (imageUrl) => {
        return await electron_1.ipcRenderer.invoke('delete-profile-image', imageUrl);
    },
    // Utility functions
    on: (channel, callback) => {
        // Deliberately strip event as it includes `sender`
        electron_1.ipcRenderer.on(channel, (_event, data) => callback(data));
    },
    // Categoria operations
    getCategorias: async () => {
        return await electron_1.ipcRenderer.invoke('getCategorias');
    },
    getCategoria: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('getCategoria', categoriaId);
    },
    createCategoria: async (categoriaData) => {
        return await electron_1.ipcRenderer.invoke('createCategoria', categoriaData);
    },
    updateCategoria: async (categoriaId, categoriaData) => {
        return await electron_1.ipcRenderer.invoke('updateCategoria', categoriaId, categoriaData);
    },
    deleteCategoria: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('deleteCategoria', categoriaId);
    },
    // Subcategoria operations
    getSubcategorias: async () => {
        return await electron_1.ipcRenderer.invoke('getSubcategorias');
    },
    getSubcategoria: async (subcategoriaId) => {
        return await electron_1.ipcRenderer.invoke('getSubcategoria', subcategoriaId);
    },
    getSubcategoriasByCategoria: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('getSubcategoriasByCategoria', categoriaId);
    },
    createSubcategoria: async (subcategoriaData) => {
        return await electron_1.ipcRenderer.invoke('createSubcategoria', subcategoriaData);
    },
    updateSubcategoria: async (subcategoriaId, subcategoriaData) => {
        return await electron_1.ipcRenderer.invoke('updateSubcategoria', subcategoriaId, subcategoriaData);
    },
    deleteSubcategoria: async (subcategoriaId) => {
        return await electron_1.ipcRenderer.invoke('deleteSubcategoria', subcategoriaId);
    },
    // Producto operations
    getProductos: async () => {
        return await electron_1.ipcRenderer.invoke('getProductos');
    },
    getProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getProducto', productoId);
    },
    getProductosBySubcategoria: async (subcategoriaId) => {
        return await electron_1.ipcRenderer.invoke('getProductosBySubcategoria', subcategoriaId);
    },
    createProducto: async (productoData) => {
        return await electron_1.ipcRenderer.invoke('createProducto', productoData);
    },
    updateProducto: async (productoId, productoData) => {
        return await electron_1.ipcRenderer.invoke('updateProducto', productoId, productoData);
    },
    deleteProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('deleteProducto', productoId);
    },
    saveProductoImage: async (base64Data, fileName) => {
        return await electron_1.ipcRenderer.invoke('saveProductoImage', { base64Data, fileName });
    },
    deleteProductoImage: async (imageUrl) => {
        return await electron_1.ipcRenderer.invoke('deleteProductoImage', imageUrl);
    },
    searchProductosByCode: async (code) => {
        return await electron_1.ipcRenderer.invoke('searchProductosByCode', code || '');
    },
    searchProductos: async (params) => {
        return await electron_1.ipcRenderer.invoke('searchProductos', params);
    },
    // Product Image methods
    getProductImages: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getProductImages', productoId);
    },
    createProductImage: async (imageData) => {
        return await electron_1.ipcRenderer.invoke('createProductImage', imageData);
    },
    updateProductImage: async (imageId, imageData) => {
        return await electron_1.ipcRenderer.invoke('updateProductImage', imageId, imageData);
    },
    deleteProductImage: async (imageId) => {
        return await electron_1.ipcRenderer.invoke('deleteProductImage', imageId);
    },
    // Presentacion methods
    getPresentaciones: async () => {
        return await electron_1.ipcRenderer.invoke('getPresentaciones');
    },
    getPresentacion: async (presentacionId) => {
        return await electron_1.ipcRenderer.invoke('getPresentacion', presentacionId);
    },
    getPresentacionesByProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getPresentacionesByProducto', productoId);
    },
    createPresentacion: async (presentacionData) => {
        return await electron_1.ipcRenderer.invoke('createPresentacion', presentacionData);
    },
    updatePresentacion: async (presentacionId, presentacionData) => {
        return await electron_1.ipcRenderer.invoke('updatePresentacion', presentacionId, presentacionData);
    },
    deletePresentacion: async (presentacionId) => {
        return await electron_1.ipcRenderer.invoke('deletePresentacion', presentacionId);
    },
    // Codigo methods
    getCodigos: async () => {
        return await electron_1.ipcRenderer.invoke('getCodigos');
    },
    getCodigo: async (codigoId) => {
        return await electron_1.ipcRenderer.invoke('getCodigo', codigoId);
    },
    getCodigosByPresentacion: async (presentacionId) => {
        return await electron_1.ipcRenderer.invoke('getCodigosByPresentacion', presentacionId);
    },
    createCodigo: async (codigoData) => {
        return await electron_1.ipcRenderer.invoke('createCodigo', codigoData);
    },
    updateCodigo: async (codigoId, codigoData) => {
        return await electron_1.ipcRenderer.invoke('updateCodigo', codigoId, codigoData);
    },
    deleteCodigo: async (codigoId) => {
        return await electron_1.ipcRenderer.invoke('deleteCodigo', codigoId);
    },
    // Moneda methods
    getMonedas: async () => {
        return await electron_1.ipcRenderer.invoke('getMonedas');
    },
    getMoneda: async (monedaId) => {
        return await electron_1.ipcRenderer.invoke('getMoneda', monedaId);
    },
    createMoneda: async (monedaData) => {
        return await electron_1.ipcRenderer.invoke('createMoneda', monedaData);
    },
    updateMoneda: async (monedaId, monedaData) => {
        return await electron_1.ipcRenderer.invoke('updateMoneda', monedaId, monedaData);
    },
    deleteMoneda: async (monedaId) => {
        return await electron_1.ipcRenderer.invoke('deleteMoneda', monedaId);
    },
    getMonedaPrincipal: async () => {
        return await electron_1.ipcRenderer.invoke('getMonedaPrincipal');
    },
    // TipoPrecio methods
    getTipoPrecios: async () => {
        return await electron_1.ipcRenderer.invoke('getTipoPrecios');
    },
    getTipoPrecio: async (tipoPrecioId) => {
        return await electron_1.ipcRenderer.invoke('getTipoPrecio', tipoPrecioId);
    },
    createTipoPrecio: async (tipoPrecioData) => {
        return await electron_1.ipcRenderer.invoke('createTipoPrecio', tipoPrecioData);
    },
    updateTipoPrecio: async (tipoPrecioId, tipoPrecioData) => {
        return await electron_1.ipcRenderer.invoke('updateTipoPrecio', tipoPrecioId, tipoPrecioData);
    },
    deleteTipoPrecio: async (tipoPrecioId) => {
        return await electron_1.ipcRenderer.invoke('deleteTipoPrecio', tipoPrecioId);
    },
    // PrecioVenta methods
    getPreciosVenta: async (active) => {
        return await electron_1.ipcRenderer.invoke('getPreciosVenta', active);
    },
    getPrecioVenta: async (precioVentaId, active) => {
        return await electron_1.ipcRenderer.invoke('getPrecioVenta', precioVentaId, active);
    },
    getPreciosVentaByPresentacion: async (presentacionId, active) => {
        return await electron_1.ipcRenderer.invoke('getPreciosVentaByPresentacion', presentacionId, active);
    },
    getPreciosVentaByPresentacionSabor: async (presentacionSaborId, active) => {
        return await electron_1.ipcRenderer.invoke('getPreciosVentaByPresentacionSabor', presentacionSaborId, active);
    },
    createPrecioVenta: async (precioVentaData) => {
        return await electron_1.ipcRenderer.invoke('createPrecioVenta', precioVentaData);
    },
    updatePrecioVenta: async (precioVentaId, precioVentaData) => {
        return await electron_1.ipcRenderer.invoke('updatePrecioVenta', precioVentaId, precioVentaData);
    },
    deletePrecioVenta: async (precioVentaId) => {
        return await electron_1.ipcRenderer.invoke('deletePrecioVenta', precioVentaId);
    },
    // Sabor methods
    getSabores: async () => {
        return await electron_1.ipcRenderer.invoke('getSabores');
    },
    getSabor: async (saborId) => {
        return await electron_1.ipcRenderer.invoke('getSabor', saborId);
    },
    createSabor: async (saborData) => {
        return await electron_1.ipcRenderer.invoke('createSabor', saborData);
    },
    updateSabor: async (saborId, saborData) => {
        return await electron_1.ipcRenderer.invoke('updateSabor', saborId, saborData);
    },
    deleteSabor: async (saborId) => {
        return await electron_1.ipcRenderer.invoke('deleteSabor', saborId);
    },
    // PresentacionSabor methods
    getPresentacionSaboresByPresentacion: async (presentacionId) => {
        return await electron_1.ipcRenderer.invoke('getPresentacionSaboresByPresentacion', presentacionId);
    },
    getPresentacionSabor: async (presentacionSaborId) => {
        return await electron_1.ipcRenderer.invoke('getPresentacionSabor', presentacionSaborId);
    },
    createPresentacionSabor: async (presentacionSaborData) => {
        return await electron_1.ipcRenderer.invoke('createPresentacionSabor', presentacionSaborData);
    },
    updatePresentacionSabor: async (presentacionSaborId, presentacionSaborData) => {
        return await electron_1.ipcRenderer.invoke('updatePresentacionSabor', presentacionSaborId, presentacionSaborData);
    },
    deletePresentacionSabor: async (presentacionSaborId) => {
        return await electron_1.ipcRenderer.invoke('deletePresentacionSabor', presentacionSaborId);
    },
    // Receta methods
    getRecetas: async () => {
        return await electron_1.ipcRenderer.invoke('getRecetas');
    },
    getReceta: async (recetaId) => {
        return await electron_1.ipcRenderer.invoke('getReceta', recetaId);
    },
    createReceta: async (recetaData) => {
        return await electron_1.ipcRenderer.invoke('createReceta', recetaData);
    },
    updateReceta: async (recetaId, recetaData) => {
        return await electron_1.ipcRenderer.invoke('updateReceta', recetaId, recetaData);
    },
    deleteReceta: async (recetaId) => {
        return await electron_1.ipcRenderer.invoke('deleteReceta', recetaId);
    },
    searchRecetasByNombre: async (searchText) => {
        return await electron_1.ipcRenderer.invoke('searchRecetasByNombre', searchText);
    },
    // RecetaItem methods
    getRecetaItems: async (recetaId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaItems', recetaId);
    },
    getRecetaItem: async (recetaItemId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaItem', recetaItemId);
    },
    createRecetaItem: async (recetaItemData) => {
        return await electron_1.ipcRenderer.invoke('createRecetaItem', recetaItemData);
    },
    updateRecetaItem: async (recetaItemId, recetaItemData) => {
        return await electron_1.ipcRenderer.invoke('updateRecetaItem', recetaItemId, recetaItemData);
    },
    deleteRecetaItem: async (recetaItemId) => {
        return await electron_1.ipcRenderer.invoke('deleteRecetaItem', recetaItemId);
    },
    // Ingrediente methods
    getIngredientes: async () => {
        return await electron_1.ipcRenderer.invoke('getIngredientes');
    },
    getIngrediente: async (ingredienteId) => {
        return await electron_1.ipcRenderer.invoke('getIngrediente', ingredienteId);
    },
    createIngrediente: async (ingredienteData) => {
        return await electron_1.ipcRenderer.invoke('createIngrediente', ingredienteData);
    },
    updateIngrediente: async (ingredienteId, ingredienteData) => {
        return await electron_1.ipcRenderer.invoke('updateIngrediente', ingredienteId, ingredienteData);
    },
    deleteIngrediente: async (ingredienteId) => {
        return await electron_1.ipcRenderer.invoke('deleteIngrediente', ingredienteId);
    },
    searchIngredientesByDescripcion: async (searchText) => {
        return await electron_1.ipcRenderer.invoke('searchIngredientesByDescripcion', searchText);
    },
    // RecetaVariacion methods
    getRecetaVariaciones: async (recetaId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaVariaciones', recetaId);
    },
    getRecetaVariacion: async (variacionId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaVariacion', variacionId);
    },
    createRecetaVariacion: async (variacionData) => {
        return await electron_1.ipcRenderer.invoke('createRecetaVariacion', variacionData);
    },
    updateRecetaVariacion: async (variacionId, variacionData) => {
        return await electron_1.ipcRenderer.invoke('updateRecetaVariacion', variacionId, variacionData);
    },
    deleteRecetaVariacion: async (variacionId) => {
        return await electron_1.ipcRenderer.invoke('deleteRecetaVariacion', variacionId);
    },
    // RecetaVariacionItem methods
    getRecetaVariacionItems: async (variacionId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaVariacionItems', variacionId);
    },
    getRecetaVariacionItem: async (variacionItemId) => {
        return await electron_1.ipcRenderer.invoke('getRecetaVariacionItem', variacionItemId);
    },
    createRecetaVariacionItem: async (variacionItemData) => {
        return await electron_1.ipcRenderer.invoke('createRecetaVariacionItem', variacionItemData);
    },
    updateRecetaVariacionItem: async (variacionItemId, variacionItemData) => {
        return await electron_1.ipcRenderer.invoke('updateRecetaVariacionItem', variacionItemId, variacionItemData);
    },
    deleteRecetaVariacionItem: async (variacionItemId) => {
        return await electron_1.ipcRenderer.invoke('deleteRecetaVariacionItem', variacionItemId);
    },
    // MonedaBillete methods
    getMonedasBilletes: async () => {
        return await electron_1.ipcRenderer.invoke('get-monedas-billetes');
    },
    getMonedaBillete: async (monedaBilleteId) => {
        return await electron_1.ipcRenderer.invoke('get-moneda-billete', monedaBilleteId);
    },
    createMonedaBillete: async (monedaBilleteData) => {
        return await electron_1.ipcRenderer.invoke('create-moneda-billete', monedaBilleteData);
    },
    updateMonedaBillete: async (monedaBilleteId, monedaBilleteData) => {
        return await electron_1.ipcRenderer.invoke('update-moneda-billete', monedaBilleteId, monedaBilleteData);
    },
    deleteMonedaBillete: async (monedaBilleteId) => {
        return await electron_1.ipcRenderer.invoke('delete-moneda-billete', monedaBilleteId);
    },
    // Conteo methods
    getConteos: async () => {
        return await electron_1.ipcRenderer.invoke('get-conteos');
    },
    getConteo: async (conteoId) => {
        return await electron_1.ipcRenderer.invoke('get-conteo', conteoId);
    },
    createConteo: async (conteoData) => {
        return await electron_1.ipcRenderer.invoke('create-conteo', conteoData);
    },
    updateConteo: async (conteoId, conteoData) => {
        return await electron_1.ipcRenderer.invoke('update-conteo', conteoId, conteoData);
    },
    deleteConteo: async (conteoId) => {
        return await electron_1.ipcRenderer.invoke('delete-conteo', conteoId);
    },
    // ConteoDetalle methods
    getConteoDetalles: async (conteoId) => {
        return await electron_1.ipcRenderer.invoke('get-conteo-detalles', conteoId);
    },
    getConteoDetalle: async (conteoDetalleId) => {
        return await electron_1.ipcRenderer.invoke('get-conteo-detalle', conteoDetalleId);
    },
    createConteoDetalle: async (conteoDetalleData) => {
        return await electron_1.ipcRenderer.invoke('create-conteo-detalle', conteoDetalleData);
    },
    updateConteoDetalle: async (conteoDetalleId, conteoDetalleData) => {
        return await electron_1.ipcRenderer.invoke('update-conteo-detalle', conteoDetalleId, conteoDetalleData);
    },
    deleteConteoDetalle: async (conteoDetalleId) => {
        return await electron_1.ipcRenderer.invoke('delete-conteo-detalle', conteoDetalleId);
    },
    // Dispositivo methods
    getDispositivos: async () => {
        return await electron_1.ipcRenderer.invoke('get-dispositivos');
    },
    getDispositivo: async (dispositivoId) => {
        return await electron_1.ipcRenderer.invoke('get-dispositivo', dispositivoId);
    },
    createDispositivo: async (dispositivoData) => {
        return await electron_1.ipcRenderer.invoke('create-dispositivo', dispositivoData);
    },
    updateDispositivo: async (dispositivoId, dispositivoData) => {
        return await electron_1.ipcRenderer.invoke('update-dispositivo', dispositivoId, dispositivoData);
    },
    deleteDispositivo: async (dispositivoId) => {
        return await electron_1.ipcRenderer.invoke('delete-dispositivo', dispositivoId);
    },
    // Caja methods
    getCajas: async () => {
        return await electron_1.ipcRenderer.invoke('get-cajas');
    },
    getCaja: async (cajaId) => {
        return await electron_1.ipcRenderer.invoke('get-caja', cajaId);
    },
    getCajaByDispositivo: async (dispositivoId) => {
        return await electron_1.ipcRenderer.invoke('get-caja-by-dispositivo', dispositivoId);
    },
    createCaja: async (cajaData) => {
        return await electron_1.ipcRenderer.invoke('create-caja', cajaData);
    },
    updateCaja: async (cajaId, cajaData) => {
        return await electron_1.ipcRenderer.invoke('update-caja', cajaId, cajaData);
    },
    deleteCaja: async (cajaId) => {
        return await electron_1.ipcRenderer.invoke('delete-caja', cajaId);
    },
    getCajaAbiertaByUsuario: async () => {
        return await electron_1.ipcRenderer.invoke('get-caja-abierta-by-usuario');
    },
    // CajaMoneda methods
    getCajasMonedas: () => electron_1.ipcRenderer.invoke('get-cajas-monedas'),
    getCajaMoneda: (cajaMonedaId) => electron_1.ipcRenderer.invoke('get-caja-moneda', cajaMonedaId),
    createCajaMoneda: (cajaMonedaData) => electron_1.ipcRenderer.invoke('create-caja-moneda', cajaMonedaData),
    updateCajaMoneda: (cajaMonedaId, cajaMonedaData) => electron_1.ipcRenderer.invoke('update-caja-moneda', cajaMonedaId, cajaMonedaData),
    deleteCajaMoneda: (cajaMonedaId) => electron_1.ipcRenderer.invoke('delete-caja-moneda', cajaMonedaId),
    saveCajasMonedas: (updates) => electron_1.ipcRenderer.invoke('save-cajas-monedas', updates),
    // MonedaCambio methods
    getMonedasCambio: async () => {
        return await electron_1.ipcRenderer.invoke('get-monedas-cambio');
    },
    getMonedasCambioByMonedaOrigen: async (monedaOrigenId) => {
        return await electron_1.ipcRenderer.invoke('get-monedas-cambio-by-moneda-origen', monedaOrigenId);
    },
    getMonedaCambio: async (monedaCambioId) => {
        return await electron_1.ipcRenderer.invoke('get-moneda-cambio', monedaCambioId);
    },
    createMonedaCambio: async (monedaCambioData) => {
        return await electron_1.ipcRenderer.invoke('create-moneda-cambio', monedaCambioData);
    },
    updateMonedaCambio: async (monedaCambioId, monedaCambioData) => {
        return await electron_1.ipcRenderer.invoke('update-moneda-cambio', monedaCambioId, monedaCambioData);
    },
    deleteMonedaCambio: async (monedaCambioId) => {
        return await electron_1.ipcRenderer.invoke('delete-moneda-cambio', monedaCambioId);
    },
    // Proveedor methods
    getProveedores: async () => {
        return await electron_1.ipcRenderer.invoke('getProveedores');
    },
    getProveedor: async (proveedorId) => {
        return await electron_1.ipcRenderer.invoke('getProveedor', proveedorId);
    },
    createProveedor: async (proveedorData) => {
        return await electron_1.ipcRenderer.invoke('createProveedor', proveedorData);
    },
    updateProveedor: async (proveedorId, proveedorData) => {
        return await electron_1.ipcRenderer.invoke('updateProveedor', proveedorId, proveedorData);
    },
    deleteProveedor: async (proveedorId) => {
        return await electron_1.ipcRenderer.invoke('deleteProveedor', proveedorId);
    },
    // Compra methods
    getCompras: async () => {
        return await electron_1.ipcRenderer.invoke('getCompras');
    },
    getCompra: async (compraId) => {
        return await electron_1.ipcRenderer.invoke('getCompra', compraId);
    },
    createCompra: async (compraData) => {
        return await electron_1.ipcRenderer.invoke('createCompra', compraData);
    },
    updateCompra: async (compraId, compraData) => {
        return await electron_1.ipcRenderer.invoke('updateCompra', compraId, compraData);
    },
    deleteCompra: async (compraId) => {
        return await electron_1.ipcRenderer.invoke('deleteCompra', compraId);
    },
    // CompraDetalle methods
    getCompraDetalles: async (compraId) => {
        return await electron_1.ipcRenderer.invoke('getCompraDetalles', compraId);
    },
    createCompraDetalle: async (detalleData) => {
        return await electron_1.ipcRenderer.invoke('createCompraDetalle', detalleData);
    },
    updateCompraDetalle: async (detalleId, detalleData) => {
        return await electron_1.ipcRenderer.invoke('updateCompraDetalle', detalleId, detalleData);
    },
    deleteCompraDetalle: async (detalleId) => {
        return await electron_1.ipcRenderer.invoke('deleteCompraDetalle', detalleId);
    },
    // Pago methods
    getPagos: async () => {
        return await electron_1.ipcRenderer.invoke('getPagos');
    },
    getPago: async (pagoId) => {
        return await electron_1.ipcRenderer.invoke('getPago', pagoId);
    },
    createPago: async (pagoData) => {
        return await electron_1.ipcRenderer.invoke('createPago', pagoData);
    },
    updatePago: async (pagoId, pagoData) => {
        return await electron_1.ipcRenderer.invoke('updatePago', pagoId, pagoData);
    },
    deletePago: async (pagoId) => {
        return await electron_1.ipcRenderer.invoke('deletePago', pagoId);
    },
    // PagoDetalle methods
    getPagoDetalles: async (pagoId) => {
        return await electron_1.ipcRenderer.invoke('getPagoDetalles', pagoId);
    },
    createPagoDetalle: async (detalleData) => {
        return await electron_1.ipcRenderer.invoke('createPagoDetalle', detalleData);
    },
    updatePagoDetalle: async (detalleId, detalleData) => {
        return await electron_1.ipcRenderer.invoke('updatePagoDetalle', detalleId, detalleData);
    },
    deletePagoDetalle: async (detalleId) => {
        return await electron_1.ipcRenderer.invoke('deletePagoDetalle', detalleId);
    },
    // ProveedorProducto methods
    getProveedorProductos: async (proveedorId) => {
        return await electron_1.ipcRenderer.invoke('getProveedorProductos', proveedorId);
    },
    getProveedorProducto: async (proveedorProductoId) => {
        return await electron_1.ipcRenderer.invoke('getProveedorProducto', proveedorProductoId);
    },
    createProveedorProducto: async (proveedorProductoData) => {
        return await electron_1.ipcRenderer.invoke('createProveedorProducto', proveedorProductoData);
    },
    updateProveedorProducto: async (proveedorProductoId, proveedorProductoData) => {
        return await electron_1.ipcRenderer.invoke('updateProveedorProducto', proveedorProductoId, proveedorProductoData);
    },
    deleteProveedorProducto: async (proveedorProductoId) => {
        return await electron_1.ipcRenderer.invoke('deleteProveedorProducto', proveedorProductoId);
    },
    // System information
    getSystemMacAddress: () => electron_1.ipcRenderer.invoke('get-system-mac-address'),
    // FormasPago methods
    getFormasPago: async () => {
        return await electron_1.ipcRenderer.invoke('getFormasPago');
    },
    getFormaPago: async (formaPagoId) => {
        return await electron_1.ipcRenderer.invoke('getFormaPago', formaPagoId);
    },
    createFormaPago: async (formaPagoData) => {
        return await electron_1.ipcRenderer.invoke('createFormaPago', formaPagoData);
    },
    updateFormaPago: async (formaPagoId, formaPagoData) => {
        return await electron_1.ipcRenderer.invoke('updateFormaPago', formaPagoId, formaPagoData);
    },
    deleteFormaPago: async (formaPagoId) => {
        return await electron_1.ipcRenderer.invoke('deleteFormaPago', formaPagoId);
    },
    updateFormasPagoOrder: async (updates) => {
        return await electron_1.ipcRenderer.invoke('updateFormasPagoOrder', updates);
    },
    // MovimientoStock methods
    getMovimientosStock: async () => {
        return await electron_1.ipcRenderer.invoke('getMovimientosStock');
    },
    getMovimientoStock: async (movimientoStockId) => {
        return await electron_1.ipcRenderer.invoke('getMovimientoStock', movimientoStockId);
    },
    getMovimientosStockByProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getMovimientosStockByProducto', productoId);
    },
    getMovimientosStockByIngrediente: async (ingredienteId) => {
        return await electron_1.ipcRenderer.invoke('getMovimientosStockByIngrediente', ingredienteId);
    },
    getMovimientosStockByTipoReferencia: async (tipoReferencia) => {
        return await electron_1.ipcRenderer.invoke('getMovimientosStockByTipoReferencia', tipoReferencia);
    },
    getMovimientosStockByReferenciaAndTipo: async (referencia, tipoReferencia) => {
        return await electron_1.ipcRenderer.invoke('getMovimientosStockByReferenciaAndTipo', referencia, tipoReferencia);
    },
    getCurrentStockByProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getCurrentStockByProducto', productoId);
    },
    getCurrentStockByIngrediente: async (ingredienteId) => {
        return await electron_1.ipcRenderer.invoke('getCurrentStockByIngrediente', ingredienteId);
    },
    createMovimientoStock: async (movimientoStockData) => {
        return await electron_1.ipcRenderer.invoke('createMovimientoStock', movimientoStockData);
    },
    updateMovimientoStock: async (movimientoStockId, movimientoStockData) => {
        return await electron_1.ipcRenderer.invoke('updateMovimientoStock', movimientoStockId, movimientoStockData);
    },
    deleteMovimientoStock: async (movimientoStockId) => {
        return await electron_1.ipcRenderer.invoke('deleteMovimientoStock', movimientoStockId);
    },
    // PrecioDelivery methods
    getPreciosDelivery: async () => {
        return await electron_1.ipcRenderer.invoke('getPreciosDelivery');
    },
    getPrecioDelivery: async (precioDeliveryId) => {
        return await electron_1.ipcRenderer.invoke('getPrecioDelivery', precioDeliveryId);
    },
    createPrecioDelivery: async (precioDeliveryData) => {
        return await electron_1.ipcRenderer.invoke('createPrecioDelivery', precioDeliveryData);
    },
    updatePrecioDelivery: async (precioDeliveryId, precioDeliveryData) => {
        return await electron_1.ipcRenderer.invoke('updatePrecioDelivery', precioDeliveryId, precioDeliveryData);
    },
    deletePrecioDelivery: async (precioDeliveryId) => {
        return await electron_1.ipcRenderer.invoke('deletePrecioDelivery', precioDeliveryId);
    },
    // Delivery methods
    getDeliveries: async () => {
        return await electron_1.ipcRenderer.invoke('getDeliveries');
    },
    getDeliveriesByEstado: async (estado) => {
        return await electron_1.ipcRenderer.invoke('getDeliveriesByEstado', estado);
    },
    getDelivery: async (deliveryId) => {
        return await electron_1.ipcRenderer.invoke('getDelivery', deliveryId);
    },
    createDelivery: async (deliveryData) => {
        return await electron_1.ipcRenderer.invoke('createDelivery', deliveryData);
    },
    updateDelivery: async (deliveryId, deliveryData) => {
        return await electron_1.ipcRenderer.invoke('updateDelivery', deliveryId, deliveryData);
    },
    deleteDelivery: async (deliveryId) => {
        return await electron_1.ipcRenderer.invoke('deleteDelivery', deliveryId);
    },
    // Venta methods
    getVentas: async () => {
        return await electron_1.ipcRenderer.invoke('getVentas');
    },
    getVentasByEstado: async (estado) => {
        return await electron_1.ipcRenderer.invoke('getVentasByEstado', estado);
    },
    getVenta: async (ventaId) => {
        return await electron_1.ipcRenderer.invoke('getVenta', ventaId);
    },
    createVenta: async (ventaData) => {
        return await electron_1.ipcRenderer.invoke('createVenta', ventaData);
    },
    updateVenta: async (ventaId, ventaData) => {
        return await electron_1.ipcRenderer.invoke('updateVenta', ventaId, ventaData);
    },
    deleteVenta: async (ventaId) => {
        return await electron_1.ipcRenderer.invoke('deleteVenta', ventaId);
    },
    // VentaItem methods
    getVentaItems: async (ventaId) => {
        return await electron_1.ipcRenderer.invoke('getVentaItems', ventaId);
    },
    getVentaItem: async (ventaItemId) => {
        return await electron_1.ipcRenderer.invoke('getVentaItem', ventaItemId);
    },
    createVentaItem: async (ventaItemData) => {
        return await electron_1.ipcRenderer.invoke('createVentaItem', ventaItemData);
    },
    updateVentaItem: async (ventaItemId, ventaItemData) => {
        return await electron_1.ipcRenderer.invoke('updateVentaItem', ventaItemId, ventaItemData);
    },
    deleteVentaItem: async (ventaItemId) => {
        return await electron_1.ipcRenderer.invoke('deleteVentaItem', ventaItemId);
    },
    // PdvGrupoCategoria methods
    getPdvGrupoCategorias: async () => {
        return await electron_1.ipcRenderer.invoke('getPdvGrupoCategorias');
    },
    getPdvGrupoCategoria: async (grupoCategoriaId) => {
        return await electron_1.ipcRenderer.invoke('getPdvGrupoCategoria', grupoCategoriaId);
    },
    createPdvGrupoCategoria: async (grupoCategoriaData) => {
        return await electron_1.ipcRenderer.invoke('createPdvGrupoCategoria', grupoCategoriaData);
    },
    updatePdvGrupoCategoria: async (grupoCategoriaId, grupoCategoriaData) => {
        return await electron_1.ipcRenderer.invoke('updatePdvGrupoCategoria', grupoCategoriaId, grupoCategoriaData);
    },
    deletePdvGrupoCategoria: async (grupoCategoriaId) => {
        return await electron_1.ipcRenderer.invoke('deletePdvGrupoCategoria', grupoCategoriaId);
    },
    // PdvCategoria methods
    getPdvCategorias: async () => {
        return await electron_1.ipcRenderer.invoke('getPdvCategorias');
    },
    getPdvCategoria: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('getPdvCategoria', categoriaId);
    },
    createPdvCategoria: async (categoriaData) => {
        return await electron_1.ipcRenderer.invoke('createPdvCategoria', categoriaData);
    },
    updatePdvCategoria: async (categoriaId, categoriaData) => {
        return await electron_1.ipcRenderer.invoke('updatePdvCategoria', categoriaId, categoriaData);
    },
    deletePdvCategoria: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('deletePdvCategoria', categoriaId);
    },
    // PdvCategoriaItem methods
    getPdvCategoriaItems: async (categoriaId) => {
        return await electron_1.ipcRenderer.invoke('getPdvCategoriaItems', categoriaId);
    },
    getPdvCategoriaItem: async (categoriaItemId) => {
        return await electron_1.ipcRenderer.invoke('getPdvCategoriaItem', categoriaItemId);
    },
    createPdvCategoriaItem: async (categoriaItemData) => {
        return await electron_1.ipcRenderer.invoke('createPdvCategoriaItem', categoriaItemData);
    },
    updatePdvCategoriaItem: async (categoriaItemId, categoriaItemData) => {
        return await electron_1.ipcRenderer.invoke('updatePdvCategoriaItem', categoriaItemId, categoriaItemData);
    },
    deletePdvCategoriaItem: async (categoriaItemId) => {
        return await electron_1.ipcRenderer.invoke('deletePdvCategoriaItem', categoriaItemId);
    },
    //PdvItemProducto methods
    getPdvItemProductos: async (itemProductoId) => {
        return await electron_1.ipcRenderer.invoke('getPdvItemProductos', itemProductoId);
    },
    getPdvItemProducto: async (itemProductoId) => {
        return await electron_1.ipcRenderer.invoke('getPdvItemProducto', itemProductoId);
    },
    createPdvItemProducto: async (itemProductoData) => {
        return await electron_1.ipcRenderer.invoke('createPdvItemProducto', itemProductoData);
    },
    updatePdvItemProducto: async (itemProductoId, itemProductoData) => {
        return await electron_1.ipcRenderer.invoke('updatePdvItemProducto', itemProductoId, itemProductoData);
    },
    deletePdvItemProducto: async (itemProductoId) => {
        return await electron_1.ipcRenderer.invoke('deletePdvItemProducto', itemProductoId);
    },
    // PDV Config methods
    getPdvConfig: () => electron_1.ipcRenderer.invoke('getPdvConfig'),
    createPdvConfig: (data) => electron_1.ipcRenderer.invoke('createPdvConfig', data),
    updatePdvConfig: (id, data) => electron_1.ipcRenderer.invoke('updatePdvConfig', id, data),
    // Reserva methods
    getReservas: async () => {
        return await electron_1.ipcRenderer.invoke('getReservas');
    },
    getReservasActivas: async () => {
        return await electron_1.ipcRenderer.invoke('getReservasActivas');
    },
    getReserva: async (id) => {
        return await electron_1.ipcRenderer.invoke('getReserva', id);
    },
    createReserva: async (data) => {
        return await electron_1.ipcRenderer.invoke('createReserva', data);
    },
    updateReserva: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updateReserva', id, data);
    },
    deleteReserva: async (id) => {
        return await electron_1.ipcRenderer.invoke('deleteReserva', id);
    },
    // PdvMesa methods
    getPdvMesas: async () => {
        return await electron_1.ipcRenderer.invoke('getPdvMesas');
    },
    getPdvMesasActivas: async () => {
        return await electron_1.ipcRenderer.invoke('getPdvMesasActivas');
    },
    getPdvMesasDisponibles: async () => {
        return await electron_1.ipcRenderer.invoke('getPdvMesasDisponibles');
    },
    getPdvMesasBySector: async (sectorId) => {
        return await electron_1.ipcRenderer.invoke('getPdvMesasBySector', sectorId);
    },
    getPdvMesa: async (id) => {
        return await electron_1.ipcRenderer.invoke('getPdvMesa', id);
    },
    createPdvMesa: async (data) => {
        return await electron_1.ipcRenderer.invoke('createPdvMesa', data);
    },
    updatePdvMesa: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updatePdvMesa', id, data);
    },
    deletePdvMesa: async (id) => {
        return await electron_1.ipcRenderer.invoke('deletePdvMesa', id);
    },
    // Sector methods
    getSectores: async () => {
        return await electron_1.ipcRenderer.invoke('getSectores');
    },
    getSectoresActivos: async () => {
        return await electron_1.ipcRenderer.invoke('getSectoresActivos');
    },
    getSector: async (id) => {
        return await electron_1.ipcRenderer.invoke('getSector', id);
    },
    createSector: async (data) => {
        return await electron_1.ipcRenderer.invoke('createSector', data);
    },
    updateSector: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updateSector', id, data);
    },
    deleteSector: async (id) => {
        return await electron_1.ipcRenderer.invoke('deleteSector', id);
    },
    // Comanda methods
    getComandas: async () => {
        return await electron_1.ipcRenderer.invoke('getComandas');
    },
    getComandasActivas: async () => {
        return await electron_1.ipcRenderer.invoke('getComandasActivas');
    },
    getComandasByMesa: async (mesaId) => {
        return await electron_1.ipcRenderer.invoke('getComandasByMesa', mesaId);
    },
    getComanda: async (id) => {
        return await electron_1.ipcRenderer.invoke('getComanda', id);
    },
    createComanda: async (data) => {
        return await electron_1.ipcRenderer.invoke('createComanda', data);
    },
    updateComanda: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updateComanda', id, data);
    },
    deleteComanda: async (id) => {
        return await electron_1.ipcRenderer.invoke('deleteComanda', id);
    },
    // Adicional methods
    getAdicionales: async () => {
        return await electron_1.ipcRenderer.invoke('getAdicionales');
    },
    getAdicionalesFiltered: async (filters) => {
        return await electron_1.ipcRenderer.invoke('getAdicionalesFiltered', filters);
    },
    getAdicional: async (id) => {
        return await electron_1.ipcRenderer.invoke('getAdicional', id);
    },
    // ProductoAdicional methods
    getProductoAdicionales: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getProductoAdicionales', productoId);
    },
    getProductoAdicional: async (id) => {
        return await electron_1.ipcRenderer.invoke('getProductoAdicional', id);
    },
    createProductoAdicional: async (data) => {
        return await electron_1.ipcRenderer.invoke('createProductoAdicional', data);
    },
    updateProductoAdicional: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updateProductoAdicional', id, data);
    },
    getProductosAdicionalesByProducto: async (productoId) => {
        return await electron_1.ipcRenderer.invoke('getProductosAdicionalesByProducto', productoId);
    },
    getProductosAdicionalesByPresentacion: async (presentacionId) => {
        return await electron_1.ipcRenderer.invoke('getProductosAdicionalesByPresentacion', presentacionId);
    },
    deleteProductoAdicional: async (id) => {
        return await electron_1.ipcRenderer.invoke('deleteProductoAdicional', id);
    },
    // New search methods
    searchIngredientes: async (query) => {
        return await electron_1.ipcRenderer.invoke('searchIngredientes', query);
    },
    searchRecetas: async (query) => {
        return await electron_1.ipcRenderer.invoke('searchRecetas', query);
    },
    createAdicional: async (data) => {
        return await electron_1.ipcRenderer.invoke('createAdicional', data);
    },
    updateAdicional: async (id, data) => {
        return await electron_1.ipcRenderer.invoke('updateAdicional', id, data);
    },
    deleteAdicional: async (id) => {
        return await electron_1.ipcRenderer.invoke('deleteAdicional', id);
    },
});
//# sourceMappingURL=preload.js.map