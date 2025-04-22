"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPersonasHandlers = void 0;
const electron_1 = require("electron");
const persona_entity_1 = require("../../src/app/database/entities/personas/persona.entity");
const usuario_entity_1 = require("../../src/app/database/entities/personas/usuario.entity");
const role_entity_1 = require("../../src/app/database/entities/personas/role.entity");
const usuario_role_entity_1 = require("../../src/app/database/entities/personas/usuario-role.entity");
const tipo_cliente_entity_1 = require("../../src/app/database/entities/personas/tipo-cliente.entity");
const cliente_entity_1 = require("../../src/app/database/entities/personas/cliente.entity");
const entity_utils_1 = require("../utils/entity.utils"); // Import the utility function
function registerPersonasHandlers(dataSource, getCurrentUser) {
    // --- Persona Handlers ---
    electron_1.ipcMain.handle('get-personas', async () => {
        try {
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            return await personaRepository.find({
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting personas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-persona', async (_event, personaId) => {
        try {
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            return await personaRepository.findOneBy({ id: personaId });
        }
        catch (error) {
            console.error('Error getting persona:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-persona', async (_event, personaData) => {
        try {
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const currentUser = getCurrentUser();
            const persona = personaRepository.create({
                nombre: personaData.nombre,
                telefono: personaData.telefono,
                direccion: personaData.direccion,
                tipoDocumento: personaData.tipoDocumento,
                documento: personaData.documento,
                tipoPersona: personaData.tipoPersona,
                activo: personaData.activo !== undefined ? personaData.activo : true,
                imageUrl: personaData.imageUrl
            });
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, persona, currentUser?.id, false);
            const savedPersona = await personaRepository.save(persona);
            return savedPersona;
        }
        catch (error) {
            console.error('Error creating persona:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-persona', async (_event, personaId, personaData) => {
        try {
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const currentUser = getCurrentUser();
            const persona = await personaRepository.findOne({
                where: { id: personaId },
                relations: ['createdBy', 'updatedBy'] // Load relations if needed for tracking or display
            });
            if (!persona) {
                return { success: false, message: 'No persona found with that ID' };
            }
            // Update fields selectively
            if (personaData.nombre !== undefined)
                persona.nombre = personaData.nombre;
            if (personaData.telefono !== undefined)
                persona.telefono = personaData.telefono;
            if (personaData.direccion !== undefined)
                persona.direccion = personaData.direccion;
            if (personaData.tipoDocumento !== undefined)
                persona.tipoDocumento = personaData.tipoDocumento;
            if (personaData.documento !== undefined)
                persona.documento = personaData.documento;
            if (personaData.tipoPersona !== undefined)
                persona.tipoPersona = personaData.tipoPersona;
            if (personaData.activo !== undefined)
                persona.activo = personaData.activo;
            if (personaData.imageUrl !== undefined)
                persona.imageUrl = personaData.imageUrl;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, persona, currentUser?.id, true);
            const savedPersona = await personaRepository.save(persona);
            return { success: true, persona: savedPersona };
        }
        catch (error) {
            console.error('Error updating persona:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-persona', async (_event, personaId) => {
        try {
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const currentUser = getCurrentUser();
            const persona = await personaRepository.findOne({
                where: { id: personaId },
                relations: ['createdBy', 'updatedBy'] // Load relations if needed
            });
            if (!persona) {
                return { success: false, message: 'No persona found with that ID' };
            }
            persona.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, persona, currentUser?.id, true);
            await personaRepository.save(persona);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting persona:', error);
            throw error;
        }
    });
    // --- Usuario Handlers ---
    electron_1.ipcMain.handle('get-usuarios', async () => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            return await usuarioRepository.find({
                relations: ['persona'],
                order: { nickname: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting usuarios:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-usuario', async (_event, usuarioId) => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            return await usuarioRepository.findOne({
                where: { id: usuarioId },
                relations: ['persona']
            });
        }
        catch (error) {
            console.error('Error getting usuario:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-usuario', async (_event, usuarioData) => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const currentUser = getCurrentUser();
            const nicknameExists = await usuarioRepository.findOne({ where: { nickname: usuarioData.nickname } });
            if (nicknameExists) {
                return {
                    success: false,
                    message: 'El nombre de usuario ya está en uso. Por favor, elija otro.'
                };
            }
            let persona = null;
            if (usuarioData.persona_id != null) {
                persona = await personaRepository.findOneBy({ id: usuarioData.persona_id });
                if (!persona) {
                    return { success: false, message: 'Persona no encontrada' };
                }
            }
            const usuario = usuarioRepository.create({
                persona: persona,
                nickname: usuarioData.nickname,
                password: usuarioData.password || "123",
                activo: usuarioData.activo !== undefined ? usuarioData.activo : true
            });
            // Set tracking before saving
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, usuario, currentUser?.id, false);
            const savedUsuario = await usuarioRepository.save(usuario);
            // Fetch the complete usuario with relations to return
            const completeUsuario = await usuarioRepository.findOne({
                where: { id: savedUsuario.id },
                relations: ['persona', 'createdBy', 'updatedBy'] // Include tracking relations if needed
            });
            return {
                success: true,
                usuario: completeUsuario
            };
        }
        catch (error) {
            console.error('Error creating usuario:', error);
            return {
                success: false,
                message: 'Error al crear usuario: ' + (error instanceof Error ? error.message : String(error))
            };
        }
    });
    electron_1.ipcMain.handle('update-usuario', async (_event, usuarioId, usuarioData) => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const currentUser = getCurrentUser();
            const usuario = await usuarioRepository.findOne({
                where: { id: usuarioId },
                relations: ['persona', 'createdBy', 'updatedBy'] // Load relations
            });
            if (!usuario) {
                return { success: false, message: 'No usuario found with that ID' };
            }
            // Check nickname uniqueness if changed
            if (usuarioData.nickname !== undefined && usuarioData.nickname.toUpperCase() !== usuario.nickname.toUpperCase()) {
                const existingUsuario = await usuarioRepository
                    .createQueryBuilder('usuario')
                    .where('LOWER(usuario.nickname) = LOWER(:nickname)', { nickname: usuarioData.nickname })
                    .andWhere('usuario.id != :id', { id: usuarioId })
                    .getOne();
                if (existingUsuario) {
                    return {
                        success: false,
                        message: 'El nombre de usuario ya está en uso. Por favor, elija otro.'
                    };
                }
                usuario.nickname = usuarioData.nickname;
            }
            // Update persona if ID provided
            if (usuarioData.persona_id !== undefined) {
                if (usuarioData.persona_id === null) {
                    usuario.persona = null; // Allow unsetting the persona
                }
                else {
                    const persona = await personaRepository.findOneBy({ id: usuarioData.persona_id });
                    if (!persona) {
                        return { success: false, message: 'Persona not found' };
                    }
                    usuario.persona = persona;
                }
            }
            // Update other fields
            if (usuarioData.password !== undefined)
                usuario.password = usuarioData.password;
            if (usuarioData.activo !== undefined)
                usuario.activo = usuarioData.activo;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, usuario, currentUser?.id, true);
            const updatedUsuario = await usuarioRepository.save(usuario);
            return { success: true, usuario: updatedUsuario };
        }
        catch (error) {
            console.error('Error updating usuario:', error);
            return {
                success: false,
                message: 'Error al actualizar usuario: ' + (error instanceof Error ? error.message : String(error))
            };
        }
    });
    electron_1.ipcMain.handle('delete-usuario', async (_event, usuarioId) => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const currentUser = getCurrentUser();
            const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
            if (!usuario) {
                return { success: false, message: 'No usuario found with that ID' };
            }
            usuario.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, usuario, currentUser?.id, true); // Track the deactivation
            await usuarioRepository.save(usuario);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting usuario:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-usuarios-paginated', async (_event, page, pageSize, filters = {}) => {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const queryBuilder = usuarioRepository.createQueryBuilder('usuario')
                .leftJoinAndSelect('usuario.persona', 'persona');
            // Apply filters
            if (filters.nickname) {
                queryBuilder.andWhere("LOWER(usuario.nickname) LIKE LOWER(:nickname)", { nickname: `%${filters.nickname}%` });
            }
            if (filters.nombrePersona) {
                queryBuilder.andWhere("LOWER(persona.nombre) LIKE LOWER(:nombre)", { nombre: `%${filters.nombrePersona}%` });
            }
            if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
                const activoValue = String(filters.activo).toLowerCase() === 'true';
                queryBuilder.andWhere('usuario.activo = :activo', { activo: activoValue });
            }
            const total = await queryBuilder.getCount();
            const items = await queryBuilder
                .orderBy('usuario.nickname', 'ASC')
                .skip(page * pageSize)
                .take(pageSize)
                .getMany();
            return { items, total };
        }
        catch (error) {
            console.error('Error getting paginated usuarios:', error);
            throw error;
        }
    });
    // --- Role Handlers ---
    electron_1.ipcMain.handle('get-roles', async () => {
        try {
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            return await roleRepository.find({ order: { descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting roles:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-role', async (_event, roleId) => {
        try {
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            return await roleRepository.findOneBy({ id: roleId });
        }
        catch (error) {
            console.error('Error getting role:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-role', async (_event, roleData) => {
        try {
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            const currentUser = getCurrentUser();
            const role = roleRepository.create({
                descripcion: roleData.descripcion,
                activo: roleData.activo !== undefined ? roleData.activo : true
            });
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, role, currentUser?.id, false);
            const savedRole = await roleRepository.save(role);
            return savedRole;
        }
        catch (error) {
            console.error('Error creating role:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-role', async (_event, roleId, roleData) => {
        try {
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            const currentUser = getCurrentUser();
            const role = await roleRepository.findOneBy({ id: roleId });
            if (!role) {
                return { success: false, message: 'No role found with that ID' };
            }
            role.descripcion = roleData.descripcion;
            if (roleData.activo !== undefined) {
                role.activo = roleData.activo;
            }
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, role, currentUser?.id, true);
            const updatedRole = await roleRepository.save(role);
            return { success: true, role: updatedRole };
        }
        catch (error) {
            console.error('Error updating role:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-role', async (_event, roleId) => {
        try {
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            const currentUser = getCurrentUser();
            const role = await roleRepository.findOneBy({ id: roleId });
            if (!role) {
                return { success: false, message: 'No role found with that ID' };
            }
            role.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, role, currentUser?.id, true);
            await roleRepository.save(role);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting role:', error);
            throw error;
        }
    });
    // --- UsuarioRole Handlers ---
    electron_1.ipcMain.handle('get-usuario-roles', async (_event, usuarioId) => {
        try {
            const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
            return await usuarioRoleRepository.find({
                where: { usuario: { id: usuarioId } },
                relations: ['usuario', 'role', 'usuario.persona'] // Ensure role relation is loaded
            });
        }
        catch (error) {
            console.error('Error getting usuario roles:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('assign-role-to-usuario', async (_event, usuarioId, roleId) => {
        try {
            const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const roleRepository = dataSource.getRepository(role_entity_1.Role);
            const currentUser = getCurrentUser();
            const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
            if (!usuario)
                return { success: false, message: 'Usuario not found' };
            const role = await roleRepository.findOneBy({ id: roleId });
            if (!role)
                return { success: false, message: 'Role not found' };
            const existingAssignment = await usuarioRoleRepository.findOne({
                where: { usuario: { id: usuarioId }, role: { id: roleId } }
            });
            if (existingAssignment) {
                return { success: false, message: 'This role is already assigned to this user' };
            }
            const usuarioRole = usuarioRoleRepository.create({ usuario, role });
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, usuarioRole, currentUser?.id, false);
            const savedUsuarioRole = await usuarioRoleRepository.save(usuarioRole);
            // Fetch the complete role with relations
            const completeUsuarioRole = await usuarioRoleRepository.findOne({
                where: { id: savedUsuarioRole.id },
                relations: ['usuario', 'role', 'usuario.persona']
            });
            return { success: true, usuarioRole: completeUsuarioRole };
        }
        catch (error) {
            console.error('Error assigning role to usuario:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('remove-role-from-usuario', async (_event, usuarioRoleId) => {
        try {
            const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
            const result = await usuarioRoleRepository.delete(usuarioRoleId);
            return { success: result.affected && result.affected > 0 };
        }
        catch (error) {
            console.error('Error removing role from usuario:', error);
            throw error;
        }
    });
    // --- TipoCliente Handlers ---
    electron_1.ipcMain.handle('get-tipo-clientes', async () => {
        try {
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            return await tipoClienteRepository.find({ order: { descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting tipo clientes:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-tipo-cliente', async (_event, tipoClienteId) => {
        try {
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            return await tipoClienteRepository.findOneBy({ id: tipoClienteId });
        }
        catch (error) {
            console.error('Error getting tipo cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-tipo-cliente', async (_event, tipoClienteData) => {
        try {
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            const currentUser = getCurrentUser();
            const tipoCliente = tipoClienteRepository.create({
                descripcion: tipoClienteData.descripcion,
                activo: tipoClienteData.activo !== undefined ? tipoClienteData.activo : true,
                credito: tipoClienteData.credito !== undefined ? tipoClienteData.credito : false,
                descuento: tipoClienteData.descuento !== undefined ? tipoClienteData.descuento : false,
                porcentaje_descuento: tipoClienteData.porcentaje_descuento || 0
            });
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, tipoCliente, currentUser?.id, false);
            const savedTipoCliente = await tipoClienteRepository.save(tipoCliente);
            return savedTipoCliente;
        }
        catch (error) {
            console.error('Error creating tipo cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-tipo-cliente', async (_event, tipoClienteId, tipoClienteData) => {
        try {
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            const currentUser = getCurrentUser();
            const tipoCliente = await tipoClienteRepository.findOneBy({ id: tipoClienteId });
            if (!tipoCliente) {
                return { success: false, message: 'No tipo cliente found with that ID' };
            }
            // Merge data
            tipoClienteRepository.merge(tipoCliente, tipoClienteData);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, tipoCliente, currentUser?.id, true);
            const updatedTipoCliente = await tipoClienteRepository.save(tipoCliente);
            return { success: true, tipoCliente: updatedTipoCliente };
        }
        catch (error) {
            console.error('Error updating tipo cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-tipo-cliente', async (_event, tipoClienteId) => {
        try {
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            const currentUser = getCurrentUser();
            const tipoCliente = await tipoClienteRepository.findOneBy({ id: tipoClienteId });
            if (!tipoCliente) {
                return { success: false, message: 'No tipo cliente found with that ID' };
            }
            tipoCliente.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, tipoCliente, currentUser?.id, true);
            await tipoClienteRepository.save(tipoCliente);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting tipo cliente:', error);
            throw error;
        }
    });
    // --- Cliente Handlers ---
    electron_1.ipcMain.handle('get-clientes', async () => {
        try {
            const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
            return await clienteRepository.find({
                relations: ['persona', 'tipo_cliente'],
                order: { persona: { nombre: 'ASC' } }
            });
        }
        catch (error) {
            console.error('Error getting clientes:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-cliente', async (_event, clienteId) => {
        try {
            const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
            return await clienteRepository.findOne({
                where: { id: clienteId },
                relations: ['persona', 'tipo_cliente']
            });
        }
        catch (error) {
            console.error('Error getting cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-cliente', async (_event, clienteData) => {
        try {
            const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            const currentUser = getCurrentUser();
            const persona = await personaRepository.findOneBy({ id: clienteData.persona?.id });
            if (!persona)
                throw new Error('Persona not found');
            const tipoCliente = await tipoClienteRepository.findOneBy({ id: clienteData.tipo_cliente?.id });
            if (!tipoCliente)
                throw new Error('Tipo Cliente not found');
            const cliente = clienteRepository.create({
                persona,
                tipo_cliente: tipoCliente,
                ruc: clienteData.ruc,
                razon_social: clienteData.razon_social,
                tributa: clienteData.tributa !== undefined ? clienteData.tributa : false,
                activo: clienteData.activo !== undefined ? clienteData.activo : true,
                credito: clienteData.credito !== undefined ? clienteData.credito : false,
                limite_credito: clienteData.limite_credito || 0
            });
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, cliente, currentUser?.id, false);
            const savedCliente = await clienteRepository.save(cliente);
            // Fetch the complete cliente with relations
            const completeCliente = await clienteRepository.findOne({
                where: { id: savedCliente.id },
                relations: ['persona', 'tipo_cliente']
            });
            return completeCliente;
        }
        catch (error) {
            console.error('Error creating cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-cliente', async (_event, clienteId, clienteData) => {
        try {
            const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
            const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
            const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
            const currentUser = getCurrentUser();
            const cliente = await clienteRepository.findOne({
                where: { id: clienteId },
                relations: ['persona', 'tipo_cliente'] // Load existing relations
            });
            if (!cliente)
                return { success: false, message: 'No cliente found with that ID' };
            // Update relations if provided
            if (clienteData.persona?.id) {
                const persona = await personaRepository.findOneBy({ id: clienteData.persona.id });
                if (!persona)
                    return { success: false, message: 'Persona not found' };
                cliente.persona = persona;
            }
            if (clienteData.tipo_cliente?.id) {
                const tipoCliente = await tipoClienteRepository.findOneBy({ id: clienteData.tipo_cliente.id });
                if (!tipoCliente)
                    return { success: false, message: 'Tipo Cliente not found' };
                cliente.tipo_cliente = tipoCliente;
            }
            // Update fields
            if (clienteData.ruc !== undefined)
                cliente.ruc = clienteData.ruc;
            if (clienteData.razon_social !== undefined)
                cliente.razon_social = clienteData.razon_social;
            if (clienteData.tributa !== undefined)
                cliente.tributa = clienteData.tributa;
            if (clienteData.activo !== undefined)
                cliente.activo = clienteData.activo;
            if (clienteData.credito !== undefined)
                cliente.credito = clienteData.credito;
            if (clienteData.limite_credito !== undefined)
                cliente.limite_credito = clienteData.limite_credito;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, cliente, currentUser?.id, true);
            const updatedCliente = await clienteRepository.save(cliente);
            return { success: true, cliente: updatedCliente };
        }
        catch (error) {
            console.error('Error updating cliente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-cliente', async (_event, clienteId) => {
        try {
            const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
            const currentUser = getCurrentUser();
            const cliente = await clienteRepository.findOneBy({ id: clienteId });
            if (!cliente) {
                return { success: false, message: 'No cliente found with that ID' };
            }
            cliente.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, cliente, currentUser?.id, true);
            await clienteRepository.save(cliente);
            return { success: true };
        }
        catch (error) {
            console.error('Error deleting cliente:', error);
            throw error;
        }
    });
}
exports.registerPersonasHandlers = registerPersonasHandlers;
//# sourceMappingURL=personas.handler.js.map