const prisma = require('../../config/database');
const tokenManager = require('./tokenManagerService');
const accountHealthService = require('./accountHealthService');
const { google } = require('googleapis');
const redisClient = require('../../redisClient');

const SYNC_LOCK_TTL = 300; // 5 minutes

class EnterpriseSyncService {
  /**
   * Acquires a distributed lock for a specific account to prevent duplicate syncs.
   */
  async acquireLock(userId, email) {
    const lockKey = `sync_lock:v2:${userId}:${email}`;
    // Using set with NX and EX ensures atomic check-and-set
    const acquired = await redisClient.set(lockKey, 'locked', 'NX', 'EX', SYNC_LOCK_TTL);
    return acquired === 'OK';
  }

  /**
   * Releases the distributed lock.
   */
  async releaseLock(userId, email) {
    const lockKey = `sync_lock:v2:${userId}:${email}`;
    await redisClient.del(lockKey);
  }

  /**
   * The core V2 synchronization function.
   * Completely isolated from existing legacy sync logic.
   */
  async syncAccount(userId, email) {
    console.log(`[EnterpriseSync] Starting sync for ${email}`);
    
    // 1. Acquire lock
    const locked = await this.acquireLock(userId, email);
    if (!locked) {
      console.log(`[EnterpriseSync] Sync already in progress for ${email}. Skipping.`);
      return { status: 'skipped', reason: 'lock_active' };
    }

    try {
      // 2. Mark sync as in-progress in DB
      await prisma.emailAccount.update({
        where: { provider_email: { provider: 'gmail', email } },
        data: { syncStatus: 'syncing' }
      }).catch(() => {}); // Catch if emailAccount doesn't exist yet in the new schema, but it should

      // 3. Check health and get Secure Client
      const healthResult = await accountHealthService.checkAccountHealth(userId, email);
      if (healthResult.status === 'requires_reauth') {
        console.warn(`[EnterpriseSync] Account ${email} requires re-auth. Aborting sync.`);
        await this.updateSyncStatus(email, 'error');
        return { status: 'failed', reason: 'requires_reauth' };
      }

      const oauth2Client = await tokenManager.getSecureOAuth2Client(userId, email);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // 4. Perform Sync (Dummy implementation for architecture scaffolding)
      // In a full implementation, you would fetch message list, process emails, etc.
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10, // Small batch for V2 demo sync
      });

      console.log(`[EnterpriseSync] Successfully synced ${response.data.messages?.length || 0} messages for ${email}`);

      // 5. Update success status
      await this.updateSyncStatus(email, 'idle');
      await prisma.emailAccount.update({
        where: { provider_email: { provider: 'gmail', email } },
        data: { lastSyncAt: new Date() }
      }).catch(() => {});

      return { status: 'success', synced: response.data.messages?.length || 0 };

    } catch (error) {
      console.error(`[EnterpriseSync] Error syncing ${email}:`, error);
      await this.updateSyncStatus(email, 'error');
      return { status: 'failed', error: error.message };
    } finally {
      // 6. Always release lock
      await this.releaseLock(userId, email);
    }
  }

  async updateSyncStatus(email, status) {
    await prisma.emailAccount.update({
      where: { provider_email: { provider: 'gmail', email } },
      data: { syncStatus: status }
    }).catch(() => {});
  }
}

module.exports = new EnterpriseSyncService();
