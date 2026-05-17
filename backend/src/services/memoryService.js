/**
 * services/memoryService.js — Relationship Memory Graph
 * 
 * Production-grade Knowledge Graph abstraction inside PostgreSQL.
 * Uses Groq to extract entities and semantic relations from communications,
 * and executes query-focused graph traversal to synthesize business relationship summaries.
 */

const prisma = require('../config/database');
const { requestGroq, extractJsonBlock } = require('../utils/xai');

// ─── ENTITY EXTRACTION ENGINE ──────────────────────────────────────────────

/**
 * Extracts entities and relationships from an email and indexes them into the graph.
 */
async function extractAndIndexEmailEntities(email) {
  try {
    const textToAnalyze = `
Subject: ${email.subject || ''}
From: ${email.sender || ''}
Date: ${email.receivedAt?.toISOString() || ''}
Snippet: ${email.snippet || ''}
Body: ${(email.body || '').slice(0, 1500)}
`;

    const prompt = `Analyze the following email content and extract important business intelligence entities and their relationships.
We want to map these into a database Knowledge Graph.

STRICT ENTITY TYPES:
- "person": Any contact mentioned by name (e.g., "Sarah Connor", "John Doe").
- "company": Organizations, clients, or vendors (e.g., "Microsoft", "Google", "Stripe").
- "project": Named business initiatives, products, or campaigns (e.g., "Stage 3 Launch", "Website redesign").
- "deadline": Dates when deliverables are expected.
- "commitment": Specific promises, tasks, or action agreements made by the sender OR the recipient (e.g., "send draft review by Friday").

STRICT RELATIONSHIP TYPES (Source ID -> Target ID):
- "works_at": Links a person to their company.
- "committed_to": Links a person or company to a commitment.
- "belongs_to": Links a project to a company or a deadline to a project.
- "mentions": Links the email subject/context to any of these entities.

Return ONLY a valid JSON object matching this structure:
{
  "entities": [
    { "name": "Exact capitalized name", "type": "person | company | project | deadline | commitment", "description": "Quick context of who they are or what the item represents" }
  ],
  "relationships": [
    { "sourceName": "Sarah Connor", "sourceType": "person", "targetName": "Microsoft", "targetType": "company", "type": "works_at" },
    { "sourceName": "Email Context", "sourceType": "project", "targetName": "send draft by Friday", "targetType": "commitment", "type": "committed_to" }
  ]
}

Ensure:
- Entity names are standardized (e.g. convert "Microsoft Corp" to "Microsoft").
- If no entities/relationships are found, return empty lists.
- Do NOT output any explanation text, ONLY the JSON block.

Email Content:
${textToAnalyze}
`;

    const response = await requestGroq([
      { role: 'system', content: 'You are a graph database entity and relation extractor. Return clean, parsed structured JSON.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.1, maxTokens: 1000 });

    const jsonBlock = extractJsonBlock(response);
    if (!jsonBlock) return;

    const parsed = JSON.parse(jsonBlock);
    const entities = parsed.entities || [];
    const relationships = parsed.relationships || [];

    if (!entities.length) return;

    console.log(`🧠 [MemoryGraph] Extracted ${entities.length} entities and ${relationships.length} relationships for email: "${email.subject}"`);

    // 1. Persist extracted nodes (entities)
    const nodeMap = new Map(); // Maps standardized name+type key to Node record
    
    for (const ent of entities) {
      const standardizedName = String(ent.name).trim().replace(/["']/g, '');
      const type = String(ent.type).trim().toLowerCase();
      if (!standardizedName || !type) continue;

      const node = await prisma.memoryNode.upsert({
        where: {
          userId_name_type: {
            userId: email.userId,
            name: standardizedName,
            type
          }
        },
        update: {
          metadata: {
            description: ent.description || 'Synced contact node',
            lastEmailId: email.id,
            lastSubject: email.subject
          }
        },
        create: {
          userId: email.userId,
          name: standardizedName,
          type,
          metadata: {
            description: ent.description || 'Synced contact node',
            originEmailId: email.id,
            originSubject: email.subject
          }
        }
      });

      const key = `${standardizedName.toLowerCase()}:${type}`;
      nodeMap.set(key, node);
    }

    // 2. Persist relationships
    for (const rel of relationships) {
      const sourceKey = `${String(rel.sourceName).trim().toLowerCase()}:${String(rel.sourceType).trim().toLowerCase()}`;
      const targetKey = `${String(rel.targetName).trim().toLowerCase()}:${String(rel.targetType).trim().toLowerCase()}`;

      const sourceNode = nodeMap.get(sourceKey);
      const targetNode = nodeMap.get(targetKey);

      if (!sourceNode || !targetNode) continue;

      const relType = String(rel.type).trim().toLowerCase();

      await prisma.memoryRelation.upsert({
        where: {
          userId_sourceId_targetId_type: {
            userId: email.userId,
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            type: relType
          }
        },
        update: {
          metadata: {
            lastSeenEmailId: email.id,
            timestamp: new Date()
          }
        },
        create: {
          userId: email.userId,
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          type: relType,
          metadata: {
            associatedEmailId: email.id,
            associatedSubject: email.subject,
            timestamp: new Date()
          }
        }
      });
    }

  } catch (error) {
    console.error(`❌ [MemoryGraph] Extraction failed for email ${email.id}:`, error.message);
  }
}

// ─── MEMORY RELATION TIMELINE QUERY ENGINE ──────────────────────────────────

/**
 * Traverses relationships around matching entities and compiles an intelligence briefing.
 */
async function queryMemoryGraph(userId, queryText = '') {
  if (!queryText.trim()) return { summary: 'Please ask a relationship or timeline question.', nodes: [], edges: [] };

  try {
    console.log(`🕸️ [MemoryGraph] Querying relation net for user ${userId}: "${queryText}"`);

    // 1. Identify relevant node targets from query utilizing Groq
    const classificationPrompt = `Given the relationship graph query: "${queryText}"
Identify which specific entities (names) or entity types are being asked about.

Examples:
- "What commitments did I make to Microsoft?" -> Name: "Microsoft", Type: "company"
- "Timeline of projects with Sarah" -> Name: "Sarah", Type: "person"

Return ONLY a valid JSON array:
[
  { "name": "Name of entity", "type": "person | company | project | deadline | commitment | all" }
]
If none is matched, return an empty array. Do not write markdown or notes.
`;

    const classificationRes = await requestGroq([
      { role: 'system', content: 'You are an intelligent entity query translator. Extract entities in JSON format.' },
      { role: 'user', content: classificationPrompt }
    ], { temperature: 0.1, maxTokens: 200 });

    const entityArrayJson = extractJsonBlock(classificationRes, 'array');
    const targetEntities = entityArrayJson ? JSON.parse(entityArrayJson) : [];

    let coreNodeIds = [];
    let queryConditions = [];

    if (targetEntities.length > 0) {
      targetEntities.forEach(ent => {
        const nameQuery = String(ent.name).trim();
        if (nameQuery && nameQuery !== 'all') {
          queryConditions.push({
            name: { contains: nameQuery, mode: 'insensitive' }
          });
        }
      });
    }

    // If nothing found from AI extraction, fall back to simple keyword matching on the query text
    if (queryConditions.length === 0) {
      const keywords = queryText.match(/\b[A-Z][a-z]+\b/g) || []; // CamelCase words
      if (keywords.length > 0) {
        keywords.forEach(kw => {
          queryConditions.push({ name: { contains: kw, mode: 'insensitive' } });
        });
      } else {
        // Ultimate fallback: scan everything for matching text
        queryConditions.push({ name: { contains: queryText.slice(0, 10), mode: 'insensitive' } });
      }
    }

    // 2. Fetch matched core nodes
    const matchedNodes = await prisma.memoryNode.findMany({
      where: {
        userId,
        OR: queryConditions
      },
      take: 12
    });

    coreNodeIds = matchedNodes.map(n => n.id);

    if (coreNodeIds.length === 0) {
      return {
        summary: "I scanned your memory graph but could not locate specific entities matching your question. Try syncing more emails or searching for different contacts or companies.",
        nodes: [],
        edges: []
      };
    }

    // 3. Graph Traversal: Fetch first-degree relations (edges where core nodes are either source or target)
    const relations = await prisma.memoryRelation.findMany({
      where: {
        userId,
        OR: [
          { sourceId: { in: coreNodeIds } },
          { targetId: { in: coreNodeIds } }
        ]
      },
      include: {
        source: true,
        target: true
      },
      take: 30
    });

    // Extract all unique nodes involved in the network
    const nodeMap = new Map();
    matchedNodes.forEach(n => nodeMap.set(n.id, n));
    
    relations.forEach(rel => {
      if (!nodeMap.has(rel.sourceId)) nodeMap.set(rel.sourceId, rel.source);
      if (!nodeMap.has(rel.targetId)) nodeMap.set(rel.targetId, rel.target);
    });

    const networkNodes = Array.from(nodeMap.values());
    const networkEdges = relations.map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      sourceName: r.source.name,
      targetId: r.targetId,
      targetName: r.target.name,
      type: r.type,
      metadata: r.metadata
    }));

    // 4. Graph prompt synthesis via Groq
    const nodesString = networkNodes.map(n => `- [Node] ID: ${n.id}, Name: ${n.name}, Type: ${n.type}, Description: ${n.metadata?.description || ''}`).join('\n');
    const edgesString = networkEdges.map(e => `- [Edge] "${e.sourceName}" (${e.type}) -> "${e.targetName}"`).join('\n');

    const synthesisPrompt = `You are the ultimate Chief of Staff relationship memory engine. The user is asking about their business network relationships: "${queryText}"

We traversed the PostgreSQL Knowledge Graph for user's indexed email history and returned the following graph entities (Nodes) and relationship connections (Edges):

=== ACTIVE GRAPH NODE ENTITIES ===
${nodesString}

=== ACTIVE GRAPH RELATIONSHIP LINKS ===
${edgesString}

STRICT INSTRUCTIONS:
- Review the graph connections to analyze the conversation history, deadlines, and promises.
- Synthesize a comprehensive, executive relationship briefing answering: "${queryText}".
- Use clean Markdown. Group answers under professional headers like:
  - **🤝 Relationship Status** (Summarize connection depth with the person/company)
  - **📌 Commitments & Promises** (List unresolved tasks or deliverables identified)
  - **⏳ Active Deadlines & Milestones** (Mention calendar or date objectives)
- Write in a natural, highly authoritative executive manner. Avoid saying "Based on the nodes provided".
- Keep it highly actionable!
`;

    const summary = await requestGroq([
      { role: 'system', content: 'You are an elite graph relationship summary engine. Deliver detailed timelines and risk audits based on node linkages.' },
      { role: 'user', content: synthesisPrompt }
    ], { temperature: 0.1, maxTokens: 800 });

    return {
      summary: summary || 'I calculated the relationship linkages but failed to compile the briefing summary.',
      nodes: networkNodes.map(n => ({ id: n.id, name: n.name, type: n.type, description: n.metadata?.description })),
      edges: networkEdges
    };

  } catch (error) {
    console.error('❌ [MemoryGraph] Query process failed:', error.message);
    return {
      summary: 'An error occurred during knowledge graph traversal.',
      nodes: [],
      edges: []
    };
  }
}

module.exports = {
  extractAndIndexEmailEntities,
  queryMemoryGraph
};
