import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, Loader, Briefcase, Mic, Video, BookOpen,
  RotateCcw, Play, Square, SkipForward, CheckCircle,
  AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
  ArrowLeft, Send, ChevronRight, HelpCircle,
  Clock, History, Lock, Eye, Settings, X,
} from 'lucide-react';
import { jdAPI } from '../services/api';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const QUESTION_TYPES = [
  { key: 'mixed',         label: 'Mixed (Recommended)', desc: '30% behavioral · 35% technical · 20% situational · 15% role-specific' },
  { key: 'behavioral',    label: 'Behavioral',           desc: 'Tell me about a time… (STAR method)' },
  { key: 'technical',     label: 'Technical',            desc: 'Skills, tools, domain knowledge' },
  { key: 'situational',   label: 'Situational',          desc: 'What would you do if…' },
  { key: 'role_specific', label: 'Role-Specific',        desc: "Specific to this job's duties" },
];

const PRACTICE_MODES = [
  { key: 'normal', icon: <BookOpen size={15} />, label: 'Text Practice',  desc: 'Type your answers — no time pressure' },
  { key: 'voice',  icon: <Mic size={15} />,      label: 'Voice Practice', desc: 'Speak answers, auto-transcribed, LLM evaluation' },
  { key: 'video',  icon: <Video size={15} />,    label: 'Video Practice', desc: 'Record video/audio, get delivery coaching' },
];

const SILENCE_MS   = 10_000;
const MAX_REC_SECS = 180;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const Collapsible = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)' }}>
        {title}
        {open ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
    </div>
  );
};

const ScoreBar = ({ label, score, max = 10 }) => {
  const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>{score != null ? `${score}/${max}` : '—'}</span>
      </div>
      <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
};

const CategoryBadge = ({ cat }) => {
  const colors = { behavioral: 'badge-blue', technical: 'badge-purple', situational: 'badge-warning', role_specific: 'badge-muted' };
  return <span className={`badge ${colors[cat] || 'badge-muted'}`} style={{ fontSize: 10 }}>{cat?.replace('_', ' ')}</span>;
};

const sessionTypeLabel = (type) => {
  const map = { jd_normal: 'Text', jd_voice: 'Voice', jd_video: 'Video' };
  return map[type] || type;
};

/* ─────────────────────────────────────────
   JD UPLOAD VIEW
   Shown once when no JD exists yet.
───────────────────────────────────────── */
const JDUploadView = ({ chatId, onUploaded }) => {
  const [tab,     setTab]     = useState('text');
  const [text,    setText]    = useState('');
  const [file,    setFile]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleTextUpload = async () => {
    if (!text.trim()) { setError('Paste a job description first.'); return; }
    setLoading(true); setError('');
    try { const res = await jdAPI.uploadText(chatId, text.trim()); onUploaded(res.data); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async () => {
    if (!file) { setError('Select a file first.'); return; }
    setLoading(true); setError('');
    try { const res = await jdAPI.uploadFile(chatId, file); onUploaded(res.data); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Notice */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 14px' }}>
        <Lock size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--warning)' }}>JD is locked after upload.</strong> Once you upload a job description it stays tied to this session. Create a new chat to practice with a different role.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File (PDF/TXT)' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`, background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)', color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            {t.l}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {tab === 'text' ? (
        <>
          <textarea className="input" value={text} onChange={e => setText(e.target.value)}
            placeholder={"Paste the full job description here…\n\nInclude: role title, company, responsibilities, requirements, skills…"}
            style={{ minHeight: 200, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
          <button className="btn btn-primary btn-full" onClick={handleTextUpload} disabled={loading || !text.trim()}>
            {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Parse & Continue →'}
          </button>
        </>
      ) : (
        <>
          <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)' }}
            onClick={() => document.getElementById('jd-file-input').click()}>
            <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
              {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
            </div>
          </div>
          <input id="jd-file-input" type="file" accept=".pdf,.txt" style={{ display: 'none' }}
            onChange={e => { setFile(e.target.files[0] || null); setError(''); }} />
          <button className="btn btn-primary btn-full" onClick={handleFileUpload} disabled={loading || !file}>
            {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Upload & Parse →'}
          </button>
        </>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   CONFIG MODAL
   Opened from the "Change Config" button
   after a session has been generated.
───────────────────────────────────────── */
const ConfigModal = ({ currentConfig, onApply, onClose }) => {
  const [qType,     setQType]     = useState(currentConfig.qType     || 'mixed');
  const [qCount,    setQCount]    = useState(currentConfig.qCount    || '1');
  const [mode,      setMode]      = useState(currentConfig.mode      || 'normal');
  const [mediaMode, setMediaMode] = useState(currentConfig.mediaMode || 'video');

  const handleApply = () => {
    onApply({
      qType, qCount: Math.max(1, Math.min(20, Number(qCount) || 1)),
      mode, mediaMode,
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Interview Configuration</div>
            <div className="modal-subtitle">Adjust for your next session</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Question type */}
          <div className="form-section">
            <div className="form-label">Question Focus</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {QUESTION_TYPES.map(qt => (
                <button key={qt.key} onClick={() => setQType(qt.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', textAlign: 'left', background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: qType === qt.key ? 'var(--primary)' : 'var(--border)' }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div className="form-section">
            <div className="form-label">Number of Questions</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                className="input" type="number" min={1} max={20} value={qCount}
                id="number-of-questions" name="number-of-questions"
                onChange={e => setQCount(e.target.value)} style={{ maxWidth: 80, fontSize: 13 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>1 – 20 questions</span>
            </div>
          </div>

          {/* Practice mode */}
          <div className="form-section">
            <div className="form-label">Practice Mode</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {PRACTICE_MODES.map(pm => (
                <button key={pm.key} onClick={() => setMode(pm.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', textAlign: 'left', background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
                  <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {mode === 'video' && (
            <div className="form-section">
              <div className="form-label">Recording Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[{ k: 'video', icon: <Video size={13} />, l: 'Video + Audio' }, { k: 'audio', icon: <Mic size={13} />, l: 'Audio Only' }].map(opt => (
                  <button key={opt.k} onClick={() => setMediaMode(opt.k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: mediaMode === opt.k ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mediaMode === opt.k ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mediaMode === opt.k ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
                    {opt.icon} {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={handleApply}>Apply Config</button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   PRACTICE SESSION HOME
   Mirrors PracticeSession.jsx layout:
   left card (JD info + config + actions)
   right card (history)
───────────────────────────────────────── */
const JDPracticeHome = ({
  parsed, chatId, sessionHistory,
  onStartSession, onViewSession,
  generating,
  openConfigOnMount = false,
  onConfigMountHandled,
}) => {
  const [config, setConfig] = useState({
    qType: 'mixed', qCount: 1, mode: 'normal', mediaMode: 'video',
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [historyOpen,     setHistoryOpen]     = useState(true);
  const [loadingSession,  setLoadingSession]  = useState(null);

  // Auto-open config modal after first JD upload
  useEffect(() => {
    if (openConfigOnMount) {
      setShowConfigModal(true);
      onConfigMountHandled?.();
    }
  }, [openConfigOnMount]); // eslint-disable-line react-hooks/exhaustive-deps

  const jdSessions = (sessionHistory || [])
    .filter(s => (s.type || '').startsWith('jd_'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  const modeLabel = { normal: 'Text Practice', voice: 'Voice Practice', video: 'Video Practice' };
  const modeIcon  = { normal: <BookOpen size={13} />, voice: <Mic size={13} />, video: <Video size={13} /> };

  const handleOpenSession = async (s) => {
    setLoadingSession(s.sessionId);
    try { await onViewSession(s); }
    finally { setLoadingSession(null); }
  };

  const handleApplyConfig = (newConfig) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    setShowConfigModal(false);
  };

  const handleGenerate = () => {
    onStartSession({
      count:       config.qCount,
      type:        config.qType,
      sessionMode: config.mode,
      mediaMode:   config.mediaMode,
    });
  };

  return (
    <div className="session-layout">
      {/* ── Left column ──────────────────────────────────────────── */}
      <div>
        <div className="card">

          {/* Hero / JD summary */}
          <div className="session-hero">
            <div className="session-hero-icon">
              <Briefcase size={24} />
            </div>
            <h3>
              {parsed.title || 'Job Interview Prep'}
              {parsed.company && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 16 }}>
                  {' · '}{parsed.company}
                </span>
              )}
            </h3>

            {/* JD locked badge */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 9px' }}>
                <Lock size={9} /> JD LOCKED
              </span>
              {parsed.domain     && <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>}
              {parsed.experience && <span className="badge badge-muted"   style={{ fontSize: 11 }}>{parsed.experience}</span>}
            </div>

            {/* Current config summary */}
            <div style={{ marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-muted">{config.qCount} questions</span>
              <span className="badge badge-muted">{config.qType.replace('_', ' ')}</span>
              <span className="badge badge-blue" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {modeIcon[config.mode]} {modeLabel[config.mode]}
              </span>
            </div>
          </div>

          {/* Skills preview */}
          {parsed.skills?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Skills from JD</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {parsed.skills.slice(0, 12).map((s, i) => (
                  <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>
                ))}
                {parsed.skills.length > 12 && (
                  <span className="badge badge-muted" style={{ fontSize: 11 }}>+{parsed.skills.length - 12} more</span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="action-stack">
            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={handleGenerate}
              disabled={generating}
              style={{ background: generating ? undefined : 'rgba(245,158,11,0.9)', borderColor: 'var(--warning)', color: '#000' }}
            >
              {generating
                ? <><Loader size={16} className="vi-spin" /> Generating…</>
                : <><Send size={16} /> Start Interview</>
              }
            </button>

            <div className="action-divider" />

            <button
              className="btn btn-ghost btn-full new-config-btn"
              onClick={() => setShowConfigModal(true)}
            >
              <Settings size={14} /> Change Config
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                {modeLabel[config.mode]} · {config.qCount} Qs
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Right column: history ─────────────────────────────────── */}
      <div>
        <div className="history-card">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: historyOpen ? 16 : 0, color: 'var(--text-primary)' }}
          >
            <History size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>History</span>
            {historyOpen
              ? <ChevronDown  size={14} style={{ color: 'var(--text-muted)' }} />
              : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            }
          </button>

          {historyOpen && (
            jdSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                No sessions yet
              </div>
            ) : (
              jdSessions.map(s => {
                const isLoading = loadingSession === s.sessionId;
                return (
                  <div
                    key={s.sessionId}
                    className="history-item"
                    onClick={() => !isLoading && handleOpenSession(s)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="history-item-row">
                      <span className="history-label">{sessionTypeLabel(s.type)} Interview</span>
                      <span className="history-view">
                        {isLoading
                          ? <Loader size={12} className="vi-spin" />
                          : 'View →'
                        }
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.score != null && (
                        <span className={`badge ${s.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
                          {Number(s.score).toFixed(1)}/10
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {s.questions?.length || 0} Qs
                      </span>
                    </div>
                    <div className="history-meta">
                      <Clock size={11} />
                      {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Config modal */}
      {showConfigModal && (
        <ConfigModal
          currentConfig={config}
          onApply={handleApplyConfig}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   NORMAL TEXT INTERVIEW
───────────────────────────────────────── */
const JDNormalInterview = ({ questions, sessionId, onSubmit }) => {
  const [answers,    setAnswers]    = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const answeredCount = Object.values(answers).filter(v => String(v || '').trim()).length;

  const handleSubmit = async () => {
    setSubmitting(true); setError('');
    try { await onSubmit(answers); }
    catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      {questions.map((q, idx) => (
        <div key={q.id} className="question-card">
          <div className="question-header">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div className="question-number">{idx + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="question-text">{q.question}</div>
                <div className="question-meta" style={{ marginTop: 6 }}>
                  <CategoryBadge cat={q.category} />
                  {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
                  {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
                </div>
                {q.tip && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
                    💡 {q.tip}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="question-body">
            <textarea className="input" value={answers[q.id] || ''} rows={4}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Type your answer… be specific and use examples where possible"
              style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
          </div>
        </div>
      ))}
      <div className="submit-bar">
        <div className="progress-text">
          <span className="progress-count">{answeredCount}</span> / {questions.length} answered
        </div>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || answeredCount === 0}>
          {submitting ? 'Submitting…' : 'Submit & Get Feedback'}
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   VOICE INTERVIEW
───────────────────────────────────────── */
const JDVoiceInterview = ({ questions, sessionId, onSubmit }) => {
  const [idx,          setIdx]          = useState(0);
  const [phase,        setPhase]        = useState('reading');
  const [transcript,   setTranscript]   = useState('');
  const [savedAnswers, setSavedAnswers] = useState({});
  const [muteTTS,      setMuteTTS]      = useState(false);
  const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);
  const [submitting,   setSubmitting]   = useState(false);

  const recRef    = useRef(null);
  const silRef    = useRef(null);
  const cdRef     = useRef(null);
  const baseRef   = useRef('');
  const bufferRef = useRef(null);
  const advRef    = useRef(false);

  const q = questions[idx];

  const stopTimers = useCallback(() => {
    if (silRef.current) { clearTimeout(silRef.current);  silRef.current = null; }
    if (cdRef.current)  { clearInterval(cdRef.current);  cdRef.current  = null; }
  }, []);

  const stopSTT = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    stopTimers();
  }, [stopTimers]);

  const stopTTS = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch {}
    if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
  }, []);

  const saveAndAdvance = useCallback((text) => {
    if (advRef.current) return;
    advRef.current = true;
    stopSTT();
    const answer = text.trim();
    const qid = questions[idx]?.id;
    if (qid) setSavedAnswers(prev => ({ ...prev, [qid]: answer }));
    baseRef.current = '';
    setTranscript('');
    if (idx + 1 >= questions.length) {
      setPhase('done');
    } else {
      setIdx(i => i + 1);
      setPhase('reading');
      advRef.current = false;
    }
  }, [idx, questions, stopSTT]);

  const startSilenceTimer = useCallback(() => {
    stopTimers();
    let r = SILENCE_MS / 1000;
    setCountdown(r);
    cdRef.current = setInterval(() => { r -= 1; setCountdown(Math.max(0, r)); if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; } }, 1000);
    silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
  }, [stopTimers, saveAndAdvance]);

  const startSTT = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported. Try Chrome or Edge.'); return;
    }
    stopSTT(); advRef.current = false; baseRef.current = '';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
    rec.onresult = (ev) => {
      stopTimers(); startSilenceTimer();
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i]?.[0]?.transcript || '';
        if (ev.results[i].isFinal) final += t; else interim += t;
      }
      const base = baseRef.current;
      const spoken = `${final} ${interim}`.trim();
      setTranscript(base + (base.trim() && spoken ? ' ' : '') + spoken);
      if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
    };
    rec.onerror = () => stopTimers();
    rec.onend   = () => {};
    recRef.current = rec;
    try { rec.start(); } catch (e) { console.error(e); }
  }, [stopSTT, startSilenceTimer, stopTimers]);

  const startBuffer = useCallback(() => {
    setPhase('buffering');
    bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
  }, [startSTT]);

  const readQuestion = useCallback((question) => {
    stopTTS();
    if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
    const u = new SpeechSynthesisUtterance(question.question);
    u.rate  = 0.95;
    u.onend = () => startBuffer();
    u.onerror = () => startBuffer();
    window.speechSynthesis.speak(u);
  }, [muteTTS, stopTTS, startBuffer]);

  useEffect(() => {
    if (phase !== 'reading' || !q) return;
    readQuestion(q);
  }, [idx, phase, readQuestion, q]);

  useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    try {
      const allAnswers = {};
      questions.forEach(sq => { allAnswers[sq.id] = savedAnswers[sq.id] || ''; });
      await onSubmit(allAnswers);
    } catch { setSubmitting(false); }
  };

  if (phase === 'done') {
    const answeredCount = Object.values(savedAnswers).filter(Boolean).length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16 }}>
        <div style={{ fontSize: 40 }}>🎙</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>All questions answered!</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{answeredCount} of {questions.length} answered</div>
        <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleFinalSubmit} disabled={submitting}>
          {submitting ? <><Loader size={14} className="vi-spin" /> Getting feedback…</> : 'Get AI Feedback →'}
        </button>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => { stopTTS(); setMuteTTS(m => !m); if (phase === 'reading') startBuffer(); }} title={muteTTS ? 'Enable TTS' : 'Mute TTS'}>
          {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
      <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <CategoryBadge cat={q.category} />
          {phase === 'reading'   && <span style={{ fontSize: 11, color: 'var(--primary)',  fontWeight: 600 }}>🔊 Reading…</span>}
          {phase === 'buffering' && <span style={{ fontSize: 11, color: 'var(--warning)',  fontWeight: 600 }}>⏱ Starting mic…</span>}
          {phase === 'listening' && <span style={{ fontSize: 11, color: 'var(--danger)',   fontWeight: 600 }}>🎙 Listening…</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.question}</div>
        {q.tip && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>💡 {q.tip}</div>}
      </div>
      <div style={{ minHeight: 90, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
        {transcript
          ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
          : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>{phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}</p>
        }
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {phase === 'reading' && (
          <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
            <Volume2 size={14} /> Skip Reading
          </button>
        )}
        {phase === 'buffering' && (
          <>
            <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}><SkipForward size={14} /> Skip</button>
            <button className="btn btn-primary btn-full" onClick={() => { if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; } startSTT(); }}>
              <Mic size={14} /> Start Now
            </button>
          </>
        )}
        {phase === 'listening' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
              {countdown}s
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}><SkipForward size={14} /> Skip</button>
            <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
              <CheckCircle size={14} />
              {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   VIDEO INTERVIEW
───────────────────────────────────────── */
const safeTTS = (text, onEnd) => {
  try {
    if (!window.speechSynthesis) { onEnd(); return () => {}; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.onend = onEnd; u.onerror = onEnd;
    window.speechSynthesis.speak(u);
    return () => { try { window.speechSynthesis.cancel(); } catch {} };
  } catch { onEnd(); return () => {}; }
};

const JDVideoRecorder = ({ question, chatId, mediaMode, onFeedback, onSkip }) => {
  const [phase,   setPhase]   = useState('ready');
  const [elapsed, setElapsed] = useState(0);
  const [blob,    setBlob]    = useState(null);
  const [error,   setError]   = useState('');
  const [reading, setReading] = useState(true);

  const videoRef   = useRef(null);
  const previewRef = useRef(null);
  const streamRef  = useRef(null);
  const recRef     = useRef(null);
  const chunksRef  = useRef([]);
  const timerRef   = useRef(null);

  useEffect(() => {
    const cancel = safeTTS(question.question, () => setReading(false));
    return () => cancel();
  }, [question.question]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia(
        mediaMode === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
      );
      streamRef.current = s;
      if (videoRef.current && mediaMode === 'video') { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
    } catch { setError('Permission denied. Allow camera/mic and retry.'); return; }

    chunksRef.current = [];
    const mime = mediaMode === 'video' ? 'video/webm' : 'audio/webm';
    const rec  = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm' });
    rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: mime }));
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
      setPhase('preview');
    };
    recRef.current = rec; rec.start(100);
    setPhase('recording'); setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(p => { if (p + 1 >= MAX_REC_SECS) { stopRecording(); return MAX_REC_SECS; } return p + 1; });
    }, 1000);
  };

  const stopRecording = () => {
    if (recRef.current?.state !== 'inactive') recRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (phase === 'preview' && blob && previewRef.current) {
      const url = URL.createObjectURL(blob);
      previewRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [phase, blob]);

  const submitAnswer = async () => {
    if (!blob) return;
    setPhase('submitting'); setError('');
    try {
      const form = new FormData();
      form.append('media', blob, 'recording.webm');
      form.append('question', question.question);
      form.append('media_type', mediaMode);
      form.append('topic', question.category || '');
      form.append('bloom_level', 'Apply');
      const res = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Evaluation failed');
      onFeedback(data.feedback);
    } catch (err) { setError(err.message); setPhase('preview'); }
  };

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="error-box">{error}</div>}
      <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <CategoryBadge cat={question.category} />
          {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{question.question}</div>
      </div>
      {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
        <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
          <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {phase === 'recording' && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} /> {fmtTime(elapsed)}
            </div>
          )}
        </div>
      )}
      {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
        <div style={{ height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
            <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}</div>
        </div>
      )}
      {phase === 'preview' && blob && (
        mediaMode === 'video'
          ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
          : <audio ref={previewRef} controls style={{ width: '100%' }} />
      )}
      {phase === 'submitting' && (
        <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing response… (10–20s)</div>
        </div>
      )}
      {phase === 'ready' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
            {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
          </button>
          <button className="btn btn-ghost" onClick={onSkip} title="Skip"><SkipForward size={15} /></button>
        </div>
      )}
      {phase === 'recording' && (
        <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
          <Square size={14} fill="var(--danger)" /> Stop Recording
        </button>
      )}
      {phase === 'preview' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost flex-1" onClick={() => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); }}>
            <RotateCcw size={14} /> Re-record
          </button>
          <button className="btn btn-primary flex-1" onClick={submitAnswer}>
            <Play size={14} /> Submit for Feedback
          </button>
        </div>
      )}
    </div>
  );
};

