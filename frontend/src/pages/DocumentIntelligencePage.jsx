import { useState, useEffect } from 'react';
import { documentAPI } from '../services/api';
import './DocumentIntelligencePage.css';

const DocumentIntelligencePage = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [syncingEmails, setSyncingEmails] = useState(false);

  const handleSyncEmailAttachments = async () => {
    try {
      setSyncingEmails(true);
      setError(null);
      await documentAPI.syncEmails();
      await fetchDocuments();
    } catch (err) {
      console.error('Email attachment sync failed:', err);
      setError('Failed to scan and analyze email attachments.');
    } finally {
      setSyncingEmails(false);
    }
  };

  // Load history list on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const res = await documentAPI.list();
      setDocuments(res.data.documents || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Could not retrieve document database parameters.');
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file) => {
    try {
      setUploading(true);
      setError(null);
      console.log('Uploading and processing file:', file.name);
      
      const res = await documentAPI.upload(file);
      
      // Update history list and select the new parsed file
      await fetchDocuments();
      if (res.data) {
        // Construct visual representation
        const newDoc = {
          id: res.data.id,
          fileName: res.data.fileName,
          mimeType: res.data.mimeType,
          documentType: res.data.documentType,
          metadata: res.data.extractedData,
          createdAt: new Date().toISOString()
        };
        setSelectedDoc(newDoc);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.response?.data?.error || 'Document uploading or OCR parsing failed.');
    } finally {
      setUploading(false);
    }
  };

  // NL Semantic search
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await documentAPI.search(query);
      setSearchResults(res.data.matches || []);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const selectSuggestedSearch = async (suggestion) => {
    setSearchQuery(suggestion);
    try {
      const res = await documentAPI.search(suggestion);
      setSearchResults(res.data.matches || []);
    } catch (err) {
      console.error('Suggested search failed:', err);
    }
  };

  // Deletion
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this document and its semantic index?')) {
      return;
    }

    try {
      await documentAPI.delete(id);
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
      fetchDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Could not delete document.');
    }
  };

  // Select document to view
  const handleSelectDoc = async (doc) => {
    try {
      const res = await documentAPI.get(doc.id);
      setSelectedDoc(res.data.document);
    } catch (err) {
      console.error('Failed to load document details:', err);
      setSelectedDoc(doc);
    }
  };

  // Category filters
  const filteredDocs = documents.filter(doc => {
    if (activeFilter === 'all') return true;
    return doc.documentType === activeFilter;
  });

  const getDocIcon = (type) => {
    switch (type) {
      case 'invoice': return '🧾';
      case 'contract': return '📜';
      case 'resume': return '👔';
      case 'receipt': return '🪙';
      case 'financial_report': return '📊';
      default: return '📄';
    }
  };

  const getDocBadgeColor = (type) => {
    switch (type) {
      case 'invoice': return 'badge-invoice';
      case 'contract': return 'badge-contract';
      case 'resume': return 'badge-resume';
      case 'receipt': return 'badge-receipt';
      case 'financial_report': return 'badge-report';
      default: return 'badge-general';
    }
  };

  return (
    <div className="doc-intel-shell">
      
      {/* ─── ROW 1: CORE INGESTION & NL CONSOLE ─── */}
      <div className="doc-bento-grid">
        
        {/* Drag and Drop Uploader Deck */}
        <div className="bento-card uploader-card">
          <div className="card-glare"></div>
          <span className="eyebrow" style={{ color: 'var(--neon-blue)' }}>Ingestion Pipeline</span>
          <h3>Universal Parser</h3>
          <p style={{ color: 'var(--text-mute)', fontSize: '11px', marginBottom: '1.25rem' }}>
            Supports PDF, DOCX, XLSX, TXT, CSV, PNG, JPG (Auto OCR preprocessing)
          </p>

          <div 
            className={`drag-drop-zone ${uploading ? 'zone-uploading' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-picker-input').click()}
          >
            <input 
              type="file" 
              id="file-picker-input" 
              style={{ display: 'none' }} 
              onChange={handleFileSelect} 
              disabled={uploading}
            />
            {uploading ? (
              <div className="upload-loader-wrap">
                <div className="app-loading-spinner" style={{ width: '32px', height: '32px' }}></div>
                <p className="pulse-text" style={{ marginTop: '12px', fontSize: '13px' }}>OCRing & Indexing Vectors...</p>
                <div className="scanning-bar"></div>
              </div>
            ) : (
              <div className="upload-idle-wrap">
                <span className="upload-icon">🚀</span>
                <strong>Drag file here or click to upload</strong>
                <small style={{ color: 'var(--text-mute)', fontSize: '9px', marginTop: '4px', display: 'block' }}>
                  Maximum limit 10MB per upload
                </small>
              </div>
            )}
          </div>
          {error && <div className="uploader-error-banner">⚠️ {error}</div>}
        </div>

        {/* Semantic Search Console Deck */}
        <div className="bento-card search-console-card">
          <div className="card-glare" style={{ background: 'radial-gradient(800px circle at var(--x) var(--y), rgba(0, 229, 255, 0.08), transparent 40%)' }}></div>
          <span className="eyebrow" style={{ color: 'var(--neon-cyan)' }}>Semantic AI Recall</span>
          <h3>Natural Language Search</h3>
          
          <div className="search-console-input-wrap">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Query invoices, contracts, or skills naturally (e.g. 'Stripe invoices over $500')..." 
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>

          <span className="suggested-title">GLOW SUGGESTIONS</span>
          <div className="search-suggestions-container">
            {[
              'Show Stripe invoices over $500',
              'SLA renewal contracts',
              'Candidates with React and Docker skills',
              'Receipts paid with Visa'
            ].map(sug => (
              <button 
                key={sug} 
                className="suggestion-chip"
                onClick={() => selectSuggestedSearch(sug)}
              >
                ✦ {sug}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ─── ROW 2: HISTORY DOCK & INTERACTIVE VIEWER ─── */}
      <div className="doc-bento-grid workspace-row" style={{ marginTop: '1.5rem' }}>
        
        {/* Documents Historical List Panel */}
        <div className="bento-card doc-list-card">
          <div className="card-glare"></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--neon-violet)' }}>Telemetry Index</span>
              <h3>Document Archive</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={handleSyncEmailAttachments} 
                disabled={syncingEmails}
                className="button"
                style={{ 
                  padding: '6px 12px', 
                  fontSize: '11px', 
                  background: syncingEmails ? 'rgba(139, 111, 255, 0.1)' : 'rgba(139, 111, 255, 0.05)', 
                  border: '1px solid rgba(139, 111, 255, 0.35)', 
                  borderRadius: '8px',
                  color: 'var(--neon-violet)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: syncingEmails ? '0 0 10px rgba(139, 111, 255, 0.2)' : 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!syncingEmails) {
                    e.currentTarget.style.background = 'rgba(139, 111, 255, 0.15)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(139, 111, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!syncingEmails) {
                    e.currentTarget.style.background = 'rgba(139, 111, 255, 0.05)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {syncingEmails ? (
                  <>
                    <span className="app-loading-spinner" style={{ width: '12px', height: '12px', border: '2px solid rgba(139,111,255,0.2)', borderTopColor: 'var(--neon-violet)' }}></span>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <span>🔌</span> Ingest Email Docs
                  </>
                )}
              </button>
              <button className="refresh-btn" onClick={fetchDocuments} title="Refresh Archive" style={{ margin: 0, padding: '6px 10px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer' }}>🔄</button>
            </div>
          </div>

          {/* Quick Filter Menu */}
          <div className="doc-filter-bar">
            {['all', 'invoice', 'contract', 'resume', 'receipt', 'financial_report'].map(filter => (
              <button 
                key={filter} 
                className={`filter-tab ${activeFilter === filter ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter === 'all' ? 'All' : filter.replace('_', ' ').charAt(0).toUpperCase() + filter.replace('_', ' ').slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="dock-loading-shell">
              <div className="app-loading-spinner" style={{ width: '20px', height: '20px' }}></div>
              <p style={{ fontSize: '11px', color: 'var(--text-mute)', marginTop: '8px' }}>Syncing vector database...</p>
            </div>
          ) : searchQuery.trim() ? (
            /* Search results view */
            <div className="historical-documents-scroller">
              <div className="results-indicator">✦ Semantic matches for "{searchQuery}"</div>
              {searchResults.length === 0 ? (
                <div className="empty-archive">No semantic matches found.</div>
              ) : (
                searchResults.map(match => (
                  <div 
                    key={match.id}
                    className={`historical-doc-card ${selectedDoc?.id === match.documentId ? 'active' : ''}`}
                    onClick={() => handleSelectDoc({ id: match.documentId })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="doc-card-info" style={{ maxWidth: '85%' }}>
                        <div className="doc-title-row">
                          <span style={{ marginRight: '8px' }}>{getDocIcon(match.documentType)}</span>
                          <strong className="fileName-txt">{match.fileName}</strong>
                        </div>
                        <div className="search-match-snippet">
                          "...{match.chunkText.slice(0, 180)}..."
                        </div>
                      </div>
                      <span className="match-score">{(match.score * 100).toFixed(0)}% Match</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Standard archive list */
            <div className="historical-documents-scroller">
              {filteredDocs.length === 0 ? (
                <div className="empty-archive">
                  <span>📂</span>
                  <p>No documents processed in this category.</p>
                </div>
              ) : (
                filteredDocs.map(doc => (
                  <div 
                    key={doc.id}
                    className={`historical-doc-card ${selectedDoc?.id === doc.id ? 'active' : ''}`}
                    onClick={() => handleSelectDoc(doc)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="doc-card-info" style={{ overflow: 'hidden' }}>
                        <div className="doc-title-row">
                          <span style={{ marginRight: '6px' }}>{getDocIcon(doc.documentType)}</span>
                          <strong className="fileName-txt">{doc.fileName}</strong>
                        </div>
                        <small style={{ color: 'var(--text-mute)', fontSize: '10px' }}>
                          Uploaded: {new Date(doc.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`type-badge ${getDocBadgeColor(doc.documentType)}`}>
                          {doc.documentType?.toUpperCase()}
                        </span>
                        <button className="del-doc-btn" onClick={(e) => handleDelete(doc.id, e)} title="Delete Document">
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Detailed Document Viewer Panel */}
        <div className="bento-card doc-viewer-card">
          <div className="card-glare" style={{ background: 'radial-gradient(800px circle at var(--x) var(--y), rgba(139, 111, 255, 0.06), transparent 40%)' }}></div>
          {selectedDoc ? (
            <div className="viewer-content">
              {/* Header */}
              <div className="viewer-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`type-badge ${getDocBadgeColor(selectedDoc.documentType)}`}>
                    {getDocIcon(selectedDoc.documentType)} {selectedDoc.documentType?.toUpperCase()}
                  </span>
                  <small style={{ color: 'var(--text-mute)' }}>ID: {selectedDoc.id.slice(0, 8)}...</small>
                </div>
                <h2>{selectedDoc.fileName || selectedDoc.file_name}</h2>
                <div style={{ fontSize: '11px', color: 'var(--text-mute)', marginTop: '4px' }}>
                  MIME: {selectedDoc.mimeType || selectedDoc.mime_type} | Extracted: {new Date(selectedDoc.createdAt || selectedDoc.created_at).toLocaleString()}
                </div>
              </div>

              {/* Main summaries */}
              <div className="viewer-block executive-block">
                <h4>📌 AI EXECUTIVE SUMMARY</h4>
                <p>{selectedDoc.metadata?.summary || 'Executive summary compiled for this asset node.'}</p>
              </div>

              {/* Specific metadata blocks based on classification */}
              {selectedDoc.documentType === 'invoice' && (
                <div className="viewer-meta-grid">
                  <div className="meta-item">
                    <small>VENDOR</small>
                    <strong>{selectedDoc.metadata?.vendor || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>INVOICE NUMBER</small>
                    <strong>{selectedDoc.metadata?.invoice_number || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>TOTAL AMOUNT</small>
                    <strong style={{ color: 'var(--neon-green)' }}>{selectedDoc.metadata?.amount || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>DUE DATE</small>
                    <strong style={{ color: 'var(--neon-red)' }}>{selectedDoc.metadata?.due_date || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>TAXES</small>
                    <strong>{selectedDoc.metadata?.taxes || '$0.00'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>STATUS</small>
                    <strong className="status-val">{selectedDoc.metadata?.payment_status?.toUpperCase() || 'UNPAID'}</strong>
                  </div>
                </div>
              )}

              {selectedDoc.documentType === 'contract' && (
                <div className="viewer-meta-grid text-vertical">
                  <div className="meta-item-full">
                    <small>CONTRACT PARTIES</small>
                    <div className="party-tags">
                      {(selectedDoc.metadata?.parties || []).map((party, i) => (
                        <span key={i} className="party-tag">✦ {party}</span>
                      ))}
                      {(!selectedDoc.metadata?.parties || selectedDoc.metadata.parties.length === 0) && <span>N/A</span>}
                    </div>
                  </div>
                  <div className="meta-item-full">
                    <small>CRITICAL OBLIGATIONS</small>
                    <ul>
                      {(selectedDoc.metadata?.obligations || []).map((ob, i) => (
                        <li key={i}>{ob}</li>
                      ))}
                      {(!selectedDoc.metadata?.obligations || selectedDoc.metadata.obligations.length === 0) && <li>No specific obligations extracted.</li>}
                    </ul>
                  </div>
                  <div className="meta-item-full">
                    <small>PAYMENT TERMS & RENEWAL CLAUSES</small>
                    <p style={{ fontSize: '11px', color: 'var(--text-dimmed)', margin: '4px 0 0' }}>
                      <strong>Payment Terms:</strong> {selectedDoc.metadata?.payment_terms || 'N/A'}<br/>
                      <strong>Renewal:</strong> {selectedDoc.metadata?.renewal_clauses || 'N/A'}
                    </p>
                  </div>
                </div>
              )}

              {selectedDoc.documentType === 'resume' && (
                <div className="viewer-meta-grid text-vertical">
                  <div className="meta-item">
                    <small>CANDIDATE NAME</small>
                    <strong>{selectedDoc.metadata?.candidate_name || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>EXPERIENCE YEARS</small>
                    <strong>{selectedDoc.metadata?.experience_years || 0} Years</strong>
                  </div>
                  <div className="meta-item-full">
                    <small>KEY SKILLS</small>
                    <div className="skills-tags">
                      {(selectedDoc.metadata?.key_skills || []).map((skill, i) => (
                        <span key={i} className="skill-chip">{skill}</span>
                      ))}
                    </div>
                  </div>
                  <div className="meta-item-full">
                    <small>EDUCATION</small>
                    <p style={{ margin: '4px 0 0' }}>{selectedDoc.metadata?.education || 'N/A'}</p>
                  </div>
                </div>
              )}

              {selectedDoc.documentType === 'receipt' && (
                <div className="viewer-meta-grid">
                  <div className="meta-item">
                    <small>STORE/VENDOR</small>
                    <strong>{selectedDoc.metadata?.vendor || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>TRANSACTION AMOUNT</small>
                    <strong style={{ color: 'var(--neon-green)' }}>{selectedDoc.metadata?.amount || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>DATE</small>
                    <strong>{selectedDoc.metadata?.date || 'N/A'}</strong>
                  </div>
                  <div className="meta-item">
                    <small>PAYMENT METHOD</small>
                    <strong>{selectedDoc.metadata?.payment_method || 'N/A'}</strong>
                  </div>
                </div>
              )}

              {/* Action items checklist */}
              {selectedDoc.metadata?.action_items && selectedDoc.metadata.action_items.length > 0 && (
                <div className="viewer-block actions-block">
                  <h4>⚡ AI EXTRACTED ACTION ITEMS</h4>
                  <ul className="action-checklist">
                    {selectedDoc.metadata.action_items.map((action, i) => (
                      <li key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="checkbox" style={{ marginRight: '6px' }} />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw extracted text preview */}
              <div className="viewer-block text-preview-block">
                <h4>📜 RAW EXTRACTED TEXT LAYER</h4>
                <pre className="raw-text-pre">{selectedDoc.extractedText || selectedDoc.extracted_text || 'No raw text layers indexed.'}</pre>
              </div>

            </div>
          ) : (
            <div className="viewer-empty-state">
              <span>🧾</span>
              <h3>Document Understanding Console</h3>
              <p>Select any synced asset or drag a new report/invoice/contract here to execute real-time OCR and AI structured extraction.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default DocumentIntelligencePage;
