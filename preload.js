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
    getPreciosVentaByPresentacionSabor: async (presentacionSaborId) => {
        return await ipcRenderer.invoke('getPreciosVentaByPresentacionSabor', presentacionSaborId);
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
    // RecetaVariacion methods
    getRecetaVariaciones: async (recetaId) => {
        return await ipcRenderer.invoke('getRecetaVariaciones', recetaId);
    },
    getRecetaVariacion: async (variacionId) => {
        return await ipcRenderer.invoke('getRecetaVariacion', variacionId);
    },
    createRecetaVariacion: async (variacionData) => {
        return await ipcRenderer.invoke('createRecetaVariacion', variacionData);
    },
    updateRecetaVariacion: async (variacionId, variacionData) => {
        return await ipcRenderer.invoke('updateRecetaVariacion', variacionId, variacionData);
    },
    deleteRecetaVariacion: async (variacionId) => {
        return await ipcRenderer.invoke('deleteRecetaVariacion', variacionId);
    },
    // RecetaVariacionItem methods
    getRecetaVariacionItems: async (variacionId) => {
        return await ipcRenderer.invoke('getRecetaVariacionItems', variacionId);
    },
    getRecetaVariacionItem: async (variacionItemId) => {
        return await ipcRenderer.invoke('getRecetaVariacionItem', variacionItemId);
    },
    createRecetaVariacionItem: async (variacionItemData) => {
        return await ipcRenderer.invoke('createRecetaVariacionItem', variacionItemData);
    },
    updateRecetaVariacionItem: async (variacionItemId, variacionItemData) => {
        return await ipcRenderer.invoke('updateRecetaVariacionItem', variacionItemId, variacionItemData);
    },
    deleteRecetaVariacionItem: async (variacionItemId) => {
        return await ipcRenderer.invoke('deleteRecetaVariacionItem', variacionItemId);
    },
    // MonedaBillete methods
    getMonedasBilletes: async () => {
        return await ipcRenderer.invoke('get-monedas-billetes');
    },
    getMonedaBillete: async (monedaBilleteId) => {
        return await ipcRenderer.invoke('get-moneda-billete', monedaBilleteId);
    },
    createMonedaBillete: async (monedaBilleteData) => {
        return await ipcRenderer.invoke('create-moneda-billete', monedaBilleteData);
    },
    updateMonedaBillete: async (monedaBilleteId, monedaBilleteData) => {
        return await ipcRenderer.invoke('update-moneda-billete', monedaBilleteId, monedaBilleteData);
    },
    deleteMonedaBillete: async (monedaBilleteId) => {
        return await ipcRenderer.invoke('delete-moneda-billete', monedaBilleteId);
    },
    // Conteo methods
    getConteos: async () => {
        return await ipcRenderer.invoke('get-conteos');
    },
    getConteo: async (conteoId) => {
        return await ipcRenderer.invoke('get-conteo', conteoId);
    },
    createConteo: async (conteoData) => {
        return await ipcRenderer.invoke('create-conteo', conteoData);
    },
    updateConteo: async (conteoId, conteoData) => {
        return await ipcRenderer.invoke('update-conteo', conteoId, conteoData);
    },
    deleteConteo: async (conteoId) => {
        return await ipcRenderer.invoke('delete-conteo', conteoId);
    },
    // ConteoDetalle methods
    getConteoDetalles: async (conteoId) => {
        return await ipcRenderer.invoke('get-conteo-detalles', conteoId);
    },
    getConteoDetalle: async (conteoDetalleId) => {
        return await ipcRenderer.invoke('get-conteo-detalle', conteoDetalleId);
    },
    createConteoDetalle: async (conteoDetalleData) => {
        return await ipcRenderer.invoke('create-conteo-detalle', conteoDetalleData);
    },
    updateConteoDetalle: async (conteoDetalleId, conteoDetalleData) => {
        return await ipcRenderer.invoke('update-conteo-detalle', conteoDetalleId, conteoDetalleData);
    },
    deleteConteoDetalle: async (conteoDetalleId) => {
        return await ipcRenderer.invoke('delete-conteo-detalle', conteoDetalleId);
    },
    // Dispositivo methods
    getDispositivos: async () => {
        return await ipcRenderer.invoke('get-dispositivos');
    },
    getDispositivo: async (dispositivoId) => {
        return await ipcRenderer.invoke('get-dispositivo', dispositivoId);
    },
    createDispositivo: async (dispositivoData) => {
        return await ipcRenderer.invoke('create-dispositivo', dispositivoData);
    },
    updateDispositivo: async (dispositivoId, dispositivoData) => {
        return await ipcRenderer.invoke('update-dispositivo', dispositivoId, dispositivoData);
    },
    deleteDispositivo: async (dispositivoId) => {
        return await ipcRenderer.invoke('delete-dispositivo', dispositivoId);
    },
    // Caja methods
    getCajas: async () => {
        return await ipcRenderer.invoke('get-cajas');
    },
    getCaja: async (cajaId) => {
        return await ipcRenderer.invoke('get-caja', cajaId);
    },
    getCajaByDispositivo: async (dispositivoId) => {
        return await ipcRenderer.invoke('get-caja-by-dispositivo', dispositivoId);
    },
    createCaja: async (cajaData) => {
        return await ipcRenderer.invoke('create-caja', cajaData);
    },
    updateCaja: async (cajaId, cajaData) => {
        return await ipcRenderer.invoke('update-caja', cajaId, cajaData);
    },
    deleteCaja: async (cajaId) => {
        return await ipcRenderer.invoke('delete-caja', cajaId);
    },
    // CajaMoneda methods
    getCajasMonedas: () => ipcRenderer.invoke('get-cajas-monedas'),
    getCajaMoneda: (cajaMonedaId) => ipcRenderer.invoke('get-caja-moneda', cajaMonedaId),
    createCajaMoneda: (cajaMonedaData) => ipcRenderer.invoke('create-caja-moneda', cajaMonedaData),
    updateCajaMoneda: (cajaMonedaId, cajaMonedaData) => ipcRenderer.invoke('update-caja-moneda', cajaMonedaId, cajaMonedaData),
    deleteCajaMoneda: (cajaMonedaId) => ipcRenderer.invoke('delete-caja-moneda', cajaMonedaId),
    saveCajasMonedas: (updates) => ipcRenderer.invoke('save-cajas-monedas', updates),
    // MonedaCambio methods
    getMonedasCambio: async () => {
        return await ipcRenderer.invoke('get-monedas-cambio');
    },
    getMonedasCambioByMonedaOrigen: async (monedaOrigenId) => {
        return await ipcRenderer.invoke('get-monedas-cambio-by-moneda-origen', monedaOrigenId);
    },
    getMonedaCambio: async (monedaCambioId) => {
        return await ipcRenderer.invoke('get-moneda-cambio', monedaCambioId);
    },
    createMonedaCambio: async (monedaCambioData) => {
        return await ipcRenderer.invoke('create-moneda-cambio', monedaCambioData);
    },
    updateMonedaCambio: async (monedaCambioId, monedaCambioData) => {
        return await ipcRenderer.invoke('update-moneda-cambio', monedaCambioId, monedaCambioData);
    },
    deleteMonedaCambio: async (monedaCambioId) => {
        return await ipcRenderer.invoke('delete-moneda-cambio', monedaCambioId);
    },
    // Proveedor methods
    getProveedores: async () => {
        return await ipcRenderer.invoke('getProveedores');
    },
    getProveedor: async (proveedorId) => {
        return await ipcRenderer.invoke('getProveedor', proveedorId);
    },
    createProveedor: async (proveedorData) => {
        return await ipcRenderer.invoke('createProveedor', proveedorData);
    },
    updateProveedor: async (proveedorId, proveedorData) => {
        return await ipcRenderer.invoke('updateProveedor', proveedorId, proveedorData);
    },
    deleteProveedor: async (proveedorId) => {
        return await ipcRenderer.invoke('deleteProveedor', proveedorId);
    },
    // Compra methods
    getCompras: async () => {
        return await ipcRenderer.invoke('getCompras');
    },
    getCompra: async (compraId) => {
        return await ipcRenderer.invoke('getCompra', compraId);
    },
    createCompra: async (compraData) => {
        return await ipcRenderer.invoke('createCompra', compraData);
    },
    updateCompra: async (compraId, compraData) => {
        return await ipcRenderer.invoke('updateCompra', compraId, compraData);
    },
    deleteCompra: async (compraId) => {
        return await ipcRenderer.invoke('deleteCompra', compraId);
    },
    // CompraDetalle methods
    getCompraDetalles: async (compraId) => {
        return await ipcRenderer.invoke('getCompraDetalles', compraId);
    },
    createCompraDetalle: async (detalleData) => {
        return await ipcRenderer.invoke('createCompraDetalle', detalleData);
    },
    updateCompraDetalle: async (detalleId, detalleData) => {
        return await ipcRenderer.invoke('updateCompraDetalle', detalleId, detalleData);
    },
    deleteCompraDetalle: async (detalleId) => {
        return await ipcRenderer.invoke('deleteCompraDetalle', detalleId);
    },
    // Pago methods
    getPagos: async () => {
        return await ipcRenderer.invoke('getPagos');
    },
    getPago: async (pagoId) => {
        return await ipcRenderer.invoke('getPago', pagoId);
    },
    createPago: async (pagoData) => {
        return await ipcRenderer.invoke('createPago', pagoData);
    },
    updatePago: async (pagoId, pagoData) => {
        return await ipcRenderer.invoke('updatePago', pagoId, pagoData);
    },
    deletePago: async (pagoId) => {
        return await ipcRenderer.invoke('deletePago', pagoId);
    },
    // PagoDetalle methods
    getPagoDetalles: async (pagoId) => {
        return await ipcRenderer.invoke('getPagoDetalles', pagoId);
    },
    createPagoDetalle: async (detalleData) => {
        return await ipcRenderer.invoke('createPagoDetalle', detalleData);
    },
    updatePagoDetalle: async (detalleId, detalleData) => {
        return await ipcRenderer.invoke('updatePagoDetalle', detalleId, detalleData);
    },
    deletePagoDetalle: async (detalleId) => {
        return await ipcRenderer.invoke('deletePagoDetalle', detalleId);
    },
    // ProveedorProducto methods
    getProveedorProductos: async (proveedorId) => {
        return await ipcRenderer.invoke('getProveedorProductos', proveedorId);
    },
    getProveedorProducto: async (proveedorProductoId) => {
        return await ipcRenderer.invoke('getProveedorProducto', proveedorProductoId);
    },
    createProveedorProducto: async (proveedorProductoData) => {
        return await ipcRenderer.invoke('createProveedorProducto', proveedorProductoData);
    },
    updateProveedorProducto: async (proveedorProductoId, proveedorProductoData) => {
        return await ipcRenderer.invoke('updateProveedorProducto', proveedorProductoId, proveedorProductoData);
    },
    deleteProveedorProducto: async (proveedorProductoId) => {
        return await ipcRenderer.invoke('deleteProveedorProducto', proveedorProductoId);
    },
    // System information
    getSystemMacAddress: () => ipcRenderer.invoke('get-system-mac-address'),
    // FormasPago methods
    getFormasPago: async () => {
        return await ipcRenderer.invoke('getFormasPago');
    },
    getFormaPago: async (formaPagoId) => {
        return await ipcRenderer.invoke('getFormaPago', formaPagoId);
    },
    createFormaPago: async (formaPagoData) => {
        return await ipcRenderer.invoke('createFormaPago', formaPagoData);
    },
    updateFormaPago: async (formaPagoId, formaPagoData) => {
        return await ipcRenderer.invoke('updateFormaPago', formaPagoId, formaPagoData);
    },
    deleteFormaPago: async (formaPagoId) => {
        return await ipcRenderer.invoke('deleteFormaPago', formaPagoId);
    },
    updateFormasPagoOrder: async (updates) => {
        return await ipcRenderer.invoke('updateFormasPagoOrder', updates);
    },
    // MovimientoStock methods
    getMovimientosStock: async () => {
        return await ipcRenderer.invoke('getMovimientosStock');
    },
    getMovimientoStock: async (movimientoStockId) => {
        return await ipcRenderer.invoke('getMovimientoStock', movimientoStockId);
    },
    getMovimientosStockByProducto: async (productoId) => {
        return await ipcRenderer.invoke('getMovimientosStockByProducto', productoId);
    },
    getMovimientosStockByIngrediente: async (ingredienteId) => {
        return await ipcRenderer.invoke('getMovimientosStockByIngrediente', ingredienteId);
    },
    getMovimientosStockByTipoReferencia: async (tipoReferencia) => {
        return await ipcRenderer.invoke('getMovimientosStockByTipoReferencia', tipoReferencia);
    },
    getMovimientosStockByReferenciaAndTipo: async (referencia, tipoReferencia) => {
        return await ipcRenderer.invoke('getMovimientosStockByReferenciaAndTipo', referencia, tipoReferencia);
    },
    getCurrentStockByProducto: async (productoId) => {
        return await ipcRenderer.invoke('getCurrentStockByProducto', productoId);
    },
    getCurrentStockByIngrediente: async (ingredienteId) => {
        return await ipcRenderer.invoke('getCurrentStockByIngrediente', ingredienteId);
    },
    createMovimientoStock: async (movimientoStockData) => {
        return await ipcRenderer.invoke('createMovimientoStock', movimientoStockData);
    },
    updateMovimientoStock: async (movimientoStockId, movimientoStockData) => {
        return await ipcRenderer.invoke('updateMovimientoStock', movimientoStockId, movimientoStockData);
    },
    deleteMovimientoStock: async (movimientoStockId) => {
        return await ipcRenderer.invoke('deleteMovimientoStock', movimientoStockId);
    },
});
//# sourceMappingURL=preload.js.map