const JDVideoInterview = ({ questions, chatId, sessionId, mediaMode, onFinished }) => {
  const [idx,        setIdx]        = useState(0);
  const [phase,      setPhase]      = useState('recording');
  const [currentFb,  setCurrentFb]  = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [saving,     setSaving]     = useState(false);

  const current = questions[idx];
  const total   = questions.length;

  const handleFeedback   = (fb)     => { setAllResults(prev => [...prev, { question: current, feedback: fb }]); setCurrentFb(fb); setPhase('feedback'); };
  const handleSkip       = ()       => { const next = [...allResults, { question: current, feedback: null, skipped: true }]; setAllResults(next); advanceOrFinish(next); };
  const advanceOrFinish  = (results) => { setCurrentFb(null); if (idx + 1 >= total) finishSession(results); else { setIdx(i => i + 1); setPhase('recording'); } };

  const finishSession = async (results) => {
    setSaving(true);
    const feedbackMap = {};
    let totalScore = 0, scoredCount = 0;
    results.forEach(({ question: q, feedback: fb, skipped }) => {
      if (!q?.id) return;
      if (skipped || !fb) { feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: '[Skipped]', correctAnswer: null, isCorrect: null, understandingScore: 0, overallScore: null, skipped: true, videoFeedback: null, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: 0, maxMarks: 10 }; return; }
      const score = fb.overallScore ?? 0;
      totalScore += score; scoredCount += 1;
      feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: fb.transcript || '', correctAnswer: null, isCorrect: null, understandingScore: Math.round(score), overallScore: score, videoFeedback: fb, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: Math.round(score * 10) / 10, maxMarks: 10 };
    });
    const avgScore   = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
    const answersMap = Object.fromEntries(results.filter(r => r.question?.id && !r.skipped).map(r => [r.question.id, r.feedback?.transcript || '']));
    try { await jdAPI.saveVideoSession(chatId, { session_id: sessionId, questions, answers: answersMap, feedback: feedbackMap, score: avgScore, session_type: 'jd_video' }); }
    catch (err) { console.warn('[JDVideoInterview] save failed:', err); }
    setSaving(false);
    onFinished({ score: avgScore, results: feedbackMap, allResults: results });
  };

  if (saving) return (
    <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
      <div style={{ fontSize: 14, fontWeight: 700 }}>Saving session…</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / total) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
          {phase === 'feedback' ? `Feedback ${idx + 1}/${total}` : `Q ${idx + 1}/${total}`}
        </span>
      </div>
      {phase === 'recording' && current && (
        <JDVideoRecorder key={`jd-vid-${idx}`} question={current} chatId={chatId} mediaMode={mediaMode} onFeedback={handleFeedback} onSkip={handleSkip} />
      )}
      {phase === 'feedback' && currentFb && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Score</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
              {currentFb.overallScore != null ? Number(currentFb.overallScore).toFixed(1) : '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
            </div>
          </div>
          {currentFb.transcript && <Collapsible title="📝 Transcript"><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{currentFb.transcript}</p></Collapsible>}
          {(currentFb.strengths?.length > 0 || currentFb.improvements?.length > 0) && (
            <Collapsible title="💡 Coaching" defaultOpen>
              {currentFb.strengths?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
              {currentFb.improvements?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
            </Collapsible>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost flex-1" onClick={() => { setAllResults(prev => prev.slice(0, -1)); setCurrentFb(null); setPhase('recording'); }}><RotateCcw size={14} /> Re-record</button>
            <button className="btn btn-primary flex-1" onClick={() => advanceOrFinish(allResults)}>
              {idx + 1 >= total ? '🎯 View Results' : <>Next <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   SESSION REVIEW
───────────────────────────────────────── */
const JDSessionReview = ({ reviewData, onDone }) => {
  const { questions, results, score, sessionType } = reviewData;
  const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="score-hero" style={{ marginBottom: 16 }}>
        <div>
          <div className="score-label">Interview Score</div>
          <div className="score-value" style={{ color: scoreColor }}>
            {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="score-label">Questions</div>
          <div className="marks-value">{questions.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <span className="badge badge-warning" style={{ fontSize: 12 }}>💼 JD Interview</span>
        <span className="badge badge-muted" style={{ fontSize: 12 }}>
          {sessionType === 'jd_video' ? 'Video Mode' : sessionType === 'jd_voice' ? 'Voice Mode' : 'Text Mode'}
        </span>
      </div>

      {questions.map((q, idx) => {
        const r = results[q.id] || {};
        const qScore = r.overallScore ?? r.understandingScore;
        const qColor = qScore >= 7 ? 'var(--success)' : qScore >= 5 ? 'var(--warning)' : 'var(--danger)';
        return (
          <div key={q.id} className="question-review-block">
            <div className="q-review-header">
              <div className="question-number">{idx + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div className="question-text">{q.question}</div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {qScore != null && <span style={{ fontSize: 13, fontWeight: 700, color: qColor, fontFamily: 'var(--mono)' }}>{Number(qScore).toFixed(1)}/10</span>}
                    {r.skipped && <span className="badge badge-muted" style={{ fontSize: 10 }}>skipped</span>}
                  </div>
                </div>
                <div className="question-meta">
                  <CategoryBadge cat={q.category} />
                  {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
                  {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
                </div>
              </div>
            </div>
            <div className="q-review-body">
              {!r.skipped && r.userAnswer && (
                <div className="result-box">
                  <div className="result-box-label">Your Answer</div>
                  <div className="result-box-content" style={{ whiteSpace: 'pre-wrap' }}>{r.userAnswer}</div>
                </div>
              )}
              {r.videoFeedback?.content && <Collapsible title="📚 Content"><ScoreBar label="Relevance" score={r.videoFeedback.content.answerRelevance} /><ScoreBar label="Completeness" score={r.videoFeedback.content.completeness} /><ScoreBar label="Structure" score={r.videoFeedback.content.structure} /></Collapsible>}
              {r.videoFeedback?.delivery && <Collapsible title="🎤 Delivery"><ScoreBar label="Clarity" score={r.videoFeedback.delivery.clarity} /><ScoreBar label="Confidence" score={r.videoFeedback.delivery.confidencePresentation} /></Collapsible>}
              {!r.skipped && (r.strengths?.length > 0 || r.improvements?.length > 0) && (
                <div className="explanation-box">
                  <div className="explanation-title"><HelpCircle size={16} /> Coaching Feedback</div>
                  {r.strengths?.length > 0 && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ What worked well</div>{r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}</div>}
                  {r.improvements?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>↑ Areas to improve</div>{r.improvements.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}</div>}
                </div>
              )}
              {!r.skipped && r.sampleAnswer && <Collapsible title="🌟 Ideal Answer"><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</p></Collapsible>}
              {r.explanation && !r.skipped && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{r.explanation}</div>}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={onDone}>
          <ArrowLeft size={14} /> Back to Home
        </button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   MAIN PANEL
───────────────────────────────────────── */
const JDInterviewPanel = ({ chat, chatId, sessionHistory, onSessionFinished }) => {
  const [step,               setStep]               = useState('loading');
  const [jdParsed,           setJDParsed]           = useState(null);
  const [activeSession,      setActiveSession]      = useState(null);
  const [reviewData,         setReviewData]         = useState(null);
  const [generating,         setGenerating]         = useState(false);
  const [error,              setError]              = useState('');
  const [showFirstTimeConfig,setShowFirstTimeConfig]= useState(false);

  // Load JD on mount / chat change
  useEffect(() => {
    setStep('loading');
    jdAPI.getJD(chatId)
      .then(res => {
        const jd = res.data?.jd;
        if (jd?.parsed) { setJDParsed(jd.parsed); setStep('home'); }
        else setStep('upload');
      })
      .catch(() => setStep('upload'));
  }, [chatId]);

  const handleUploaded = (data) => {
    setJDParsed(data.parsed);
    setStep('home');
    setError('');
    setShowFirstTimeConfig(true); // auto-open config after first upload
  };

  const handleStartSession = async ({ count, type, sessionMode, mediaMode }) => {
    setGenerating(true); setError('');
    try {
      const res  = await jdAPI.generateSession(chatId, count, type, sessionMode);
      const data = res.data;
      setActiveSession({
        sessionId:   data.sessionId,
        questions:   data.questions,
        sessionMode: data.sessionMode,
        mediaMode,
      });
      setStep('interview');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setGenerating(false); }
  };

  const handleSubmitAnswers = async (answers) => {
    const res  = await jdAPI.submitSession(activeSession.sessionId, answers);
    const data = res.data;
    setReviewData({
      sessionId:   activeSession.sessionId,
      questions:   activeSession.questions,
      results:     data.results,
      score:       data.score,
      sessionType: activeSession.sessionMode === 'voice' ? 'jd_voice' : 'jd_normal',
    });
    setStep('review');
    onSessionFinished?.();
  };

  const handleVideoFinished = (result) => {
    setReviewData({
      sessionId:   activeSession.sessionId,
      questions:   activeSession.questions,
      results:     result.results,
      score:       result.score,
      sessionType: 'jd_video',
    });
    setStep('review');
    onSessionFinished?.();
  };

  const handleViewSession = async (s) => {
    const reviewObj = {
      sessionId:   s.sessionId,
      questions:   s.questions || [],
      results:     s.feedback  || s.results || {},
      score:       s.score,
      sessionType: s.type,
    };
    setReviewData(reviewObj);
    setStep('review');
  };

  const renderContent = () => {
    if (step === 'loading') return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
        <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    );

    if (step === 'upload') return (
      <div className="session-layout">
        <div>
          <div className="card">
            {/* Hero */}
            <div className="session-hero">
              <div className="session-hero-icon"><Briefcase size={24} /></div>
              <h3>Upload Job Description</h3>
              <p>Paste or upload the JD to get AI-generated, role-specific interview questions</p>
            </div>
            <JDUploadView chatId={chatId} onUploaded={handleUploaded} />
          </div>
        </div>
        {/* Empty right column placeholder */}
        <div>
          <div className="history-card" style={{ opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <History size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>History</span>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No sessions yet
            </div>
          </div>
        </div>
      </div>
    );

    if (step === 'review' && reviewData) {
      const hasData = (reviewData.questions?.length || 0) > 0;
      return hasData ? (
        <JDSessionReview
          reviewData={reviewData}
          onDone={() => { setStep('home'); setReviewData(null); setActiveSession(null); }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Session details not available</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            Score: {reviewData.score != null ? `${Number(reviewData.score).toFixed(1)}/10` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            Detailed question data is not stored for this entry.
          </div>
          <button className="btn btn-primary" onClick={() => { setStep('home'); setReviewData(null); }}>
            <ArrowLeft size={14} /> Back to Home
          </button>
        </div>
      );
    }

    if (step === 'interview' && activeSession) {
      const { questions, sessionId, sessionMode, mediaMode } = activeSession;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => { setStep('home'); setActiveSession(null); }}>
            <ArrowLeft size={14} /> Back to Home
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {sessionMode === 'video'  && <span className="badge badge-purple"><Video size={11} /> Video Practice</span>}
            {sessionMode === 'voice'  && <span className="badge badge-blue"><Mic size={11} /> Voice Practice</span>}
            {sessionMode === 'normal' && <span className="badge badge-muted"><BookOpen size={11} /> Text Practice</span>}
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{questions.length} questions</span>
          </div>
          {sessionMode === 'normal' && <JDNormalInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
          {sessionMode === 'voice'  && <JDVoiceInterview  questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
          {sessionMode === 'video'  && <JDVideoInterview  questions={questions} chatId={chatId} sessionId={sessionId} mediaMode={mediaMode || 'video'} onFinished={handleVideoFinished} />}
        </div>
      );
    }

    // Default: home (JD locked, config editable, history)
    return (
      <JDPracticeHome
        parsed={jdParsed}
        chatId={chatId}
        sessionHistory={sessionHistory}
        onStartSession={handleStartSession}
        onViewSession={handleViewSession}
        generating={generating}
        openConfigOnMount={showFirstTimeConfig}
        onConfigMountHandled={() => setShowFirstTimeConfig(false)}
      />
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Briefcase size={20} style={{ color: 'var(--warning)' }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Job Interview Prep
            {jdParsed?.title && jdParsed.title !== 'Unknown' && (
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 15 }}> · {jdParsed.title}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            AI-generated questions · LLM feedback · Saved to history
          </div>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {renderContent()}
    </div>
  );
};

export default JDInterviewPanel;

























// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import {
//   Upload, Loader, Briefcase, Mic, Video, BookOpen,
//   RotateCcw, Play, Square, SkipForward, CheckCircle,
//   AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
//   ArrowLeft, Send, ChevronRight, HelpCircle,
//   Clock, History, Lock, Eye, Settings, X,
// } from 'lucide-react';
// import { jdAPI } from '../services/api';

// /* ─────────────────────────────────────────
//    CONSTANTS
// ───────────────────────────────────────── */
// const QUESTION_TYPES = [
//   { key: 'mixed',         label: 'Mixed (Recommended)', desc: '30% behavioral · 35% technical · 20% situational · 15% role-specific' },
//   { key: 'behavioral',    label: 'Behavioral',           desc: 'Tell me about a time… (STAR method)' },
//   { key: 'technical',     label: 'Technical',            desc: 'Skills, tools, domain knowledge' },
//   { key: 'situational',   label: 'Situational',          desc: 'What would you do if…' },
//   { key: 'role_specific', label: 'Role-Specific',        desc: "Specific to this job's duties" },
// ];

// const PRACTICE_MODES = [
//   { key: 'normal', icon: <BookOpen size={15} />, label: 'Text Practice',  desc: 'Type your answers — no time pressure' },
//   { key: 'voice',  icon: <Mic size={15} />,      label: 'Voice Practice', desc: 'Speak answers, auto-transcribed, LLM evaluation' },
//   { key: 'video',  icon: <Video size={15} />,    label: 'Video Practice', desc: 'Record video/audio, get delivery coaching' },
// ];

// const SILENCE_MS   = 10_000;
// const MAX_REC_SECS = 180;

// /* ─────────────────────────────────────────
//    HELPERS
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
//       <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)' }}>
//         {title}
//         {open ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
//     </div>
//   );
// };

// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>{score != null ? `${score}/${max}` : '—'}</span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
//       </div>
//     </div>
//   );
// };

// const CategoryBadge = ({ cat }) => {
//   const colors = { behavioral: 'badge-blue', technical: 'badge-purple', situational: 'badge-warning', role_specific: 'badge-muted' };
//   return <span className={`badge ${colors[cat] || 'badge-muted'}`} style={{ fontSize: 10 }}>{cat?.replace('_', ' ')}</span>;
// };

// const sessionTypeLabel = (type) => {
//   const map = { jd_normal: 'Text', jd_voice: 'Voice', jd_video: 'Video' };
//   return map[type] || type;
// };

// /* ─────────────────────────────────────────
//    JD UPLOAD VIEW
//    Shown once when no JD exists yet.
// ───────────────────────────────────────── */
// const JDUploadView = ({ chatId, onUploaded }) => {
//   const [tab,     setTab]     = useState('text');
//   const [text,    setText]    = useState('');
//   const [file,    setFile]    = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error,   setError]   = useState('');

//   const handleTextUpload = async () => {
//     if (!text.trim()) { setError('Paste a job description first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadText(chatId, text.trim()); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   const handleFileUpload = async () => {
//     if (!file) { setError('Select a file first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadFile(chatId, file); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       {/* Notice */}
//       <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 14px' }}>
//         <Lock size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
//         <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
//           <strong style={{ color: 'var(--warning)' }}>JD is locked after upload.</strong> Once you upload a job description it stays tied to this session. Create a new chat to practice with a different role.
//         </div>
//       </div>

//       {/* Tabs */}
//       <div style={{ display: 'flex', gap: 6 }}>
//         {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File (PDF/TXT)' }].map(t => (
//           <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`, background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)', color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' }}>
//             {t.l}
//           </button>
//         ))}
//       </div>

//       {error && <div className="error-box">{error}</div>}

//       {tab === 'text' ? (
//         <>
//           <textarea className="input" value={text} onChange={e => setText(e.target.value)}
//             placeholder={"Paste the full job description here…\n\nInclude: role title, company, responsibilities, requirements, skills…"}
//             style={{ minHeight: 200, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           <button className="btn btn-primary btn-full" onClick={handleTextUpload} disabled={loading || !text.trim()}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Parse & Continue →'}
//           </button>
//         </>
//       ) : (
//         <>
//           <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)' }}
//             onClick={() => document.getElementById('jd-file-input').click()}>
//             <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
//             <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
//               {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
//             </div>
//           </div>
//           <input id="jd-file-input" type="file" accept=".pdf,.txt" style={{ display: 'none' }}
//             onChange={e => { setFile(e.target.files[0] || null); setError(''); }} />
//           <button className="btn btn-primary btn-full" onClick={handleFileUpload} disabled={loading || !file}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Upload & Parse →'}
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    CONFIG MODAL
//    Opened from the "Change Config" button
//    after a session has been generated.
// ───────────────────────────────────────── */
// const ConfigModal = ({ currentConfig, onApply, onClose }) => {
//   const [qType,     setQType]     = useState(currentConfig.qType     || 'mixed');
//   const [qCount,    setQCount]    = useState(currentConfig.qCount    || '3');
//   const [mode,      setMode]      = useState(currentConfig.mode      || 'normal');
//   const [mediaMode, setMediaMode] = useState(currentConfig.mediaMode || 'video');

//   const handleApply = () => {
//     onApply({
//       qType, qCount: Math.max(3, Math.min(20, Number(qCount) || 8)),
//       mode, mediaMode,
//     });
//   };

//   return (
//     <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
//       <div className="modal" style={{ maxWidth: 460 }}>
//         <div className="modal-header">
//           <div>
//             <div className="modal-title">Interview Configuration</div>
//             <div className="modal-subtitle">Adjust for your next session</div>
//           </div>
//           <button className="btn-icon" onClick={onClose}><X size={18} /></button>
//         </div>

//         <div className="modal-body">
//           {/* Question type */}
//           <div className="form-section">
//             <div className="form-label">Question Focus</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {QUESTION_TYPES.map(qt => (
//                 <button key={qt.key} onClick={() => setQType(qt.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', textAlign: 'left', background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: qType === qt.key ? 'var(--primary)' : 'var(--border)' }} />
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* Count */}
//           <div className="form-section">
//             <div className="form-label">Number of Questions</div>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//               <input className="input" type="number" min={1} max={20} value={qCount} id="number-of-questions"  // Added id attribute
//               name="number-of-questions" // Added name attribute
//                 onChange={e => setQCount(e.target.value)} style={{ maxWidth: 80, fontSize: 13 }} />
//               <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>1 – 20 questions</span>
//             </div>
//           </div>

//           {/* Practice mode */}
//           <div className="form-section">
//             <div className="form-label">Practice Mode</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {PRACTICE_MODES.map(pm => (
//                 <button key={pm.key} onClick={() => setMode(pm.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', textAlign: 'left', background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {mode === 'video' && (
//             <div className="form-section">
//               <div className="form-label">Recording Type</div>
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//                 {[{ k: 'video', icon: <Video size={13} />, l: 'Video + Audio' }, { k: 'audio', icon: <Mic size={13} />, l: 'Audio Only' }].map(opt => (
//                   <button key={opt.k} onClick={() => setMediaMode(opt.k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: mediaMode === opt.k ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mediaMode === opt.k ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mediaMode === opt.k ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
//                     {opt.icon} {opt.l}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           )}
//         </div>

//         <div className="modal-footer">
//           <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
//           <button className="btn btn-primary flex-1" onClick={handleApply}>Apply Config</button>
//         </div>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    PRACTICE SESSION HOME
//    Mirrors PracticeSession.jsx layout:
//    left card (JD info + config + actions)
//    right card (history)
// ───────────────────────────────────────── */
// const JDPracticeHome = ({
//   parsed, chatId, sessionHistory,
//   onStartSession, onViewSession,
//   generating,
// }) => {
//   const [config, setConfig] = useState({
//     qType: 'mixed', qCount: 8, mode: 'normal', mediaMode: 'video',
//   });
//   const [showConfigModal, setShowConfigModal] = useState(false);
//   const [historyOpen,     setHistoryOpen]     = useState(true);
//   const [loadingSession,  setLoadingSession]  = useState(null);

//   const jdSessions = (sessionHistory || [])
//     .filter(s => (s.type || '').startsWith('jd_'))
//     .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
//     .slice(0, 10);

//   const modeLabel = { normal: 'Text Practice', voice: 'Voice Practice', video: 'Video Practice' };
//   const modeIcon  = { normal: <BookOpen size={13} />, voice: <Mic size={13} />, video: <Video size={13} /> };

//   const handleOpenSession = async (s) => {
//     setLoadingSession(s.sessionId);
//     try { await onViewSession(s); }
//     finally { setLoadingSession(null); }
//   };

//   const handleApplyConfig = (newConfig) => {
//     setConfig(prev => ({ ...prev, ...newConfig }));
//     setShowConfigModal(false);
//   };

//   const handleGenerate = () => {
//     onStartSession({
//       count:       config.qCount,
//       type:        config.qType,
//       sessionMode: config.mode,
//       mediaMode:   config.mediaMode,
//     });
//   };

//   return (
//     <div className="session-layout">
//       {/* ── Left column ──────────────────────────────────────────── */}
//       <div>
//         <div className="card">

//           {/* Hero / JD summary */}
//           <div className="session-hero">
//             <div className="session-hero-icon">
//               <Briefcase size={24} />
//             </div>
//             <h3>
//               {parsed.title || 'Job Interview Prep'}
//               {parsed.company && (
//                 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 16 }}>
//                   {' · '}{parsed.company}
//                 </span>
//               )}
//             </h3>

//             {/* JD locked badge */}
//             <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
//               <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 9px' }}>
//                 <Lock size={9} /> JD LOCKED
//               </span>
//               {parsed.domain     && <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>}
//               {parsed.experience && <span className="badge badge-muted"   style={{ fontSize: 11 }}>{parsed.experience}</span>}
//             </div>

//             {/* Current config summary */}
//             <div style={{ marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
//               <span className="badge badge-muted">{config.qCount} questions</span>
//               <span className="badge badge-muted">{config.qType.replace('_', ' ')}</span>
//               <span className="badge badge-blue" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//                 {modeIcon[config.mode]} {modeLabel[config.mode]}
//               </span>
//             </div>
//           </div>

//           {/* Skills preview */}
//           {parsed.skills?.length > 0 && (
//             <div style={{ marginBottom: 20 }}>
//               <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Skills from JD</div>
//               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
//                 {parsed.skills.slice(0, 12).map((s, i) => (
//                   <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>
//                 ))}
//                 {parsed.skills.length > 12 && (
//                   <span className="badge badge-muted" style={{ fontSize: 11 }}>+{parsed.skills.length - 12} more</span>
//                 )}
//               </div>
//             </div>
//           )}

//           {/* Actions */}
//           <div className="action-stack">
//             <button
//               className="btn btn-primary btn-lg btn-full"
//               onClick={handleGenerate}
//               disabled={generating}
//               style={{ background: generating ? undefined : 'rgba(245,158,11,0.9)', borderColor: 'var(--warning)', color: '#000' }}
//             >
//               {generating
//                 ? <><Loader size={16} className="vi-spin" /> Generating…</>
//                 : <><Send size={16} /> Start Interview</>
//               }
//             </button>

//             <div className="action-divider" />

//             <button
//               className="btn btn-ghost btn-full new-config-btn"
//               onClick={() => setShowConfigModal(true)}
//             >
//               <Settings size={14} /> Change Config
//               <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
//                 {modeLabel[config.mode]} · {config.qCount} Qs
//               </span>
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* ── Right column: history ─────────────────────────────────── */}
//       <div>
//         <div className="history-card">
//           <button
//             onClick={() => setHistoryOpen(o => !o)}
//             style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: historyOpen ? 16 : 0, color: 'var(--text-primary)' }}
//           >
//             <History size={16} style={{ color: 'var(--text-muted)' }} />
//             <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>History</span>
//             {historyOpen
//               ? <ChevronDown  size={14} style={{ color: 'var(--text-muted)' }} />
//               : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
//             }
//           </button>

//           {historyOpen && (
//             jdSessions.length === 0 ? (
//               <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
//                 No sessions yet
//               </div>
//             ) : (
//               jdSessions.map(s => {
//                 const isLoading = loadingSession === s.sessionId;
//                 return (
//                   <div
//                     key={s.sessionId}
//                     className="history-item"
//                     onClick={() => !isLoading && handleOpenSession(s)}
//                     style={{ cursor: 'pointer' }}
//                   >
//                     <div className="history-item-row">
//                       <span className="history-label">{sessionTypeLabel(s.type)} Interview</span>
//                       <span className="history-view">
//                         {isLoading
//                           ? <Loader size={12} className="vi-spin" />
//                           : 'View →'
//                         }
//                       </span>
//                     </div>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
//                       {s.score != null && (
//                         <span className={`badge ${s.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
//                           {Number(s.score).toFixed(1)}/10
//                         </span>
//                       )}
//                       <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
//                         {s.questions?.length || 0} Qs
//                       </span>
//                     </div>
//                     <div className="history-meta">
//                       <Clock size={11} />
//                       {new Date(s.createdAt).toLocaleDateString()}
//                     </div>
//                   </div>
//                 );
//               })
//             )
//           )}
//         </div>
//       </div>

//       {/* Config modal */}
//       {showConfigModal && (
//         <ConfigModal
//           currentConfig={config}
//           onApply={handleApplyConfig}
//           onClose={() => setShowConfigModal(false)}
//         />
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    NORMAL TEXT INTERVIEW
// ───────────────────────────────────────── */
// const JDNormalInterview = ({ questions, sessionId, onSubmit }) => {
//   const [answers,    setAnswers]    = useState({});
//   const [submitting, setSubmitting] = useState(false);
//   const [error,      setError]      = useState('');

//   const answeredCount = Object.values(answers).filter(v => String(v || '').trim()).length;

//   const handleSubmit = async () => {
//     setSubmitting(true); setError('');
//     try { await onSubmit(answers); }
//     catch (err) { setError(err.message); }
//     finally { setSubmitting(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
//       {questions.map((q, idx) => (
//         <div key={q.id} className="question-card">
//           <div className="question-header">
//             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div className="question-text">{q.question}</div>
//                 <div className="question-meta" style={{ marginTop: 6 }}>
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//                 {q.tip && (
//                   <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
//                     💡 {q.tip}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//           <div className="question-body">
//             <textarea className="input" value={answers[q.id] || ''} rows={4}
//               onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
//               placeholder="Type your answer… be specific and use examples where possible"
//               style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           </div>
//         </div>
//       ))}
//       <div className="submit-bar">
//         <div className="progress-text">
//           <span className="progress-count">{answeredCount}</span> / {questions.length} answered
//         </div>
//         <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || answeredCount === 0}>
//           {submitting ? 'Submitting…' : 'Submit & Get Feedback'}
//           <Send size={16} />
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VOICE INTERVIEW
// ───────────────────────────────────────── */
// const JDVoiceInterview = ({ questions, sessionId, onSubmit }) => {
//   const [idx,          setIdx]          = useState(0);
//   const [phase,        setPhase]        = useState('reading');
//   const [transcript,   setTranscript]   = useState('');
//   const [savedAnswers, setSavedAnswers] = useState({});
//   const [muteTTS,      setMuteTTS]      = useState(false);
//   const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);
//   const [submitting,   setSubmitting]   = useState(false);

//   const recRef    = useRef(null);
//   const silRef    = useRef(null);
//   const cdRef     = useRef(null);
//   const baseRef   = useRef('');
//   const bufferRef = useRef(null);
//   const advRef    = useRef(false);

//   const q = questions[idx];

//   const stopTimers = useCallback(() => {
//     if (silRef.current) { clearTimeout(silRef.current);  silRef.current = null; }
//     if (cdRef.current)  { clearInterval(cdRef.current);  cdRef.current  = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recRef.current?.stop(); } catch {}
//     recRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//   }, []);

//   const saveAndAdvance = useCallback((text) => {
//     if (advRef.current) return;
//     advRef.current = true;
//     stopSTT();
//     const answer = text.trim();
//     const qid = questions[idx]?.id;
//     if (qid) setSavedAnswers(prev => ({ ...prev, [qid]: answer }));
//     baseRef.current = '';
//     setTranscript('');
//     if (idx + 1 >= questions.length) {
//       setPhase('done');
//     } else {
//       setIdx(i => i + 1);
//       setPhase('reading');
//       advRef.current = false;
//     }
//   }, [idx, questions, stopSTT]);

//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     let r = SILENCE_MS / 1000;
//     setCountdown(r);
//     cdRef.current = setInterval(() => { r -= 1; setCountdown(Math.max(0, r)); if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; } }, 1000);
//     silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
//   }, [stopTimers, saveAndAdvance]);

//   const startSTT = useCallback(() => {
//     if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
//       alert('Speech recognition not supported. Try Chrome or Edge.'); return;
//     }
//     stopSTT(); advRef.current = false; baseRef.current = '';
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
//     rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
//     rec.onresult = (ev) => {
//       stopTimers(); startSilenceTimer();
//       let interim = '', final = '';
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const t = ev.results[i]?.[0]?.transcript || '';
//         if (ev.results[i].isFinal) final += t; else interim += t;
//       }
//       const base = baseRef.current;
//       const spoken = `${final} ${interim}`.trim();
//       setTranscript(base + (base.trim() && spoken ? ' ' : '') + spoken);
//       if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
//     };
//     rec.onerror = () => stopTimers();
//     rec.onend   = () => {};
//     recRef.current = rec;
//     try { rec.start(); } catch (e) { console.error(e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   const startBuffer = useCallback(() => {
//     setPhase('buffering');
//     bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
//   }, [startSTT]);

//   const readQuestion = useCallback((question) => {
//     stopTTS();
//     if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
//     const u = new SpeechSynthesisUtterance(question.question);
//     u.rate  = 0.95;
//     u.onend = () => startBuffer();
//     u.onerror = () => startBuffer();
//     window.speechSynthesis.speak(u);
//   }, [muteTTS, stopTTS, startBuffer]);

//   useEffect(() => {
//     if (phase !== 'reading' || !q) return;
//     readQuestion(q);
//   }, [idx, phase, readQuestion, q]);

//   useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

//   const handleFinalSubmit = async () => {
//     setSubmitting(true);
//     try {
//       const allAnswers = {};
//       questions.forEach(sq => { allAnswers[sq.id] = savedAnswers[sq.id] || ''; });
//       await onSubmit(allAnswers);
//     } catch { setSubmitting(false); }
//   };

//   if (phase === 'done') {
//     const answeredCount = Object.values(savedAnswers).filter(Boolean).length;
//     return (
//       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16 }}>
//         <div style={{ fontSize: 40 }}>🎙</div>
//         <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>All questions answered!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{answeredCount} of {questions.length} answered</div>
//         <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleFinalSubmit} disabled={submitting}>
//           {submitting ? <><Loader size={14} className="vi-spin" /> Getting feedback…</> : 'Get AI Feedback →'}
//         </button>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
//         <button className="btn btn-ghost btn-sm" onClick={() => { stopTTS(); setMuteTTS(m => !m); if (phase === 'reading') startBuffer(); }} title={muteTTS ? 'Enable TTS' : 'Mute TTS'}>
//           {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
//         </button>
//       </div>
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
//           <CategoryBadge cat={q.category} />
//           {phase === 'reading'   && <span style={{ fontSize: 11, color: 'var(--primary)',  fontWeight: 600 }}>🔊 Reading…</span>}
//           {phase === 'buffering' && <span style={{ fontSize: 11, color: 'var(--warning)',  fontWeight: 600 }}>⏱ Starting mic…</span>}
//           {phase === 'listening' && <span style={{ fontSize: 11, color: 'var(--danger)',   fontWeight: 600 }}>🎙 Listening…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.question}</div>
//         {q.tip && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>💡 {q.tip}</div>}
//       </div>
//       <div style={{ minHeight: 90, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
//         {transcript
//           ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
//           : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>{phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}</p>
//         }
//       </div>
//       <div style={{ display: 'flex', gap: 8 }}>
//         {phase === 'reading' && (
//           <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
//             <Volume2 size={14} /> Skip Reading
//           </button>
//         )}
//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary btn-full" onClick={() => { if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; } startSTT(); }}>
//               <Mic size={14} /> Start Now
//             </button>
//           </>
//         )}
//         {phase === 'listening' && (
//           <>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
//               {countdown}s
//             </div>
//             <div style={{ flex: 1 }} />
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
//               <CheckCircle size={14} />
//               {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VIDEO INTERVIEW
// ───────────────────────────────────────── */
// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.92; u.onend = onEnd; u.onerror = onEnd;
//     window.speechSynthesis.speak(u);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch { onEnd(); return () => {}; }
// };

// const JDVideoRecorder = ({ question, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   useEffect(() => {
//     const cancel = safeTTS(question.question, () => setReading(false));
//     return () => cancel();
//   }, [question.question]);

//   useEffect(() => () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const startRecording = async () => {
//     setError('');
//     try {
//       const s = await navigator.mediaDevices.getUserMedia(
//         mediaMode === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
//       );
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
//     } catch { setError('Permission denied. Allow camera/mic and retry.'); return; }

//     chunksRef.current = [];
//     const mime = mediaMode === 'video' ? 'video/webm' : 'audio/webm';
//     const rec  = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm' });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       setBlob(new Blob(chunksRef.current, { type: mime }));
//       streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
//       setPhase('preview');
//     };
//     recRef.current = rec; rec.start(100);
//     setPhase('recording'); setElapsed(0);
//     timerRef.current = setInterval(() => {
//       setElapsed(p => { if (p + 1 >= MAX_REC_SECS) { stopRecording(); return MAX_REC_SECS; } return p + 1; });
//     }, 1000);
//   };

//   const stopRecording = () => {
//     if (recRef.current?.state !== 'inactive') recRef.current?.stop();
//     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
//   };

//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting'); setError('');
//     try {
//       const form = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question.question);
//       form.append('media_type', mediaMode);
//       form.append('topic', question.category || '');
//       form.append('bloom_level', 'Apply');
//       const res = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) { setError(err.message); setPhase('preview'); }
//   };

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
//           <CategoryBadge cat={question.category} />
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{question.question}</div>
//       </div>
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} /> {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 44, height: 44, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}</div>
//         </div>
//       )}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <audio ref={previewRef} controls style={{ width: '100%' }} />
//       )}
//       {phase === 'submitting' && (
//         <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
//           <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing response… (10–20s)</div>
//         </div>
//       )}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip"><SkipForward size={15} /></button>
//         </div>
//       )}
//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}
//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={() => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); }}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// const JDVideoInterview = ({ questions, chatId, sessionId, mediaMode, onFinished }) => {
//   const [idx,        setIdx]        = useState(0);
//   const [phase,      setPhase]      = useState('recording');
//   const [currentFb,  setCurrentFb]  = useState(null);
//   const [allResults, setAllResults] = useState([]);
//   const [saving,     setSaving]     = useState(false);

//   const current = questions[idx];
//   const total   = questions.length;

//   const handleFeedback   = (fb)     => { setAllResults(prev => [...prev, { question: current, feedback: fb }]); setCurrentFb(fb); setPhase('feedback'); };
//   const handleSkip       = ()       => { const next = [...allResults, { question: current, feedback: null, skipped: true }]; setAllResults(next); advanceOrFinish(next); };
//   const advanceOrFinish  = (results) => { setCurrentFb(null); if (idx + 1 >= total) finishSession(results); else { setIdx(i => i + 1); setPhase('recording'); } };

//   const finishSession = async (results) => {
//     setSaving(true);
//     const feedbackMap = {};
//     let totalScore = 0, scoredCount = 0;
//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) { feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: '[Skipped]', correctAnswer: null, isCorrect: null, understandingScore: 0, overallScore: null, skipped: true, videoFeedback: null, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: 0, maxMarks: 10 }; return; }
//       const score = fb.overallScore ?? 0;
//       totalScore += score; scoredCount += 1;
//       feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: fb.transcript || '', correctAnswer: null, isCorrect: null, understandingScore: Math.round(score), overallScore: score, videoFeedback: fb, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: Math.round(score * 10) / 10, maxMarks: 10 };
//     });
//     const avgScore   = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
//     const answersMap = Object.fromEntries(results.filter(r => r.question?.id && !r.skipped).map(r => [r.question.id, r.feedback?.transcript || '']));
//     try { await jdAPI.saveVideoSession(chatId, { session_id: sessionId, questions, answers: answersMap, feedback: feedbackMap, score: avgScore, session_type: 'jd_video' }); }
//     catch (err) { console.warn('[JDVideoInterview] save failed:', err); }
//     setSaving(false);
//     onFinished({ score: avgScore, results: feedbackMap, allResults: results });
//   };

//   if (saving) return (
//     <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
//       <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
//       <div style={{ fontSize: 14, fontWeight: 700 }}>Saving session…</div>
//     </div>
//   );

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / total) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
//           {phase === 'feedback' ? `Feedback ${idx + 1}/${total}` : `Q ${idx + 1}/${total}`}
//         </span>
//       </div>
//       {phase === 'recording' && current && (
//         <JDVideoRecorder key={`jd-vid-${idx}`} question={current} chatId={chatId} mediaMode={mediaMode} onFeedback={handleFeedback} onSkip={handleSkip} />
//       )}
//       {phase === 'feedback' && currentFb && (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
//             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Score</div>
//             <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
//               {currentFb.overallScore != null ? Number(currentFb.overallScore).toFixed(1) : '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//             </div>
//           </div>
//           {currentFb.transcript && <Collapsible title="📝 Transcript"><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{currentFb.transcript}</p></Collapsible>}
//           {(currentFb.strengths?.length > 0 || currentFb.improvements?.length > 0) && (
//             <Collapsible title="💡 Coaching" defaultOpen>
//               {currentFb.strengths?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//               {currentFb.improvements?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//             </Collapsible>
//           )}
//           <div style={{ display: 'flex', gap: 10 }}>
//             <button className="btn btn-ghost flex-1" onClick={() => { setAllResults(prev => prev.slice(0, -1)); setCurrentFb(null); setPhase('recording'); }}><RotateCcw size={14} /> Re-record</button>
//             <button className="btn btn-primary flex-1" onClick={() => advanceOrFinish(allResults)}>
//               {idx + 1 >= total ? '🎯 View Results' : <>Next <ChevronRight size={14} /></>}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    SESSION REVIEW
// ───────────────────────────────────────── */
// const JDSessionReview = ({ reviewData, onDone }) => {
//   const { questions, results, score, sessionType } = reviewData;
//   const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       <div className="score-hero" style={{ marginBottom: 16 }}>
//         <div>
//           <div className="score-label">Interview Score</div>
//           <div className="score-value" style={{ color: scoreColor }}>
//             {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
//           </div>
//         </div>
//         <div style={{ textAlign: 'right' }}>
//           <div className="score-label">Questions</div>
//           <div className="marks-value">{questions.length}</div>
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
//         <span className="badge badge-warning" style={{ fontSize: 12 }}>💼 JD Interview</span>
//         <span className="badge badge-muted" style={{ fontSize: 12 }}>
//           {sessionType === 'jd_video' ? 'Video Mode' : sessionType === 'jd_voice' ? 'Voice Mode' : 'Text Mode'}
//         </span>
//       </div>

//       {questions.map((q, idx) => {
//         const r = results[q.id] || {};
//         const qScore = r.overallScore ?? r.understandingScore;
//         const qColor = qScore >= 7 ? 'var(--success)' : qScore >= 5 ? 'var(--warning)' : 'var(--danger)';
//         return (
//           <div key={q.id} className="question-review-block">
//             <div className="q-review-header">
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
//                   <div className="question-text">{q.question}</div>
//                   <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
//                     {qScore != null && <span style={{ fontSize: 13, fontWeight: 700, color: qColor, fontFamily: 'var(--mono)' }}>{Number(qScore).toFixed(1)}/10</span>}
//                     {r.skipped && <span className="badge badge-muted" style={{ fontSize: 10 }}>skipped</span>}
//                   </div>
//                 </div>
//                 <div className="question-meta">
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//               </div>
//             </div>
//             <div className="q-review-body">
//               {!r.skipped && r.userAnswer && (
//                 <div className="result-box">
//                   <div className="result-box-label">Your Answer</div>
//                   <div className="result-box-content" style={{ whiteSpace: 'pre-wrap' }}>{r.userAnswer}</div>
//                 </div>
//               )}
//               {r.videoFeedback?.content && <Collapsible title="📚 Content"><ScoreBar label="Relevance" score={r.videoFeedback.content.answerRelevance} /><ScoreBar label="Completeness" score={r.videoFeedback.content.completeness} /><ScoreBar label="Structure" score={r.videoFeedback.content.structure} /></Collapsible>}
//               {r.videoFeedback?.delivery && <Collapsible title="🎤 Delivery"><ScoreBar label="Clarity" score={r.videoFeedback.delivery.clarity} /><ScoreBar label="Confidence" score={r.videoFeedback.delivery.confidencePresentation} /></Collapsible>}
//               {!r.skipped && (r.strengths?.length > 0 || r.improvements?.length > 0) && (
//                 <div className="explanation-box">
//                   <div className="explanation-title"><HelpCircle size={16} /> Coaching Feedback</div>
//                   {r.strengths?.length > 0 && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ What worked well</div>{r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}</div>}
//                   {r.improvements?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>↑ Areas to improve</div>{r.improvements.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}</div>}
//                 </div>
//               )}
//               {!r.skipped && r.sampleAnswer && <Collapsible title="🌟 Ideal Answer"><p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</p></Collapsible>}
//               {r.explanation && !r.skipped && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{r.explanation}</div>}
//             </div>
//           </div>
//         );
//       })}

//       <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
//         <button className="btn btn-primary" onClick={onDone}>
//           <ArrowLeft size={14} /> Back to Home
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN PANEL
// ───────────────────────────────────────── */
// const JDInterviewPanel = ({ chat, chatId, sessionHistory, onSessionFinished }) => {
//   const [step,          setStep]          = useState('loading');
//   const [jdParsed,      setJDParsed]      = useState(null);
//   const [activeSession, setActiveSession] = useState(null);
//   const [reviewData,    setReviewData]    = useState(null);
//   const [generating,    setGenerating]    = useState(false);
//   const [error,         setError]         = useState('');

//   // Load JD on mount / chat change
//   useEffect(() => {
//     setStep('loading');
//     jdAPI.getJD(chatId)
//       .then(res => {
//         const jd = res.data?.jd;
//         if (jd?.parsed) { setJDParsed(jd.parsed); setStep('home'); }
//         else setStep('upload');
//       })
//       .catch(() => setStep('upload'));
//   }, [chatId]);

//   const handleUploaded = (data) => {
//     setJDParsed(data.parsed);
//     setStep('home');
//     setError('');
//   };

//   const handleStartSession = async ({ count, type, sessionMode, mediaMode }) => {
//     setGenerating(true); setError('');
//     try {
//       const res  = await jdAPI.generateSession(chatId, count, type, sessionMode);
//       const data = res.data;
//       setActiveSession({
//         sessionId:   data.sessionId,
//         questions:   data.questions,
//         sessionMode: data.sessionMode,
//         mediaMode,
//       });
//       setStep('interview');
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setGenerating(false); }
//   };

//   const handleSubmitAnswers = async (answers) => {
//     const res  = await jdAPI.submitSession(activeSession.sessionId, answers);
//     const data = res.data;
//     setReviewData({
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     data.results,
//       score:       data.score,
//       sessionType: activeSession.sessionMode === 'voice' ? 'jd_voice' : 'jd_normal',
//     });
//     setStep('review');
//     onSessionFinished?.();
//   };

//   const handleVideoFinished = (result) => {
//     setReviewData({
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     result.results,
//       score:       result.score,
//       sessionType: 'jd_video',
//     });
//     setStep('review');
//     onSessionFinished?.();
//   };

//   const handleViewSession = async (s) => {
//     const reviewObj = {
//       sessionId:   s.sessionId,
//       questions:   s.questions || [],
//       results:     s.feedback  || s.results || {},
//       score:       s.score,
//       sessionType: s.type,
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//   };

//   const renderContent = () => {
//     if (step === 'loading') return (
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
//         <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
//         <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
//       </div>
//     );

//     if (step === 'upload') return (
//       <div className="session-layout">
//         <div>
//           <div className="card">
//             {/* Hero */}
//             <div className="session-hero">
//               <div className="session-hero-icon"><Briefcase size={24} /></div>
//               <h3>Upload Job Description</h3>
//               <p>Paste or upload the JD to get AI-generated, role-specific interview questions</p>
//             </div>
//             <JDUploadView chatId={chatId} onUploaded={handleUploaded} />
//           </div>
//         </div>
//         {/* Empty right column placeholder */}
//         <div>
//           <div className="history-card" style={{ opacity: 0.5 }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
//               <History size={16} style={{ color: 'var(--text-muted)' }} />
//               <span style={{ fontSize: 14, fontWeight: 700 }}>History</span>
//             </div>
//             <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
//               No sessions yet
//             </div>
//           </div>
//         </div>
//       </div>
//     );

//     if (step === 'review' && reviewData) {
//       const hasData = (reviewData.questions?.length || 0) > 0;
//       return hasData ? (
//         <JDSessionReview
//           reviewData={reviewData}
//           onDone={() => { setStep('home'); setReviewData(null); setActiveSession(null); }}
//         />
//       ) : (
//         <div style={{ textAlign: 'center', padding: '40px 24px' }}>
//           <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
//           <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Session details not available</div>
//           <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
//             Score: {reviewData.score != null ? `${Number(reviewData.score).toFixed(1)}/10` : '—'}
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
//             Detailed question data is not stored for this entry.
//           </div>
//           <button className="btn btn-primary" onClick={() => { setStep('home'); setReviewData(null); }}>
//             <ArrowLeft size={14} /> Back to Home
//           </button>
//         </div>
//       );
//     }

//     if (step === 'interview' && activeSession) {
//       const { questions, sessionId, sessionMode, mediaMode } = activeSession;
//       return (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//           <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
//             onClick={() => { setStep('home'); setActiveSession(null); }}>
//             <ArrowLeft size={14} /> Back to Home
//           </button>
//           <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
//             {sessionMode === 'video'  && <span className="badge badge-purple"><Video size={11} /> Video Practice</span>}
//             {sessionMode === 'voice'  && <span className="badge badge-blue"><Mic size={11} /> Voice Practice</span>}
//             {sessionMode === 'normal' && <span className="badge badge-muted"><BookOpen size={11} /> Text Practice</span>}
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{questions.length} questions</span>
//           </div>
//           {sessionMode === 'normal' && <JDNormalInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'voice'  && <JDVoiceInterview  questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'video'  && <JDVideoInterview  questions={questions} chatId={chatId} sessionId={sessionId} mediaMode={mediaMode || 'video'} onFinished={handleVideoFinished} />}
//         </div>
//       );
//     }

//     // Default: home (JD locked, config editable, history)
//     return (
//       <JDPracticeHome
//         parsed={jdParsed}
//         chatId={chatId}
//         sessionHistory={sessionHistory}
//         onStartSession={handleStartSession}
//         onViewSession={handleViewSession}
//         generating={generating}
//       />
//     );
//   };

//   return (
//     <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
//       {/* Page header */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
//         <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
//           <Briefcase size={20} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div>
//           <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
//             Job Interview Prep
//             {jdParsed?.title && jdParsed.title !== 'Unknown' && (
//               <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 15 }}> · {jdParsed.title}</span>
//             )}
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             AI-generated questions · LLM feedback · Saved to history
//           </div>
//         </div>
//       </div>

//       {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

//       {renderContent()}
//     </div>
//   );
// };

// export default JDInterviewPanel;


























// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import {
//   Upload, Loader, Briefcase, Mic, Video, BookOpen,
//   RotateCcw, Play, Square, SkipForward, CheckCircle,
//   AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
//   ArrowLeft, Send, ChevronRight, HelpCircle,
//   Clock, History, Lock, Eye,
// } from 'lucide-react';
// import { jdAPI, chatAPI } from '../services/api';

// /* ─────────────────────────────────────────
//    CONSTANTS / CONFIG
// ───────────────────────────────────────── */
// const QUESTION_TYPES = [
//   { key: 'mixed',         label: 'Mixed (Recommended)', desc: '30% behavioral · 35% technical · 20% situational · 15% role-specific' },
//   { key: 'behavioral',    label: 'Behavioral',           desc: 'Tell me about a time… (STAR method)' },
//   { key: 'technical',     label: 'Technical',            desc: 'Skills, tools, domain knowledge' },
//   { key: 'situational',   label: 'Situational',          desc: 'What would you do if…' },
//   { key: 'role_specific', label: 'Role-Specific',        desc: "Specific to this job's duties" },
// ];

// const PRACTICE_MODES = [
//   { key: 'normal', icon: <BookOpen size={15} />, label: 'Text Practice',  desc: 'Type your answers — no time pressure' },
//   { key: 'voice',  icon: <Mic size={15} />,      label: 'Voice Practice', desc: 'Speak answers, auto-transcribed, LLM evaluation' },
//   { key: 'video',  icon: <Video size={15} />,    label: 'Video Practice', desc: 'Record video/audio, get delivery coaching' },
// ];

// const SILENCE_MS   = 10_000;
// const MAX_REC_SECS = 180;

// /* ─────────────────────────────────────────
//    SMALL HELPERS
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
//       <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)' }}>
//         {title}
//         {open ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
//     </div>
//   );
// };

// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>{score != null ? `${score}/${max}` : '—'}</span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
//       </div>
//     </div>
//   );
// };

// const CategoryBadge = ({ cat }) => {
//   const colors = { behavioral: 'badge-blue', technical: 'badge-purple', situational: 'badge-warning', role_specific: 'badge-muted' };
//   return <span className={`badge ${colors[cat] || 'badge-muted'}`} style={{ fontSize: 10 }}>{cat?.replace('_', ' ')}</span>;
// };

// const sessionTypeLabel = (type) => {
//   const map = { jd_normal: 'Text', jd_voice: 'Voice', jd_video: 'Video' };
//   return map[type] || type;
// };

// /* ─────────────────────────────────────────
//    STEP 1 — JD UPLOAD VIEW
//    (only shown when no JD exists yet)
// ───────────────────────────────────────── */
// const JDUploadView = ({ chatId, onUploaded }) => {
//   const [tab,     setTab]     = useState('text');
//   const [text,    setText]    = useState('');
//   const [file,    setFile]    = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error,   setError]   = useState('');

//   const handleTextUpload = async () => {
//     if (!text.trim()) { setError('Paste a job description first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadText(chatId, text.trim()); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   const handleFileUpload = async () => {
//     if (!file) { setError('Select a file first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadFile(chatId, file); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
//         <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
//           <Briefcase size={24} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Add Job Description</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//           Paste or upload a JD — AI parses it, then you practice with role-specific interview questions
//         </div>
//         {/* Permanent lock notice */}
//         <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--warning)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 12px' }}>
//           <Lock size={11} />
//           Once uploaded, the JD is locked to this session. Create a new chat to use a different JD.
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 6 }}>
//         {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File (PDF/TXT)' }].map(t => (
//           <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`, background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)', color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' }}>
//             {t.l}
//           </button>
//         ))}
//       </div>

//       {error && <div className="error-box">{error}</div>}

//       {tab === 'text' ? (
//         <>
//           <textarea className="input" value={text} onChange={e => setText(e.target.value)}
//             placeholder={"Paste the full job description here…\n\nInclude: role title, company, responsibilities, requirements, skills…"}
//             style={{ minHeight: 180, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           <button className="btn btn-primary btn-full" onClick={handleTextUpload} disabled={loading || !text.trim()}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Parse & Continue →'}
//           </button>
//         </>
//       ) : (
//         <>
//           <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)' }}
//             onClick={() => document.getElementById('jd-file-input').click()}>
//             <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
//             <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
//               {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
//             </div>
//           </div>
//           <input id="jd-file-input" type="file" accept=".pdf,.txt" style={{ display: 'none' }}
//             onChange={e => { setFile(e.target.files[0] || null); setError(''); }} />
//           <button className="btn btn-primary btn-full" onClick={handleFileUpload} disabled={loading || !file}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Upload & Parse →'}
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    STEP 2 — JD CONFIG VIEW
//    JD is LOCKED — no replace/delete buttons.
//    Config (count, type, mode) is always editable.
// ───────────────────────────────────────── */
// const JDConfigView = ({ parsed, onGenerate, generating, sessionHistory, onViewSession }) => {
//   const [qType,     setQType]     = useState('mixed');
//   const [qCount,    setQCount]    = useState('8');
//   const [mode,      setMode]      = useState('normal');
//   const [mediaMode, setMediaMode] = useState('video');
//   const [histOpen,  setHistOpen]  = useState(true);
//   const [loadingSession, setLoadingSession] = useState(null);

//   const handleGenerate = () => {
//     onGenerate({
//       count: Math.max(3, Math.min(20, Number(qCount) || 8)),
//       type: qType,
//       sessionMode: mode,
//       mediaMode,
//     });
//   };

//   const jdSessions = (sessionHistory || [])
//     .filter(s => (s.type || '').startsWith('jd_'))
//     .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
//     .slice(0, 10);

//   const handleOpenSession = async (s) => {
//     setLoadingSession(s.sessionId);
//     try {
//       await onViewSession(s);
//     } finally {
//       setLoadingSession(null);
//     }
//   };

//   return (
//     <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

//       {/* ── Left: JD summary (locked) + config ──────────────────────── */}
//       <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

//         {/* JD locked card */}
//         <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//           <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
//             <div style={{ flex: 1 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
//                 <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//                   {parsed.title || 'Job Description'}
//                 </div>
//                 {/* Locked badge */}
//                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 7px' }}>
//                   <Lock size={9} /> LOCKED
//                 </span>
//               </div>
//               {parsed.company && (
//                 <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{parsed.company}</div>
//               )}
//               <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
//                 {parsed.domain     && <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>}
//                 {parsed.experience && <span className="badge badge-muted"   style={{ fontSize: 11 }}>{parsed.experience}</span>}
//               </div>
//             </div>
//           </div>
//           {/* Subtle info note */}
//           <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
//             <Lock size={10} />
//             JD is locked to this session. Create a new chat to practice with a different JD.
//           </div>
//         </div>

//         {/* Skills */}
//         {parsed.skills?.length > 0 && (
//           <Collapsible title={`🛠 Skills (${parsed.skills.length})`} defaultOpen>
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
//               {parsed.skills.slice(0, 20).map((s, i) => (
//                 <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>
//               ))}
//             </div>
//           </Collapsible>
//         )}

//         {/* Config — always editable */}
//         <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px' }}>
//           <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
//             Configure Interview
//           </div>

//           {/* Question type */}
//           <div style={{ marginBottom: 14 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Question Focus</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {QUESTION_TYPES.map(qt => (
//                 <button key={qt.key} onClick={() => setQType(qt.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', textAlign: 'left', background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: qType === qt.key ? 'var(--primary)' : 'var(--border)' }} />
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* Count */}
//           <div style={{ marginBottom: 14 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Number of Questions</div>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//               <input className="input" type="number" min={3} max={20} value={qCount}
//                 onChange={e => setQCount(e.target.value)}
//                 style={{ maxWidth: 80, fontSize: 13 }} />
//               <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>3 – 20 questions</span>
//             </div>
//           </div>

//           {/* Practice mode */}
//           <div style={{ marginBottom: mode === 'video' ? 10 : 16 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Practice Mode</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {PRACTICE_MODES.map(pm => (
//                 <button key={pm.key} onClick={() => setMode(pm.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', textAlign: 'left', background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {mode === 'video' && (
//             <div style={{ marginBottom: 16 }}>
//               <div className="form-label" style={{ marginBottom: 6 }}>Recording Type</div>
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//                 {[{ k: 'video', icon: <Video size={13} />, l: 'Video + Audio' }, { k: 'audio', icon: <Mic size={13} />, l: 'Audio Only' }].map(opt => (
//                   <button key={opt.k} onClick={() => setMediaMode(opt.k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: mediaMode === opt.k ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mediaMode === opt.k ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mediaMode === opt.k ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
//                     {opt.icon} {opt.l}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           )}

//           <button className="btn btn-primary btn-full" onClick={handleGenerate} disabled={generating}>
//             {generating
//               ? <><Loader size={14} className="vi-spin" /> Generating…</>
//               : <><Send size={14} /> Start Interview</>
//             }
//           </button>
//         </div>
//       </div>

//       {/* ── Right: History sidebar — NOW CLICKABLE ───────────────────── */}
//       <div className="history-card">
//         <button
//           onClick={() => setHistOpen(o => !o)}
//           style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: histOpen ? 14 : 0, color: 'var(--text-primary)' }}
//         >
//           <History size={15} style={{ color: 'var(--text-muted)' }} />
//           <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>Past Sessions</span>
//           {histOpen
//             ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
//             : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
//           }
//         </button>

//         {histOpen && (
//           jdSessions.length === 0 ? (
//             <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
//               No sessions yet
//             </div>
//           ) : (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//               {jdSessions.map(s => {
//                 const isLoading = loadingSession === s.sessionId;
//                 return (
//                   <button
//                     key={s.sessionId}
//                     onClick={() => handleOpenSession(s)}
//                     disabled={isLoading}
//                     style={{
//                       width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'var(--transition)',
//                     }}
//                     onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--warning)'; e.currentTarget.style.background = 'rgba(245,158,11,0.04)'; }}
//                     onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
//                   >
//                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
//                       <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
//                         {sessionTypeLabel(s.type)} Interview
//                       </span>
//                       {isLoading
//                         ? <Loader size={12} className="vi-spin" style={{ color: 'var(--text-muted)' }} />
//                         : <Eye size={12} style={{ color: 'var(--text-muted)' }} />
//                       }
//                     </div>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
//                       {s.score != null && (
//                         <span className={`badge ${s.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
//                           {Number(s.score).toFixed(1)}/10
//                         </span>
//                       )}
//                       <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
//                         {s.questions?.length || 0} Qs
//                       </span>
//                     </div>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
//                       <Clock size={10} />
//                       {new Date(s.createdAt).toLocaleDateString()}
//                     </div>
//                   </button>
//                 );
//               })}
//             </div>
//           )
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    NORMAL TEXT INTERVIEW (jd_normal)
// ───────────────────────────────────────── */
// const JDNormalInterview = ({ questions, sessionId, onSubmit }) => {
//   const [answers,    setAnswers]    = useState({});
//   const [submitting, setSubmitting] = useState(false);
//   const [error,      setError]      = useState('');

//   const answeredCount = Object.values(answers).filter(v => String(v || '').trim()).length;

//   const handleSubmit = async () => {
//     setSubmitting(true); setError('');
//     try { await onSubmit(answers); }
//     catch (err) { setError(err.message); }
//     finally { setSubmitting(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
//       {questions.map((q, idx) => (
//         <div key={q.id} className="question-card">
//           <div className="question-header">
//             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div className="question-text">{q.question}</div>
//                 <div className="question-meta" style={{ marginTop: 6 }}>
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//                 {q.tip && (
//                   <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
//                     💡 {q.tip}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//           <div className="question-body">
//             <textarea className="input" value={answers[q.id] || ''} rows={4}
//               onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
//               placeholder="Type your answer… be specific and use examples where possible"
//               style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           </div>
//         </div>
//       ))}
//       <div className="submit-bar">
//         <div className="progress-text">
//           <span className="progress-count">{answeredCount}</span> / {questions.length} answered
//         </div>
//         <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || answeredCount === 0}>
//           {submitting ? 'Submitting…' : 'Submit & Get Feedback'}
//           <Send size={16} />
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VOICE INTERVIEW (jd_voice)
// ───────────────────────────────────────── */
// const JDVoiceInterview = ({ questions, sessionId, onSubmit }) => {
//   const [idx,          setIdx]          = useState(0);
//   const [phase,        setPhase]        = useState('reading');
//   const [transcript,   setTranscript]   = useState('');
//   const [savedAnswers, setSavedAnswers] = useState({});
//   const [muteTTS,      setMuteTTS]      = useState(false);
//   const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);
//   const [submitting,   setSubmitting]   = useState(false);

//   const recRef    = useRef(null);
//   const silRef    = useRef(null);
//   const cdRef     = useRef(null);
//   const baseRef   = useRef('');
//   const bufferRef = useRef(null);
//   const advRef    = useRef(false);

//   const q = questions[idx];

//   const stopTimers = useCallback(() => {
//     if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
//     if (cdRef.current)  { clearInterval(cdRef.current); cdRef.current = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recRef.current?.stop(); } catch {}
//     recRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//   }, []);

//   const saveAndAdvance = useCallback((text) => {
//     if (advRef.current) return;
//     advRef.current = true;
//     stopSTT();
//     const answer = text.trim();
//     const qid = questions[idx]?.id;
//     if (qid) setSavedAnswers(prev => ({ ...prev, [qid]: answer }));
//     baseRef.current = '';
//     setTranscript('');
//     if (idx + 1 >= questions.length) {
//       setPhase('done');
//     } else {
//       setIdx(i => i + 1);
//       setPhase('reading');
//       advRef.current = false;
//     }
//   }, [idx, questions, stopSTT]);

//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     let r = SILENCE_MS / 1000;
//     setCountdown(r);
//     cdRef.current = setInterval(() => { r -= 1; setCountdown(Math.max(0, r)); if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; } }, 1000);
//     silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
//   }, [stopTimers, saveAndAdvance]);

//   const startSTT = useCallback(() => {
//     if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
//       alert('Speech recognition not supported. Try Chrome or Edge.'); return;
//     }
//     stopSTT(); advRef.current = false; baseRef.current = '';
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
//     rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
//     rec.onresult = (ev) => {
//       stopTimers(); startSilenceTimer();
//       let interim = '', final = '';
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const t = ev.results[i]?.[0]?.transcript || '';
//         if (ev.results[i].isFinal) final += t; else interim += t;
//       }
//       const base = baseRef.current;
//       const spoken = `${final} ${interim}`.trim();
//       setTranscript(base + (base.trim() && spoken ? ' ' : '') + spoken);
//       if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
//     };
//     rec.onerror = () => stopTimers();
//     rec.onend = () => {};
//     recRef.current = rec;
//     try { rec.start(); } catch (e) { console.error(e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   const startBuffer = useCallback(() => {
//     setPhase('buffering');
//     bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
//   }, [startSTT]);

//   const readQuestion = useCallback((question) => {
//     stopTTS();
//     if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
//     const u = new SpeechSynthesisUtterance(question.question);
//     u.rate = 0.95;
//     u.onend = () => startBuffer();
//     u.onerror = () => startBuffer();
//     window.speechSynthesis.speak(u);
//   }, [muteTTS, stopTTS, startBuffer]);

//   useEffect(() => {
//     if (phase !== 'reading' || !q) return;
//     readQuestion(q);
//   }, [idx, phase, readQuestion, q]);

//   useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

//   const handleFinalSubmit = async () => {
//     setSubmitting(true);
//     try {
//       const allAnswers = {};
//       questions.forEach(sq => { allAnswers[sq.id] = savedAnswers[sq.id] || ''; });
//       await onSubmit(allAnswers);
//     } catch { setSubmitting(false); }
//   };

//   if (phase === 'done') {
//     const answeredCount = Object.values(savedAnswers).filter(Boolean).length;
//     return (
//       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16 }}>
//         <div style={{ fontSize: 40 }}>🎙</div>
//         <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>All questions answered!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{answeredCount} of {questions.length} answered</div>
//         <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleFinalSubmit} disabled={submitting}>
//           {submitting ? <><Loader size={14} className="vi-spin" /> Getting feedback…</> : 'Get AI Feedback →'}
//         </button>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
//         <button className="btn btn-ghost btn-sm" onClick={() => { stopTTS(); setMuteTTS(m => !m); if (phase === 'reading') startBuffer(); }} title={muteTTS ? 'Enable TTS' : 'Mute TTS'}>
//           {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
//         </button>
//       </div>
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
//           <CategoryBadge cat={q.category} />
//           {phase === 'reading'   && <span style={{ fontSize: 11, color: 'var(--primary)',  fontWeight: 600 }}>🔊 Reading…</span>}
//           {phase === 'buffering' && <span style={{ fontSize: 11, color: 'var(--warning)',  fontWeight: 600 }}>⏱ Starting mic…</span>}
//           {phase === 'listening' && <span style={{ fontSize: 11, color: 'var(--danger)',   fontWeight: 600 }}>🎙 Listening…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.question}</div>
//         {q.tip && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>💡 {q.tip}</div>}
//       </div>
//       <div style={{ minHeight: 90, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
//         {transcript
//           ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
//           : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>{phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}</p>
//         }
//       </div>
//       <div style={{ display: 'flex', gap: 8 }}>
//         {phase === 'reading' && (
//           <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
//             <Volume2 size={14} /> Skip Reading
//           </button>
//         )}
//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary btn-full" onClick={() => { if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; } startSTT(); }}>
//               <Mic size={14} /> Start Now
//             </button>
//           </>
//         )}
//         {phase === 'listening' && (
//           <>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
//               {countdown}s
//             </div>
//             <div style={{ flex: 1 }} />
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
//               <CheckCircle size={14} />
//               {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VIDEO INTERVIEW (jd_video)
// ───────────────────────────────────────── */
// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.92; u.onend = onEnd; u.onerror = onEnd;
//     window.speechSynthesis.speak(u);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch { onEnd(); return () => {}; }
// };

// const JDVideoRecorder = ({ question, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   useEffect(() => {
//     const cancel = safeTTS(question.question, () => setReading(false));
//     return () => cancel();
//   }, [question.question]);

//   useEffect(() => () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const startRecording = async () => {
//     setError('');
//     try {
//       const s = await navigator.mediaDevices.getUserMedia(
//         mediaMode === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
//       );
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
//     } catch { setError('Permission denied. Allow camera/mic and retry.'); return; }

//     chunksRef.current = [];
//     const mime = mediaMode === 'video' ? 'video/webm' : 'audio/webm';
//     const rec = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm' });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       setBlob(new Blob(chunksRef.current, { type: mime }));
//       streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
//       setPhase('preview');
//     };
//     recRef.current = rec; rec.start(100);
//     setPhase('recording'); setElapsed(0);
//     timerRef.current = setInterval(() => {
//       setElapsed(p => { if (p + 1 >= MAX_REC_SECS) { stopRecording(); return MAX_REC_SECS; } return p + 1; });
//     }, 1000);
//   };

//   const stopRecording = () => {
//     if (recRef.current?.state !== 'inactive') recRef.current?.stop();
//     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
//   };

//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting'); setError('');
//     try {
//       const form = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question.question);
//       form.append('media_type', mediaMode);
//       form.append('topic', question.category || '');
//       form.append('bloom_level', 'Apply');
//       const res = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) { setError(err.message); setPhase('preview'); }
//   };

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
//           <CategoryBadge cat={question.category} />
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{question.question}</div>
//       </div>
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} /> {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 44, height: 44, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}</div>
//         </div>
//       )}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <audio ref={previewRef} controls style={{ width: '100%' }} />
//       )}
//       {phase === 'submitting' && (
//         <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
//           <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing response… (10–20s)</div>
//         </div>
//       )}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip"><SkipForward size={15} /></button>
//         </div>
//       )}
//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}
//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={() => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); }}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// const JDVideoInterview = ({ questions, chatId, sessionId, mediaMode, onFinished }) => {
//   const [idx,        setIdx]        = useState(0);
//   const [phase,      setPhase]      = useState('recording');
//   const [currentFb,  setCurrentFb]  = useState(null);
//   const [allResults, setAllResults] = useState([]);
//   const [saving,     setSaving]     = useState(false);

//   const current = questions[idx];
//   const total   = questions.length;

//   const handleFeedback = (fb) => {
//     const result = { question: current, feedback: fb };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(fb);
//     setPhase('feedback');
//   };

//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     const next = [...allResults, result];
//     setAllResults(next);
//     advanceOrFinish(next);
//   };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (idx + 1 >= total) { finishSession(results); }
//     else { setIdx(i => i + 1); setPhase('recording'); }
//   };

//   const finishSession = async (results) => {
//     setSaving(true);
//     const feedbackMap = {};
//     let totalScore = 0, scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) {
//         feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: '[Skipped]', correctAnswer: null, isCorrect: null, understandingScore: 0, overallScore: null, skipped: true, videoFeedback: null, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: 0, maxMarks: 10 };
//         return;
//       }
//       const score = fb.overallScore ?? 0;
//       totalScore += score; scoredCount += 1;
//       feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: fb.transcript || '', correctAnswer: null, isCorrect: null, understandingScore: Math.round(score), overallScore: score, videoFeedback: fb, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: Math.round(score * 10) / 10, maxMarks: 10 };
//     });

//     const avgScore   = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
//     const answersMap = Object.fromEntries(results.filter(r => r.question?.id && !r.skipped).map(r => [r.question.id, r.feedback?.transcript || '']));

//     try {
//       await jdAPI.saveVideoSession(chatId, { session_id: sessionId, questions, answers: answersMap, feedback: feedbackMap, score: avgScore, session_type: 'jd_video' });
//     } catch (err) { console.warn('[JDVideoInterview] save failed:', err); }

//     setSaving(false);
//     onFinished({ score: avgScore, results: feedbackMap, allResults: results });
//   };

//   if (saving) {
//     return (
//       <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
//         <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
//         <div style={{ fontSize: 14, fontWeight: 700 }}>Saving session…</div>
//       </div>
//     );
//   }

//   const progressPct = (idx / total) * 100;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
//           {phase === 'feedback' ? `Feedback ${idx + 1}/${total}` : `Q ${idx + 1}/${total}`}
//         </span>
//       </div>

//       {phase === 'recording' && current && (
//         <JDVideoRecorder key={`jd-vid-${idx}`} question={current} chatId={chatId} mediaMode={mediaMode} onFeedback={handleFeedback} onSkip={handleSkip} />
//       )}

//       {phase === 'feedback' && currentFb && (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
//             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Score</div>
//             <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
//               {currentFb.overallScore != null ? Number(currentFb.overallScore).toFixed(1) : '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//             </div>
//           </div>
//           {currentFb.transcript && (
//             <Collapsible title="📝 Transcript">
//               <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{currentFb.transcript}</p>
//             </Collapsible>
//           )}
//           {(currentFb.strengths?.length > 0 || currentFb.improvements?.length > 0) && (
//             <Collapsible title="💡 Coaching" defaultOpen>
//               {currentFb.strengths?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//               {currentFb.improvements?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//             </Collapsible>
//           )}
//           <div style={{ display: 'flex', gap: 10 }}>
//             <button className="btn btn-ghost flex-1" onClick={() => { setAllResults(prev => prev.slice(0, -1)); setCurrentFb(null); setPhase('recording'); }}>
//               <RotateCcw size={14} /> Re-record
//             </button>
//             <button className="btn btn-primary flex-1" onClick={() => advanceOrFinish(allResults)}>
//               {idx + 1 >= total ? '🎯 View Results' : <>Next <ChevronRight size={14} /></>}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    JD SESSION REVIEW
// ───────────────────────────────────────── */
// const JDSessionReview = ({ reviewData, onDone }) => {
//   const { questions, results, score, sessionType } = reviewData;
//   const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       <div className="score-hero" style={{ marginBottom: 16 }}>
//         <div>
//           <div className="score-label">Interview Score</div>
//           <div className="score-value" style={{ color: scoreColor }}>
//             {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
//           </div>
//         </div>
//         <div style={{ textAlign: 'right' }}>
//           <div className="score-label">Questions</div>
//           <div className="marks-value">{questions.length}</div>
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
//         <span className="badge badge-warning" style={{ fontSize: 12 }}>💼 JD Interview</span>
//         <span className="badge badge-muted" style={{ fontSize: 12 }}>
//           {sessionType === 'jd_video' ? 'Video Mode' : sessionType === 'jd_voice' ? 'Voice Mode' : 'Text Mode'}
//         </span>
//       </div>

//       {questions.map((q, idx) => {
//         const r = results[q.id] || {};
//         const qScore = r.overallScore ?? r.understandingScore;
//         const qColor = qScore >= 7 ? 'var(--success)' : qScore >= 5 ? 'var(--warning)' : 'var(--danger)';

//         return (
//           <div key={q.id} className="question-review-block">
//             <div className="q-review-header">
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
//                   <div className="question-text">{q.question}</div>
//                   <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
//                     {qScore != null && (
//                       <span style={{ fontSize: 13, fontWeight: 700, color: qColor, fontFamily: 'var(--mono)' }}>
//                         {Number(qScore).toFixed(1)}/10
//                       </span>
//                     )}
//                     {r.skipped && <span className="badge badge-muted" style={{ fontSize: 10 }}>skipped</span>}
//                   </div>
//                 </div>
//                 <div className="question-meta">
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//               </div>
//             </div>

//             <div className="q-review-body">
//               {!r.skipped && r.userAnswer && (
//                 <div className="result-box">
//                   <div className="result-box-label">Your Answer</div>
//                   <div className="result-box-content" style={{ whiteSpace: 'pre-wrap' }}>{r.userAnswer}</div>
//                 </div>
//               )}
//               {r.videoFeedback && (
//                 <>
//                   {r.videoFeedback.content && (
//                     <Collapsible title="📚 Content">
//                       <ScoreBar label="Relevance"    score={r.videoFeedback.content.answerRelevance} />
//                       <ScoreBar label="Completeness" score={r.videoFeedback.content.completeness} />
//                       <ScoreBar label="Structure"    score={r.videoFeedback.content.structure} />
//                     </Collapsible>
//                   )}
//                   {r.videoFeedback.delivery && (
//                     <Collapsible title="🎤 Delivery">
//                       <ScoreBar label="Clarity"    score={r.videoFeedback.delivery.clarity} />
//                       <ScoreBar label="Confidence" score={r.videoFeedback.delivery.confidencePresentation} />
//                     </Collapsible>
//                   )}
//                 </>
//               )}
//               {!r.videoFeedback && !r.skipped && r.contentScore != null && (
//                 <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
//                   <ScoreBar label="Content Quality" score={r.contentScore} />
//                   <ScoreBar label="Structure"       score={r.structureScore} />
//                 </div>
//               )}
//               {!r.skipped && (r.strengths?.length > 0 || r.improvements?.length > 0) && (
//                 <div className="explanation-box">
//                   <div className="explanation-title"><HelpCircle size={16} /> Coaching Feedback</div>
//                   {r.strengths?.length > 0 && (
//                     <div style={{ marginBottom: 10 }}>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ What worked well</div>
//                       {r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                   {r.improvements?.length > 0 && (
//                     <div>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>↑ Areas to improve</div>
//                       {r.improvements.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                 </div>
//               )}
//               {!r.skipped && r.sampleAnswer && (
//                 <Collapsible title="🌟 Ideal Answer">
//                   <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</p>
//                 </Collapsible>
//               )}
//               {r.explanation && !r.skipped && (
//                 <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{r.explanation}</div>
//               )}
//             </div>
//           </div>
//         );
//       })}

//       {/* Back to config — never back to upload */}
//       <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
//         <button className="btn btn-primary" onClick={onDone}>
//           <ArrowLeft size={14} /> Back to Config
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN PANEL COMPONENT
// ───────────────────────────────────────── */
// const JDInterviewPanel = ({ chat, chatId, sessionHistory, onSessionFinished }) => {
//   const [step,          setStep]          = useState('loading');
//   const [jdParsed,      setJDParsed]      = useState(null);
//   const [activeSession, setActiveSession] = useState(null);
//   const [reviewData,    setReviewData]    = useState(null);
//   const [generating,    setGenerating]    = useState(false);
//   const [error,         setError]         = useState('');

//   useEffect(() => {
//     jdAPI.getJD(chatId)
//       .then(res => {
//         const jd = res.data?.jd;
//         if (jd?.parsed) { setJDParsed(jd.parsed); setStep('config'); }
//         else setStep('upload');
//       })
//       .catch(() => setStep('upload'));
//   }, [chatId]);

//   const handleUploaded = (data) => {
//     setJDParsed(data.parsed);
//     setStep('config');
//     setError('');
//   };

//   const handleGenerate = async ({ count, type, sessionMode, mediaMode }) => {
//     setGenerating(true); setError('');
//     try {
//       const res = await jdAPI.generateSession(chatId, count, type, sessionMode);
//       const data = res.data;
//       setActiveSession({
//         sessionId:   data.sessionId,
//         questions:   data.questions,
//         sessionMode: data.sessionMode,
//         mediaMode,
//         jdTitle:     data.jdTitle,
//         jdCompany:   data.jdCompany,
//       });
//       setStep('interview');
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setGenerating(false); }
//   };

//   const handleSubmitAnswers = async (answers) => {
//     const res = await jdAPI.submitSession(activeSession.sessionId, answers);
//     const data = res.data;
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     data.results,
//       score:       data.score,
//       sessionType: activeSession.sessionMode === 'voice' ? 'jd_voice' : 'jd_normal',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     onSessionFinished?.();
//   };

//   const handleVideoFinished = (result) => {
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     result.results,
//       score:       result.score,
//       sessionType: 'jd_video',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     onSessionFinished?.();
//   };

//   /**
//    * Open a past session from the history panel.
//    * History items from getChatHistory should already contain questions + feedback.
//    * If they don't (some backends return a summary), we fall back gracefully.
//    */
//   const handleViewSession = async (s) => {
//     // Build reviewData from what the history entry already has
//     // History shape from getChatHistory: { sessionId, type, score, createdAt, questions, answers, feedback }
//     let questions = s.questions || [];
//     let results   = s.feedback  || s.results || {};

//     // If questions are missing or minimal, try fetching the full session
//     // The existing chatAPI.getChatHistory endpoint may already return everything
//     // If your backend only returns a summary, you could add a new endpoint.
//     // Here we use what we have and show a graceful fallback if data is sparse.

//     if (questions.length === 0) {
//       // Try to enrich from the session list (sessionHistory may have full data)
//       // No dedicated "get session by id" endpoint in your current API,
//       // so we surface whatever we have.
//       console.warn('[JDInterviewPanel] History item has no questions — showing partial review');
//     }

//     const reviewObj = {
//       sessionId:   s.sessionId,
//       questions,
//       results,
//       score:       s.score,
//       sessionType: s.type,
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//   };

//   const renderContent = () => {
//     if (step === 'loading') {
//       return (
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
//           <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
//           <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
//         </div>
//       );
//     }

//     if (step === 'review' && reviewData) {
//       const hasData = reviewData.questions?.length > 0;
//       return hasData ? (
//         <JDSessionReview
//           reviewData={reviewData}
//           onDone={() => {
//             setStep('config');   // always back to config, never upload
//             setReviewData(null);
//             setActiveSession(null);
//           }}
//         />
//       ) : (
//         // Fallback if history entry has no question detail
//         <div style={{ textAlign: 'center', padding: '40px 24px' }}>
//           <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
//           <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
//             Session details not available
//           </div>
//           <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
//             Score: {reviewData.score != null ? `${Number(reviewData.score).toFixed(1)}/10` : '—'}
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
//             Detailed question data is not stored for this session.
//           </div>
//           <button className="btn btn-primary" onClick={() => { setStep('config'); setReviewData(null); }}>
//             <ArrowLeft size={14} /> Back to Config
//           </button>
//         </div>
//       );
//     }

//     if (step === 'interview' && activeSession) {
//       const { questions, sessionId, sessionMode, mediaMode } = activeSession;
//       return (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//           <button
//             className="btn btn-ghost btn-sm"
//             style={{ alignSelf: 'flex-start' }}
//             onClick={() => { setStep('config'); setActiveSession(null); }}
//           >
//             <ArrowLeft size={14} /> Back to Config
//           </button>
//           <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
//             {sessionMode === 'video'  && <span className="badge badge-purple"><Video size={11} /> Video Practice</span>}
//             {sessionMode === 'voice'  && <span className="badge badge-blue"><Mic size={11} /> Voice Practice</span>}
//             {sessionMode === 'normal' && <span className="badge badge-muted"><BookOpen size={11} /> Text Practice</span>}
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{questions.length} questions</span>
//           </div>
//           {sessionMode === 'normal' && <JDNormalInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'voice'  && <JDVoiceInterview  questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'video'  && <JDVideoInterview  questions={questions} chatId={chatId} sessionId={sessionId} mediaMode={mediaMode || 'video'} onFinished={handleVideoFinished} />}
//         </div>
//       );
//     }

//     if (step === 'config' && jdParsed) {
//       return (
//         <JDConfigView
//           parsed={jdParsed}
//           onGenerate={handleGenerate}
//           generating={generating}
//           sessionHistory={sessionHistory}
//           onViewSession={handleViewSession}
//         />
//       );
//     }

//     // Upload — only reached when no JD exists yet
//     return <JDUploadView chatId={chatId} onUploaded={handleUploaded} />;
//   };

//   return (
//     <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
//       {/* Page header */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
//         <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
//           <Briefcase size={20} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div>
//           <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
//             Job Interview Prep
//             {jdParsed?.title && jdParsed.title !== 'Unknown' && (
//               <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 15 }}> · {jdParsed.title}</span>
//             )}
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             AI-generated questions · LLM feedback · Saved to history
//           </div>
//         </div>
//       </div>

//       {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

//       {renderContent()}
//     </div>
//   );
// };

// export default JDInterviewPanel;




























// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import {
//   Upload, Loader, Briefcase, Mic, Video, BookOpen,
//   RotateCcw, Play, Square, SkipForward, CheckCircle,
//   AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
//   ArrowLeft, Send, Trash2, ChevronRight, HelpCircle,
//   Clock, History,
// } from 'lucide-react';
// import { jdAPI } from '../services/api';

// /* ─────────────────────────────────────────
//    CONSTANTS / CONFIG
// ───────────────────────────────────────── */
// const QUESTION_TYPES = [
//   { key: 'mixed',         label: 'Mixed (Recommended)', desc: '30% behavioral · 35% technical · 20% situational · 15% role-specific' },
//   { key: 'behavioral',    label: 'Behavioral',           desc: 'Tell me about a time… (STAR method)' },
//   { key: 'technical',     label: 'Technical',            desc: 'Skills, tools, domain knowledge' },
//   { key: 'situational',   label: 'Situational',          desc: 'What would you do if…' },
//   { key: 'role_specific', label: 'Role-Specific',        desc: "Specific to this job's duties" },
// ];

// const PRACTICE_MODES = [
//   { key: 'normal', icon: <BookOpen size={15} />, label: 'Text Practice',  desc: 'Type your answers — no time pressure' },
//   { key: 'voice',  icon: <Mic size={15} />,      label: 'Voice Practice', desc: 'Speak answers, auto-transcribed, LLM evaluation' },
//   { key: 'video',  icon: <Video size={15} />,    label: 'Video Practice', desc: 'Record video/audio, get delivery coaching' },
// ];

// const SILENCE_MS   = 10_000;
// const MAX_REC_SECS = 180;

// /* ─────────────────────────────────────────
//    SMALL HELPERS
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
//       <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)' }}>
//         {title}
//         {open ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
//     </div>
//   );
// };

// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>{score != null ? `${score}/${max}` : '—'}</span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
//       </div>
//     </div>
//   );
// };

// const CategoryBadge = ({ cat }) => {
//   const colors = { behavioral: 'badge-blue', technical: 'badge-purple', situational: 'badge-warning', role_specific: 'badge-muted' };
//   return <span className={`badge ${colors[cat] || 'badge-muted'}`} style={{ fontSize: 10 }}>{cat?.replace('_', ' ')}</span>;
// };

// const sessionTypeLabel = (type) => {
//   const map = { jd_normal: 'Text', jd_voice: 'Voice', jd_video: 'Video' };
//   return map[type] || type;
// };

// /* ─────────────────────────────────────────
//    STEP 1 — JD UPLOAD VIEW
// ───────────────────────────────────────── */
// const JDUploadView = ({ chatId, onUploaded }) => {
//   const [tab,     setTab]     = useState('text');
//   const [text,    setText]    = useState('');
//   const [file,    setFile]    = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error,   setError]   = useState('');

//   const handleTextUpload = async () => {
//     if (!text.trim()) { setError('Paste a job description first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadText(chatId, text.trim()); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   const handleFileUpload = async () => {
//     if (!file) { setError('Select a file first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadFile(chatId, file); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
//         <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
//           <Briefcase size={24} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Add Job Description</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//           Paste or upload a JD — AI parses it, then you practice with role-specific interview questions
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 6 }}>
//         {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File (PDF/TXT)' }].map(t => (
//           <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`, background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)', color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' }}>
//             {t.l}
//           </button>
//         ))}
//       </div>

//       {error && <div className="error-box">{error}</div>}

//       {tab === 'text' ? (
//         <>
//           <textarea className="input" value={text} onChange={e => setText(e.target.value)}
//             placeholder={"Paste the full job description here…\n\nInclude: role title, company, responsibilities, requirements, skills…"}
//             style={{ minHeight: 180, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           <button className="btn btn-primary btn-full" onClick={handleTextUpload} disabled={loading || !text.trim()}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Parse & Continue →'}
//           </button>
//         </>
//       ) : (
//         <>
//           <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)' }}
//             onClick={() => document.getElementById('jd-file-input').click()}>
//             <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
//             <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
//               {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
//             </div>
//           </div>
//           <input id="jd-file-input" type="file" accept=".pdf,.txt" style={{ display: 'none' }}
//             onChange={e => { setFile(e.target.files[0] || null); setError(''); }} />
//           <button className="btn btn-primary btn-full" onClick={handleFileUpload} disabled={loading || !file}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Upload & Parse →'}
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    STEP 2 — JD CONFIG VIEW
// ───────────────────────────────────────── */
// const JDConfigView = ({ parsed, onGenerate, onReplace, onDeleteJD, generating, sessionHistory }) => {
//   const [qType,     setQType]     = useState('mixed');
//   const [qCount,    setQCount]    = useState('8');
//   const [mode,      setMode]      = useState('normal');
//   const [mediaMode, setMediaMode] = useState('video');
//   const [histOpen,  setHistOpen]  = useState(true);

//   const handleGenerate = () => {
//     onGenerate({
//       count: Math.max(3, Math.min(20, Number(qCount) || 8)),
//       type: qType,
//       sessionMode: mode,
//       mediaMode,
//     });
//   };

//   const jdSessions = (sessionHistory || []).filter(s => (s.type || '').startsWith('jd_'));

//   return (
//     <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

//       {/* ── Left: JD summary + config ─────────────────────────────────── */}
//       <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

//         {/* JD summary card */}
//         <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//           <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
//             <div>
//               <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{parsed.title || 'Job Description'}</div>
//               {parsed.company && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{parsed.company}</div>}
//               <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
//                 {parsed.domain && <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>}
//                 {parsed.experience && <span className="badge badge-muted" style={{ fontSize: 11 }}>{parsed.experience}</span>}
//               </div>
//             </div>
//             <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
//               <button className="btn btn-ghost btn-sm" onClick={onReplace} style={{ fontSize: 11 }}>
//                 <RotateCcw size={12} /> Replace
//               </button>
//               <button className="btn btn-ghost btn-sm" onClick={onDeleteJD} style={{ fontSize: 11, color: 'var(--danger)' }}>
//                 <Trash2 size={12} />
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* Skills */}
//         {parsed.skills?.length > 0 && (
//           <Collapsible title={`🛠 Skills (${parsed.skills.length})`} defaultOpen>
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
//               {parsed.skills.slice(0, 20).map((s, i) => <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>)}
//             </div>
//           </Collapsible>
//         )}

//         {/* Config */}
//         <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px' }}>
//           <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Configure Interview</div>

//           {/* Question type */}
//           <div style={{ marginBottom: 14 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Question Focus</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {QUESTION_TYPES.map(qt => (
//                 <button key={qt.key} onClick={() => setQType(qt.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', textAlign: 'left', background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: qType === qt.key ? 'var(--primary)' : 'var(--border)' }} />
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* Count */}
//           <div style={{ marginBottom: 14 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Number of Questions</div>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//               <input className="input" type="number" min={3} max={20} value={qCount}
//                 onChange={e => setQCount(e.target.value)} style={{ maxWidth: 80, fontSize: 13 }} />
//               <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>3 – 20 questions</span>
//             </div>
//           </div>

//           {/* Practice mode */}
//           <div style={{ marginBottom: mode === 'video' ? 10 : 16 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Practice Mode</div>
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//               {PRACTICE_MODES.map(pm => (
//                 <button key={pm.key} onClick={() => setMode(pm.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', textAlign: 'left', background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                   <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
//                   <div>
//                     <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
//                     <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {mode === 'video' && (
//             <div style={{ marginBottom: 16 }}>
//               <div className="form-label" style={{ marginBottom: 6 }}>Recording Type</div>
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//                 {[{ k: 'video', icon: <Video size={13} />, l: 'Video + Audio' }, { k: 'audio', icon: <Mic size={13} />, l: 'Audio Only' }].map(opt => (
//                   <button key={opt.k} onClick={() => setMediaMode(opt.k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: mediaMode === opt.k ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mediaMode === opt.k ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mediaMode === opt.k ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
//                     {opt.icon} {opt.l}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           )}

//           <button className="btn btn-primary btn-full" onClick={handleGenerate} disabled={generating}>
//             {generating ? <><Loader size={14} className="vi-spin" /> Generating…</> : <><Send size={14} /> Start Interview</>}
//           </button>
//         </div>
//       </div>

//       {/* ── Right: History sidebar ─────────────────────────────────────── */}
//       <div className="history-card">
//         <button onClick={() => setHistOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: histOpen ? 14 : 0, color: 'var(--text-primary)' }}>
//           <History size={15} style={{ color: 'var(--text-muted)' }} />
//           <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>Past Sessions</span>
//           {histOpen ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
//         </button>

//         {histOpen && (
//           jdSessions.length === 0 ? (
//             <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No sessions yet</div>
//           ) : (
//             jdSessions
//               .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
//               .slice(0, 8)
//               .map(s => (
//                 <div key={s.sessionId} className="history-item" style={{ cursor: 'default' }}>
//                   <div className="history-item-row">
//                     <span className="history-label">{sessionTypeLabel(s.type)} Interview</span>
//                   </div>
//                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
//                     {s.score != null && (
//                       <span className={`badge ${s.score >= 7 ? 'badge-success' : 'badge-warning'}`}>
//                         {Number(s.score).toFixed(1)}/10
//                       </span>
//                     )}
//                     <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
//                       {s.questions?.length || 0} Qs
//                     </span>
//                   </div>
//                   <div className="history-meta">
//                     <Clock size={11} />
//                     {new Date(s.createdAt).toLocaleDateString()}
//                   </div>
//                 </div>
//               ))
//           )
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    NORMAL TEXT INTERVIEW (jd_normal)
// ───────────────────────────────────────── */
// const JDNormalInterview = ({ questions, sessionId, onSubmit }) => {
//   const [answers,    setAnswers]    = useState({});
//   const [submitting, setSubmitting] = useState(false);
//   const [error,      setError]      = useState('');

//   const answeredCount = Object.values(answers).filter(v => String(v || '').trim()).length;

//   const handleSubmit = async () => {
//     setSubmitting(true); setError('');
//     try { await onSubmit(answers); }
//     catch (err) { setError(err.message); }
//     finally { setSubmitting(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
//       {questions.map((q, idx) => (
//         <div key={q.id} className="question-card">
//           <div className="question-header">
//             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div className="question-text">{q.question}</div>
//                 <div className="question-meta" style={{ marginTop: 6 }}>
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//                 {q.tip && (
//                   <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
//                     💡 {q.tip}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//           <div className="question-body">
//             <textarea className="input" value={answers[q.id] || ''} rows={4}
//               onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
//               placeholder="Type your answer… be specific and use examples where possible"
//               style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           </div>
//         </div>
//       ))}
//       <div className="submit-bar">
//         <div className="progress-text">
//           <span className="progress-count">{answeredCount}</span> / {questions.length} answered
//         </div>
//         <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || answeredCount === 0}>
//           {submitting ? 'Submitting…' : 'Submit & Get Feedback'}
//           <Send size={16} />
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VOICE INTERVIEW (jd_voice)
// ───────────────────────────────────────── */
// const JDVoiceInterview = ({ questions, sessionId, onSubmit }) => {
//   const [idx,          setIdx]          = useState(0);
//   const [phase,        setPhase]        = useState('reading');
//   const [transcript,   setTranscript]   = useState('');
//   const [savedAnswers, setSavedAnswers] = useState({});
//   const [muteTTS,      setMuteTTS]      = useState(false);
//   const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);
//   const [submitting,   setSubmitting]   = useState(false);

//   const recRef    = useRef(null);
//   const silRef    = useRef(null);
//   const cdRef     = useRef(null);
//   const baseRef   = useRef('');
//   const bufferRef = useRef(null);
//   const advRef    = useRef(false);

//   const q = questions[idx];

//   const stopTimers = useCallback(() => {
//     if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
//     if (cdRef.current)  { clearInterval(cdRef.current); cdRef.current = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recRef.current?.stop(); } catch {}
//     recRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//   }, []);

//   const saveAndAdvance = useCallback((text) => {
//     if (advRef.current) return;
//     advRef.current = true;
//     stopSTT();
//     const answer = text.trim();
//     const qid = questions[idx]?.id;
//     if (qid) setSavedAnswers(prev => ({ ...prev, [qid]: answer }));
//     baseRef.current = '';
//     setTranscript('');
//     if (idx + 1 >= questions.length) {
//       setPhase('done');
//     } else {
//       setIdx(i => i + 1);
//       setPhase('reading');
//       advRef.current = false;
//     }
//   }, [idx, questions, stopSTT]);

//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     let r = SILENCE_MS / 1000;
//     setCountdown(r);
//     cdRef.current = setInterval(() => { r -= 1; setCountdown(Math.max(0, r)); if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; } }, 1000);
//     silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
//   }, [stopTimers, saveAndAdvance]);

//   const startSTT = useCallback(() => {
//     if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
//       alert('Speech recognition not supported. Try Chrome or Edge.'); return;
//     }
//     stopSTT(); advRef.current = false; baseRef.current = '';
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
//     rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
//     rec.onresult = (ev) => {
//       stopTimers(); startSilenceTimer();
//       let interim = '', final = '';
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const t = ev.results[i]?.[0]?.transcript || '';
//         if (ev.results[i].isFinal) final += t; else interim += t;
//       }
//       const base = baseRef.current;
//       const spoken = `${final} ${interim}`.trim();
//       setTranscript(base + (base.trim() && spoken ? ' ' : '') + spoken);
//       if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
//     };
//     rec.onerror = () => stopTimers();
//     rec.onend = () => {};
//     recRef.current = rec;
//     try { rec.start(); } catch (e) { console.error(e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   const startBuffer = useCallback(() => {
//     setPhase('buffering');
//     bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
//   }, [startSTT]);

//   const readQuestion = useCallback((question) => {
//     stopTTS();
//     if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
//     const u = new SpeechSynthesisUtterance(question.question);
//     u.rate = 0.95;
//     u.onend = () => startBuffer();
//     u.onerror = () => startBuffer();
//     window.speechSynthesis.speak(u);
//   }, [muteTTS, stopTTS, startBuffer]);

//   useEffect(() => {
//     if (phase !== 'reading' || !q) return;
//     readQuestion(q);
//   }, [idx, phase, readQuestion, q]);

//   useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

//   const handleFinalSubmit = async () => {
//     setSubmitting(true);
//     try {
//       const allAnswers = {};
//       questions.forEach(sq => { allAnswers[sq.id] = savedAnswers[sq.id] || ''; });
//       await onSubmit(allAnswers);
//     } catch { setSubmitting(false); }
//   };

//   if (phase === 'done') {
//     const answeredCount = Object.values(savedAnswers).filter(Boolean).length;
//     return (
//       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16 }}>
//         <div style={{ fontSize: 40 }}>🎙</div>
//         <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>All questions answered!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{answeredCount} of {questions.length} answered</div>
//         <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleFinalSubmit} disabled={submitting}>
//           {submitting ? <><Loader size={14} className="vi-spin" /> Getting feedback…</> : 'Get AI Feedback →'}
//         </button>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
//         <button className="btn btn-ghost btn-sm" onClick={() => { stopTTS(); setMuteTTS(m => !m); if (phase === 'reading') startBuffer(); }} title={muteTTS ? 'Enable TTS' : 'Mute TTS'}>
//           {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
//         </button>
//       </div>
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
//           <CategoryBadge cat={q.category} />
//           {phase === 'reading'   && <span style={{ fontSize: 11, color: 'var(--primary)',  fontWeight: 600 }}>🔊 Reading…</span>}
//           {phase === 'buffering' && <span style={{ fontSize: 11, color: 'var(--warning)',  fontWeight: 600 }}>⏱ Starting mic…</span>}
//           {phase === 'listening' && <span style={{ fontSize: 11, color: 'var(--danger)',   fontWeight: 600 }}>🎙 Listening…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.question}</div>
//         {q.tip && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>💡 {q.tip}</div>}
//       </div>
//       <div style={{ minHeight: 90, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
//         {transcript
//           ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
//           : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>{phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}</p>
//         }
//       </div>
//       <div style={{ display: 'flex', gap: 8 }}>
//         {phase === 'reading' && (
//           <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
//             <Volume2 size={14} /> Skip Reading
//           </button>
//         )}
//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary btn-full" onClick={() => { if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; } startSTT(); }}>
//               <Mic size={14} /> Start Now
//             </button>
//           </>
//         )}
//         {phase === 'listening' && (
//           <>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
//               {countdown}s
//             </div>
//             <div style={{ flex: 1 }} />
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
//               <CheckCircle size={14} />
//               {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VIDEO INTERVIEW (jd_video)
// ───────────────────────────────────────── */
// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.92; u.onend = onEnd; u.onerror = onEnd;
//     window.speechSynthesis.speak(u);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch { onEnd(); return () => {}; }
// };

// const JDVideoRecorder = ({ question, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   useEffect(() => {
//     const cancel = safeTTS(question.question, () => setReading(false));
//     return () => cancel();
//   }, [question.question]);

//   useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); if (timerRef.current) clearInterval(timerRef.current); }, []);

//   const startRecording = async () => {
//     setError('');
//     try {
//       const s = await navigator.mediaDevices.getUserMedia(
//         mediaMode === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
//       );
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
//     } catch { setError('Permission denied. Allow camera/mic and retry.'); return; }

//     chunksRef.current = [];
//     const mime = mediaMode === 'video' ? 'video/webm' : 'audio/webm';
//     const rec = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm' });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       setBlob(new Blob(chunksRef.current, { type: mime }));
//       streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
//       setPhase('preview');
//     };
//     recRef.current = rec; rec.start(100);
//     setPhase('recording'); setElapsed(0);
//     timerRef.current = setInterval(() => {
//       setElapsed(p => { if (p + 1 >= MAX_REC_SECS) { stopRecording(); return MAX_REC_SECS; } return p + 1; });
//     }, 1000);
//   };

//   const stopRecording = () => {
//     if (recRef.current?.state !== 'inactive') recRef.current?.stop();
//     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
//   };

//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting'); setError('');
//     try {
//       const form = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question.question);
//       form.append('media_type', mediaMode);
//       form.append('topic', question.category || '');
//       form.append('bloom_level', 'Apply');
//       const res = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) { setError(err.message); setPhase('preview'); }
//   };

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
//           <CategoryBadge cat={question.category} />
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{question.question}</div>
//       </div>
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} /> {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 44, height: 44, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}</div>
//         </div>
//       )}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <audio ref={previewRef} controls style={{ width: '100%' }} />
//       )}
//       {phase === 'submitting' && (
//         <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
//           <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing response… (10–20s)</div>
//         </div>
//       )}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip"><SkipForward size={15} /></button>
//         </div>
//       )}
//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}
//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={() => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); }}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// const JDVideoInterview = ({ questions, chatId, sessionId, mediaMode, onFinished }) => {
//   const [idx,        setIdx]        = useState(0);
//   const [phase,      setPhase]      = useState('recording');
//   const [currentFb,  setCurrentFb]  = useState(null);
//   const [allResults, setAllResults] = useState([]);
//   const [saving,     setSaving]     = useState(false);

//   const current = questions[idx];
//   const total   = questions.length;

//   const handleFeedback = (fb) => {
//     const result = { question: current, feedback: fb };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(fb);
//     setPhase('feedback');
//   };

//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     const next = [...allResults, result];
//     setAllResults(next);
//     advanceOrFinish(next);
//   };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (idx + 1 >= total) { finishSession(results); }
//     else { setIdx(i => i + 1); setPhase('recording'); }
//   };

//   const finishSession = async (results) => {
//     setSaving(true);
//     const feedbackMap = {};
//     let totalScore = 0, scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) {
//         feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: '[Skipped]', correctAnswer: null, isCorrect: null, understandingScore: 0, overallScore: null, skipped: true, videoFeedback: null, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: 0, maxMarks: 10 };
//         return;
//       }
//       const score = fb.overallScore ?? 0;
//       totalScore += score; scoredCount += 1;
//       feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: fb.transcript || '', correctAnswer: null, isCorrect: null, understandingScore: Math.round(score), overallScore: score, videoFeedback: fb, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: Math.round(score * 10) / 10, maxMarks: 10 };
//     });

//     const avgScore   = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
//     const answersMap = Object.fromEntries(results.filter(r => r.question?.id && !r.skipped).map(r => [r.question.id, r.feedback?.transcript || '']));

//     try {
//       await jdAPI.saveVideoSession(chatId, { session_id: sessionId, questions, answers: answersMap, feedback: feedbackMap, score: avgScore, session_type: 'jd_video' });
//     } catch (err) { console.warn('[JDVideoInterview] save failed:', err); }

//     setSaving(false);
//     onFinished({ score: avgScore, results: feedbackMap, allResults: results });
//   };

//   if (saving) {
//     return (
//       <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
//         <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
//         <div style={{ fontSize: 14, fontWeight: 700 }}>Saving session…</div>
//       </div>
//     );
//   }

//   const progressPct = (idx / total) * 100;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
//           {phase === 'feedback' ? `Feedback ${idx + 1}/${total}` : `Q ${idx + 1}/${total}`}
//         </span>
//       </div>

//       {phase === 'recording' && current && (
//         <JDVideoRecorder key={`jd-vid-${idx}`} question={current} chatId={chatId} mediaMode={mediaMode} onFeedback={handleFeedback} onSkip={handleSkip} />
//       )}

//       {phase === 'feedback' && currentFb && (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
//             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Score</div>
//             <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
//               {currentFb.overallScore != null ? Number(currentFb.overallScore).toFixed(1) : '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//             </div>
//           </div>
//           {currentFb.transcript && (
//             <Collapsible title="📝 Transcript">
//               <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{currentFb.transcript}</p>
//             </Collapsible>
//           )}
//           {(currentFb.strengths?.length > 0 || currentFb.improvements?.length > 0) && (
//             <Collapsible title="💡 Coaching" defaultOpen>
//               {currentFb.strengths?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//               {currentFb.improvements?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//             </Collapsible>
//           )}
//           <div style={{ display: 'flex', gap: 10 }}>
//             <button className="btn btn-ghost flex-1" onClick={() => { setAllResults(prev => prev.slice(0, -1)); setCurrentFb(null); setPhase('recording'); }}>
//               <RotateCcw size={14} /> Re-record
//             </button>
//             <button className="btn btn-primary flex-1" onClick={() => advanceOrFinish(allResults)}>
//               {idx + 1 >= total ? '🎯 View Results' : <>Next <ChevronRight size={14} /></>}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    JD SESSION REVIEW (inline in panel)
// ───────────────────────────────────────── */
// const JDSessionReview = ({ reviewData, onDone }) => {
//   const { questions, results, score, sessionType } = reviewData;
//   const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       <div className="score-hero" style={{ marginBottom: 16 }}>
//         <div>
//           <div className="score-label">Interview Score</div>
//           <div className="score-value" style={{ color: scoreColor }}>
//             {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
//           </div>
//         </div>
//         <div style={{ textAlign: 'right' }}>
//           <div className="score-label">Questions</div>
//           <div className="marks-value">{questions.length}</div>
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
//         <span className="badge badge-warning" style={{ fontSize: 12 }}>💼 JD Interview</span>
//         <span className="badge badge-muted" style={{ fontSize: 12 }}>
//           {sessionType === 'jd_video' ? 'Video Mode' : sessionType === 'jd_voice' ? 'Voice Mode' : 'Text Mode'}
//         </span>
//       </div>

//       {questions.map((q, idx) => {
//         const r = results[q.id] || {};
//         const qScore = r.overallScore ?? r.understandingScore;
//         const qColor = qScore >= 7 ? 'var(--success)' : qScore >= 5 ? 'var(--warning)' : 'var(--danger)';

//         return (
//           <div key={q.id} className="question-review-block">
//             <div className="q-review-header">
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
//                   <div className="question-text">{q.question}</div>
//                   <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
//                     {qScore != null && (
//                       <span style={{ fontSize: 13, fontWeight: 700, color: qColor, fontFamily: 'var(--mono)' }}>
//                         {Number(qScore).toFixed(1)}/10
//                       </span>
//                     )}
//                     {r.skipped && <span className="badge badge-muted" style={{ fontSize: 10 }}>skipped</span>}
//                   </div>
//                 </div>
//                 <div className="question-meta">
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//               </div>
//             </div>

//             <div className="q-review-body">
//               {!r.skipped && r.userAnswer && (
//                 <div className="result-box">
//                   <div className="result-box-label">Your Answer</div>
//                   <div className="result-box-content" style={{ whiteSpace: 'pre-wrap' }}>{r.userAnswer}</div>
//                 </div>
//               )}
//               {r.videoFeedback && (
//                 <>
//                   {r.videoFeedback.content && (
//                     <Collapsible title="📚 Content">
//                       <ScoreBar label="Relevance"    score={r.videoFeedback.content.answerRelevance} />
//                       <ScoreBar label="Completeness" score={r.videoFeedback.content.completeness} />
//                       <ScoreBar label="Structure"    score={r.videoFeedback.content.structure} />
//                     </Collapsible>
//                   )}
//                   {r.videoFeedback.delivery && (
//                     <Collapsible title="🎤 Delivery">
//                       <ScoreBar label="Clarity"    score={r.videoFeedback.delivery.clarity} />
//                       <ScoreBar label="Confidence" score={r.videoFeedback.delivery.confidencePresentation} />
//                     </Collapsible>
//                   )}
//                 </>
//               )}
//               {!r.videoFeedback && !r.skipped && r.contentScore != null && (
//                 <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
//                   <ScoreBar label="Content Quality" score={r.contentScore} />
//                   <ScoreBar label="Structure"       score={r.structureScore} />
//                 </div>
//               )}
//               {!r.skipped && (r.strengths?.length > 0 || r.improvements?.length > 0) && (
//                 <div className="explanation-box">
//                   <div className="explanation-title"><HelpCircle size={16} /> Coaching Feedback</div>
//                   {r.strengths?.length > 0 && (
//                     <div style={{ marginBottom: 10 }}>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ What worked well</div>
//                       {r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                   {r.improvements?.length > 0 && (
//                     <div>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>↑ Areas to improve</div>
//                       {r.improvements.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                 </div>
//               )}
//               {!r.skipped && r.sampleAnswer && (
//                 <Collapsible title="🌟 Ideal Answer">
//                   <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</p>
//                 </Collapsible>
//               )}
//               {r.explanation && !r.skipped && (
//                 <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{r.explanation}</div>
//               )}
//             </div>
//           </div>
//         );
//       })}

//       <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
//         <button className="btn btn-primary" onClick={onDone}>
//           <ArrowLeft size={14} /> Back to Config
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN PANEL COMPONENT
//    Now renders as an inline page, not a modal overlay.
//    Removed: onClose, onStartSession props (no longer needed).
//    Added:   sessionHistory prop for history sidebar.
// ───────────────────────────────────────── */
// const JDInterviewPanel = ({ chat, chatId, sessionHistory, onSessionFinished }) => {
//   const [step,          setStep]         = useState('loading');
//   const [jdParsed,      setJDParsed]     = useState(null);
//   const [activeSession, setActiveSession]= useState(null);
//   const [reviewData,    setReviewData]   = useState(null);
//   const [generating,    setGenerating]   = useState(false);
//   const [error,         setError]        = useState('');

//   useEffect(() => {
//     jdAPI.getJD(chatId)
//       .then(res => {
//         const jd = res.data?.jd;
//         if (jd?.parsed) { setJDParsed(jd.parsed); setStep('config'); }
//         else setStep('upload');
//       })
//       .catch(() => setStep('upload'));
//   }, [chatId]);

//   const handleUploaded = (data) => {
//     setJDParsed(data.parsed);
//     setStep('config');
//     setError('');
//   };

//   const handleGenerate = async ({ count, type, sessionMode, mediaMode }) => {
//     setGenerating(true); setError('');
//     try {
//       const res = await jdAPI.generateSession(chatId, count, type, sessionMode);
//       const data = res.data;
//       setActiveSession({
//         sessionId:   data.sessionId,
//         questions:   data.questions,
//         sessionMode: data.sessionMode,
//         mediaMode,
//         jdTitle:     data.jdTitle,
//         jdCompany:   data.jdCompany,
//       });
//       setStep('interview');
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setGenerating(false); }
//   };

//   const handleSubmitAnswers = async (answers) => {
//     const res = await jdAPI.submitSession(activeSession.sessionId, answers);
//     const data = res.data;
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     data.results,
//       score:       data.score,
//       sessionType: activeSession.sessionMode === 'voice' ? 'jd_voice' : 'jd_normal',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     onSessionFinished?.();
//   };

//   const handleVideoFinished = (result) => {
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     result.results,
//       score:       result.score,
//       sessionType: 'jd_video',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     onSessionFinished?.();
//   };

//   const handleDeleteJD = async () => {
//     if (!window.confirm('Delete the current JD? You can upload a new one anytime.')) return;
//     try { await jdAPI.deleteJD(chatId); setJDParsed(null); setStep('upload'); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//   };

//   const renderContent = () => {
//     if (step === 'loading') {
//       return (
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
//           <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
//           <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
//         </div>
//       );
//     }

//     if (step === 'review' && reviewData) {
//       return (
//         <JDSessionReview
//           reviewData={reviewData}
//           onDone={() => { setStep('config'); setReviewData(null); setActiveSession(null); }}
//         />
//       );
//     }

//     if (step === 'interview' && activeSession) {
//       const { questions, sessionId, sessionMode, mediaMode } = activeSession;
//       return (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//           <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
//             onClick={() => { setStep('config'); setActiveSession(null); }}>
//             <ArrowLeft size={14} /> Back to Config
//           </button>
//           <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
//             {sessionMode === 'video'  && <span className="badge badge-purple"><Video size={11} /> Video Practice</span>}
//             {sessionMode === 'voice'  && <span className="badge badge-blue"><Mic size={11} /> Voice Practice</span>}
//             {sessionMode === 'normal' && <span className="badge badge-muted"><BookOpen size={11} /> Text Practice</span>}
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{questions.length} questions</span>
//           </div>
//           {sessionMode === 'normal' && <JDNormalInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'voice'  && <JDVoiceInterview  questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />}
//           {sessionMode === 'video'  && <JDVideoInterview  questions={questions} chatId={chatId} sessionId={sessionId} mediaMode={mediaMode || 'video'} onFinished={handleVideoFinished} />}
//         </div>
//       );
//     }

//     if (step === 'config' && jdParsed) {
//       return (
//         <JDConfigView
//           parsed={jdParsed}
//           onGenerate={handleGenerate}
//           onReplace={() => setStep('upload')}
//           onDeleteJD={handleDeleteJD}
//           generating={generating}
//           sessionHistory={sessionHistory}
//         />
//       );
//     }

//     return <JDUploadView chatId={chatId} onUploaded={handleUploaded} />;
//   };

//   return (
//     <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
//       {/* Page header */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
//         <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
//           <Briefcase size={20} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div>
//           <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
//             Job Interview Prep
//             {jdParsed?.title && jdParsed.title !== 'Unknown' && (
//               <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 15 }}> · {jdParsed.title}</span>
//             )}
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             AI-generated questions · LLM feedback · Saved to history
//           </div>
//         </div>
//       </div>

//       {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

//       {renderContent()}
//     </div>
//   );
// };

// export default JDInterviewPanel;




























// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import {
//   X, Upload, Loader, Briefcase, Mic, Video, BookOpen,
//   RotateCcw, Play, Square, SkipForward, CheckCircle,
//   AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp,
//   ArrowLeft, Send, Trash2, ChevronRight, HelpCircle,
// } from 'lucide-react';
// import { jdAPI } from '../services/api';

// /* ─────────────────────────────────────────
//    CONSTANTS / CONFIG
// ───────────────────────────────────────── */
// const QUESTION_TYPES = [
//   { key: 'mixed',         label: 'Mixed (Recommended)', desc: '30% behavioral · 35% technical · 20% situational · 15% role-specific' },
//   { key: 'behavioral',    label: 'Behavioral',           desc: 'Tell me about a time… (STAR method)' },
//   { key: 'technical',     label: 'Technical',            desc: 'Skills, tools, domain knowledge' },
//   { key: 'situational',   label: 'Situational',          desc: 'What would you do if…' },
//   { key: 'role_specific', label: 'Role-Specific',        desc: 'Specific to this job\'s duties' },
// ];

// const PRACTICE_MODES = [
//   { key: 'normal', icon: <BookOpen size={15} />, label: 'Text Practice',  desc: 'Type your answers — no time pressure' },
//   { key: 'voice',  icon: <Mic size={15} />,      label: 'Voice Practice', desc: 'Speak answers, auto-transcribed, LLM evaluation' },
//   { key: 'video',  icon: <Video size={15} />,    label: 'Video Practice', desc: 'Record video/audio, get delivery coaching' },
// ];

// const SILENCE_MS  = 10_000;
// const MAX_REC_SECS = 180;

// /* ─────────────────────────────────────────
//    SMALL HELPERS
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
//       <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)' }}>
//         {title}
//         {open ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
//     </div>
//   );
// };

// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>{score != null ? `${score}/${max}` : '—'}</span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
//       </div>
//     </div>
//   );
// };

// const CategoryBadge = ({ cat }) => {
//   const colors = { behavioral: 'badge-blue', technical: 'badge-purple', situational: 'badge-warning', role_specific: 'badge-muted' };
//   return <span className={`badge ${colors[cat] || 'badge-muted'}`} style={{ fontSize: 10 }}>{cat?.replace('_', ' ')}</span>;
// };

// /* ─────────────────────────────────────────
//    STEP 1 — JD UPLOAD VIEW
// ───────────────────────────────────────── */
// const JDUploadView = ({ chatId, onUploaded }) => {
//   const [tab,     setTab]     = useState('text');
//   const [text,    setText]    = useState('');
//   const [file,    setFile]    = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error,   setError]   = useState('');

//   const handleTextUpload = async () => {
//     if (!text.trim()) { setError('Paste a job description first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadText(chatId, text.trim()); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   const handleFileUpload = async () => {
//     if (!file) { setError('Select a file first.'); return; }
//     setLoading(true); setError('');
//     try { const res = await jdAPI.uploadFile(chatId, file); onUploaded(res.data); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//     finally { setLoading(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
//         <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
//           <Briefcase size={24} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Add Job Description</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//           Paste or upload a JD — AI parses it, then you practice with role-specific interview questions
//         </div>
//       </div>

//       <div style={{ display: 'flex', gap: 6 }}>
//         {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File (PDF/TXT)' }].map(t => (
//           <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`, background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)', color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)' }}>
//             {t.l}
//           </button>
//         ))}
//       </div>

//       {error && <div className="error-box">{error}</div>}

//       {tab === 'text' ? (
//         <>
//           <textarea className="input" value={text} onChange={e => setText(e.target.value)}
//             placeholder={"Paste the full job description here…\n\nInclude: role title, company, responsibilities, requirements, skills…"}
//             style={{ minHeight: 180, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           <button className="btn btn-primary btn-full" onClick={handleTextUpload} disabled={loading || !text.trim()}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Parse & Continue →'}
//           </button>
//         </>
//       ) : (
//         <>
//           <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)' }}
//             onClick={() => document.getElementById('jd-file-input').click()}>
//             <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
//             <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
//               {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
//             </div>
//           </div>
//           <input id="jd-file-input" type="file" accept=".pdf,.txt" style={{ display: 'none' }}
//             onChange={e => { setFile(e.target.files[0] || null); setError(''); }} />
//           <button className="btn btn-primary btn-full" onClick={handleFileUpload} disabled={loading || !file}>
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing…</> : 'Upload & Parse →'}
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    STEP 2 — JD CONFIG VIEW
//    Shows parsed JD + lets user configure session
// ───────────────────────────────────────── */
// const JDConfigView = ({ parsed, onGenerate, onReplace, generating }) => {
//   const [qType,      setQType]      = useState('mixed');
//   const [qCount,     setQCount]     = useState('8');
//   const [mode,       setMode]       = useState('normal');
//   const [mediaMode,  setMediaMode]  = useState('video'); // for video practice

//   const handleGenerate = () => {
//     onGenerate({
//       count: Math.max(3, Math.min(20, Number(qCount) || 8)),
//       type: qType,
//       sessionMode: mode,
//       mediaMode,
//     });
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* JD summary card */}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//         <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
//           <div>
//             <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{parsed.title || 'Job Description'}</div>
//             {parsed.company && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{parsed.company}</div>}
//             <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
//               {parsed.domain && <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>}
//               {parsed.experience && <span className="badge badge-muted" style={{ fontSize: 11 }}>{parsed.experience}</span>}
//             </div>
//           </div>
//           <button className="btn btn-ghost btn-sm" onClick={onReplace} style={{ fontSize: 11, flexShrink: 0 }}>
//             <RotateCcw size={12} /> Replace
//           </button>
//         </div>
//       </div>

//       {/* Skills */}
//       {parsed.skills?.length > 0 && (
//         <Collapsible title={`🛠 Skills (${parsed.skills.length})`} defaultOpen>
//           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
//             {parsed.skills.slice(0, 20).map((s, i) => <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>)}
//           </div>
//         </Collapsible>
//       )}

//       {/* Config */}
//       <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px' }}>
//         <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Configure Interview</div>

//         {/* Question type */}
//         <div style={{ marginBottom: 14 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Question Focus</div>
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//             {QUESTION_TYPES.map(qt => (
//               <button key={qt.key} onClick={() => setQType(qt.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', textAlign: 'left', background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                 <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: qType === qt.key ? 'var(--primary)' : 'var(--border)' }} />
//                 <div>
//                   <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
//                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
//                 </div>
//               </button>
//             ))}
//           </div>
//         </div>

//         {/* Count */}
//         <div style={{ marginBottom: 14 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Number of Questions</div>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//             <input className="input" type="number" min={3} max={20} value={qCount}
//               onChange={e => setQCount(e.target.value)} style={{ maxWidth: 80, fontSize: 13 }} />
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>3 – 20 questions</span>
//           </div>
//         </div>

//         {/* Practice mode */}
//         <div style={{ marginBottom: mode === 'video' ? 10 : 16 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Practice Mode</div>
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
//             {PRACTICE_MODES.map(pm => (
//               <button key={pm.key} onClick={() => setMode(pm.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', textAlign: 'left', background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'var(--transition)' }}>
//                 <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
//                 <div>
//                   <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
//                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
//                 </div>
//               </button>
//             ))}
//           </div>
//         </div>

//         {/* Video sub-option */}
//         {mode === 'video' && (
//           <div style={{ marginBottom: 16 }}>
//             <div className="form-label" style={{ marginBottom: 6 }}>Recording Type</div>
//             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//               {[{ k: 'video', icon: <Video size={13} />, l: 'Video + Audio' }, { k: 'audio', icon: <Mic size={13} />, l: 'Audio Only' }].map(opt => (
//                 <button key={opt.k} onClick={() => setMediaMode(opt.k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: mediaMode === opt.k ? 'var(--primary-dim)' : 'var(--surface)', border: `1px solid ${mediaMode === opt.k ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', color: mediaMode === opt.k ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
//                   {opt.icon} {opt.l}
//                 </button>
//               ))}
//             </div>
//           </div>
//         )}

//         <button className="btn btn-primary btn-full" onClick={handleGenerate} disabled={generating}>
//           {generating ? <><Loader size={14} className="vi-spin" /> Generating…</> : <><Send size={14} /> Start Interview</>}
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    NORMAL TEXT INTERVIEW (jd_normal)
//    Shows all questions → submit all at once → LLM feedback
// ───────────────────────────────────────── */
// const JDNormalInterview = ({ questions, sessionId, onSubmit }) => {
//   const [answers,    setAnswers]    = useState({});
//   const [submitting, setSubmitting] = useState(false);
//   const [error,      setError]      = useState('');

//   const answeredCount = Object.values(answers).filter(v => String(v || '').trim()).length;

//   const handleSubmit = async () => {
//     setSubmitting(true); setError('');
//     try { await onSubmit(answers); }
//     catch (err) { setError(err.message); }
//     finally { setSubmitting(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

//       {questions.map((q, idx) => (
//         <div key={q.id} className="question-card">
//           <div className="question-header">
//             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div className="question-text">{q.question}</div>
//                 <div className="question-meta" style={{ marginTop: 6 }}>
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//                 {q.tip && (
//                   <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
//                     💡 {q.tip}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//           <div className="question-body">
//             <textarea className="input" value={answers[q.id] || ''} rows={4}
//               onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
//               placeholder="Type your answer… be specific and use examples where possible"
//               style={{ fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
//           </div>
//         </div>
//       ))}

//       <div className="submit-bar">
//         <div className="progress-text">
//           <span className="progress-count">{answeredCount}</span> / {questions.length} answered
//         </div>
//         <button className="btn btn-primary" onClick={handleSubmit}
//           disabled={submitting || answeredCount === 0}>
//           {submitting ? 'Submitting…' : 'Submit & Get Feedback'}
//           <Send size={16} />
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VOICE INTERVIEW (jd_voice)
//    TTS reads question → STT captures answer → submit all at end
// ───────────────────────────────────────── */
// const JDVoiceInterview = ({ questions, sessionId, onSubmit }) => {
//   const [idx,          setIdx]          = useState(0);
//   const [phase,        setPhase]        = useState('reading'); // reading|buffering|listening|done
//   const [transcript,   setTranscript]   = useState('');
//   const [savedAnswers, setSavedAnswers] = useState({});
//   const [muteTTS,      setMuteTTS]      = useState(false);
//   const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);
//   const [submitting,   setSubmitting]   = useState(false);

//   const recRef    = useRef(null);
//   const silRef    = useRef(null);
//   const cdRef     = useRef(null);
//   const baseRef   = useRef('');
//   const bufferRef = useRef(null);
//   const advRef    = useRef(false);

//   const q = questions[idx];

//   const stopTimers = useCallback(() => {
//     if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
//     if (cdRef.current)  { clearInterval(cdRef.current); cdRef.current = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recRef.current?.stop(); } catch {}
//     recRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//   }, []);

//   const saveAndAdvance = useCallback((text) => {
//     if (advRef.current) return;
//     advRef.current = true;
//     stopSTT();
//     const answer = text.trim();
//     const qid = questions[idx]?.id;
//     if (qid) setSavedAnswers(prev => ({ ...prev, [qid]: answer }));
//     baseRef.current = '';
//     setTranscript('');
//     if (idx + 1 >= questions.length) {
//       setPhase('done');
//     } else {
//       setIdx(i => i + 1);
//       setPhase('reading');
//       advRef.current = false;
//     }
//   }, [idx, questions, stopSTT]);

//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     let r = SILENCE_MS / 1000;
//     setCountdown(r);
//     cdRef.current = setInterval(() => { r -= 1; setCountdown(Math.max(0, r)); if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; } }, 1000);
//     silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
//   }, [stopTimers, saveAndAdvance]);

//   const startSTT = useCallback(() => {
//     if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
//       alert('Speech recognition not supported. Try Chrome or Edge.'); return;
//     }
//     stopSTT(); advRef.current = false; baseRef.current = '';
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
//     rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
//     rec.onresult = (ev) => {
//       stopTimers(); startSilenceTimer();
//       let interim = '', final = '';
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const t = ev.results[i]?.[0]?.transcript || '';
//         if (ev.results[i].isFinal) final += t; else interim += t;
//       }
//       const base = baseRef.current;
//       const spoken = `${final} ${interim}`.trim();
//       setTranscript(base + (base.trim() && spoken ? ' ' : '') + spoken);
//       if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
//     };
//     rec.onerror = () => stopTimers();
//     rec.onend = () => {};
//     recRef.current = rec;
//     try { rec.start(); } catch (e) { console.error(e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   const startBuffer = useCallback(() => {
//     setPhase('buffering');
//     bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
//   }, [startSTT]);

//   const readQuestion = useCallback((question) => {
//     stopTTS();
//     if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
//     const u = new SpeechSynthesisUtterance(question.question);
//     u.rate = 0.95;
//     u.onend = () => startBuffer();
//     u.onerror = () => startBuffer();
//     window.speechSynthesis.speak(u);
//   }, [muteTTS, stopTTS, startBuffer]);

//   useEffect(() => {
//     if (phase !== 'reading' || !q) return;
//     readQuestion(q);
//   }, [idx, phase, readQuestion, q]);

//   useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

//   // Done — submit all answers
//   const handleFinalSubmit = async () => {
//     setSubmitting(true);
//     try {
//       // Fill in any remaining unanswered
//       const allAnswers = {};
//       questions.forEach(sq => { allAnswers[sq.id] = savedAnswers[sq.id] || ''; });
//       await onSubmit(allAnswers);
//     } catch { setSubmitting(false); }
//   };

//   if (phase === 'done') {
//     const answeredCount = Object.values(savedAnswers).filter(Boolean).length;
//     return (
//       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 16 }}>
//         <div style={{ fontSize: 40 }}>🎙</div>
//         <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>All questions answered!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{answeredCount} of {questions.length} answered</div>
//         <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleFinalSubmit} disabled={submitting}>
//           {submitting ? <><Loader size={14} className="vi-spin" /> Getting feedback…</> : 'Get AI Feedback →'}
//         </button>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Progress bar */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
//         <button className="btn btn-ghost btn-sm" onClick={() => { stopTTS(); setMuteTTS(m => !m); if (phase === 'reading') startBuffer(); }} title={muteTTS ? 'Enable TTS' : 'Mute TTS'}>
//           {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
//         </button>
//       </div>

//       {/* Question card */}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
//           <CategoryBadge cat={q.category} />
//           {phase === 'reading'    && <span style={{ fontSize: 11, color: 'var(--primary)',  fontWeight: 600 }}>🔊 Reading…</span>}
//           {phase === 'buffering'  && <span style={{ fontSize: 11, color: 'var(--warning)',  fontWeight: 600 }}>⏱ Starting mic…</span>}
//           {phase === 'listening'  && <span style={{ fontSize: 11, color: 'var(--danger)',   fontWeight: 600 }}>🎙 Listening…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.question}</div>
//         {q.tip && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>💡 {q.tip}</div>}
//       </div>

//       {/* Transcript box */}
//       <div style={{ minHeight: 90, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
//         {transcript
//           ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
//           : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
//               {phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}
//             </p>
//         }
//       </div>

//       {/* Controls */}
//       <div style={{ display: 'flex', gap: 8 }}>
//         {phase === 'reading' && (
//           <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
//             <Volume2 size={14} /> Skip Reading
//           </button>
//         )}
//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary btn-full" onClick={() => { if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; } startSTT(); }}>
//               <Mic size={14} /> Start Now
//             </button>
//           </>
//         )}
//         {phase === 'listening' && (
//           <>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
//               {countdown}s
//             </div>
//             <div style={{ flex: 1 }} />
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}><SkipForward size={14} /> Skip</button>
//             <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
//               <CheckCircle size={14} />
//               {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VIDEO INTERVIEW (jd_video)
//    Uses /api/chats/<id>/video-question per question
//    Saves via /api/chats/<id>/video-session/save at end
// ───────────────────────────────────────── */
// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.92; u.onend = onEnd; u.onerror = onEnd;
//     window.speechSynthesis.speak(u);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch { onEnd(); return () => {}; }
// };

// const JDVideoRecorder = ({ question, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   useEffect(() => {
//     const cancel = safeTTS(question.question, () => setReading(false));
//     return () => cancel();
//   }, [question.question]);

//   useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); if (timerRef.current) clearInterval(timerRef.current); }, []);

//   const startRecording = async () => {
//     setError('');
//     try {
//       const s = await navigator.mediaDevices.getUserMedia(
//         mediaMode === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
//       );
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
//     } catch { setError('Permission denied. Allow camera/mic and retry.'); return; }

//     chunksRef.current = [];
//     const mime = mediaMode === 'video' ? 'video/webm' : 'audio/webm';
//     const rec = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm' });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       setBlob(new Blob(chunksRef.current, { type: mime }));
//       streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
//       setPhase('preview');
//     };
//     recRef.current = rec; rec.start(100);
//     setPhase('recording'); setElapsed(0);
//     timerRef.current = setInterval(() => {
//       setElapsed(p => { if (p + 1 >= MAX_REC_SECS) { stopRecording(); return MAX_REC_SECS; } return p + 1; });
//     }, 1000);
//   };

//   const stopRecording = () => {
//     if (recRef.current?.state !== 'inactive') recRef.current?.stop();
//     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
//   };

//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting'); setError('');
//     try {
//       const form = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question.question);
//       form.append('media_type', mediaMode);
//       form.append('topic', question.category || '');
//       form.append('bloom_level', 'Apply');
//       const res = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) { setError(err.message); setPhase('preview'); }
//   };

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}
//       <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
//           <CategoryBadge cat={question.category} />
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>{question.question}</div>
//       </div>

//       {/* Camera / audio */}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} /> {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 44, height: 44, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}</div>
//         </div>
//       )}

//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <audio ref={previewRef} controls style={{ width: '100%' }} />
//       )}

//       {phase === 'submitting' && (
//         <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
//           <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing response… (10–20s)</div>
//         </div>
//       )}

//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip"><SkipForward size={15} /></button>
//         </div>
//       )}
//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}
//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={() => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); }}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// const JDVideoInterview = ({ questions, chatId, sessionId, mediaMode, onFinished }) => {
//   const [idx,       setIdx]       = useState(0);
//   const [phase,     setPhase]     = useState('recording'); // recording|feedback
//   const [currentFb, setCurrentFb] = useState(null);
//   const [allResults,setAllResults]= useState([]);
//   const [saving,    setSaving]    = useState(false);

//   const current = questions[idx];
//   const total   = questions.length;

//   const handleFeedback = (fb) => {
//     const result = { question: current, feedback: fb };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(fb);
//     setPhase('feedback');
//   };

//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     const next = [...allResults, result];
//     setAllResults(next);
//     advanceOrFinish(next);
//   };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (idx + 1 >= total) { finishSession(results); }
//     else { setIdx(i => i + 1); setPhase('recording'); }
//   };

//   const finishSession = async (results) => {
//     setSaving(true);
//     const feedbackMap = {};
//     let totalScore = 0, scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) {
//         feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: '[Skipped]', correctAnswer: null, isCorrect: null, understandingScore: 0, overallScore: null, skipped: true, videoFeedback: null, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: 0, maxMarks: 10 };
//         return;
//       }
//       const score = fb.overallScore ?? 0;
//       totalScore += score; scoredCount += 1;
//       feedbackMap[q.id] = { type: 'video', topic: q.category || 'General', question: q.question, userAnswer: fb.transcript || '', correctAnswer: null, isCorrect: null, understandingScore: Math.round(score), overallScore: score, videoFeedback: fb, bloomLevel: 'Apply', difficulty: q.difficulty, awardedMarks: Math.round(score * 10) / 10, maxMarks: 10 };
//     });

//     const avgScore = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
//     const answersMap = Object.fromEntries(results.filter(r => r.question?.id && !r.skipped).map(r => [r.question.id, r.feedback?.transcript || '']));

//     try {
//       await jdAPI.saveVideoSession(chatId, { session_id: sessionId, questions, answers: answersMap, feedback: feedbackMap, score: avgScore, session_type: 'jd_video' });
//     } catch (err) { console.warn('[JDVideoInterview] save failed:', err); }

//     setSaving(false);
//     onFinished({ score: avgScore, results: feedbackMap, allResults: results });
//   };

//   if (saving) {
//     return (
//       <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
//         <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
//         <div style={{ fontSize: 14, fontWeight: 700 }}>Saving session…</div>
//       </div>
//     );
//   }

//   const progressPct = (idx / total) * 100;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Progress */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
//           {phase === 'feedback' ? `Feedback ${idx + 1}/${total}` : `Q ${idx + 1}/${total}`}
//         </span>
//       </div>

//       {phase === 'recording' && current && (
//         <JDVideoRecorder key={`jd-vid-${idx}`} question={current} chatId={chatId} mediaMode={mediaMode} onFeedback={handleFeedback} onSkip={handleSkip} />
//       )}

//       {phase === 'feedback' && currentFb && (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           {/* Mini feedback card */}
//           <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
//             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Score</div>
//             <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
//               {currentFb.overallScore != null ? Number(currentFb.overallScore).toFixed(1) : '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//             </div>
//           </div>
//           {currentFb.transcript && (
//             <Collapsible title="📝 Transcript">
//               <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{currentFb.transcript}</p>
//             </Collapsible>
//           )}
//           {(currentFb.strengths?.length > 0 || currentFb.improvements?.length > 0) && (
//             <Collapsible title="💡 Coaching" defaultOpen>
//               {currentFb.strengths?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//               {currentFb.improvements?.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}><AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />{s}</div>)}
//             </Collapsible>
//           )}
//           <div style={{ display: 'flex', gap: 10 }}>
//             <button className="btn btn-ghost flex-1" onClick={() => { setAllResults(prev => prev.slice(0, -1)); setCurrentFb(null); setPhase('recording'); }}>
//               <RotateCcw size={14} /> Re-record
//             </button>
//             <button className="btn btn-primary flex-1" onClick={() => advanceOrFinish(allResults)}>
//               {idx + 1 >= total ? '🎯 View Results' : <>Next <ChevronRight size={14} /></>}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    JD SESSION REVIEW
//    Shows all questions with feedback — displayed after submission
// ───────────────────────────────────────── */
// const JDSessionReview = ({ reviewData, onDone }) => {
//   const { questions, results, score, sessionType } = reviewData;

//   const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       {/* Score hero */}
//       <div className="score-hero" style={{ marginBottom: 16 }}>
//         <div>
//           <div className="score-label">Interview Score</div>
//           <div className="score-value" style={{ color: scoreColor }}>
//             {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
//           </div>
//         </div>
//         <div style={{ textAlign: 'right' }}>
//           <div className="score-label">Questions</div>
//           <div className="marks-value">{questions.length}</div>
//         </div>
//       </div>

//       {/* Session type badge */}
//       <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
//         <span className="badge badge-warning" style={{ fontSize: 12 }}>
//           💼 JD Interview
//         </span>
//         <span className="badge badge-muted" style={{ fontSize: 12 }}>
//           {sessionType === 'jd_video' ? 'Video Mode' : sessionType === 'jd_voice' ? 'Voice Mode' : 'Text Mode'}
//         </span>
//       </div>

//       {/* Questions */}
//       {questions.map((q, idx) => {
//         const r = results[q.id] || {};
//         const score = r.overallScore ?? r.understandingScore;
//         const scoreColor = score >= 7 ? 'var(--success)' : score >= 5 ? 'var(--warning)' : 'var(--danger)';

//         return (
//           <div key={q.id} className="question-review-block">
//             <div className="q-review-header">
//               <div className="question-number">{idx + 1}</div>
//               <div style={{ flex: 1 }}>
//                 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
//                   <div className="question-text">{q.question}</div>
//                   <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
//                     {score != null && (
//                       <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor, fontFamily: 'var(--mono)' }}>
//                         {Number(score).toFixed(1)}/10
//                       </span>
//                     )}
//                     {r.skipped && <span className="badge badge-muted" style={{ fontSize: 10 }}>skipped</span>}
//                   </div>
//                 </div>
//                 <div className="question-meta">
//                   <CategoryBadge cat={q.category} />
//                   {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//                   {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//                 </div>
//               </div>
//             </div>

//             <div className="q-review-body">
//               {/* Answer */}
//               {!r.skipped && r.userAnswer && (
//                 <div className="result-box">
//                   <div className="result-box-label">Your Answer</div>
//                   <div className="result-box-content" style={{ whiteSpace: 'pre-wrap' }}>{r.userAnswer}</div>
//                 </div>
//               )}

//               {/* Score bars for video */}
//               {r.videoFeedback && (
//                 <>
//                   {r.videoFeedback.content && (
//                     <Collapsible title="📚 Content">
//                       <ScoreBar label="Relevance" score={r.videoFeedback.content.answerRelevance} />
//                       <ScoreBar label="Completeness" score={r.videoFeedback.content.completeness} />
//                       <ScoreBar label="Structure" score={r.videoFeedback.content.structure} />
//                     </Collapsible>
//                   )}
//                   {r.videoFeedback.delivery && (
//                     <Collapsible title="🎤 Delivery">
//                       <ScoreBar label="Clarity" score={r.videoFeedback.delivery.clarity} />
//                       <ScoreBar label="Confidence" score={r.videoFeedback.delivery.confidencePresentation} />
//                     </Collapsible>
//                   )}
//                 </>
//               )}

//               {/* Text/Voice feedback */}
//               {!r.videoFeedback && !r.skipped && (
//                 <>
//                   {r.contentScore != null && (
//                     <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
//                       <ScoreBar label="Content Quality" score={r.contentScore} />
//                       <ScoreBar label="Structure" score={r.structureScore} />
//                     </div>
//                   )}
//                 </>
//               )}

//               {/* Coaching notes */}
//               {!r.skipped && (r.strengths?.length > 0 || r.improvements?.length > 0) && (
//                 <div className="explanation-box">
//                   <div className="explanation-title"><HelpCircle size={16} /> Coaching Feedback</div>
//                   {r.strengths?.length > 0 && (
//                     <div style={{ marginBottom: 10 }}>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ What worked well</div>
//                       {r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                   {r.improvements?.length > 0 && (
//                     <div>
//                       <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>↑ Areas to improve</div>
//                       {r.improvements.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>)}
//                     </div>
//                   )}
//                 </div>
//               )}

//               {/* Sample answer */}
//               {!r.skipped && r.sampleAnswer && (
//                 <Collapsible title="🌟 Ideal Answer">
//                   <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</p>
//                 </Collapsible>
//               )}

//               {r.explanation && !r.skipped && (
//                 <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{r.explanation}</div>
//               )}
//             </div>
//           </div>
//         );
//       })}

//       <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
//         <button className="btn btn-primary" onClick={onDone}>Done → Back to Session</button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN PANEL COMPONENT
// ───────────────────────────────────────── */
// const JDInterviewPanel = ({ chat, chatId, onClose, onStartSession, onSessionFinished }) => {
//   const [step,         setStep]        = useState('loading'); // loading|upload|config|interview|review
//   const [jdParsed,     setJDParsed]    = useState(null);
//   const [activeSession,setActiveSession] = useState(null);  // { sessionId, questions, sessionMode, mediaMode }
//   const [reviewData,   setReviewData]  = useState(null);
//   const [generating,   setGenerating]  = useState(false);
//   const [error,        setError]       = useState('');

//   // Load existing JD on mount
//   useEffect(() => {
//     jdAPI.getJD(chatId)
//       .then(res => {
//         const jd = res.data?.jd;
//         if (jd?.parsed) { setJDParsed(jd.parsed); setStep('config'); }
//         else setStep('upload');
//       })
//       .catch(() => setStep('upload'));
//   }, [chatId]);

//   const handleUploaded = (data) => {
//     // data from backend: { jdId, parsed, status }
//     setJDParsed(data.parsed);
//     setStep('config');
//     setError('');
//   };

//   const handleGenerate = async ({ count, type, sessionMode, mediaMode }) => {
//     setGenerating(true); setError('');
//     try {
//       const res = await jdAPI.generateSession(chatId, count, type, sessionMode);
//       const data = res.data;
//       setActiveSession({
//         sessionId:   data.sessionId,
//         questions:   data.questions,
//         sessionMode: data.sessionMode,
//         mediaMode:   mediaMode,
//         jdTitle:     data.jdTitle,
//         jdCompany:   data.jdCompany,
//       });
//       setStep('interview');
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setGenerating(false); }
//   };

//   // Normal + voice submission
//   const handleSubmitAnswers = async (answers) => {
//     const res = await jdAPI.submitSession(activeSession.sessionId, answers);
//     const data = res.data;
//     // Build review data — questions are on activeSession
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     data.results,
//       score:       data.score,
//       sessionType: activeSession.sessionMode === 'voice' ? 'jd_voice' : 'jd_normal',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     // Notify App to reload session history
//     onSessionFinished?.(null); // null = don't switch to review in main area, we show it in panel
//   };

//   // Video session finished (handled inside JDVideoInterview)
//   const handleVideoFinished = (result) => {
//     const reviewObj = {
//       sessionId:   activeSession.sessionId,
//       questions:   activeSession.questions,
//       results:     result.results,
//       score:       result.score,
//       sessionType: 'jd_video',
//     };
//     setReviewData(reviewObj);
//     setStep('review');
//     onSessionFinished?.(null);
//   };

//   const handleDeleteJD = async () => {
//     if (!window.confirm('Delete the current JD? You can upload a new one anytime.')) return;
//     try { await jdAPI.deleteJD(chatId); setJDParsed(null); setStep('upload'); }
//     catch (err) { setError(err.response?.data?.error || err.message); }
//   };

//   const renderContent = () => {
//     if (step === 'loading') {
//       return (
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
//           <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
//           <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
//         </div>
//       );
//     }

//     if (step === 'review' && reviewData) {
//       return <JDSessionReview reviewData={reviewData} onDone={() => { setStep('config'); setReviewData(null); setActiveSession(null); }} />;
//     }

//     if (step === 'interview' && activeSession) {
//       const { questions, sessionId, sessionMode, mediaMode } = activeSession;
//       return (
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//           {/* Back */}
//           <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
//             onClick={() => { setStep('config'); setActiveSession(null); }}>
//             <ArrowLeft size={14} /> Back to Config
//           </button>
//           {/* Mode badge */}
//           <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
//             {sessionMode === 'video'  && <span className="badge badge-purple"><Video size={11} /> Video Practice</span>}
//             {sessionMode === 'voice'  && <span className="badge badge-blue"><Mic size={11} /> Voice Practice</span>}
//             {sessionMode === 'normal' && <span className="badge badge-muted"><BookOpen size={11} /> Text Practice</span>}
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{questions.length} questions</span>
//           </div>

//           {sessionMode === 'normal' && (
//             <JDNormalInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />
//           )}
//           {sessionMode === 'voice' && (
//             <JDVoiceInterview questions={questions} sessionId={sessionId} onSubmit={handleSubmitAnswers} />
//           )}
//           {sessionMode === 'video' && (
//             <JDVideoInterview questions={questions} chatId={chatId} sessionId={sessionId} mediaMode={mediaMode || 'video'} onFinished={handleVideoFinished} />
//           )}
//         </div>
//       );
//     }

//     if (step === 'config' && jdParsed) {
//       return <JDConfigView parsed={jdParsed} onGenerate={handleGenerate} onReplace={() => setStep('upload')} generating={generating} />;
//     }

//     return <JDUploadView chatId={chatId} onUploaded={handleUploaded} />;
//   };

//   return (
//     <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
//       <div style={{ width: '100%', maxWidth: 600, maxHeight: '94vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'modalSlide 0.25s ease' }}>

//         {/* Header */}
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//             <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//               <Briefcase size={17} style={{ color: 'var(--warning)' }} />
//             </div>
//             <div>
//               <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>JD Interview Prep</div>
//               <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
//                 Practice · LLM Feedback · Saved to History
//               </div>
//             </div>
//           </div>
//           <div style={{ display: 'flex', gap: 6 }}>
//             {jdParsed && step === 'config' && (
//               <button className="btn btn-ghost btn-sm" onClick={handleDeleteJD} title="Delete JD" style={{ color: 'var(--danger)' }}>
//                 <Trash2 size={13} />
//               </button>
//             )}
//             <button className="btn-icon" onClick={onClose}><X size={18} /></button>
//           </div>
//         </div>

//         {/* Error banner */}
//         {error && <div className="error-box" style={{ margin: '12px 24px 0' }}>{error}</div>}

//         {/* Body */}
//         <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
//           {renderContent()}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default JDInterviewPanel;























// /**
//  * JDInterviewPanel — Job Description Interview Prep
//  *
//  * ISOLATED: This entire file is the JD feature. To remove it:
//  *   1. Delete this file
//  *   2. Remove `import JDInterviewPanel` and `{showJDPanel && ...}` from App.js
//  *   3. Remove `onOpenJDPanel` from PracticeSession.js
//  *   4. Remove jdAPI from api.js
//  *
//  * What it does:
//  *   - Upload a JD (paste text or upload PDF/TXT)
//  *   - Shows parsed JD (title, company, skills, requirements)
//  *   - Generate interview questions (behavioral / technical / situational / role_specific / mixed)
//  *   - Practice: Normal (text), Voice, or Video interview with those questions
//  *
//  * The session mode (normal/voice/video) for JD practice is chosen INSIDE this panel
//  * because it's a standalone practice flow separate from the main exam session.
//  * It does NOT use the chat's examConfig sessionMode — that is intentional.
//  * JD practice is always "practice only" — no marks, no weak topics, no analytics.
//  */

// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import {
//   X, Upload, FileText, Loader, Briefcase, ChevronDown, ChevronRight,
//   Mic, Video, BookOpen, RotateCcw, Play, Square, SkipForward,
//   CheckCircle, AlertCircle, Volume2, VolumeX, ChevronUp,
//   ArrowLeft, Send, Trash2,
// } from 'lucide-react';
// import { jdAPI } from '../services/api';

// /* ─────────────────────────────────────────
//    HELPERS
// ───────────────────────────────────────── */
// const QUESTION_TYPES = [
//   { key: 'mixed',        label: 'Mixed',        desc: 'All types combined (recommended)' },
//   { key: 'behavioral',   label: 'Behavioral',   desc: 'Tell me about a time…' },
//   { key: 'technical',    label: 'Technical',    desc: 'Skills & domain knowledge' },
//   { key: 'situational',  label: 'Situational',  desc: 'What would you do if…' },
//   { key: 'role_specific',label: 'Role-Specific', desc: 'Specific to this job' },
// ];

// const PRACTICE_MODES = [
//   { key: 'normal', icon: <BookOpen size={16} />, label: 'Text Practice',  desc: 'Type your answers at your own pace' },
//   { key: 'voice',  icon: <Mic size={16} />,      label: 'Voice Practice', desc: 'Speak your answers (auto-transcribed)' },
//   { key: 'video',  icon: <Video size={16} />,    label: 'Video Practice', desc: 'Record video/audio for delivery coaching' },
// ];

// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{
//       background: 'var(--surface-2)', border: '1px solid var(--border)',
//       borderRadius: 12, overflow: 'hidden', marginBottom: 10,
//     }}>
//       <button onClick={() => setOpen(o => !o)} style={{
//         width: '100%', padding: '11px 14px', display: 'flex',
//         justifyContent: 'space-between', alignItems: 'center',
//         background: 'none', border: 'none', cursor: 'pointer',
//         color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)',
//       }}>
//         {title}
//         {open
//           ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
//           : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    JD UPLOAD VIEW
// ───────────────────────────────────────── */
// const JDUploadView = ({ chatId, onUploaded, existingJD }) => {
//   const [tab,       setTab]       = useState('text');   // 'text' | 'file'
//   const [text,      setText]      = useState('');
//   const [file,      setFile]      = useState(null);
//   const [loading,   setLoading]   = useState(false);
//   const [error,     setError]     = useState('');

//   const handleTextUpload = async () => {
//     if (!text.trim()) { setError('Paste a job description first.'); return; }
//     setLoading(true); setError('');
//     try {
//       const res = await jdAPI.uploadText(chatId, text.trim());
//       onUploaded(res.data);
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setLoading(false); }
//   };

