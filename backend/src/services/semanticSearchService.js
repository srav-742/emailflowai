/**
 * services/semanticSearchService.js — Semantic AI Search
 * 
 * Production-grade vector search engine.
 * Supports:
 * - Mode A: Qdrant vector database (if QDRANT_URL is set in .env)
 * - Mode B: Postgres-native vector storage and Cosine Similarity in Node.js
 * 
 * Generates embeddings via:
 * 1. OpenAI Embeddings (if OPENAI_API_KEY is available)
 * 2. Hugging Face free feature-extraction (sentence-transformers/all-MiniLM-L6-v2)
 * 3. Local TF-IDF word frequency vectorization (safe fallback)
 */

const axios = require('axios');
const prisma = require('../config/database');
const { requestGroq, extractJsonBlock } = require('../utils/xai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// ─── EMBEDDING GENERATOR ───────────────────────────────────────────────────

/**
 * Generates float array embeddings for a text string.
 * Uses OpenAI, Hugging Face, or local token-frequency calculations.
 */
async function generateEmbedding(text = '') {
  const cleanText = String(text).replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!cleanText) return new Array(384).fill(0); // Return empty vector

  // 1. Attempt OpenAI if key is present
  if (OPENAI_API_KEY) {
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/embeddings',
        { input: cleanText, model: 'text-embedding-3-small' },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, timeout: 8000 }
      );
      const vector = res.data?.data?.[0]?.embedding;
      if (Array.isArray(vector)) return vector;
    } catch (err) {
      console.warn('⚠️ [Embeddings] OpenAI embedding failed, falling back...', err.message);
    }
  }

  // 2. Attempt Hugging Face inference pipeline (Zero-config free endpoint, 384-dimensional MiniLM vector)
  try {
    const res = await axios.post(
      'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
      { inputs: cleanText },
      { timeout: 8000 }
    );
    if (Array.isArray(res.data) && typeof res.data[0] === 'number') {
      return res.data;
    }
    // Nested array formatting
    if (Array.isArray(res.data?.[0]) && typeof res.data[0][0] === 'number') {
      return res.data[0];
    }
  } catch (err) {
    console.warn('⚠️ [Embeddings] Hugging Face pipeline failed/timed-out, using local fallback...', err.message);
  }

  // 3. Robust Local Fallback (Normalized TF-IDF Token Frequency, 384 dimension mapping)
  return generateLocalFrequencyVector(cleanText);
}

/**
 * Standard Cosine Similarity helper for floats
 */
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Creates a deterministic word frequency vector scaled to a fixed 384 dimensions.
 */
function generateLocalFrequencyVector(text = '') {
  const tokens = text.toLowerCase().match(/\b\w{3,15}\b/g) || [];
  const vector = new Array(384).fill(0);
  if (!tokens.length) return vector;

  tokens.forEach(token => {
    // Simple hash to map string to a dimension index [0...383]
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = token.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % 384;
    vector[idx] += 1;
  });

  // Normalize vector to unit length
  const sumSq = vector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    for (let i = 0; i < 384; i++) {
      vector[i] = vector[i] / magnitude;
    }
  }
  return vector;
}

// ─── INDEXING SERVICE ──────────────────────────────────────────────────────

/**
 * Indexes an email to our vector store.
 */
async function indexEmail(email) {
  try {
    const textToIndex = `Subject: ${email.subject || ''}\nFrom: ${email.sender || ''}\nContent: ${email.snippet || ''}\n${email.body || ''}`;
    const embedding = await generateEmbedding(textToIndex);
    const contentHash = String(email.id) + '-' + String(email.updatedAt?.getTime() || Date.now());

    // 1. Store in Qdrant if active
    if (QDRANT_URL) {
      try {
        await axios.put(
          `${QDRANT_URL}/collections/emails/points`,
          {
            points: [{
              id: email.id,
              vector: embedding,
              payload: {
                emailId: email.id,
                userId: email.userId,
                subject: email.subject,
                sender: email.sender,
                receivedAt: email.receivedAt
              }
            }]
          },
          { headers: QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {} }
        );
      } catch (err) {
        console.warn('⚠️ [SemanticSync] Qdrant write warning, writing locally...', err.message);
      }
    }

    // 2. Always persist locally in Postgres for 100% data durability and fallback reliability
    await prisma.semanticEmailIndex.upsert({
      where: { emailId: email.id },
      update: {
        contentHash,
        subjectText: email.subject || 'No subject',
        searchText: textToIndex.slice(0, 3000),
        embedding: embedding,
        embeddingModel: OPENAI_API_KEY ? 'text-embedding-3-small' : 'all-minilm-l6-v2-fallback',
        provider: QDRANT_URL ? 'qdrant-local-dual' : 'postgres-local'
      },
      create: {
        userId: email.userId,
        emailId: email.id,
        contentHash,
        subjectText: email.subject || 'No subject',
        searchText: textToIndex.slice(0, 3000),
        embedding: embedding,
        embeddingModel: OPENAI_API_KEY ? 'text-embedding-3-small' : 'all-minilm-l6-v2-fallback',
        provider: QDRANT_URL ? 'qdrant-local-dual' : 'postgres-local'
      }
    });

    console.log(`✅ [SemanticSearch] Indexed email: ${email.subject || email.id}`);
  } catch (error) {
    console.error(`❌ [SemanticSearch] Error indexing email ${email.id}:`, error.message);
  }
}

