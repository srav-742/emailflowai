const fs = require('fs');
const path = require('path');
const DocumentIntelligenceService = require('../services/stage4_documentIntelligenceService');
const prisma = require('../config/database');

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'application/json'
];

/**
 * Handle multipart attachment uploads
 */
const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { mimetype, size, path: tempPath, originalname } = req.file;

    // 1. MIME Validation
    if (!SUPPORTED_MIME_TYPES.includes(mimetype)) {
      if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath);
      return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
    }

    // 2. Size Validation (10MB maximum limit)
    if (size > 10 * 1024 * 1024) {
      if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath);
      return res.status(400).json({ error: 'File size exceeds the 10MB maximum limit.' });
    }

    console.log(`[DocumentController] Uploading secure doc: ${originalname} (${mimetype})`);

    // 3. Process attachment with Stage 4 engine
    const result = await DocumentIntelligenceService.processAttachment(
      tempPath,
      mimetype,
      req.user.id,
      originalname
    );

    // 4. Safely clean up local temporary upload file
    if (fs.existsSync(tempPath)) {
      await fs.promises.unlink(tempPath);
    }

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Parsing operation failed.' });
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error('[DocumentController] Upload error:', error);
    next(error);
  }
};

/**
 * Get all document index lists
 */
const listDocuments = async (req, res, next) => {
  try {
    const documents = await prisma.$queryRawUnsafe(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", storage_url AS "storageUrl", document_type AS "documentType", metadata, embedding_status AS "embeddingStatus", created_at AS "createdAt"
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      req.user.id
    );

    const formatted = documents.map(d => {
      let meta = {};
      try {
        meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata;
      } catch (e) {}
      return {
        ...d,
        metadata: meta
      };
    });

    return res.json({ success: true, documents: formatted });
  } catch (error) {
    console.error('[DocumentController] List error:', error);
    next(error);
  }
};

/**
 * Get document details
 */
const getDocument = async (req, res, next) => {
  try {
    const documents = await prisma.$queryRawUnsafe(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", storage_url AS "storageUrl", document_type AS "documentType", extracted_text AS "extractedText", metadata, embedding_status AS "embeddingStatus", created_at AS "createdAt"
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      req.params.id,
      req.user.id
    );

    if (!documents || documents.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = documents[0];
    let meta = {};
    try {
      meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
    } catch (e) {}

    return res.json({
      success: true,
      document: {
        ...doc,
        metadata: meta
      }
    });
  } catch (error) {
    console.error('[DocumentController] Get error:', error);
    next(error);
  }
};

/**
 * Natural language vector query matching
 */
const searchDocuments = async (req, res, next) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Search query parameter (q) is required.' });
    }

    console.log(`[DocumentController] NL Vector search: "${query}" for user: ${req.user.id}`);
    const matches = await DocumentIntelligenceService.searchDocuments(req.user.id, query);
    return res.json({ success: true, matches });
  } catch (error) {
    console.error('[DocumentController] Search error:', error);
    next(error);
  }
};

/**
 * Safe document deletion
 */
const deleteDocument = async (req, res, next) => {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM documents WHERE id = $1 AND user_id = $2`,
      req.params.id,
      req.user.id
    );

    return res.json({ success: true, message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('[DocumentController] Delete error:', error);
    next(error);
  }
};

module.exports = {
  uploadDocument,
  listDocuments,
  getDocument,
  searchDocuments,
  deleteDocument
};