//   const handleFileUpload = async () => {
//     if (!file) { setError('Select a file first.'); return; }
//     setLoading(true); setError('');
//     try {
//       const res = await jdAPI.uploadFile(chatId, file);
//       onUploaded(res.data);
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setLoading(false); }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
//         <div style={{
//           width: 52, height: 52, borderRadius: 14,
//           background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
//           display: 'flex', alignItems: 'center', justifyContent: 'center',
//           margin: '0 auto 12px',
//         }}>
//           <Briefcase size={24} style={{ color: 'var(--warning)' }} />
//         </div>
//         <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
//           {existingJD ? 'Replace Job Description' : 'Add Job Description'}
//         </div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//           Paste or upload a JD — AI will parse it and generate interview questions tailored to the role
//         </div>
//       </div>

//       {/* Tabs */}
//       <div style={{ display: 'flex', gap: 6 }}>
//         {[{ k: 'text', l: 'Paste Text' }, { k: 'file', l: 'Upload File' }].map(t => (
//           <button
//             key={t.k}
//             onClick={() => setTab(t.k)}
//             style={{
//               flex: 1, padding: '8px', fontSize: 13, fontWeight: 600,
//               border: `1px solid ${tab === t.k ? 'var(--warning)' : 'var(--border)'}`,
//               background: tab === t.k ? 'rgba(245,158,11,0.08)' : 'var(--surface-2)',
//               color: tab === t.k ? 'var(--warning)' : 'var(--text-secondary)',
//               borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
//             }}
//           >
//             {t.l}
//           </button>
//         ))}
//       </div>

