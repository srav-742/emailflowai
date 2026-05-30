const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const queues = new Map();

function buildDeadLetterQueueName(queueName) {
  return `${queueName}:dead-letter`;
}

function getDeadLetterQueue(queueName) {
  if (!queueName || typeof queueName !== 'string') {
    throw new Error('A queue name is required to create a dead-letter queue.');
  }

  const deadLetterQueueName = buildDeadLetterQueueName(queueName);

  if (!queues.has(deadLetterQueueName)) {
    queues.set(deadLetterQueueName, new Queue(deadLetterQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    }));
  }

  return queues.get(deadLetterQueueName);
}

function getDeadLetterQueues(queueNames = []) {
  return queueNames.map((queueName) => ({
    name: buildDeadLetterQueueName(queueName),
    queue: getDeadLetterQueue(queueName),
    type: 'dead-letter',
  }));
}

module.exports = {
  buildDeadLetterQueueName,
  getDeadLetterQueue,
  getDeadLetterQueues,
};
