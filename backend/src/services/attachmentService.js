const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2 } = require('../config/storage');
const prisma = require('../config/database');

/**
 * Fetches an attachment from Gmail, uploads it to R2, and saves metadata to DB.
 */
async function saveAttachment(gmail, emailId, part) {
  try {
    if (!part.body?.attachmentId) return;

    // 1. Fetch binary data from Gmail
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: emailId,
      id: part.body.attachmentId,
    });

    const buffer = Buffer.from(response.data.data, 'base64url');

    // 2. Upload to R2
    const filename = part.filename || 'unnamed_attachment';
    const key = `attachments/${emailId}/${Date.now()}_${filename}`;
    
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: part.mimeType || 'application/octet-stream',
    }));

    // 3. Save metadata to DB
    await prisma.attachment.create({
      data: {
        emailId,
        filename,
        contentType: part.mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        storageKey: key,
      },
    });

    console.log(`[AttachmentService] Saved attachment: ${filename} for email ${emailId}`);
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