//       {error && <div className="error-box">{error}</div>}

//       {tab === 'text' ? (
//         <>
//           <textarea
//             className="input"
//             value={text}
//             onChange={e => setText(e.target.value)}
//             placeholder="Paste the full job description here…&#10;&#10;Include: role title, company, responsibilities, requirements, skills…"
//             style={{ minHeight: 200, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }}
//           />
//           <button
//             className="btn btn-primary btn-full"
//             onClick={handleTextUpload}
//             disabled={loading || !text.trim()}
//           >
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing JD…</> : 'Parse & Continue'}
//           </button>
//         </>
//       ) : (
//         <>
//           <div
//             style={{
//               border: '2px dashed var(--border)', borderRadius: 12,
//               padding: '32px 16px', textAlign: 'center', cursor: 'pointer',
//               background: file ? 'rgba(245,158,11,0.04)' : 'var(--surface-2)',
//               transition: 'var(--transition)',
//             }}
//             onClick={() => document.getElementById('jd-file-input').click()}
//           >
//             <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
//             <div style={{ fontSize: 13, color: file ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: file ? 600 : 400 }}>
//               {file ? file.name : 'Click to select PDF or TXT file (max 5MB)'}
//             </div>
//           </div>
//           <input
//             id="jd-file-input"
//             type="file"
//             accept=".pdf,.txt"
//             style={{ display: 'none' }}
//             onChange={e => { setFile(e.target.files[0] || null); setError(''); }}
//           />
//           <button
//             className="btn btn-primary btn-full"
//             onClick={handleFileUpload}
//             disabled={loading || !file}
//           >
//             {loading ? <><Loader size={14} className="vi-spin" /> Analysing JD…</> : 'Upload & Parse'}
//           </button>
//         </>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    JD PARSED VIEW — shows skills, role etc.
// ───────────────────────────────────────── */
// const JDParsedView = ({ jd, onGenerateQuestions, onReplace, generating }) => {
//   const [qType,  setQType]  = useState('mixed');
//   const [qCount, setQCount] = useState('8');
//   const [mode,   setMode]   = useState('normal');

