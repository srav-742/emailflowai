const crypto = require('crypto');

const EMBEDDING_DIMENSION = 128;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'will', 'with',
]);

function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9$@.\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function hashToken(token) {
  const digest = crypto.createHash('sha256').update(token).digest();
  return digest.readUInt32BE(0);
}

async function embedText(text = '') {
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  const tokens = tokenize(text);

  if (!tokens.length) {
    return {
      embedding: vector,
      model: 'local-hash-v1',
      provider: 'local-hash',
    };
  }

  tokens.forEach((token, index) => {
    const hash = hashToken(`${token}:${index}`);
    const bucket = hash % EMBEDDING_DIMENSION;
    const sign = hash % 2 === 0 ? 1 : -1;
    const weight = token.startsWith('$') ? 1.6 : token.includes('@') ? 1.4 : 1;
    vector[bucket] += sign * weight;
  });

  return {
    embedding: normalizeVector(vector),
    model: 'local-hash-v1',
    provider: 'local-hash',
  };
}

module.exports = {
  EMBEDDING_DIMENSION,
  embedText,
  tokenize,
};
