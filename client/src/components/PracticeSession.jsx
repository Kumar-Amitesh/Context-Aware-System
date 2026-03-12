import React, { useState } from 'react';
import { Send, Upload, AlertCircle, FileText, History, Clock, BarChart3, Zap, Mic, Settings } from 'lucide-react';
import { chatAPI } from '../services/api';

const sessionLabel = (type) => {
  if (!type) return 'Practice';
  if (type === 'full' || type === 'full_fallback') return 'Full Practice Test';
  if (type === 'weak') return 'Weak Topics Practice';
  if (type === 'voice_full') return 'Voice Interview (Full)';
  if (type === 'voice_weak') return 'Voice Interview (Weak Topics)';
  return type.replace('_', ' ');
};

/* Infer session mode from examConfig — no backend field needed */
const isVoiceMode = (chat) => {
  if (!chat?.examConfig) return false;
  try {
    const config = typeof chat.examConfig === 'string'
      ? JSON.parse(chat.examConfig)
      : chat.examConfig;
    const qt = config.questionTypes || {};
    const keys = Object.keys(qt).filter((k) => (qt[k]?.count || 0) > 0);
    return keys.length === 1 && keys[0] === 'descriptive';
  } catch { return false; }
};

const PracticeSession = ({
  chat, pdfs, sessionHistory, onGenerateFullExam, onGenerateWeakExam,
  onGenerateVoiceFull, onGenerateVoiceWeak,
  onUploadPDF, onOpenHistorySession, canGenerate, allProcessed, hasAnyPDF,
  onNewSessionPrefilled,
}) => {
  const [uploading,  setUploading]  = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAllPdfs, setShowAllPdfs] = useState(false);

  const voiceMode = isVoiceMode(chat);

  const processedCount  = (pdfs || []).filter((p) =>  p.processed).length;
  const processingCount = (pdfs || []).filter((p) => !p.processed && !p.error).length;

  const getQuestionTypeSummary = () => {
    if (!chat?.examConfig) return null;
    try {
      const config = typeof chat.examConfig === 'string'
        ? JSON.parse(chat.examConfig)
        : chat.examConfig;
      const qt = config.questionTypes || {};
      const types = [];
      if (qt.mcq?.count         > 0) types.push(`${qt.mcq.count} MCQ (${qt.mcq.marks}m${qt.mcq.negativeMarks > 0 ? `/-${qt.mcq.negativeMarks}` : ''})`);
      if (qt.fill_blank?.count  > 0) types.push(`${qt.fill_blank.count} Fill (${qt.fill_blank.marks}m)`);
      if (qt.true_false?.count  > 0) types.push(`${qt.true_false.count} T/F (${qt.true_false.marks}m)`);
      if (qt.descriptive?.count > 0) types.push(`${qt.descriptive.count} Desc (${qt.descriptive.marks}m)`);
      return types;
    } catch { return null; }
  };

  const questionTypeSummary = getQuestionTypeSummary();
  const disabledReason = !hasAnyPDF      ? 'Upload at least 1 PDF first'
    : !allProcessed                      ? 'Waiting for PDFs to finish processing…'
    : null;

  const handlePDFUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try { await onUploadPDF(files); }
    catch (err) { console.error(err); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleFullExam = async () => {
    setGenerating(true);
    try { await onGenerateFullExam(); } finally { setGenerating(false); }
  };

  const handleWeakExam = async () => {
    if (!chat?.weakTopics?.length) { alert('No weak topics identified yet. Complete a test first.'); return; }
    setGenerating(true);
    try { await onGenerateWeakExam(); } finally { setGenerating(false); }
  };

  const handleVoiceFull = async () => {
    setGenerating(true);
    try { await onGenerateVoiceFull(); } finally { setGenerating(false); }
  };

  const handleVoiceWeak = async () => {
    if (!chat?.weakTopics?.length) { alert('No weak topics identified yet. Complete a session first.'); return; }
    setGenerating(true);
    try { await onGenerateVoiceWeak(); } finally { setGenerating(false); }
  };

  return (
    <div className="session-layout">
      {/* Main column */}
      <div>
        <div className="card">
          {/* Hero */}
          <div className="session-hero">
            <div className="session-hero-icon">
              {voiceMode ? <Mic size={24} /> : <Send size={24} />}
            </div>
            <h3>
              {chat?.examType} Preparation
              {chat?.subject && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 16 }}>
                  {' · '}{chat.subject}
                </span>
              )}
            </h3>
            {voiceMode && (
              <div style={{ marginTop: 6 }}>
                <span className="badge badge-purple" style={{ fontSize: 12 }}>
                  <Mic size={11} style={{ marginRight: 4 }} /> Voice Interview Mode
                </span>
              </div>
            )}
            <p style={{ marginTop: 6 }}>
              {processedCount}/{(pdfs || []).length} PDFs processed
              {processingCount > 0 && (
                <span style={{ color: 'var(--warning)', marginLeft: 8 }}>· Processing…</span>
              )}
            </p>

            {/* Config chips */}
            {(questionTypeSummary?.length > 0 || chat?.bloomLevels?.length > 0) && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionTypeSummary?.length > 0 && (
                  <div className="config-row" style={{ justifyContent: 'center' }}>
                    {questionTypeSummary.map((s, i) => (
                      <span key={i} className="badge badge-muted">{s}</span>
                    ))}
                  </div>
                )}
                {chat?.bloomLevels?.length > 0 && (
                  <div className="config-row" style={{ justifyContent: 'center' }}>
                    {chat.bloomLevels.map((b, i) => (
                      <span key={i} className="badge badge-blue">{b}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDF section */}
          <div style={{ marginBottom: 20 }}>
            <div className="pdf-section-header">
              <span className="pdf-section-label">Study Materials</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {(pdfs || []).length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPdfs((s) => !s)}>
                    {showAllPdfs ? 'Hide' : 'Show all'}
                  </button>
                )}
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} />
                  {uploading ? 'Uploading…' : 'Upload PDF'}
                  <input
                    type="file" accept=".pdf" multiple
                    onChange={handlePDFUpload}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>

            {!(pdfs || []).length ? (
              <div className="pdf-empty">No PDFs uploaded yet. Upload notes, syllabus, or papers.</div>
            ) : showAllPdfs ? (
              (pdfs || []).map((pdf) => (
                <div key={pdf.pdfId} className="pdf-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="pdf-name">{pdf.filename}</div>
                      <div className="pdf-meta">
                        <span className={`badge ${pdf.error ? 'badge-danger' : pdf.processed ? 'badge-success' : 'badge-warning'}`}>
                          {pdf.error ? 'Error' : pdf.processed ? 'Ready' : 'Processing'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {pdf.error && (
                    <button className="btn btn-primary btn-sm" onClick={async () => {
                      try { await chatAPI.retryPDF(pdf.pdfId); alert('Retry queued'); }
                      catch (e) { alert(e.response?.data?.error || e.message); }
                    }}>Retry</button>
                  )}
                </div>
              ))
            ) : (
              <div className="info-box">
                {(pdfs || []).length} PDF(s) · {processingCount > 0 ? 'Some still processing' : 'All ready'}
              </div>
            )}
          </div>

          {/* Weak topics */}
          {chat?.weakTopics?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <AlertCircle size={15} style={{ color: 'var(--warning)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Focus Areas</span>
              </div>
              <div className="config-row">
                {chat.weakTopics.map((topic, idx) => (
                  <span key={idx} className="badge badge-warning">{topic}</span>
                ))}
              </div>
            </div>
          )}

          {/* Analytics */}
          {chat?.analytics?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <BarChart3 size={15} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Analytics</span>
              </div>
              {chat.analytics.slice(0, 3).map((item, idx) => (
                <div key={idx} className="analytics-card">
                  <div className="analytics-row">
                    <span className="analytics-topic">{item.topic}</span>
                    <span className="analytics-score">Weakness: {Math.round((item.score || 0) * 100)}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Seen {item.seen || 0}×</div>
                  {item.topWeakBlooms?.length > 0 && (
                    <div className="config-row">
                      {item.topWeakBlooms.map((b, i) => <span key={i} className="badge badge-blue">{b}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Disabled reason */}
          {disabledReason && (
            <div className="info-box warning" style={{ marginBottom: 12 }}>{disabledReason}</div>
          )}

          {/* ── ACTIONS ── */}
          <div className="action-stack">
            {voiceMode ? (
              /* Voice interview actions */
              <>
                <button
                  className="btn btn-primary btn-lg btn-full"
                  onClick={handleVoiceFull}
                  disabled={generating || !canGenerate}
                >
                  <Mic size={18} />
                  {generating ? 'Generating…' : 'Start Full Voice Interview'}
                </button>
                <button
                  className="btn btn-outline btn-full"
                  onClick={handleVoiceWeak}
                  disabled={generating || !canGenerate || !chat?.weakTopics?.length}
                >
                  <Zap size={16} />
                  Voice Interview · Weak Topics
                </button>
              </>
            ) : (
              /* Normal actions */
              <>
                <button
                  className="btn btn-primary btn-lg btn-full"
                  onClick={handleFullExam}
                  disabled={generating || !canGenerate}
                >
                  <Send size={18} />
                  {generating ? 'Generating…' : 'Generate Full Practice Test'}
                </button>
                <button
                  className="btn btn-outline btn-full"
                  onClick={handleWeakExam}
                  disabled={generating || !canGenerate || !chat?.weakTopics?.length}
                >
                  <Zap size={16} />
                  Focus on Weak Topics
                </button>
              </>
            )}

            {/* Divider + reconfigure shortcut */}
            <div className="action-divider" />
            <button
              className="btn btn-ghost btn-full new-config-btn"
              onClick={() => onNewSessionPrefilled?.(chat?.examType)}
            >
              <Settings size={14} />
              New Session with Different Config
            </button>
          </div>
        </div>
      </div>

      {/* History sidebar */}
      <div>
        <div className="history-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <History size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>History</span>
          </div>

          {(sessionHistory || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No sessions yet
            </div>
          ) : (
            (sessionHistory || [])
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // descending
              .slice(0, 8)
              .map((session) => (
                <div
                  key={session.sessionId}
                  className="history-item"
                  onClick={() => onOpenHistorySession?.(session)}
                >
                  <div className="history-item-row">
                    <span className="history-label">{sessionLabel(session.type)}</span>
                    <span className="history-view">View →</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {session.score != null && (
                      <span className={`badge ${session.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
                        {Number(session.score).toFixed(1)}/10
                      </span>
                    )}

                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {session.questions?.length || 0} Qs
                    </span>
                  </div>

                  <div className="history-meta">
                    <Clock size={11} />
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PracticeSession;





















// import React, { useState } from 'react';
// import { Send, Upload, AlertCircle, FileText, History, Clock, BarChart3, Zap } from 'lucide-react';
// import { chatAPI } from '../services/api';

// const sessionLabel = (type) => {
//   if (!type) return 'Practice';
//   if (type === 'full' || type === 'full_fallback') return 'Full Practice Test';
//   if (type === 'weak') return 'Weak Topics Practice';
//   return type.replace('_', ' ');
// };

// const PracticeSession = ({
//   chat, pdfs, sessionHistory, onGenerateFullExam, onGenerateWeakExam,
//   onUploadPDF, onOpenHistorySession, canGenerate, allProcessed, hasAnyPDF,
// }) => {
//   const [uploading, setUploading] = useState(false);
//   const [generating, setGenerating] = useState(false);
//   const [showAllPdfs, setShowAllPdfs] = useState(false);

//   const processedCount = (pdfs || []).filter((p) => p.processed).length;
//   const processingCount = (pdfs || []).filter((p) => !p.processed && !p.error).length;

//   const getQuestionTypeSummary = () => {
//     if (!chat?.examConfig) return null;
//     try {
//       const config = typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//       const qt = config.questionTypes || {};
//       const types = [];
//       if (qt.mcq?.count > 0) types.push(`${qt.mcq.count} MCQ (${qt.mcq.marks}m${qt.mcq.negativeMarks > 0 ? `/-${qt.mcq.negativeMarks}` : ''})`);
//       if (qt.fill_blank?.count > 0) types.push(`${qt.fill_blank.count} Fill (${qt.fill_blank.marks}m)`);
//       if (qt.true_false?.count > 0) types.push(`${qt.true_false.count} T/F (${qt.true_false.marks}m)`);
//       if (qt.descriptive?.count > 0) types.push(`${qt.descriptive.count} Desc (${qt.descriptive.marks}m)`);
//       return types;
//     } catch { return null; }
//   };

//   const questionTypeSummary = getQuestionTypeSummary();
//   const disabledReason = !hasAnyPDF ? 'Upload at least 1 PDF first'
//     : !allProcessed ? 'Waiting for PDFs to finish processing…' : null;

//   const handlePDFUpload = async (e) => {
//     const files = Array.from(e.target.files || []);
//     if (!files.length) return;
//     setUploading(true);
//     try { await onUploadPDF(files); }
//     catch (err) { console.error(err); }
//     finally { setUploading(false); e.target.value = ''; }
//   };

//   const handleFullExam = async () => {
//     setGenerating(true);
//     try { await onGenerateFullExam(); } finally { setGenerating(false); }
//   };

//   const handleWeakExam = async () => {
//     if (!chat?.weakTopics?.length) { alert('No weak topics identified yet. Complete a test first.'); return; }
//     setGenerating(true);
//     try { await onGenerateWeakExam(); } finally { setGenerating(false); }
//   };

//   return (
//     <div className="session-layout">
//       {/* Main column */}
//       <div>
//         <div className="card">
//           {/* Hero */}
//           <div className="session-hero">
//             <div className="session-hero-icon"><Send size={24} /></div>
//             <h3>
//               {chat?.examType} Preparation
//               {chat?.subject && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 16 }}> · {chat.subject}</span>}
//             </h3>
//             <p>
//               {processedCount}/{(pdfs || []).length} PDFs processed
//               {processingCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>· Processing…</span>}
//             </p>

//             {/* Config chips */}
//             {(questionTypeSummary?.length > 0 || chat?.bloomLevels?.length > 0) && (
//               <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
//                 {questionTypeSummary?.length > 0 && (
//                   <div className="config-row" style={{ justifyContent: 'center' }}>
//                     {questionTypeSummary.map((s, i) => (
//                       <span key={i} className="badge badge-muted">{s}</span>
//                     ))}
//                   </div>
//                 )}
//                 {chat?.bloomLevels?.length > 0 && (
//                   <div className="config-row" style={{ justifyContent: 'center' }}>
//                     {chat.bloomLevels.map((b, i) => (
//                       <span key={i} className="badge badge-blue">{b}</span>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>

//           {/* PDF section */}
//           <div style={{ marginBottom: 20 }}>
//             <div className="pdf-section-header">
//               <span className="pdf-section-label">Study Materials</span>
//               <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
//                 {(pdfs || []).length > 0 && (
//                   <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPdfs((s) => !s)}>
//                     {showAllPdfs ? 'Hide' : 'Show all'}
//                   </button>
//                 )}
//                 <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
//                   <Upload size={14} />
//                   {uploading ? 'Uploading…' : 'Upload PDF'}
//                   <input type="file" accept=".pdf" multiple onChange={handlePDFUpload} style={{ display: 'none' }} disabled={uploading} />
//                 </label>
//               </div>
//             </div>

//             {!(pdfs || []).length ? (
//               <div className="pdf-empty">No PDFs uploaded yet. Upload notes, syllabus, or papers.</div>
//             ) : showAllPdfs ? (
//               (pdfs || []).map((pdf) => (
//                 <div key={pdf.pdfId} className="pdf-item">
//                   <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
//                     <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
//                     <div style={{ minWidth: 0 }}>
//                       <div className="pdf-name">{pdf.filename}</div>
//                       <div className="pdf-meta">
//                         <span className={`badge ${pdf.error ? 'badge-danger' : pdf.processed ? 'badge-success' : 'badge-warning'}`}>
//                           {pdf.error ? 'Error' : pdf.processed ? 'Ready' : 'Processing'}
//                         </span>
//                       </div>
//                     </div>
//                   </div>
//                   {pdf.error && (
//                     <button className="btn btn-primary btn-sm" onClick={async () => {
//                       try { await chatAPI.retryPDF(pdf.pdfId); alert('Retry queued'); }
//                       catch (e) { alert(e.response?.data?.error || e.message); }
//                     }}>Retry</button>
//                   )}
//                 </div>
//               ))
//             ) : (
//               <div className="info-box">
//                 {(pdfs || []).length} PDF(s) · {processingCount > 0 ? 'Some still processing' : 'All ready'}
//               </div>
//             )}
//           </div>

//           {/* Weak topics */}
//           {chat?.weakTopics?.length > 0 && (
//             <div style={{ marginBottom: 20 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
//                 <AlertCircle size={15} style={{ color: 'var(--warning)' }} />
//                 <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Focus Areas</span>
//               </div>
//               <div className="config-row">
//                 {chat.weakTopics.map((topic, idx) => (
//                   <span key={idx} className="badge badge-warning">{topic}</span>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* Analytics */}
//           {chat?.analytics?.length > 0 && (
//             <div style={{ marginBottom: 20 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
//                 <BarChart3 size={15} style={{ color: 'var(--primary)' }} />
//                 <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Analytics</span>
//               </div>
//               {chat.analytics.slice(0, 3).map((item, idx) => (
//                 <div key={idx} className="analytics-card">
//                   <div className="analytics-row">
//                     <span className="analytics-topic">{item.topic}</span>
//                     <span className="analytics-score">Weakness: {Math.round((item.score || 0) * 100)}%</span>
//                   </div>
//                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Seen {item.seen || 0}×</div>
//                   {item.topWeakBlooms?.length > 0 && (
//                     <div className="config-row">
//                       {item.topWeakBlooms.map((b, i) => <span key={i} className="badge badge-blue">{b}</span>)}
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* Disabled reason */}
//           {disabledReason && (
//             <div className="info-box warning" style={{ marginBottom: 12 }}>{disabledReason}</div>
//           )}

//           {/* Actions */}
//           <div className="action-stack">
//             <button className="btn btn-primary btn-lg btn-full" onClick={handleFullExam} disabled={generating || !canGenerate}>
//               <Send size={18} />
//               {generating ? 'Generating…' : 'Generate Full Practice Test'}
//             </button>
//             <button
//               className="btn btn-outline btn-full"
//               onClick={handleWeakExam}
//               disabled={generating || !canGenerate || !chat?.weakTopics?.length}
//             >
//               <Zap size={16} />
//               Focus on Weak Topics
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* History sidebar */}
//       <div>
//         <div className="history-card">
//           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//             <History size={16} style={{ color: 'var(--text-muted)' }} />
//             <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>History</span>
//           </div>

//           {(sessionHistory || []).length === 0 ? (
//             <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
//               No sessions yet
//             </div>
//           ) : (
//             (sessionHistory || []).slice(0, 8).map((session) => (
//               <div key={session.sessionId} className="history-item" onClick={() => onOpenHistorySession?.(session)}>
//                 <div className="history-item-row">
//                   <span className="history-label">{sessionLabel(session.type)}</span>
//                   <span className="history-view">View →</span>
//                 </div>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
//                   {session.score != null && (
//                     <span className={`badge ${session.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
//                       {Number(session.score).toFixed(1)}/10
//                     </span>
//                   )}
//                   <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
//                     {session.questions?.length || 0} Qs
//                   </span>
//                 </div>
//                 <div className="history-meta">
//                   <Clock size={11} />
//                   {new Date(session.createdAt).toLocaleDateString()}
//                 </div>
//               </div>
//             ))
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PracticeSession;

























// import React, { useState } from "react";
// import { Send, Upload, AlertCircle, FileText, History, Clock, BarChart3 } from "lucide-react";
// import { chatAPI } from "../services/api";

// const sessionLabel = (type) => {
//   if (!type) return "Practice";
//   if (type === "full" || type === "full_fallback") return "Full Practice Test";
//   if (type === "weak") return "Weak Topics Practice";
//   return type.replace("_", " ");
// };

// const PracticeSession = ({
//   chat,
//   pdfs,
//   sessionHistory,
//   onGenerateFullExam,
//   onGenerateWeakExam,
//   onUploadPDF,
//   onOpenHistorySession,
//   canGenerate,
//   allProcessed,
//   hasAnyPDF,
// }) => {
//   const [uploading, setUploading] = useState(false);
//   const [generating, setGenerating] = useState(false);
//   const [showAllPdfs, setShowAllPdfs] = useState(false);

//   const processedCount = (pdfs || []).filter((p) => p.processed).length;
//   const processingCount = (pdfs || []).filter((p) => !p.processed && !p.error).length;

//   const getQuestionTypeSummary = () => {
//     if (!chat?.examConfig) return null;

//     try {
//       const config = typeof chat.examConfig === "string"
//         ? JSON.parse(chat.examConfig)
//         : chat.examConfig;

//       const questionTypes = config.questionTypes || {};
//       const types = [];

//       if (questionTypes.mcq?.count > 0) {
//         types.push(`${questionTypes.mcq.count} MCQ (${questionTypes.mcq.marks} marks${questionTypes.mcq.negativeMarks > 0 ? `, -${questionTypes.mcq.negativeMarks}` : ""})`);
//       }
//       if (questionTypes.fill_blank?.count > 0) {
//         types.push(`${questionTypes.fill_blank.count} Fill (${questionTypes.fill_blank.marks} marks${questionTypes.fill_blank.negativeMarks > 0 ? `, -${questionTypes.fill_blank.negativeMarks}` : ""})`);
//       }
//       if (questionTypes.true_false?.count > 0) {
//         types.push(`${questionTypes.true_false.count} T/F (${questionTypes.true_false.marks} marks${questionTypes.true_false.negativeMarks > 0 ? `, -${questionTypes.true_false.negativeMarks}` : ""})`);
//       }
//       if (questionTypes.descriptive?.count > 0) {
//         types.push(`${questionTypes.descriptive.count} Descriptive (${questionTypes.descriptive.marks} marks)`);
//       }

//       return types;
//     } catch (e) {
//       return null;
//     }
//   };

//   const questionTypeSummary = getQuestionTypeSummary();

//   const handlePDFUpload = async (e) => {
//     const files = Array.from(e.target.files || []);
//     if (!files.length) return;

//     setUploading(true);
//     try {
//       await onUploadPDF(files);
//     } catch (error) {
//       console.error("Error uploading PDF:", error);
//     } finally {
//       setUploading(false);
//       e.target.value = "";
//     }
//   };

//   const handleGenerateFullQuestions = async () => {
//     setGenerating(true);
//     try {
//       await onGenerateFullExam();
//     } finally {
//       setGenerating(false);
//     }
//   };

//   const handleGenerateWeakQuestions = async () => {
//     if (!chat?.weakTopics || chat.weakTopics.length === 0) {
//       alert("No weak topics identified yet. Complete a test first.");
//       return;
//     }

//     setGenerating(true);
//     try {
//       await onGenerateWeakExam();
//     } finally {
//       setGenerating(false);
//     }
//   };

//   const generateDisabledReason = () => {
//     if (!hasAnyPDF) return "Upload at least 1 PDF to generate questions.";
//     if (!allProcessed) return "Please wait until all PDFs finish processing.";
//     return null;
//   };

//   return (
//     <div className="flex flex-col lg:flex-row gap-6 h-full">
//       <div className="lg:w-2/3">
//         <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
//           <div className="text-center mb-6">
//             <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-4">
//               <Send className="text-indigo-600" size={40} />
//             </div>

//             <h3 className="text-2xl font-semibold text-gray-800 mb-2">
//               {chat?.examType} Preparation
//               {chat?.subject ? (
//                 <span className="text-gray-500 text-base font-medium"> • {chat.subject}</span>
//               ) : null}
//             </h3>

//             <p className="text-gray-600 mb-2">
//               Upload study materials and generate practice questions tailored to your needs
//             </p>

//             <p className="text-sm text-gray-500">
//               PDFs: {processedCount}/{(pdfs || []).length} processed
//               {processingCount > 0 ? <span className="ml-2 text-yellow-600">• Processing…</span> : null}
//             </p>

//             {questionTypeSummary && questionTypeSummary.length > 0 && (
//               <div className="mt-3 p-3 bg-gray-50 rounded-lg">
//                 <p className="text-sm font-medium text-gray-700 mb-1">Question Types:</p>
//                 <div className="flex flex-wrap gap-2 justify-center">
//                   {questionTypeSummary.map((summary, idx) => (
//                     <span key={idx} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded">
//                       {summary}
//                     </span>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {chat?.bloomLevels?.length > 0 && (
//               <div className="mt-3 p-3 bg-gray-50 rounded-lg">
//                 <p className="text-sm font-medium text-gray-700 mb-1">Bloom Levels:</p>
//                 <div className="flex flex-wrap gap-2 justify-center">
//                   {chat.bloomLevels.map((bloom, idx) => (
//                     <span key={idx} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
//                       {bloom}
//                     </span>
//                   ))}
//                 </div>
//               </div>
//             )}
//           </div>

//           <div className="mb-8 p-4 bg-gray-50 rounded-lg">
//             <div className="flex items-center justify-between mb-3">
//               <h4 className="font-medium text-gray-700">Study Materials</h4>

//               <div className="flex items-center gap-3">
//                 {(pdfs || []).length > 0 && (
//                   <button
//                     onClick={() => setShowAllPdfs((s) => !s)}
//                     className="text-sm text-gray-600 hover:text-indigo-700"
//                   >
//                     {showAllPdfs ? "Hide PDFs" : "See all PDFs"}
//                   </button>
//                 )}

//                 <label className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 cursor-pointer">
//                   <Upload size={16} />
//                   <span>{uploading ? "Uploading..." : "Upload PDF(s)"}</span>
//                   <input
//                     type="file"
//                     accept=".pdf"
//                     multiple
//                     onChange={handlePDFUpload}
//                     className="hidden"
//                     disabled={uploading}
//                   />
//                 </label>
//               </div>
//             </div>

//             {!(pdfs || []).length ? (
//               <p className="text-sm text-gray-500 text-center py-3">
//                 No PDFs uploaded yet. Upload syllabus, notes, or previous question papers.
//               </p>
//             ) : showAllPdfs ? (
//               <div className="space-y-2">
//                 {pdfs.map((pdf) => (
//                   <div
//                     key={pdf.pdfId}
//                     className="flex items-center justify-between p-3 bg-white rounded border"
//                   >
//                     <div className="flex items-center gap-3">
//                       <FileText size={20} className="text-gray-500" />
//                       <div>
//                         <p className="text-sm font-medium text-gray-800">{pdf.filename}</p>
//                         <div className="flex items-center gap-2 mt-1">
//                           <span
//                             className={`text-xs px-2 py-1 rounded ${
//                               pdf.error
//                                 ? "bg-red-100 text-red-700"
//                                 : pdf.processed
//                                 ? "bg-green-100 text-green-700"
//                                 : "bg-yellow-100 text-yellow-700"
//                             }`}
//                           >
//                             {pdf.error ? "Error" : pdf.processed ? "Processed" : "Processing..."}
//                           </span>
//                           <span className="text-xs text-gray-500">{pdf.type}</span>
//                         </div>
//                       </div>
//                     </div>

//                     {pdf.error && (
//                       <div className="text-right">
//                         <div className="text-xs text-red-600 mb-2">Error: {pdf.error}</div>
//                         <button
//                           className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
//                           onClick={async () => {
//                             try {
//                               await chatAPI.retryPDF(pdf.pdfId);
//                               alert("Retry queued");
//                             } catch (e) {
//                               alert(e.response?.data?.error || e.message);
//                             }
//                           }}
//                         >
//                           Retry
//                         </button>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             ) : (
//               <p className="text-sm text-gray-600">
//                 {(pdfs || []).length} PDF(s) uploaded.{" "}
//                 {processingCount > 0 ? "Some are still processing." : "All processed."}
//               </p>
//             )}
//           </div>

//           {chat?.weakTopics && chat.weakTopics.length > 0 && (
//             <div className="mb-8">
//               <div className="flex items-center gap-2 mb-3">
//                 <AlertCircle size={20} className="text-orange-500" />
//                 <h4 className="font-medium text-gray-700">Focus Areas</h4>
//               </div>
//               <div className="flex flex-wrap gap-2">
//                 {chat.weakTopics.map((topic, idx) => (
//                   <span
//                     key={idx}
//                     className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-medium"
//                   >
//                     {topic}
//                   </span>
//                 ))}
//               </div>
//             </div>
//           )}

//           {chat?.analytics && chat.analytics.length > 0 && (
//             <div className="mb-8">
//               <div className="flex items-center gap-2 mb-3">
//                 <BarChart3 size={20} className="text-indigo-500" />
//                 <h4 className="font-medium text-gray-700">Learning Analytics</h4>
//               </div>

//               <div className="space-y-3">
//                 {chat.analytics.slice(0, 3).map((item, idx) => (
//                   <div key={idx} className="p-4 border rounded-lg bg-gray-50">
//                     <div className="flex items-center justify-between mb-2">
//                       <div className="font-medium text-gray-800">{item.topic}</div>
//                       <div className="text-sm text-gray-600">
//                         Weakness: {Math.round((item.score || 0) * 100)}%
//                       </div>
//                     </div>

//                     <div className="text-xs text-gray-500 mb-2">
//                       Seen {item.seen || 0} times
//                     </div>

//                     {item.topWeakBlooms?.length > 0 && (
//                       <div className="mb-2">
//                         <div className="text-xs font-medium text-gray-600 mb-1">Weak Bloom Levels</div>
//                         <div className="flex flex-wrap gap-1">
//                           {item.topWeakBlooms.map((b, i) => (
//                             <span key={i} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
//                               {b}
//                             </span>
//                           ))}
//                         </div>
//                       </div>
//                     )}

//                     {item.topWeakTypes?.length > 0 && (
//                       <div className="mb-2">
//                         <div className="text-xs font-medium text-gray-600 mb-1">Weak Question Types</div>
//                         <div className="flex flex-wrap gap-1">
//                           {item.topWeakTypes.map((t, i) => (
//                             <span key={i} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
//                               {t}
//                             </span>
//                           ))}
//                         </div>
//                       </div>
//                     )}

//                     {item.topWeakDifficulties?.length > 0 && (
//                       <div>
//                         <div className="text-xs font-medium text-gray-600 mb-1">Weak Difficulty Pattern</div>
//                         <div className="flex flex-wrap gap-1">
//                           {item.topWeakDifficulties.map((d, i) => (
//                             <span key={i} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
//                               {d}
//                             </span>
//                           ))}
//                         </div>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           {generateDisabledReason() && (
//             <div className="mb-3 text-sm text-gray-600 bg-gray-50 border rounded p-3">
//               {generateDisabledReason()}
//             </div>
//           )}

//           <div className="space-y-3">
//             <button
//               onClick={handleGenerateFullQuestions}
//               disabled={generating || !canGenerate}
//               className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
//             >
//               <Send size={20} />
//               <span>{generating ? "Generating..." : "Generate Full Practice Test"}</span>
//             </button>

//             <button
//               onClick={handleGenerateWeakQuestions}
//               disabled={generating || !canGenerate || !chat?.weakTopics || chat.weakTopics.length === 0}
//               className="w-full px-6 py-3 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition font-medium disabled:border-gray-300 disabled:text-gray-400 flex items-center justify-center gap-2"
//             >
//               <AlertCircle size={20} />
//               <span>Focus on Weak Topics</span>
//             </button>
//           </div>
//         </div>
//       </div>

//       <div className="lg:w-1/3">
//         <div className="bg-white rounded-xl shadow-lg p-6">
//           <div className="flex items-center gap-2 mb-4">
//             <History size={20} className="text-gray-600" />
//             <h4 className="font-medium text-gray-700">Practice History</h4>
//           </div>

//           {(sessionHistory || []).length > 0 ? (
//             <div className="space-y-3">
//               {sessionHistory.slice(0, 8).map((session) => (
//                 <div
//                   key={session.sessionId}
//                   onClick={() => onOpenHistorySession?.(session)}
//                   className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
//                   title="Click to review this attempt"
//                 >
//                   <div className="flex justify-between items-center mb-2">
//                     <span className="text-sm font-medium text-gray-800">
//                       {sessionLabel(session.type)}
//                     </span>
//                     <span className="text-xs text-indigo-600">View</span>
//                   </div>

//                   <div className="flex justify-between items-center mb-2">
//                     {session.score !== null && session.score !== undefined && (
//                       <span
//                         className={`px-2 py-1 text-xs rounded ${
//                           session.score >= 7 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
//                         }`}
//                       >
//                         {Number(session.score).toFixed(1)}/10
//                       </span>
//                     )}
//                     <span className="text-xs text-gray-500 ml-auto">
//                       {session.questions?.length || 0} questions
//                     </span>
//                   </div>

//                   <div className="flex items-center gap-2 text-xs text-gray-500">
//                     <Clock size={12} />
//                     <span>{new Date(session.createdAt).toLocaleDateString()}</span>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           ) : (
//             <p className="text-sm text-gray-500 text-center py-4">
//               No practice sessions yet. Generate your first test!
//             </p>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PracticeSession;
