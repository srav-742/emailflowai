const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2 } = require('../config/storage');
const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DocumentIntelligenceService = require('./stage4_documentIntelligenceService');

/**
 * Fetches an attachment from Gmail, uploads it to R2, and saves metadata to DB.
 */
async function saveAttachment(gmail, emailId, part, userId) {
  try {
    if (!part.body?.attachmentId) return;

    // 1. Fetch binary data from Gmail
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: emailId,
      id: part.body.attachmentId,
    });

    const buffer = Buffer.from(response.data.data, 'base64url');

    // 2. Upload to R2 (if configured)
    const filename = part.filename || 'unnamed_attachment';
    const key = `attachments/${emailId}/${Date.now()}_${filename}`;
    let storageKey = key;

    try {
      if (process.env.R2_BUCKET && r2) {
        await r2.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: part.mimeType || 'application/octet-stream',
        }));
      } else {
        storageKey = `local:${key}`;
        console.warn(`[AttachmentService] R2_BUCKET not configured. Skipping remote upload for ${filename}`);
      }
    } catch (uploadErr) {
      console.warn(`[AttachmentService] R2 Upload failed:`, uploadErr.message);
      storageKey = `failed:${key}`;
    }

    // 3. Save metadata to DB
    // Look up the internal DB email record using the external Gmail messageId
    let dbEmailId = emailId;
    const dbEmail = await prisma.email.findFirst({
      where: { messageId: emailId }
    });

    if (dbEmail) {
      dbEmailId = dbEmail.id;
    } else {
      console.warn(`[AttachmentService] Warning: Email with messageId ${emailId} not found in database. Attempting insertion with raw ID.`);
    }

    await prisma.attachment.create({
      data: {
        emailId: dbEmailId,
        filename,
        contentType: part.mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        storageKey,
      },
    });

    console.log(`[AttachmentService] Saved attachment metadata: ${filename} for email ${dbEmailId}`);

    // 4. Send to Document Intelligence Hub automatically
    if (userId) {
      const tempFilePath = path.join(os.tmpdir(), `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
      try {
        await fs.promises.writeFile(tempFilePath, buffer);
        await DocumentIntelligenceService.processAttachment(tempFilePath, part.mimeType || 'application/octet-stream', userId, filename);
        console.log(`[AttachmentService] Automatically processed document intelligence for ${filename}`);
      } catch (docErr) {
        console.error(`[AttachmentService] Failed to process document intelligence for ${filename}:`, docErr.message);
      } finally {
        await fs.promises.unlink(tempFilePath).catch(() => {}); // cleanup guaranteed
      }
    }
  } catch (error) {
    console.error(`[AttachmentService] Failed to save attachment for email ${emailId}:`, error.message);
  }
}

/**
 * Generates a time-limited presigned download URL (1 hour expiry).
 */
async function getDownloadUrl(storageKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: storageKey,
    });

    return await getSignedUrl(r2, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('[AttachmentService] Failed to generate presigned URL:', error.message);
    return null;
  }
}

module.exports = {
  saveAttachment,
  getDownloadUrl,
};
