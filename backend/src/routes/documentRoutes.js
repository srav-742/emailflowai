const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  uploadDocument,
  listDocuments,
  getDocument,
  searchDocuments,
  deleteDocument,
  syncEmailAttachments
} = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

// Ensure local temporary uploads directory exists safely
const uploadDir = path.join(__dirname, '../../uploads_tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer upload config
const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

// Apply auth middleware to ALL document intelligence nodes
router.use(authenticate);

router.post('/upload', upload.single('file'), asyncHandler(uploadDocument));
router.post('/sync-emails', asyncHandler(syncEmailAttachments));
router.get('/', asyncHandler(listDocuments));
router.get('/search', asyncHandler(searchDocuments));
router.get('/:id', asyncHandler(getDocument));
router.delete('/:id', asyncHandler(deleteDocument));

module.exports = router;