//   const parsed = jd.parsedJson || {};

//   const handleGenerate = () => {
//     const count = Math.max(3, Math.min(20, Number(qCount) || 8));
//     onGenerateQuestions(count, qType, mode);
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Role summary */}
//       <div style={{
//         background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
//         borderRadius: 12, padding: '14px 16px',
//       }}>
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
//           <div>
//             <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//               {parsed.title || 'Job Description'}
//             </div>
//             {parsed.company && (
//               <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{parsed.company}</div>
//             )}
//           </div>
//           <button
//             className="btn btn-ghost btn-sm"
//             onClick={onReplace}
//             style={{ fontSize: 11 }}
//           >
//             <RotateCcw size={12} /> Replace
//           </button>
//         </div>
//         {parsed.domain && (
//           <span className="badge badge-warning" style={{ fontSize: 11 }}>{parsed.domain}</span>
//         )}
//         {parsed.experience && (
//           <span className="badge badge-muted" style={{ fontSize: 11, marginLeft: 6 }}>{parsed.experience}</span>
//         )}
//       </div>

//       {/* Skills */}
//       {parsed.skills?.length > 0 && (
//         <Collapsible title={`🛠 Skills (${parsed.skills.length})`} defaultOpen>
//           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
//             {parsed.skills.slice(0, 20).map((s, i) => (
//               <span key={i} className="badge badge-blue" style={{ fontSize: 11 }}>{s}</span>
//             ))}
//           </div>
//         </Collapsible>
//       )}

