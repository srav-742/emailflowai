const { EMBEDDING_DIMENSION, embedText, tokenize } = require('../../src/services/semanticEmbeddingService');

describe('semanticEmbeddingService', () => {
  test('tokenizes useful search terms and removes stop words', () => {
    expect(tokenize('Show me emails from Amazon about invoices')).toEqual([
      'show',
      'me',
      'emails',
      'amazon',
      'about',
      'invoices',
    ]);
  });

  test('creates deterministic normalized embeddings', async () => {
    const first = await embedText('invoice from amazon over $500');
    const second = await embedText('invoice from amazon over $500');

    expect(first.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(first.embedding).toEqual(second.embedding);
    expect(first.provider).toBe('local-hash');
  });
});
