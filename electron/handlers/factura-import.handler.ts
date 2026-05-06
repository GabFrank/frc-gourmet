import { app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { DocumentoCompraImportado } from '../../src/app/database/entities/compras/documento-compra-importado.entity';
import {
  DocumentoCompraImportadoEstado,
  DocumentoCompraImportadoTipo,
} from '../../src/app/database/entities/compras/documento-compra-importado-estado.enum';
import { OcrAliasProveedor } from '../../src/app/database/entities/compras/ocr-alias-proveedor.entity';
import { OcrAliasProducto } from '../../src/app/database/entities/compras/ocr-alias-producto.entity';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { CodigoBarra } from '../../src/app/database/entities/productos/codigo-barra.entity';
import { Compra } from '../../src/app/database/entities/compras/compra.entity';
import { CompraDetalle } from '../../src/app/database/entities/compras/compra-detalle.entity';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { setEntityUserTracking } from '../utils/entity.utils';
import { readIaConfig, writeIaConfig, IaConfig, DEFAULT_IA_CONFIG } from '../utils/ia-config.utils';
import {
  buildVisionDataUrl,
  callOpenAiVision,
  copyArchivoToImports,
  normalizeText,
  parseOpenAiError,
  validateFacturaJson,
  FacturaJson,
  FACTURA_PROMPT_BASE,
} from '../utils/factura-import.utils';
import {
  buildMatchResult,
  MatchResult,
} from '../utils/ocr-matcher.utils';
import {
  ensureIaPromptConfig,
  loadEffectivePrompt,
  parseAdiciones,
  setAdiciones,
} from '../utils/ia-prompt.utils';
import { IaPromptConfig } from '../../src/app/database/entities/ia/ia-prompt-config.entity';
import {
  IaPromptSugerencia,
  IaPromptSugerenciaEstado,
} from '../../src/app/database/entities/ia/ia-prompt-sugerencia.entity';

const MAX_BYTES = 5 * 1024 * 1024;

export function registerFacturaImportHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ============ IA CONFIG ============
  ipcMain.handle('ia-config-get', async () => {
    const cfg = readIaConfig(app.getPath('userData'));
    return { ...cfg, openaiApiKey: cfg.openaiApiKey ? '***' : '' };
  });

  ipcMain.handle('ia-config-get-raw', async () => {
    return readIaConfig(app.getPath('userData'));
  });

  ipcMain.handle('ia-config-set', async (_e, partial: Partial<IaConfig>) => {
    const current = readIaConfig(app.getPath('userData'));
    const next: IaConfig = { ...current };
    if (partial.modelo !== undefined) next.modelo = partial.modelo || DEFAULT_IA_CONFIG.modelo;
    if (partial.habilitado !== undefined) next.habilitado = !!partial.habilitado;
    if (partial.openaiApiKey !== undefined && partial.openaiApiKey !== '***') {
      next.openaiApiKey = partial.openaiApiKey;
    }
    writeIaConfig(app.getPath('userData'), next);
    return { success: true, config: { ...next, openaiApiKey: next.openaiApiKey ? '***' : '' } };
  });

  // ============ IA PROMPT CONFIG ============
  ipcMain.handle('ia-prompt-get', async () => {
    const cfg = await ensureIaPromptConfig(dataSource);
    return {
      id: cfg.id,
      promptBase: cfg.promptBase,
      promptBaseSeed: FACTURA_PROMPT_BASE,
      adiciones: parseAdiciones(cfg),
      version: cfg.version,
    };
  });

  ipcMain.handle('ia-prompt-set-adiciones', async (_e, payload: { adiciones: string[] }) => {
    const cfg = await setAdiciones(dataSource, payload?.adiciones || []);
    return {
      success: true,
      version: cfg.version,
      adiciones: parseAdiciones(cfg),
    };
  });

  ipcMain.handle('ia-prompt-effective', async () => {
    const eff = await loadEffectivePrompt(dataSource);
    return { text: eff.text, version: eff.version, lengthChars: eff.text.length };
  });

  // ============ IA PROMPT SUGERENCIAS ============
  ipcMain.handle('ia-prompt-sugerencia-list', async (_e, payload: { estado?: IaPromptSugerenciaEstado } = {}) => {
    const repo = dataSource.getRepository(IaPromptSugerencia);
    const qb = repo.createQueryBuilder('s')
      .leftJoinAndSelect('s.documentoOrigen', 'd')
      .orderBy('s.createdAt', 'DESC');
    if (payload.estado) qb.andWhere('s.estado = :estado', { estado: payload.estado });
    return await qb.getMany();
  });

  ipcMain.handle('ia-prompt-sugerencia-create', async (_e, payload: { texto: string; motivo?: string; documentoOrigenId?: number; origen?: string }) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(IaPromptSugerencia);
    const texto = (payload?.texto || '').trim();
    if (!texto) return { success: false, error: 'Texto vacio.' };
    const sug = repo.create({
      texto,
      motivo: payload?.motivo,
      origen: (payload?.origen || 'USUARIO').toUpperCase(),
      estado: IaPromptSugerenciaEstado.PENDIENTE,
      documentoOrigen: payload?.documentoOrigenId
        ? ({ id: payload.documentoOrigenId } as any)
        : undefined,
    });
    await setEntityUserTracking(dataSource, sug, userId, false);
    const saved = await repo.save(sug);
    return { success: true, id: saved.id };
  });

  ipcMain.handle('ia-prompt-sugerencia-aprobar', async (_e, payload: { id: number }) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(IaPromptSugerencia);
    const sug = await repo.findOne({ where: { id: payload.id } });
    if (!sug) return { success: false, error: 'Sugerencia no encontrada.' };
    if (sug.estado !== IaPromptSugerenciaEstado.PENDIENTE) {
      return { success: false, error: `Sugerencia ya esta ${sug.estado}.` };
    }
    const cfg = await ensureIaPromptConfig(dataSource);
    const adiciones = parseAdiciones(cfg);
    if (!adiciones.includes(sug.texto)) adiciones.push(sug.texto);
    await setAdiciones(dataSource, adiciones);
    sug.estado = IaPromptSugerenciaEstado.APROBADA;
    await setEntityUserTracking(dataSource, sug, userId, true);
    await repo.save(sug);
    return { success: true };
  });

  ipcMain.handle('ia-prompt-sugerencia-rechazar', async (_e, payload: { id: number; motivo?: string }) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(IaPromptSugerencia);
    const sug = await repo.findOne({ where: { id: payload.id } });
    if (!sug) return { success: false, error: 'Sugerencia no encontrada.' };
    sug.estado = IaPromptSugerenciaEstado.RECHAZADA;
    if (payload?.motivo) sug.motivo = payload.motivo;
    await setEntityUserTracking(dataSource, sug, userId, true);
    await repo.save(sug);
    return { success: true };
  });

  ipcMain.handle('ia-prompt-sugerencia-delete', async (_e, payload: { id: number }) => {
    const repo = dataSource.getRepository(IaPromptSugerencia);
    const sug = await repo.findOne({ where: { id: payload.id } });
    if (!sug) return { success: false, error: 'Sugerencia no encontrada.' };
    await repo.remove(sug);
    return { success: true };
  });

  ipcMain.handle('ia-config-test', async () => {
    const cfg = readIaConfig(app.getPath('userData'));
    if (!cfg.openaiApiKey) {
      return { success: false, message: 'API key vacia.' };
    }
    const start = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.openaiApiKey}` },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text();
        return { success: false, message: parseOpenAiError(res.status, txt), latencyMs };
      }
      return { success: true, message: 'Conexion OK', latencyMs, modelo: cfg.modelo };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error desconocido', latencyMs: Date.now() - start };
    }
  });

  // ============ FACTURA IMPORT ============
  ipcMain.handle('factura-import-pick-file', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Seleccionar factura (imagen o PDF)',
      properties: ['openFile'],
      filters: [
        { name: 'Imagen o PDF', extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] },
        { name: 'Todos', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { canceled: true };
    }
    const filePath = res.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const fileType: 'PDF' | 'IMAGE' = ext === '.pdf' ? 'PDF' : 'IMAGE';
    return { canceled: false, filePath, fileType };
  });

  ipcMain.handle('factura-import-process', async (_e, payload: { filePath: string }) => {
    const userDataPath = app.getPath('userData');
    const userId = getCurrentUser()?.id;
    const cfg = readIaConfig(userDataPath);
    if (!cfg.habilitado || !cfg.openaiApiKey) {
      return { success: false, error: 'IA deshabilitada o sin API key. Configura desde Sistema → Configurar IA.' };
    }
    if (!payload?.filePath || !fs.existsSync(payload.filePath)) {
      return { success: false, error: 'Archivo no encontrado.' };
    }
    const stat = fs.statSync(payload.filePath);
    if (stat.size > MAX_BYTES) {
      return { success: false, error: `Archivo demasiado grande (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.` };
    }

    const promptEff = await loadEffectivePrompt(dataSource);

    const copied = copyArchivoToImports(userDataPath, payload.filePath);
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    const doc = repo.create({
      archivoUrl: copied.archivoUrl,
      archivoNombre: copied.archivoNombre,
      archivoTipo: copied.archivoTipo as DocumentoCompraImportadoTipo,
      estado: DocumentoCompraImportadoEstado.PROCESANDO,
      intentos: 1,
      modeloUsado: cfg.modelo,
      promptVersion: promptEff.version,
    });
    await setEntityUserTracking(dataSource, doc, userId, false);
    const savedDoc = await repo.save(doc);

    try {
      const dataUrl = await buildVisionDataUrl(copied.destPath);
      const sizeKb = (dataUrl.length * 0.75 / 1024).toFixed(1);
      console.log(`[factura-import] imagen lista para vision: ${sizeKb} KB (${copied.archivoTipo})`);

      // Persistir PNG al lado del PDF para inspeccion manual si falla
      if (copied.archivoTipo === 'PDF' && dataUrl.startsWith('data:image/png;base64,')) {
        const pngPath = copied.destPath.replace(/\.pdf$/i, '.render.png');
        try {
          const b64 = dataUrl.split(',')[1];
          fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
          console.log(`[factura-import] PNG render guardado en ${pngPath}`);
        } catch (e) { /* noop */ }
      }

      const aiRes = await callOpenAiVision({
        apiKey: cfg.openaiApiKey,
        modelo: cfg.modelo,
        base64DataUrl: dataUrl,
        promptText: promptEff.text,
      });

      savedDoc.jsonCrudo = JSON.stringify(aiRes.json);
      savedDoc.tokensPrompt = aiRes.tokensPrompt;
      savedDoc.tokensCompletion = aiRes.tokensCompletion;
      savedDoc.modeloUsado = aiRes.modelo;

      const validated = validateFacturaJson(aiRes.json);
      if (validated.ok === false) {
        savedDoc.estado = DocumentoCompraImportadoEstado.ERROR;
        savedDoc.errorMensaje = validated.error;
        await setEntityUserTracking(dataSource, savedDoc, userId, true);
        await repo.save(savedDoc);
        return { success: false, documentoId: savedDoc.id, error: validated.error };
      }

      savedDoc.jsonValidado = JSON.stringify(validated.result.factura);
      savedDoc.estado = DocumentoCompraImportadoEstado.REQUIERE_REVISION;
      savedDoc.errorMensaje = validated.result.warnings.length ? validated.result.warnings.join(' | ') : undefined;
      await setEntityUserTracking(dataSource, savedDoc, userId, true);
      await repo.save(savedDoc);

      return { success: true, documentoId: savedDoc.id, warnings: validated.result.warnings };
    } catch (e: any) {
      savedDoc.estado = DocumentoCompraImportadoEstado.ERROR;
      savedDoc.errorMensaje = e?.message?.slice(0, 1000) || 'Error desconocido';
      await setEntityUserTracking(dataSource, savedDoc, userId, true);
      await repo.save(savedDoc);
      return { success: false, documentoId: savedDoc.id, error: savedDoc.errorMensaje };
    }
  });

  ipcMain.handle('factura-import-reprocess', async (_e, payload: { documentoId: number }) => {
    const userDataPath = app.getPath('userData');
    const userId = getCurrentUser()?.id;
    const cfg = readIaConfig(userDataPath);
    if (!cfg.habilitado || !cfg.openaiApiKey) {
      return { success: false, error: 'IA deshabilitada o sin API key.' };
    }
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    const doc = await repo.findOne({ where: { id: payload.documentoId } });
    if (!doc) return { success: false, error: 'Documento no encontrado.' };

    const localPath = doc.archivoUrl.replace('app://factura-imports/', '');
    const fullPath = path.join(userDataPath, 'factura-imports', localPath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Archivo original no encontrado en disco.' };
    }

    const promptEff = await loadEffectivePrompt(dataSource);
    doc.estado = DocumentoCompraImportadoEstado.PROCESANDO;
    doc.intentos = (doc.intentos || 0) + 1;
    doc.errorMensaje = undefined;
    doc.promptVersion = promptEff.version;
    await setEntityUserTracking(dataSource, doc, userId, true);
    await repo.save(doc);

    try {
      const dataUrl = await buildVisionDataUrl(fullPath);
      const aiRes = await callOpenAiVision({
        apiKey: cfg.openaiApiKey,
        modelo: cfg.modelo,
        base64DataUrl: dataUrl,
        promptText: promptEff.text,
      });

      doc.jsonCrudo = JSON.stringify(aiRes.json);
      doc.tokensPrompt = aiRes.tokensPrompt;
      doc.tokensCompletion = aiRes.tokensCompletion;
      doc.modeloUsado = aiRes.modelo;

      const validated = validateFacturaJson(aiRes.json);
      if (validated.ok === false) {
        doc.estado = DocumentoCompraImportadoEstado.ERROR;
        doc.errorMensaje = validated.error;
        await repo.save(doc);
        return { success: false, error: validated.error };
      }
      doc.jsonValidado = JSON.stringify(validated.result.factura);
      doc.estado = DocumentoCompraImportadoEstado.REQUIERE_REVISION;
      doc.errorMensaje = validated.result.warnings.length ? validated.result.warnings.join(' | ') : undefined;
      await repo.save(doc);
      return { success: true, warnings: validated.result.warnings };
    } catch (e: any) {
      doc.estado = DocumentoCompraImportadoEstado.ERROR;
      doc.errorMensaje = e?.message?.slice(0, 1000) || 'Error desconocido';
      await repo.save(doc);
      return { success: false, error: doc.errorMensaje };
    }
  });

  ipcMain.handle('factura-import-get', async (_e, payload: { documentoId: number }) => {
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    return await repo.findOne({
      where: { id: payload.documentoId },
      relations: ['compra'],
    });
  });

  ipcMain.handle('factura-import-list', async (_e, payload: { page?: number; pageSize?: number; estado?: string } = {}) => {
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    const page = Math.max(1, payload.page || 1);
    const pageSize = Math.min(100, payload.pageSize || 20);
    const qb = repo.createQueryBuilder('d')
      .leftJoinAndSelect('d.compra', 'c')
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (payload.estado) {
      qb.andWhere('d.estado = :estado', { estado: payload.estado });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  });

  ipcMain.handle('factura-import-descartar', async (_e, payload: { documentoId: number }) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    const doc = await repo.findOne({ where: { id: payload.documentoId } });
    if (!doc) return { success: false, error: 'No encontrado.' };
    doc.estado = DocumentoCompraImportadoEstado.DESCARTADO;
    await setEntityUserTracking(dataSource, doc, userId, true);
    await repo.save(doc);
    return { success: true };
  });

  // ============ MATCHING ============
  ipcMain.handle('factura-import-match', async (_e, payload: { documentoId: number }): Promise<MatchResult | { error: string }> => {
    const repo = dataSource.getRepository(DocumentoCompraImportado);
    const doc = await repo.findOne({ where: { id: payload.documentoId } });
    if (!doc) return { error: 'Documento no encontrado.' };
    if (!doc.jsonValidado) return { error: 'Documento sin JSON validado. Procesalo primero.' };

    let factura: FacturaJson;
    try {
      factura = JSON.parse(doc.jsonValidado);
    } catch {
      return { error: 'JSON validado corrupto.' };
    }

    const proveedoresActivos = await dataSource.getRepository(Proveedor).find({
      where: { activo: true },
      relations: ['persona'],
    });

    const aliasProveedoresRepo = dataSource.getRepository(OcrAliasProveedor);
    const aliasProveedores = await aliasProveedoresRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.proveedor', 'p')
      .leftJoinAndSelect('p.persona', 'per')
      .getMany();

    const productosActivos = await dataSource.getRepository(Producto)
      .createQueryBuilder('p')
      .where('p.activo = :a', { a: true })
      .andWhere('p.esComprable = :c', { c: true })
      .getMany();

    const presentaciones = await dataSource.getRepository(Presentacion)
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.producto', 'prod')
      .where('pr.activo = :a', { a: true })
      .getMany();

    const codigosBarra = await dataSource.getRepository(CodigoBarra)
      .createQueryBuilder('cb')
      .leftJoinAndSelect('cb.presentacion', 'pres')
      .leftJoinAndSelect('pres.producto', 'prod')
      .where('cb.activo = :a', { a: true })
      .getMany();

    const aliasProductosRepo = dataSource.getRepository(OcrAliasProducto);
    const aliasProductos = await aliasProductosRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.proveedor', 'pr')
      .leftJoinAndSelect('a.producto', 'p')
      .leftJoinAndSelect('a.presentacion', 'pres')
      .getMany();

    return buildMatchResult({
      documentoId: doc.id,
      factura,
      proveedoresActivos,
      aliasProveedores,
      productosActivos,
      presentaciones,
      codigosBarra,
      aliasProductos,
    });
  });

  ipcMain.handle('factura-import-confirm', async (_e, payload: {
    documentoId: number;
    datosCompra: any;
    itemsVinculados: Array<{
      indice: number;
      productoId: number;
      presentacionId: number | null;
      cantidad: number;
      costoUnitario: number;
      descripcionOcr: string;
      omitir: boolean;
    }>;
    aliasProveedor: { textoOcr: string; rucOcr: string | null; proveedorId: number };
  }) => {
    const userId = getCurrentUser()?.id;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const docRepo = qr.manager.getRepository(DocumentoCompraImportado);
      const doc = await docRepo.findOne({ where: { id: payload.documentoId } });
      if (!doc) throw new Error('Documento no encontrado.');
      if (doc.estado === DocumentoCompraImportadoEstado.CONFIRMADO) {
        throw new Error('Documento ya fue confirmado anteriormente.');
      }

      const dc = payload.datosCompra || {};
      const compra = qr.manager.create(Compra, {
        estado: CompraEstado.ABIERTO,
        isRecepcionMercaderia: false,
        activo: true,
        numeroNota: dc.numeroNota ? String(dc.numeroNota).toUpperCase() : null,
        tipoBoleta: dc.tipoBoleta || null,
        fechaCompra: dc.fechaCompra ? new Date(dc.fechaCompra) : new Date(),
        credito: !!dc.credito,
        plazoDias: dc.plazoDias ?? null,
        proveedor: { id: payload.aliasProveedor.proveedorId } as any,
        moneda: { id: dc.monedaId } as any,
        total: 0,
      });
      await setEntityUserTracking(dataSource, compra, userId, false);
      const savedCompra = await qr.manager.save(Compra, compra);

      let total = 0;
      const itemsValidos = payload.itemsVinculados.filter(i => !i.omitir && i.productoId && i.presentacionId);
      for (const it of itemsValidos) {
        let factor = 1;
        if (it.presentacionId) {
          const pres = await qr.manager.getRepository(Presentacion).findOne({ where: { id: it.presentacionId } });
          if (pres && pres.cantidad) factor = Number(pres.cantidad);
        }
        const cantidad = Number(it.cantidad);
        const costo = Number(it.costoUnitario);
        const subtotal = +(cantidad * costo).toFixed(2);
        const cantidadUB = +(cantidad * factor).toFixed(3);
        total += subtotal;
        const det = qr.manager.create(CompraDetalle, {
          compra: { id: savedCompra.id } as any,
          producto: { id: it.productoId } as any,
          presentacion: it.presentacionId ? { id: it.presentacionId } as any : null,
          cantidad,
          costoUnitarioPresentacion: costo,
          subtotal,
          cantidadUnidadBase: cantidadUB,
          activo: true,
        });
        await setEntityUserTracking(dataSource, det, userId, false);
        await qr.manager.save(CompraDetalle, det);
      }
      await qr.manager
        .getRepository(Compra)
        .createQueryBuilder()
        .update(Compra)
        .set({ total: +total.toFixed(2) })
        .where('id = :id', { id: savedCompra.id })
        .execute();

      // Upsert alias proveedor
      const ap = payload.aliasProveedor;
      if (ap?.proveedorId && ap.textoOcr) {
        const aliasProvRepo = qr.manager.getRepository(OcrAliasProveedor);
        const existing = await aliasProvRepo.findOne({
          where: { textoOcr: normalizeText(ap.textoOcr), proveedor: { id: ap.proveedorId } as any },
          relations: ['proveedor'],
        });
        if (existing) {
          existing.vecesUsado = (existing.vecesUsado || 0) + 1;
          if (ap.rucOcr) existing.rucOcr = ap.rucOcr;
          await setEntityUserTracking(dataSource, existing, userId, true);
          await aliasProvRepo.save(existing);
        } else {
          const nuevo = aliasProvRepo.create({
            textoOcr: normalizeText(ap.textoOcr),
            rucOcr: ap.rucOcr || undefined,
            proveedor: { id: ap.proveedorId } as any,
            vecesUsado: 1,
          });
          await setEntityUserTracking(dataSource, nuevo, userId, false);
          await aliasProvRepo.save(nuevo);
        }
      }

      // Upsert alias productos
      const aliasProdRepo = qr.manager.getRepository(OcrAliasProducto);
      for (const it of itemsValidos) {
        if (!it.descripcionOcr) continue;
        const texto = normalizeText(it.descripcionOcr);
        const existing = await aliasProdRepo.findOne({
          where: {
            textoOcr: texto,
            proveedor: { id: ap.proveedorId } as any,
            producto: { id: it.productoId } as any,
          },
          relations: ['producto', 'proveedor'],
        });
        if (existing) {
          existing.vecesUsado = (existing.vecesUsado || 0) + 1;
          if (it.presentacionId) existing.presentacion = { id: it.presentacionId } as any;
          await setEntityUserTracking(dataSource, existing, userId, true);
          await aliasProdRepo.save(existing);
        } else {
          const nuevo = aliasProdRepo.create({
            textoOcr: texto,
            proveedor: { id: ap.proveedorId } as any,
            producto: { id: it.productoId } as any,
            presentacion: it.presentacionId ? { id: it.presentacionId } as any : undefined,
            vecesUsado: 1,
          });
          await setEntityUserTracking(dataSource, nuevo, userId, false);
          await aliasProdRepo.save(nuevo);
        }
      }

      doc.estado = DocumentoCompraImportadoEstado.CONFIRMADO;
      doc.compra = { id: savedCompra.id } as any;
      await setEntityUserTracking(dataSource, doc, userId, true);
      await qr.manager.save(DocumentoCompraImportado, doc);

      await qr.commitTransaction();
      return { success: true, compraId: savedCompra.id };
    } catch (e: any) {
      await qr.rollbackTransaction();
      return { success: false, error: e?.message || 'Error desconocido' };
    } finally {
      await qr.release();
    }
  });
}
