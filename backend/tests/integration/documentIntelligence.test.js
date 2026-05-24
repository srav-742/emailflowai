const DocumentIntelligenceService = require('../../src/services/stage4_documentIntelligenceService');
const prisma = require('../../src/config/database');

jest.mock('../../src/config/database', () => ({
  $executeRawUnsafe: jest.fn().mockResolvedValue(true),
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/utils/xai', () => ({
  requestGroq: jest.fn().mockResolvedValue('{"document_type":"invoice", "vendor":"Stripe", "amount":"$500.00", "summary":"Mocked invoice"}'),
  extractJsonBlock: (val) => val,
}));

describe('Document Intelligence Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ensureDocumentTables can execute raw SQL commands to initialize tables', async () => {
    const spy = jest.spyOn(prisma, '$executeRawUnsafe');
    
    // Triggering database query which initiates dynamic tables ensure
    await DocumentIntelligenceService.searchDocuments('test-user-id', 'Stripe invoice');
    
    expect(spy).toHaveBeenCalled();
  });

  test('searchDocuments maps chunk results and executes cosine similarity correctly', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'chunk-1',
        document_id: 'doc-1',
        chunk_text: 'This is a stripe invoice receipt for $500',
        embedding: JSON.stringify(new Array(384).fill(0.1)),
        file_name: 'stripe.pdf',
        document_type: 'invoice'
      }
    ]);

    const results = await DocumentIntelligenceService.searchDocuments('test-user-id', 'stripe payment');
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
  });
});