//       {/* Keywords */}
//       {parsed.keywords?.length > 0 && (
//         <Collapsible title="🔑 Key Terms">
//           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
//             {parsed.keywords.slice(0, 15).map((k, i) => (
//               <span key={i} className="badge badge-muted" style={{ fontSize: 11 }}>{k}</span>
//             ))}
//           </div>
//         </Collapsible>
//       )}

//       {/* Question config */}
//       <div style={{
//         background: 'var(--surface-2)', border: '1px solid var(--border)',
//         borderRadius: 12, padding: '16px',
//       }}>
//         <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
//           Generate Interview Questions
//         </div>

//         {/* Question type */}
//         <div style={{ marginBottom: 14 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Question Focus</div>
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//             {QUESTION_TYPES.map(qt => (
//               <button
//                 key={qt.key}
//                 onClick={() => setQType(qt.key)}
//                 style={{
//                   display: 'flex', alignItems: 'center', gap: 10,
//                   padding: '9px 12px', textAlign: 'left',
//                   background: qType === qt.key ? 'var(--primary-dim)' : 'var(--surface)',
//                   border: `1px solid ${qType === qt.key ? 'var(--primary)' : 'var(--border)'}`,
//                   borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
//                   color: qType === qt.key ? 'var(--primary)' : 'var(--text-secondary)',
//                   transition: 'var(--transition)',
//                 }}
//               >
//                 <div style={{
//                   width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
//                   background: qType === qt.key ? 'var(--primary)' : 'var(--border)',
//                 }} />
//                 <div>
//                   <div style={{ fontSize: 12, fontWeight: 700 }}>{qt.label}</div>
//                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{qt.desc}</div>
//                 </div>
//               </button>
//             ))}
//           </div>
//         </div>

