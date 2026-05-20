export default function HeroDashboard() {
  const emails = [
    { sender: 'Sarah Mitchell', subject: 'Q3 Product Roadmap Review', preview: 'Following up on the items discussed last Thursday...', time: '9:14 AM', tags: ['High Priority','AI Summary'], active: true },
    { sender: 'Alex Chen', subject: 'Partnership Proposal — Series B', preview: 'We would love to explore a strategic integration...', time: '8:47 AM', tags: ['Action Required'] },
    { sender: 'Design System', subject: 'Weekly Design Sync Reminder', preview: 'Your weekly design review is scheduled for...', time: 'Yesterday', tags: ['Meeting'] },
  ];

  return (
    <div className="hero-dashboard">
      <div className="dashboard-titlebar">
        <div className="dot dot-r"/><div className="dot dot-y"/><div className="dot dot-g"/>
        <div className="dashboard-title">EmailFlow AI — Inbox Intelligence</div>
      </div>
      <div className="dashboard-body">
        {/* Sidebar */}
        <div className="db-sidebar">
          <div className="db-sidebar-title">Workspace</div>
          {[
            {label:'All Inbox',dot:'blue',count:'24',active:true},
            {label:'Priority',dot:'violet',count:'6'},
            {label:'AI Drafts',dot:'cyan',count:'3'},
            {label:'Automated',dot:'gray',count:'12'},
          ].map(item => (
            <div key={item.label} className={`db-nav-item${item.active?' active':''}`}>
              <div className={`db-nav-dot nav-dot-${item.dot}`}/>
              {item.label}
              <span style={{marginLeft:'auto',fontSize:'11px',opacity:0.5}}>{item.count}</span>
            </div>
          ))}
          <div style={{marginTop:'20px'}}>
            <div className="db-sidebar-title">Labels</div>
            {['Work','Finance','Personal','Updates'].map(l=>(
              <div key={l} className="db-nav-item" style={{fontSize:'12px'}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#333',flexShrink:0}}/>
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="db-main">
          <div className="db-top-bar">
            <div className="db-search">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="4" stroke="#666" strokeWidth="1.2"/><path d="M9 9l2 2" stroke="#666" strokeWidth="1.2" strokeLinecap="round"/></svg>
              Search emails…
            </div>
            <div className="ai-status"><div className="ai-status-dot"/>AI Active</div>
          </div>
          {emails.map((e,i) => (
            <div key={i} className={`email-card${e.active?' active':''}`}>
              <div className="email-row1">
                <div className="email-sender">{e.sender}</div>
                <div className="email-time">{e.time}</div>
              </div>
              <div className="email-subject">{e.subject}</div>
              <div className="email-preview">{e.preview}</div>
              <div className="email-tags">
                {e.tags.map(t => {
                  const cls = t==='High Priority'?'tag-high':t==='AI Summary'?'tag-ai':t==='Action Required'?'tag-action':'tag-meeting';
                  return <span key={t} className={`tag ${cls}`}>{t}</span>;
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Panel */}
        <div className="db-panel">
          <div>
            <div className="panel-section-title">AI Summary</div>
            <div className="ai-summary-card">
              <div className="ai-label">✦ AI Generated</div>
              <div className="ai-text">Sarah requests sign-off on Q3 roadmap. 3 action items require response by EOD Friday.</div>
            </div>
          </div>
          <div>
            <div className="panel-section-title">Productivity</div>
            {[{label:'Response Rate',val:87},{label:'AI Automation',val:64},{label:'Focus Score',val:91}].map(b=>(
              <div key={b.label} className="productivity-bar-wrap">
                <div className="productivity-label"><span>{b.label}</span><span>{b.val}%</span></div>
                <div className="productivity-bar"><div className="productivity-fill" style={{width:`${b.val}%`}}/></div>
              </div>
            ))}
          </div>
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-value">247</div><div className="stat-label">Emails AI Sorted</div></div>
            <div className="stat-box"><div className="stat-value">3.2h</div><div className="stat-label">Time Saved</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