// ─── SEARCH & SYNTHESIS SERVICE ────────────────────────────────────────────

/**
 * Searches the communications index semantically and compiles a response brief.
 */
async function searchSemantically(userId, query = '', limit = 6) {
  if (!query.trim()) return { summary: 'Please specify a question.', matches: [] };

  try {
    console.log(`🔍 [SemanticSearch] Query received from user ${userId}: "${query}"`);
    const queryVector = await generateEmbedding(query);
    let matchedEmailIds = [];

    // Mode A: Query Qdrant
    if (QDRANT_URL) {
      try {
        const qdrantRes = await axios.post(
          `${QDRANT_URL}/collections/emails/points/search`,
          {
            vector: queryVector,
            limit,
            filter: {
              must: [{ key: 'userId', match: { value: userId } }]
            }
          },
          { headers: QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {} }
        );
        matchedEmailIds = (qdrantRes.data?.result || []).map(p => p.id);
      } catch (err) {
        console.warn('⚠️ [SemanticSearch] Qdrant search failed, falling back to local database similarity...', err.message);
      }
    }

    // Mode B: Local Database Cosine Similarity Matcher
    if (matchedEmailIds.length === 0) {
      const records = await prisma.semanticEmailIndex.findMany({
        where: { userId },
        select: { emailId: true, embedding: true }
      });

      console.log(`🧮 [SemanticSearch] Found ${records.length} stored indices. Calculating Cosine Similarities...`);
      
      const similarityScores = records.map(record => {
        let embeddingArray = record.embedding;
        if (typeof embeddingArray === 'string') {
          try { embeddingArray = JSON.parse(embeddingArray); } catch { embeddingArray = null; }
        }
        
        if (!Array.isArray(embeddingArray)) return { emailId: record.emailId, score: 0 };
        
        const score = calculateCosineSimilarity(queryVector, embeddingArray);
        return { emailId: record.emailId, score };
      });

      // Filter and sort by score descending
      similarityScores.sort((a, b) => b.score - a.score);
      matchedEmailIds = similarityScores
        .filter(item => item.score > 0.15) // Relevance threshold
        .slice(0, limit)
        .map(item => item.emailId);
    }

    if (matchedEmailIds.length === 0) {
      return {
        summary: 'No semantically matching communications were found inside your workspace. Try using other keywords or syncing your inbox.',
        matches: []
      };
    }

    // Retrieve full email documents from Database
    const emails = await prisma.email.findMany({
      where: { id: { in: matchedEmailIds } },
      select: {
        id: true,
        subject: true,
        sender: true,
        senderName: true,
        snippet: true,
        body: true,
        receivedAt: true,
        category: true,
        priority: true,
        threadId: true
      }
    });

    // Rank emails in order of matched index list
    const sortedEmails = matchedEmailIds
      .map(id => emails.find(e => e.id === id))
      .filter(Boolean);

    // ─── LLM ANSWER SYNTHESIS ───────────────────────────────────────────────
    
    const contextList = sortedEmails.map((e, idx) => 
      `[Email ${idx + 1}]
From: ${e.senderName || e.sender}
Date: ${e.receivedAt?.toLocaleString() || 'N/A'}
Subject: ${e.subject}
Snippet: ${e.snippet || ''}
Content: ${e.body ? e.body.slice(0, 800) : ''}
---`
    ).join('\n\n');

    const prompt = `You are a high-signal Chief of Staff Assistant. The user asked a natural-language query: "${query}"

Below is the relevant email history matching their question. Analyze this context carefully and provide a decisive, executive-grade summary.

STRICT INSTRUCTIONS:
- Directly answer the user's question in a clear, narrative style (1-2 crisp paragraphs).
- Bold key facts, names, commitments, or deadlines.
- If there are unresolved action items or risks visible, list them under a brief "📌 Immediate Actions/Follow-ups" section.
- NEVER start with filler phrases like "Based on the emails provided".
- Be professional, highly authoritative, and conversational.

Relevant Communications Context:
${contextList}
`;

    const summary = await requestGroq([
      { role: 'system', content: 'You are an email-intelligent search synthesis engine. Summarize relevant communication threads with extreme precision.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2, maxTokens: 800 });

    return {
      summary: summary || 'I synthesized matching email threads but was unable to compile the final brief. Review the matching threads directly.',
      matches: sortedEmails.map(e => ({
        id: e.id,
        subject: e.subject,
        sender: e.sender,
        senderName: e.senderName,
        snippet: e.snippet,
        receivedAt: e.receivedAt,
        category: e.category,
        priority: e.priority,
        threadId: e.threadId
      }))
    };
  } catch (error) {
    console.error('❌ [SemanticSearch] Search process failed:', error.message);
    return {
      summary: 'An error occurred during semantic processing. Please verify database connections or try a simpler search.',
      matches: []
    };
  }
}

module.exports = {
  generateEmbedding,
  indexEmail,
  searchSemantically
};