//         {/* Count */}
//         <div style={{ marginBottom: 14 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Number of Questions</div>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//             <input
//               className="input" type="number" min={3} max={20}
//               value={qCount} onChange={e => setQCount(e.target.value)}
//               style={{ maxWidth: 80, fontSize: 13 }}
//             />
//             <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>3 – 20 questions</span>
//           </div>
//         </div>

//         {/* Practice mode */}
//         <div style={{ marginBottom: 16 }}>
//           <div className="form-label" style={{ marginBottom: 6 }}>Practice Mode</div>
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
//             {PRACTICE_MODES.map(pm => (
//               <button
//                 key={pm.key}
//                 onClick={() => setMode(pm.key)}
//                 style={{
//                   display: 'flex', alignItems: 'center', gap: 10,
//                   padding: '9px 12px', textAlign: 'left',
//                   background: mode === pm.key ? 'var(--primary-dim)' : 'var(--surface)',
//                   border: `1px solid ${mode === pm.key ? 'var(--primary)' : 'var(--border)'}`,
//                   borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
//                   color: mode === pm.key ? 'var(--primary)' : 'var(--text-secondary)',
//                   transition: 'var(--transition)',
//                 }}
//               >
//                 <div style={{ color: 'inherit', flexShrink: 0 }}>{pm.icon}</div>
//                 <div>
//                   <div style={{ fontSize: 12, fontWeight: 700 }}>{pm.label}</div>
//                   <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{pm.desc}</div>
//                 </div>
//               </button>
//             ))}
//           </div>
//         </div>

