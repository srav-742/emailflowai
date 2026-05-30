const { aiQueue } = require('./ai.queue');
const { gmailQueue } = require('./gmail.queue');
const { analyticsQueue } = require('./analytics.queue');
const { notificationQueue } = require('./notification.queue');
const { schedulerQueue } = require('./scheduler.queue');
const { mailSyncQueue } = require('./mail-sync.queue');
const { otpMailQueue } = require('./otpMail.queue');
const { enterpriseSyncQueue } = require('./enterpriseSync.queue');
const { getDeadLetterQueues } = require('./dead-letter.queue');

const primaryQueues = [
  { name: 'ai-processing', label: 'AI Processing', queue: aiQueue, type: 'primary' },
  { name: 'gmail-sync', label: 'Gmail Sync', queue: gmailQueue, type: 'primary' },
  { name: 'mail-sync', label: 'Mail Sync', queue: mailSyncQueue, type: 'primary' },
  { name: 'analytics-processing', label: 'Analytics Processing', queue: analyticsQueue, type: 'primary' },
  { name: 'notification-delivery', label: 'Notification Delivery', queue: notificationQueue, type: 'primary' },
  { name: 'scheduler', label: 'Scheduler', queue: schedulerQueue, type: 'primary' },
  { name: 'otp-mail-delivery', label: 'OTP Mail Delivery', queue: otpMailQueue, type: 'primary' },
  { name: 'enterprise-sync', label: 'Enterprise Sync', queue: enterpriseSyncQueue, type: 'primary' },
];

function getQueueEntries({ includeDeadLetter = true } = {}) {
  if (!includeDeadLetter) {
    return primaryQueues;
  }

  return [
    ...primaryQueues,
    ...getDeadLetterQueues(primaryQueues.map((entry) => entry.name)),
  ];
}

function getPrimaryQueueEntries() {
  return primaryQueues;
}

function findQueueEntry(queueName) {
  return getQueueEntries().find((entry) => entry.name === queueName);
}

module.exports = {
  getQueueEntries,
  getPrimaryQueueEntries,
  findQueueEntry,
};