//         <button
//           className="btn btn-primary btn-full"
//           onClick={handleGenerate}
//           disabled={generating}
//         >
//           {generating
//             ? <><Loader size={14} className="vi-spin" /> Generating…</>
//             : <><Send size={14} /> Generate Questions</>}
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    NORMAL TEXT PRACTICE (JD)
// ───────────────────────────────────────── */
// const JDNormalPractice = ({ questions, onDone }) => {
//   const [answers,  setAnswers]  = useState({});
//   const [idx,      setIdx]      = useState(0);
//   const [finished, setFinished] = useState(false);

//   const q = questions[idx];

//   const handleNext = () => {
//     if (idx + 1 >= questions.length) setFinished(true);
//     else setIdx(i => i + 1);
//   };

//   if (finished) {
//     return (
//       <div style={{ textAlign: 'center', padding: '40px 24px' }}>
//         <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
//         <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
//           Practice Complete!
//         </div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
//           You've answered all {questions.length} questions
//         </div>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 240, margin: '0 auto' }}>
//           <button className="btn btn-primary" onClick={() => { setIdx(0); setAnswers({}); setFinished(false); }}>
//             <RotateCcw size={14} /> Practice Again
//           </button>
//           <button className="btn btn-ghost" onClick={onDone}>
//             Back to JD Setup
//           </button>
//         </div>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Progress */}
//       <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{
//           height: '100%', background: 'var(--warning)',
//           width: `${((idx) / questions.length) * 100}%`,
//           transition: 'width 0.3s ease',
//         }} />
//       </div>
//       <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
//         Question {idx + 1} of {questions.length}
//       </div>

//       {/* Question */}
//       <div style={{
//         background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
//         borderRadius: 12, padding: '14px 16px',
//       }}>
//         <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
//           {q.category && <span className="badge badge-warning" style={{ fontSize: 10 }}>{q.category}</span>}
//           {q.difficulty && <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-yellow' : 'badge-danger'}`} style={{ fontSize: 10 }}>{q.difficulty}</span>}
//           {q.skill_tested && <span className="badge badge-muted" style={{ fontSize: 10 }}>{q.skill_tested}</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {q.question}
//         </div>
//         {q.tip && (
//           <div style={{
//             marginTop: 10, fontSize: 12, color: 'var(--accent)',
//             background: 'rgba(167,139,250,0.08)', borderRadius: 8,
//             padding: '8px 12px', borderLeft: '2px solid var(--accent)',
//           }}>
//             💡 Tip: {q.tip}
//           </div>
//         )}
//       </div>

//       {/* Answer */}
//       <textarea
//         className="input"
//         value={answers[q.id] || ''}
//         onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
//         placeholder="Type your answer… (this is practice — no grading)"
//         style={{ minHeight: 120, fontSize: 13, lineHeight: 1.7, resize: 'vertical' }}
//       />

//       <div style={{ display: 'flex', gap: 10 }}>
//         {idx > 0 && (
//           <button className="btn btn-ghost" onClick={() => setIdx(i => i - 1)}>
//             <ArrowLeft size={14} /> Back
//           </button>
//         )}
//         <button className="btn btn-primary btn-full" onClick={handleNext}>
//           {idx + 1 >= questions.length ? '🎉 Finish' : 'Next Question →'}
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VOICE PRACTICE (JD) — simple TTS+STT loop
//    Reuses the same pattern as VoiceInterview
//    but self-contained, no submit to backend.
// ───────────────────────────────────────── */
// const SILENCE_MS = 10_000;

// const JDVoicePractice = ({ questions, onDone }) => {
//   const [idx,          setIdx]          = useState(0);
//   const [phase,        setPhase]        = useState('reading'); // reading|buffering|listening|done
//   const [transcript,   setTranscript]   = useState('');
//   const [savedAnswers, setSavedAnswers] = useState({});
//   const [muteTTS,      setMuteTTS]      = useState(false);
//   const [countdown,    setCountdown]    = useState(SILENCE_MS / 1000);

//   const recRef     = useRef(null);
//   const silRef     = useRef(null);
//   const cdRef      = useRef(null);
//   const baseRef    = useRef('');
//   const ttsRef     = useRef(null);
//   const bufferRef  = useRef(null);
//   const advRef     = useRef(false);

//   const q = questions[idx];

//   const stopTimers = useCallback(() => {
//     if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
//     if (cdRef.current)  { clearInterval(cdRef.current); cdRef.current = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recRef.current?.stop(); } catch {}
//     recRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//   }, []);

//   const saveAndAdvance = useCallback((text) => {
//     if (advRef.current) return;
//     advRef.current = true;
//     stopSTT();
//     const answer = text.trim();
//     setSavedAnswers(prev => ({ ...prev, [questions[idx]?.id]: answer }));
//     baseRef.current = '';
//     setTranscript('');
//     if (idx + 1 >= questions.length) {
//       setPhase('done');
//     } else {
//       setIdx(i => i + 1);
//       setPhase('reading');
//       advRef.current = false;
//     }
//   }, [idx, questions, stopSTT]);

//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     let r = SILENCE_MS / 1000;
//     setCountdown(r);
//     cdRef.current = setInterval(() => {
//       r -= 1;
//       setCountdown(Math.max(0, r));
//       if (r <= 0) { clearInterval(cdRef.current); cdRef.current = null; }
//     }, 1000);
//     silRef.current = setTimeout(() => saveAndAdvance(baseRef.current), SILENCE_MS);
//   }, [stopTimers, saveAndAdvance]);

//   const startSTT = useCallback(() => {
//     if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
//       alert('Speech recognition not supported. Try Chrome or Edge.');
//       return;
//     }
//     stopSTT();
//     advRef.current = false;
//     baseRef.current = '';
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
//     rec.onstart = () => { setPhase('listening'); startSilenceTimer(); };
//     rec.onresult = (ev) => {
//       stopTimers();
//       startSilenceTimer();
//       let interim = '', final = '';
//       for (let i = ev.resultIndex; i < ev.results.length; i++) {
//         const t = ev.results[i]?.[0]?.transcript || '';
//         if (ev.results[i].isFinal) final += t; else interim += t;
//       }
//       const base = baseRef.current;
//       const spoken = `${final} ${interim}`.trim();
//       const sp = base.trim() && spoken ? ' ' : '';
//       setTranscript(base + sp + spoken);
//       if (final.trim()) baseRef.current = (base + (base.trim() ? ' ' : '') + final.trim()).trim();
//     };
//     rec.onerror = () => stopTimers();
//     rec.onend   = () => {};
//     recRef.current = rec;
//     try { rec.start(); } catch (e) { console.error(e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   const startBuffer = useCallback(() => {
//     setPhase('buffering');
//     bufferRef.current = setTimeout(() => { bufferRef.current = null; startSTT(); }, 800);
//   }, [startSTT]);

//   const readQuestion = useCallback((question) => {
//     stopTTS();
//     if (!('speechSynthesis' in window) || muteTTS) { startBuffer(); return; }
//     const u = new SpeechSynthesisUtterance(question.question);
//     u.rate = 0.95;
//     u.onend = () => startBuffer();
//     u.onerror = () => startBuffer();
//     window.speechSynthesis.speak(u);
//   }, [muteTTS, stopTTS, startBuffer]);

//   useEffect(() => {
//     if (phase !== 'reading' || !q) return;
//     readQuestion(q);
//   }, [idx, phase, readQuestion, q]);

//   useEffect(() => () => { stopSTT(); stopTTS(); }, [stopSTT, stopTTS]);

//   if (phase === 'done') {
//     return (
//       <div style={{ textAlign: 'center', padding: '40px 24px' }}>
//         <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
//         <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Voice Practice Done!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
//           {Object.values(savedAnswers).filter(Boolean).length} of {questions.length} answered
//         </div>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 220, margin: '0 auto' }}>
//           <button className="btn btn-primary" onClick={() => { setIdx(0); setSavedAnswers({}); setPhase('reading'); advRef.current = false; }}>
//             <RotateCcw size={14} /> Practice Again
//           </button>
//           <button className="btn btn-ghost" onClick={onDone}>Back to JD Setup</button>
//         </div>
//       </div>
//     );
//   }

//   if (!q) return null;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Progress */}
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
//           {idx + 1} / {questions.length}
//         </span>
//         <button
//           className="btn btn-ghost btn-sm"
//           onClick={() => {
//             if (phase === 'reading' && window.speechSynthesis) {
//               window.speechSynthesis.cancel();
//               setMuteTTS(m => !m);
//               startBuffer();
//             } else {
//               setMuteTTS(m => !m);
//             }
//           }}
//           title={muteTTS ? 'Enable TTS' : 'Mute TTS'}
//         >
//           {muteTTS ? <VolumeX size={14} /> : <Volume2 size={14} />}
//         </button>
//       </div>

//       {/* Question */}
//       <div style={{
//         background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
//         borderRadius: 12, padding: '14px 16px',
//       }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
//           {q.category && <span className="badge badge-warning" style={{ fontSize: 10 }}>{q.category}</span>}
//           {phase === 'reading' && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//           {phase === 'listening' && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>🎙 Listening…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {q.question}
//         </div>
//         {q.tip && (
//           <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'rgba(167,139,250,0.08)', borderRadius: 8, padding: '7px 12px', borderLeft: '2px solid var(--accent)' }}>
//             💡 {q.tip}
//           </div>
//         )}
//       </div>

//       {/* Transcript */}
//       <div style={{
//         minHeight: 100, background: 'var(--surface-2)', border: '1px solid var(--border)',
//         borderRadius: 12, padding: '12px 14px',
//       }}>
//         {transcript
//           ? <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcript}</p>
//           : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
//               {phase === 'listening' ? 'Speak now — your answer appears here…' : 'Waiting…'}
//             </p>
//         }
//       </div>

//       {/* Controls */}
//       <div style={{ display: 'flex', gap: 8 }}>
//         {phase === 'reading' && (
//           <button className="btn btn-ghost btn-full" onClick={() => { stopTTS(); startBuffer(); }}>
//             <Volume2 size={14} /> Skip Reading
//           </button>
//         )}
//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance('')}>
//               <SkipForward size={14} /> Skip
//             </button>
//             <button className="btn btn-primary btn-full" onClick={() => {
//               if (bufferRef.current) { clearTimeout(bufferRef.current); bufferRef.current = null; }
//               startSTT();
//             }}>
//               <Mic size={14} /> Start Now
//             </button>
//           </>
//         )}
//         {phase === 'listening' && (
//           <>
//             <div style={{
//               display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
//               color: 'var(--text-muted)', padding: '0 4px',
//             }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease infinite' }} />
//               {countdown}s silence = auto-next
//             </div>
//             <div style={{ flex: 1 }} />
//             <button className="btn btn-ghost" onClick={() => saveAndAdvance(baseRef.current)}>
//               <SkipForward size={14} /> Skip
//             </button>
//             <button className="btn btn-primary" onClick={() => saveAndAdvance(transcript)}>
//               <CheckCircle size={14} />
//               {idx + 1 >= questions.length ? 'Finish' : 'Next'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    VIDEO PRACTICE (JD)
//    Reuses QuestionRecorder pattern, self-contained.
//    No backend save — pure client-side practice.
// ───────────────────────────────────────── */
// const MAX_SECS = 180;

// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.92;
//     u.onend = onEnd; u.onerror = onEnd;
//     window.speechSynthesis.speak(u);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch { onEnd(); return () => {}; }
// };

// const JDVideoRecorder = ({ question, mediaMode = 'video', onNext, isLast }) => {
//   const [phase,   setPhase]   = useState('ready');  // ready|recording|preview|done
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   useEffect(() => {
//     const cancel = safeTTS(question.question, () => setReading(false));
//     return () => { cancel(); };
//   }, [question.question]);

//   useEffect(() => () => {
//     stopStream();
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const stopStream = () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     streamRef.current = null;
//   };

//   const startRecording = async () => {
//     setError('');
//     try {
//       const c = mediaMode === 'video'
//         ? { video: { facingMode: 'user' }, audio: true }
//         : { audio: true };
//       const s = await navigator.mediaDevices.getUserMedia(c);
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') {
//         videoRef.current.srcObject = s;
//         videoRef.current.play().catch(() => {});
//       }
//     } catch {
//       setError('Permission denied. Please allow camera/mic and retry.');
//       return;
//     }
//     chunksRef.current = [];
//     const mime = mediaMode === 'video'
//       ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
//       : 'audio/webm';
//     const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       setBlob(new Blob(chunksRef.current, { type: mime }));
//       stopStream();
//       setPhase('preview');
//     };
//     recRef.current = rec;
//     rec.start(100);
//     setPhase('recording');
//     setElapsed(0);
//     timerRef.current = setInterval(() => {
//       setElapsed(p => {
//         if (p + 1 >= MAX_SECS) { stopRecording(); return MAX_SECS; }
//         return p + 1;
//       });
//     }, 1000);
//   };

//   const stopRecording = () => {
//     if (recRef.current?.state !== 'inactive') recRef.current?.stop();
//     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
//   };

//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
//   const reRecord = () => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}

//       {/* Question */}
//       <div style={{
//         background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
//         borderRadius: 10, padding: '12px 16px',
//       }}>
//         <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
//           {question.category && <span className="badge badge-warning" style={{ fontSize: 10 }}>{question.category}</span>}
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {question.question}
//         </div>
//       </div>

//       {/* Camera / audio indicator */}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(244,63,94,0.9)', color: 'white', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'pulse 1s ease infinite' }} />
//               {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 100, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 48, height: 48, borderRadius: '50%', background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)', border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
//             {phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}
//           </div>
//         </div>
//       )}

//       {/* Preview */}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
//               <audio ref={previewRef} controls style={{ width: '100%' }} />
//             </div>
//       )}

//       {/* Controls */}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading…' : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={() => onNext()} title="Skip">
//             <SkipForward size={15} />
//           </button>
//         </div>
//       )}
//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)', color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}
//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={reRecord}><RotateCcw size={14} /> Re-record</button>
//           <button className="btn btn-primary flex-1" onClick={() => onNext()}>
//             {isLast ? '🎉 Finish' : <>Next <ChevronRight size={14} /></>}
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// const JDVideoPractice = ({ questions, mediaMode = 'video', onDone }) => {
//   const [idx,      setIdx]      = useState(0);
//   const [finished, setFinished] = useState(false);

//   if (finished) {
//     return (
//       <div style={{ textAlign: 'center', padding: '40px 24px' }}>
//         <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
//         <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Video Practice Done!</div>
//         <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>All {questions.length} questions completed</div>
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 220, margin: '0 auto' }}>
//           <button className="btn btn-primary" onClick={() => { setIdx(0); setFinished(false); }}>
//             <RotateCcw size={14} /> Practice Again
//           </button>
//           <button className="btn btn-ghost" onClick={onDone}>Back to JD Setup</button>
//         </div>
//       </div>
//     );
//   }

//   const q = questions[idx];
//   if (!q) return null;

//   const handleNext = () => {
//     if (idx + 1 >= questions.length) setFinished(true);
//     else setIdx(i => i + 1);
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {/* Progress */}
//       <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%', background: 'var(--warning)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
//         </div>
//         <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}/{questions.length}</span>
//       </div>

//       <JDVideoRecorder
//         key={`jd-video-${idx}`}
//         question={q}
//         mediaMode={mediaMode}
//         onNext={handleNext}
//         isLast={idx + 1 >= questions.length}
//       />
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN COMPONENT
// ───────────────────────────────────────── */
// const JDInterviewPanel = ({ chat, chatId, onClose }) => {
//   const [jd,         setJD]         = useState(null);  // null | { parsedJson, ... }
//   const [loadingJD,  setLoadingJD]  = useState(true);
//   const [questions,  setQuestions]  = useState([]);
//   const [generating, setGenerating] = useState(false);
//   const [practiceMode, setPracticeMode] = useState(null); // null | 'normal' | 'voice' | 'video'
//   const [videoMediaMode, setVideoMediaMode] = useState('video');
//   const [error,      setError]      = useState('');
//   const [showUpload, setShowUpload] = useState(false);

//   // Load existing JD on mount
//   useEffect(() => {
//     jdAPI.getJD(chatId)
//       .then(res => { setJD(res.data); setLoadingJD(false); })
//       .catch(() => { setJD(null); setLoadingJD(false); });
//   }, [chatId]);

//   const handleUploaded = (data) => {
//     setJD(data);
//     setShowUpload(false);
//     setQuestions([]);
//     setPracticeMode(null);
//   };

//   const handleGenerateQuestions = async (count, type, mode) => {
//     setGenerating(true);
//     setError('');
//     try {
//       const res = await jdAPI.generateQuestions(chatId, count, type);
//       setQuestions(res.data.questions || []);
//       // Determine video media mode before starting
//       if (mode === 'video') setVideoMediaMode('video');
//       setPracticeMode(mode);
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally { setGenerating(false); }
//   };

//   const handleDeleteJD = async () => {
//     if (!window.confirm('Delete the current JD? This cannot be undone.')) return;
//     try {
//       await jdAPI.deleteJD(chatId);
//       setJD(null);
//       setQuestions([]);
//       setPracticeMode(null);
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     }
//   };

//   // ── Render ──────────────────────────────────────────────────────────────────
//   const showContent = () => {
//     if (loadingJD) {
//       return (
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
//           <Loader size={20} className="vi-spin" style={{ color: 'var(--warning)' }} />
//           <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</span>
//         </div>
//       );
//     }

//     // Active practice session
//     if (practiceMode && questions.length > 0) {
//       return (
//         <>
//           {/* Back button */}
//           <div style={{ marginBottom: 16 }}>
//             <button
//               className="btn btn-ghost btn-sm"
//               onClick={() => setPracticeMode(null)}
//             >
//               <ArrowLeft size={14} /> Back to JD Setup
//             </button>
//           </div>

//           {/* Practice mode header */}
//           <div style={{
//             display: 'flex', alignItems: 'center', gap: 8,
//             marginBottom: 16, padding: '8px 12px',
//             background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
//             borderRadius: 10, fontSize: 13, fontWeight: 600, color: 'var(--warning)',
//           }}>
//             {practiceMode === 'video' ? <Video size={14} /> : practiceMode === 'voice' ? <Mic size={14} /> : <BookOpen size={14} />}
//             {practiceMode === 'video' ? 'Video Practice' : practiceMode === 'voice' ? 'Voice Practice' : 'Text Practice'}
//             <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
//               · {questions.length} questions
//             </span>
//           </div>

//           {practiceMode === 'normal' && (
//             <JDNormalPractice
//               questions={questions}
//               onDone={() => setPracticeMode(null)}
//             />
//           )}
//           {practiceMode === 'voice' && (
//             <JDVoicePractice
//               questions={questions}
//               onDone={() => setPracticeMode(null)}
//             />
//           )}
//           {practiceMode === 'video' && (
//             <JDVideoPractice
//               questions={questions}
//               mediaMode={videoMediaMode}
//               onDone={() => setPracticeMode(null)}
//             />
//           )}
//         </>
//       );
//     }

//     // Upload new JD
//     if (!jd || showUpload) {
//       return (
//         <JDUploadView
//           chatId={chatId}
//           onUploaded={handleUploaded}
//           existingJD={jd}
//         />
//       );
//     }

//     // Parsed JD — generate questions
//     return (
//       <JDParsedView
//         jd={jd}
//         onGenerateQuestions={handleGenerateQuestions}
//         onReplace={() => setShowUpload(true)}
//         generating={generating}
//       />
//     );
//   };

//   return (
//     <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
//       <div style={{
//         width: '100%', maxWidth: 560, maxHeight: '94vh',
//         background: 'var(--surface)', border: '1px solid var(--border)',
//         borderRadius: 24, display: 'flex', flexDirection: 'column',
//         boxShadow: 'var(--shadow-lg)', animation: 'modalSlide 0.25s ease',
//       }}>
//         {/* Header */}
//         <div style={{
//           display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//           padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
//         }}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//             <div style={{
//               width: 32, height: 32, borderRadius: 9,
//               background: 'rgba(245,158,11,0.12)', display: 'flex',
//               alignItems: 'center', justifyContent: 'center',
//             }}>
//               <Briefcase size={16} style={{ color: 'var(--warning)' }} />
//             </div>
//             <div>
//               <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//                 JD Interview Prep
//               </div>
//               <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
//                 {chat?.examType} · Practice for your job interview
//               </div>
//             </div>
//           </div>
//           <div style={{ display: 'flex', gap: 6 }}>
//             {jd && !showUpload && !practiceMode && (
//               <button
//                 className="btn btn-ghost btn-sm"
//                 onClick={handleDeleteJD}
//                 title="Delete JD"
//                 style={{ color: 'var(--danger)' }}
//               >
//                 <Trash2 size={13} />
//               </button>
//             )}
//             <button className="btn-icon" onClick={onClose}><X size={18} /></button>
//           </div>
//         </div>

//         {/* Error */}
//         {error && (
//           <div className="error-box" style={{ margin: '12px 24px 0' }}>{error}</div>
//         )}

//         {/* Body */}
//         <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
//           {showContent()}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default JDInterviewPanel;