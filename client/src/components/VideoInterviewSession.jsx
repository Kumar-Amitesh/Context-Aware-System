import React, { useState, useEffect, useRef } from 'react';
import {
  X, Video, Mic, Square, Play, Loader,
  RotateCcw, Volume2, ChevronDown, ChevronUp,
  CheckCircle, AlertCircle, SkipForward, ChevronRight
} from 'lucide-react';

/* ─────────────────────────────────────────
   SCORE RING
───────────────────────────────────────── */
const ScoreRing = ({ score, size = 64, label }) => {
  const r    = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(10, score || 0)) / 10;
  const dash = circ * pct;
  const color = pct >= 0.7 ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
          style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
            fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: 'var(--mono)' }}>
          {score != null ? Number(score).toFixed(1) : '—'}
        </text>
      </svg>
      {label && <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{label}</span>}
    </div>
  );
};

/* ─────────────────────────────────────────
   SCORE BAR
───────────────────────────────────────── */
const ScoreBar = ({ label, score, max = 10 }) => {
  const pct   = Math.max(0, Math.min(max, score || 0)) / max * 100;
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>
          {score != null ? `${score}/${max}` : '—'}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          borderRadius: 99, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   COLLAPSIBLE
───────────────────────────────────────── */
const Collapsible = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '12px 16px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)',
      }}>
        {title}
        {open
          ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
          : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && <div style={{ padding: '0 16px 14px' }}>{children}</div>}
    </div>
  );
};

/* ─────────────────────────────────────────
   FEEDBACK VIEW
───────────────────────────────────────── */
const FeedbackView = ({ feedback, onRetry, onNext, isLast }) => {
  const f = feedback;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Overall Score</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
            {f.overallScore != null ? Number(f.overallScore).toFixed(1) : '—'}
            <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <ScoreRing score={f.content?.answerRelevance} label="Relevance" />
          <ScoreRing score={f.delivery?.clarity} label="Clarity" />
          <ScoreRing score={f.naturalness?.score} label="Naturalness" />
          {f.visual?.eyeContactEngagement != null && (
            <ScoreRing score={f.visual.eyeContactEngagement} label="Eye Contact" />
          )}
        </div>
      </div>

      {f.question && (
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: 8 }}>Q:</span>
          {f.question}
        </div>
      )}

      {f.transcript && (
        <Collapsible title="📝 Your Transcript">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{f.transcript}</p>
        </Collapsible>
      )}

      {f.content && (
        <Collapsible title="📚 Content Quality" defaultOpen>
          <ScoreBar label="Answer Relevance" score={f.content.answerRelevance} />
          <ScoreBar label="Completeness" score={f.content.completeness} />
          <ScoreBar label="Structure & Flow" score={f.content.structure} />
          <ScoreBar label="Examples & Specificity" score={f.content.examplesSpecificity} />
        </Collapsible>
      )}

      {f.delivery && (
        <Collapsible title="🎤 Delivery" defaultOpen>
          <ScoreBar label="Clarity" score={f.delivery.clarity} />
          <ScoreBar label="Confidence & Presentation" score={f.delivery.confidencePresentation} />
          <ScoreBar label="Pacing" score={f.delivery.pacing} />
          <ScoreBar label="Filler Words (fewer = better)" score={f.delivery.fillerWords} />
        </Collapsible>
      )}

      {f.visual && (f.visual.eyeContactEngagement != null || f.visual.postureProfessionalism != null) && (
        <Collapsible title="👁 Visual Presence">
          {f.visual.eyeContactEngagement != null && (
            <ScoreBar label="Eye Contact & Engagement" score={f.visual.eyeContactEngagement} />
          )}
          {f.visual.postureProfessionalism != null && (
            <ScoreBar label="Posture & Professionalism" score={f.visual.postureProfessionalism} />
          )}
        </Collapsible>
      )}

      {f.naturalness && (
        <Collapsible title="✨ Answer Naturalness">
          <ScoreBar label="Naturalness Score" score={f.naturalness.score} />
          {f.naturalness.notes && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{f.naturalness.notes}</p>
          )}
        </Collapsible>
      )}

      {(f.strengths?.length || f.improvements?.length) && (
        <Collapsible title="💡 Coaching Notes" defaultOpen>
          {f.strengths?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>What worked well</div>
              {f.strengths.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> {s}
                </div>
              ))}
            </div>
          )}
          {f.improvements?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>Areas to improve</div>
              {f.improvements.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} /> {s}
                </div>
              ))}
            </div>
          )}
        </Collapsible>
      )}

      {f.suggestedBetterAnswer && (
        <Collapsible title="🌟 Suggested Stronger Answer">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{f.suggestedBetterAnswer}</p>
        </Collapsible>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button className="btn btn-ghost flex-1" onClick={onRetry}>
          <RotateCcw size={14} /> Re-record
        </button>
        <button className="btn btn-primary flex-1" onClick={onNext}>
          {isLast ? '🎯 View Full Results' : <>Next Question <ChevronRight size={14} /></>}
        </button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   QUESTION RECORDER
───────────────────────────────────────── */
const MAX_SECS = 180;

// Safe TTS — never throws, silently skips if unsupported
const safeTTS = (text, onEnd) => {
  try {
    if (!window.speechSynthesis) { onEnd(); return () => {}; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.onend = onEnd;
    utt.onerror = onEnd;
    window.speechSynthesis.speak(utt);
    return () => { try { window.speechSynthesis.cancel(); } catch {} };
  } catch {
    onEnd();
    return () => {};
  }
};

const QuestionRecorder = ({ question, questionObj, chatId, mediaMode, onFeedback, onSkip }) => {
  const [phase,   setPhase]   = useState('ready');   // ready|recording|preview|submitting|error
  const [elapsed, setElapsed] = useState(0);
  const [blob,    setBlob]    = useState(null);
  const [error,   setError]   = useState('');
  const [reading, setReading] = useState(true);      // TTS in progress

  const videoRef   = useRef(null);
  const previewRef = useRef(null);
  const streamRef  = useRef(null);
  const recRef     = useRef(null);
  const chunksRef  = useRef([]);
  const timerRef   = useRef(null);
  const cancelTTS  = useRef(() => {});

  /* TTS — read question on mount, silent fallback */
  useEffect(() => {
    cancelTTS.current = safeTTS(question, () => setReading(false));
    return () => { cancelTTS.current(); };
  }, [question]);

  const skipReading = () => {
    cancelTTS.current();
    setReading(false);
  };

  useEffect(() => () => {
    stopStream();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startStream = async () => {
    try {
      const constraints = mediaMode === 'video'
        ? { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }
        : { audio: true };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      if (videoRef.current && mediaMode === 'video') {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Camera/microphone permission denied. Please allow access and retry.');
    }
  };

  const startRecording = async () => {
    setError('');
    await startStream();
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mime = mediaMode === 'video'
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: mime }));
      stopStream();
      setPhase('preview');
    };
    recRef.current = rec;
    rec.start(100);
    setPhase('recording');
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(p => {
        if (p + 1 >= MAX_SECS) { stopRecording(); return MAX_SECS; }
        return p + 1;
      });
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
    setPhase('submitting');
    setError('');
    try {
      const form = new FormData();
      form.append('media', blob, 'recording.webm');
      form.append('question', question);
      form.append('media_type', mediaMode);
      form.append('topic', questionObj?.topic || '');
      form.append('bloom_level', questionObj?.bloomLevel || '');

      const res  = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Evaluation failed');
      onFeedback(data.feedback);
    } catch (err) {
      setError(err.message);
      setPhase('preview');
    }
  };

  const reRecord = () => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); };

  const fmtTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="error-box">{error}</div>}

      {/* Question card */}
      <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
        borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
            {questionObj?.topic && <span className="badge badge-muted" style={{ fontSize: 10 }}>{questionObj.topic}</span>}
            {questionObj?.bloomLevel && <span className="badge badge-blue" style={{ fontSize: 10 }}>{questionObj.bloomLevel}</span>}
          </div>
          {/* Skip reading button — shown while TTS is active */}
          {reading && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={skipReading}
              style={{ fontSize: 11, padding: '3px 8px', height: 'auto' }}
            >
              Skip reading
            </button>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
          {question}
        </div>
      </div>

      {/* Camera preview — compact, not full-width tall */}
      {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 360,          // cap width so it doesn't dominate
          margin: '0 auto',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#000',
          aspectRatio: '4/3',    // more compact than 16/9
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {phase === 'recording' && (
            <div style={{ position: 'absolute', top: 8, right: 8,
              background: 'rgba(244,63,94,0.9)', color: 'white',
              padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white',
                animation: 'pulse 1s ease infinite' }} />
              {fmtTime(elapsed)}
            </div>
          )}
        </div>
      )}

      {/* Audio indicator */}
      {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
        <div style={{ height: 100, background: 'var(--surface-2)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%',
            background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)',
            border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
            <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}
          </div>
        </div>
      )}

      {/* Timer bar */}
      {phase === 'recording' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
            color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>{fmtTime(elapsed)}</span><span>Max {fmtTime(MAX_SECS)}</span>
          </div>
          <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, transition: 'width 1s linear',
              background: elapsed > MAX_SECS * 0.8 ? 'var(--danger)' : 'var(--primary)',
              width: `${(elapsed / MAX_SECS) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Blob preview */}
      {phase === 'preview' && blob && (
        mediaMode === 'video'
          ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
          : <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10 }}>
              <Volume2 size={24} style={{ color: 'var(--primary)' }} />
              <audio ref={previewRef} controls style={{ width: '100%' }} />
            </div>
      )}

      {/* Controls */}
      {phase === 'ready' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
            {reading ? '🔊 Reading question…'
              : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
          </button>
          <button className="btn btn-ghost" onClick={onSkip} title="Skip question"
            style={{ padding: '0 16px', flexShrink: 0 }}>
            <SkipForward size={15} />
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <button className="btn btn-full btn-lg" onClick={stopRecording}
          style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)',
            color: 'var(--danger)', fontWeight: 700 }}>
          <Square size={14} fill="var(--danger)" /> Stop Recording
        </button>
      )}

      {phase === 'preview' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost flex-1" onClick={reRecord}>
            <RotateCcw size={14} /> Re-record
          </button>
          <button className="btn btn-primary flex-1" onClick={submitAnswer}>
            <Play size={14} /> Submit for Feedback
          </button>
        </div>
      )}

      {phase === 'submitting' && (
        <div style={{ minHeight: 80, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
          <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Analysing your response…</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Takes 10–20 seconds.</div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   MAIN — VideoInterviewSession
───────────────────────────────────────── */
const VideoInterviewSession = ({
  questions, chatId, sessionId, mediaMode = 'video', onFinished, onExit,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase,      setPhase]      = useState('recording');
  const [currentFb,  setCurrentFb]  = useState(null);
  const [allResults, setAllResults]  = useState([]);
  const [saving,     setSaving]      = useState(false);

  const total   = questions.length;
  const current = questions[currentIdx];

  /* Exit mid-session — save whatever answered so far, then leave */
  const handleExit = () => {
    if (allResults.length === 0) {
      onExit();
      return;
    }
    finishSession(allResults, true); // true = exitAfterSave
  };

  const handleFeedback = (feedback) => {
    const result = { question: current, feedback };
    setAllResults(prev => [...prev, result]);
    setCurrentFb(feedback);
    setPhase('feedback');
  };

  const handleSkip = () => {
    const result = { question: current, feedback: null, skipped: true };
    const next = [...allResults, result];
    setAllResults(next);
    advanceOrFinish(next);
  };

  const handleReRecord = () => {
    setAllResults(prev => prev.slice(0, -1));
    setCurrentFb(null);
    setPhase('recording');
  };

  const handleNext = () => { advanceOrFinish(allResults); };

  const advanceOrFinish = (results) => {
    setCurrentFb(null);
    if (currentIdx + 1 >= total) {
      finishSession(results);
    } else {
      setCurrentIdx(i => i + 1);
      setPhase('recording');
    }
  };

  const finishSession = async (results, exitAfterSave = false) => {
    setSaving(true);

    const feedbackMap = {};
    let totalScore  = 0;
    let scoredCount = 0;

    results.forEach(({ question: q, feedback: fb, skipped }) => {
      if (!q?.id) return;
      if (skipped || !fb) {
        feedbackMap[q.id] = {
          type: 'video', topic: q.topic || 'General',
          question: q.question, userAnswer: '[Skipped]',
          correctAnswer: null, isCorrect: null,
          understandingScore: 0, overallScore: null,
          skipped: true, videoFeedback: null,
          bloomLevel: q.bloomLevel, difficulty: q.difficulty,
          awardedMarks: 0, maxMarks: 10,
        };
        return;
      }
      const score = fb.overallScore ?? 0;
      totalScore  += score;
      scoredCount += 1;
      feedbackMap[q.id] = {
        type: 'video', topic: q.topic || 'General',
        question: q.question,
        userAnswer: fb.transcript || '',
        correctAnswer: null, isCorrect: null,
        understandingScore: Math.round((score / 10) * 10),
        overallScore: score,
        videoFeedback: fb,
        bloomLevel: q.bloomLevel, difficulty: q.difficulty,
        awardedMarks: Math.round((score / 10) * 10 * 10) / 10,
        maxMarks: 10,
      };
    });

    const avgScore = scoredCount > 0
      ? Math.round((totalScore / scoredCount) * 10) / 10
      : 0;

    const answersMap = Object.fromEntries(
      results
        .filter(r => r.question?.id && !r.skipped)
        .map(r => [r.question.id, r.feedback?.transcript || ''])
    );

    try {
      await fetch(`http://localhost:5000/api/chats/${chatId}/video-session/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          session_id:   sessionId,
          questions,
          answers:      answersMap,
          feedback:     feedbackMap,
          score:        avgScore,
          session_type: 'video_full',
        }),
      });
    } catch (err) {
      console.warn('[VideoInterviewSession] save failed (non-fatal):', err);
    } finally {
      setSaving(false);
    }

    if (exitAfterSave) {
      onExit();
    } else {
      onFinished({ score: avgScore, results: feedbackMap, allResults: results });
    }
  };

  const progressPct = (currentIdx / total) * 100;

  if (saving) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Loader size={36} className="vi-spin" style={{ color: 'var(--primary)' }} />
        <div style={{ fontSize: 16, fontWeight: 700 }}>Saving your session…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {mediaMode === 'video' ? '🎥' : '🎤'} Video Interview
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Question {currentIdx + 1} of {total}
            {phase === 'feedback' && ' · Feedback'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleExit} style={{ color: 'var(--text-muted)' }}>
          <X size={14} /> Exit
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: 'var(--primary)',
          width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {phase === 'recording' && current && (
          <QuestionRecorder
            key={`${currentIdx}-recording`}
            question={current.question}
            questionObj={current}
            chatId={chatId}
            mediaMode={mediaMode}
            onFeedback={handleFeedback}
            onSkip={handleSkip}
          />
        )}

        {phase === 'feedback' && currentFb && (
          <FeedbackView
            feedback={currentFb}
            onRetry={handleReRecord}
            onNext={handleNext}
            isLast={currentIdx + 1 >= total}
          />
        )}
      </div>

      {/* Progress dots */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 5, justifyContent: 'center', flexShrink: 0 }}>
        {questions.map((_, i) => {
          const done   = i < currentIdx || (i === currentIdx && phase === 'feedback');
          const active = i === currentIdx;
          return (
            <div key={i} style={{
              width: active ? 20 : 8, height: 8, borderRadius: 99,
              background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--surface-3)',
              transition: 'all 0.3s ease',
            }} />
          );
        })}
      </div>
    </div>
  );
};

export default VideoInterviewSession;






















// import React, { useState, useEffect, useRef } from 'react';
// import {
//   X, Video, Mic, Square, Play, Loader,
//   RotateCcw, Volume2, ChevronDown, ChevronUp,
//   CheckCircle, AlertCircle, SkipForward, ChevronRight
// } from 'lucide-react';

// /* ─────────────────────────────────────────
//    SCORE RING
// ───────────────────────────────────────── */
// const ScoreRing = ({ score, size = 64, label }) => {
//   const r    = (size / 2) - 5;
//   const circ = 2 * Math.PI * r;
//   const pct  = Math.max(0, Math.min(10, score || 0)) / 10;
//   const dash = circ * pct;
//   const color = pct >= 0.7 ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
//       <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
//           strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
//           style={{ transition: 'stroke-dasharray 0.8s ease' }} />
//         <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
//           style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
//             fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: 'var(--mono)' }}>
//           {score != null ? Number(score).toFixed(1) : '—'}
//         </text>
//       </svg>
//       {label && <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{label}</span>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    SCORE BAR
// ───────────────────────────────────────── */
// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct   = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>
//           {score != null ? `${score}/${max}` : '—'}
//         </span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color,
//           borderRadius: 99, transition: 'width 0.7s ease' }} />
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    COLLAPSIBLE
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//       borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
//       <button onClick={() => setOpen(o => !o)} style={{
//         width: '100%', padding: '12px 16px', display: 'flex',
//         justifyContent: 'space-between', alignItems: 'center',
//         background: 'none', border: 'none', cursor: 'pointer',
//         color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)',
//       }}>
//         {title}
//         {open
//           ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
//           : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 16px 14px' }}>{children}</div>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    FEEDBACK VIEW
// ───────────────────────────────────────── */
// const FeedbackView = ({ feedback, onRetry, onNext, isLast }) => {
//   const f = feedback;
//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
//       <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//         borderRadius: 12, padding: '20px', marginBottom: 16,
//         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         flexWrap: 'wrap', gap: 16 }}>
//         <div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Overall Score</div>
//           <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
//             {f.overallScore != null ? Number(f.overallScore).toFixed(1) : '—'}
//             <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//           </div>
//         </div>
//         <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
//           <ScoreRing score={f.content?.answerRelevance} label="Relevance" />
//           <ScoreRing score={f.delivery?.clarity} label="Clarity" />
//           <ScoreRing score={f.naturalness?.score} label="Naturalness" />
//           {f.visual?.eyeContactEngagement != null && (
//             <ScoreRing score={f.visual.eyeContactEngagement} label="Eye Contact" />
//           )}
//         </div>
//       </div>

//       {f.question && (
//         <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
//           borderRadius: 10, padding: '10px 14px', marginBottom: 12,
//           fontSize: 13, color: 'var(--text-secondary)' }}>
//           <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: 8 }}>Q:</span>
//           {f.question}
//         </div>
//       )}

//       {f.transcript && (
//         <Collapsible title="📝 Your Transcript">
//           <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{f.transcript}</p>
//         </Collapsible>
//       )}

//       {f.content && (
//         <Collapsible title="📚 Content Quality" defaultOpen>
//           <ScoreBar label="Answer Relevance" score={f.content.answerRelevance} />
//           <ScoreBar label="Completeness" score={f.content.completeness} />
//           <ScoreBar label="Structure & Flow" score={f.content.structure} />
//           <ScoreBar label="Examples & Specificity" score={f.content.examplesSpecificity} />
//         </Collapsible>
//       )}

//       {f.delivery && (
//         <Collapsible title="🎤 Delivery" defaultOpen>
//           <ScoreBar label="Clarity" score={f.delivery.clarity} />
//           <ScoreBar label="Confidence & Presentation" score={f.delivery.confidencePresentation} />
//           <ScoreBar label="Pacing" score={f.delivery.pacing} />
//           <ScoreBar label="Filler Words (fewer = better)" score={f.delivery.fillerWords} />
//         </Collapsible>
//       )}

//       {f.visual && (f.visual.eyeContactEngagement != null || f.visual.postureProfessionalism != null) && (
//         <Collapsible title="👁 Visual Presence">
//           {f.visual.eyeContactEngagement != null && (
//             <ScoreBar label="Eye Contact & Engagement" score={f.visual.eyeContactEngagement} />
//           )}
//           {f.visual.postureProfessionalism != null && (
//             <ScoreBar label="Posture & Professionalism" score={f.visual.postureProfessionalism} />
//           )}
//         </Collapsible>
//       )}

//       {f.naturalness && (
//         <Collapsible title="✨ Answer Naturalness">
//           <ScoreBar label="Naturalness Score" score={f.naturalness.score} />
//           {f.naturalness.notes && (
//             <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{f.naturalness.notes}</p>
//           )}
//         </Collapsible>
//       )}

//       {(f.strengths?.length || f.improvements?.length) && (
//         <Collapsible title="💡 Coaching Notes" defaultOpen>
//           {f.strengths?.length > 0 && (
//             <div style={{ marginBottom: 12 }}>
//               <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>What worked well</div>
//               {f.strengths.map((s, i) => (
//                 <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
//                   <CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> {s}
//                 </div>
//               ))}
//             </div>
//           )}
//           {f.improvements?.length > 0 && (
//             <div>
//               <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>Areas to improve</div>
//               {f.improvements.map((s, i) => (
//                 <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
//                   <AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} /> {s}
//                 </div>
//               ))}
//             </div>
//           )}
//         </Collapsible>
//       )}

//       {f.suggestedBetterAnswer && (
//         <Collapsible title="🌟 Suggested Stronger Answer">
//           <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{f.suggestedBetterAnswer}</p>
//         </Collapsible>
//       )}

//       <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
//         <button className="btn btn-ghost flex-1" onClick={onRetry}>
//           <RotateCcw size={14} /> Re-record
//         </button>
//         <button className="btn btn-primary flex-1" onClick={onNext}>
//           {isLast ? '🎯 View Full Results' : <>Next Question <ChevronRight size={14} /></>}
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    QUESTION RECORDER
// ───────────────────────────────────────── */
// const MAX_SECS = 180;

// // Safe TTS — never throws, silently skips if unsupported
// const safeTTS = (text, onEnd) => {
//   try {
//     if (!window.speechSynthesis) { onEnd(); return () => {}; }
//     window.speechSynthesis.cancel();
//     const utt = new SpeechSynthesisUtterance(text);
//     utt.rate = 0.92;
//     utt.onend = onEnd;
//     utt.onerror = onEnd;
//     window.speechSynthesis.speak(utt);
//     return () => { try { window.speechSynthesis.cancel(); } catch {} };
//   } catch {
//     onEnd();
//     return () => {};
//   }
// };

// const QuestionRecorder = ({ question, questionObj, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');   // ready|recording|preview|submitting|error
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);      // TTS in progress

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);
//   const cancelTTS  = useRef(() => {});

//   /* TTS — read question on mount, silent fallback */
//   useEffect(() => {
//     cancelTTS.current = safeTTS(question, () => setReading(false));
//     return () => { cancelTTS.current(); };
//   }, [question]);

//   const skipReading = () => {
//     cancelTTS.current();
//     setReading(false);
//   };

//   useEffect(() => () => {
//     stopStream();
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const stopStream = () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     streamRef.current = null;
//   };

//   const startStream = async () => {
//     try {
//       const constraints = mediaMode === 'video'
//         ? { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }
//         : { audio: true };
//       const s = await navigator.mediaDevices.getUserMedia(constraints);
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') {
//         videoRef.current.srcObject = s;
//         videoRef.current.play().catch(() => {});
//       }
//     } catch {
//       setError('Camera/microphone permission denied. Please allow access and retry.');
//     }
//   };

//   const startRecording = async () => {
//     setError('');
//     await startStream();
//     if (!streamRef.current) return;

//     chunksRef.current = [];
//     const mime = mediaMode === 'video'
//       ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
//       : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

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

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting');
//     setError('');
//     try {
//       const form = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question);
//       form.append('media_type', mediaMode);
//       form.append('topic', questionObj?.topic || '');
//       form.append('bloom_level', questionObj?.bloomLevel || '');

//       const res  = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) {
//       setError(err.message);
//       setPhase('preview');
//     }
//   };

//   const reRecord = () => { setBlob(null); setPhase('ready'); setElapsed(0); setError(''); };

//   const fmtTime = s =>
//     `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}

//       {/* Question card */}
//       <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
//         borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
//             {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//             {questionObj?.topic && <span className="badge badge-muted" style={{ fontSize: 10 }}>{questionObj.topic}</span>}
//             {questionObj?.bloomLevel && <span className="badge badge-blue" style={{ fontSize: 10 }}>{questionObj.bloomLevel}</span>}
//           </div>
//           {/* Skip reading button — shown while TTS is active */}
//           {reading && (
//             <button
//               className="btn btn-ghost btn-sm"
//               onClick={skipReading}
//               style={{ fontSize: 11, padding: '3px 8px', height: 'auto' }}
//             >
//               Skip reading
//             </button>
//           )}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {question}
//         </div>
//       </div>

//       {/* Camera preview — compact, not full-width tall */}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{
//           position: 'relative',
//           width: '100%',
//           maxWidth: 360,          // cap width so it doesn't dominate
//           margin: '0 auto',
//           borderRadius: 10,
//           overflow: 'hidden',
//           background: '#000',
//           aspectRatio: '4/3',    // more compact than 16/9
//           boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
//         }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 8, right: 8,
//               background: 'rgba(244,63,94,0.9)', color: 'white',
//               padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
//               display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white',
//                 animation: 'pulse 1s ease infinite' }} />
//               {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}

//       {/* Audio indicator */}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 100, background: 'var(--surface-2)', borderRadius: 12,
//           display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
//           <div style={{ width: 48, height: 48, borderRadius: '50%',
//             background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)',
//             border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
//             {phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}
//           </div>
//         </div>
//       )}

//       {/* Timer bar */}
//       {phase === 'recording' && (
//         <div>
//           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
//             color: 'var(--text-muted)', marginBottom: 4 }}>
//             <span>{fmtTime(elapsed)}</span><span>Max {fmtTime(MAX_SECS)}</span>
//           </div>
//           <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//             <div style={{ height: '100%', borderRadius: 99, transition: 'width 1s linear',
//               background: elapsed > MAX_SECS * 0.8 ? 'var(--danger)' : 'var(--primary)',
//               width: `${(elapsed / MAX_SECS) * 100}%` }} />
//           </div>
//         </div>
//       )}

//       {/* Blob preview */}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', maxWidth: 360, margin: '0 auto', display: 'block', borderRadius: 10, background: '#000' }} />
//           : <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//               borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column',
//               alignItems: 'center', gap: 10 }}>
//               <Volume2 size={24} style={{ color: 'var(--primary)' }} />
//               <audio ref={previewRef} controls style={{ width: '100%' }} />
//             </div>
//       )}

//       {/* Controls */}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Reading question…'
//               : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip question"
//             style={{ padding: '0 16px', flexShrink: 0 }}>
//             <SkipForward size={15} />
//           </button>
//         </div>
//       )}

//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording}
//           style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)',
//             color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}

//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={reRecord}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}

//       {phase === 'submitting' && (
//         <div style={{ minHeight: 80, display: 'flex', flexDirection: 'column',
//           alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
//           <Loader size={24} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Analysing your response…</div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Takes 10–20 seconds.</div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN — VideoInterviewSession
// ───────────────────────────────────────── */
// const VideoInterviewSession = ({
//   questions, chatId, sessionId, mediaMode = 'video', onFinished, onExit,
// }) => {
//   const [currentIdx, setCurrentIdx] = useState(0);
//   const [phase,      setPhase]      = useState('recording');
//   const [currentFb,  setCurrentFb]  = useState(null);
//   const [allResults, setAllResults]  = useState([]);
//   const [saving,     setSaving]      = useState(false);

//   const total   = questions.length;
//   const current = questions[currentIdx];

//   const handleFeedback = (feedback) => {
//     const result = { question: current, feedback };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(feedback);
//     setPhase('feedback');
//   };

//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     const next = [...allResults, result];
//     setAllResults(next);
//     advanceOrFinish(next);
//   };

//   const handleReRecord = () => {
//     setAllResults(prev => prev.slice(0, -1));
//     setCurrentFb(null);
//     setPhase('recording');
//   };

//   const handleNext = () => { advanceOrFinish(allResults); };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (currentIdx + 1 >= total) {
//       finishSession(results);
//     } else {
//       setCurrentIdx(i => i + 1);
//       setPhase('recording');
//     }
//   };

//   const finishSession = async (results) => {
//     setSaving(true);

//     const feedbackMap = {};
//     let totalScore  = 0;
//     let scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) {
//         feedbackMap[q.id] = {
//           type: 'video', topic: q.topic || 'General',
//           question: q.question, userAnswer: '[Skipped]',
//           correctAnswer: null, isCorrect: null,
//           understandingScore: 0, overallScore: null,
//           skipped: true, videoFeedback: null,
//           bloomLevel: q.bloomLevel, difficulty: q.difficulty,
//           awardedMarks: 0, maxMarks: 10,
//         };
//         return;
//       }
//       const score = fb.overallScore ?? 0;
//       totalScore  += score;
//       scoredCount += 1;
//       feedbackMap[q.id] = {
//         type: 'video', topic: q.topic || 'General',
//         question: q.question,
//         userAnswer: fb.transcript || '',
//         correctAnswer: null, isCorrect: null,
//         understandingScore: Math.round((score / 10) * 10),
//         overallScore: score,
//         videoFeedback: fb,
//         bloomLevel: q.bloomLevel, difficulty: q.difficulty,
//         awardedMarks: Math.round((score / 10) * 10 * 10) / 10,
//         maxMarks: 10,
//       };
//     });

//     const avgScore = scoredCount > 0
//       ? Math.round((totalScore / scoredCount) * 10) / 10
//       : 0;

//     const answersMap = Object.fromEntries(
//       results
//         .filter(r => r.question?.id && !r.skipped)
//         .map(r => [r.question.id, r.feedback?.transcript || ''])
//     );

//     try {
//       await fetch(`http://localhost:5000/api/chats/${chatId}/video-session/save`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${localStorage.getItem('token')}`,
//         },
//         body: JSON.stringify({
//           session_id:   sessionId,
//           questions,
//           answers:      answersMap,
//           feedback:     feedbackMap,
//           score:        avgScore,
//           session_type: 'video_full',
//         }),
//       });
//     } catch (err) {
//       console.warn('[VideoInterviewSession] save failed (non-fatal):', err);
//     } finally {
//       setSaving(false);
//     }

//     onFinished({ score: avgScore, results: feedbackMap, allResults: results });
//   };

//   const progressPct = (currentIdx / total) * 100;

//   if (saving) {
//     return (
//       <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
//         alignItems: 'center', justifyContent: 'center', gap: 16 }}>
//         <Loader size={36} className="vi-spin" style={{ color: 'var(--primary)' }} />
//         <div style={{ fontSize: 16, fontWeight: 700 }}>Saving your session…</div>
//       </div>
//     );
//   }

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
//       {/* Header */}
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
//         <div>
//           <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//             {mediaMode === 'video' ? '🎥' : '🎤'} Video Interview
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             Question {currentIdx + 1} of {total}
//             {phase === 'feedback' && ' · Feedback'}
//           </div>
//         </div>
//         <button className="btn btn-ghost btn-sm" onClick={onExit} style={{ color: 'var(--text-muted)' }}>
//           <X size={14} /> Exit
//         </button>
//       </div>

//       {/* Progress bar */}
//       <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
//         <div style={{ height: '100%', background: 'var(--primary)',
//           width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
//       </div>

//       {/* Scrollable content */}
//       <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
//         {phase === 'recording' && current && (
//           <QuestionRecorder
//             key={`${currentIdx}-recording`}
//             question={current.question}
//             questionObj={current}
//             chatId={chatId}
//             mediaMode={mediaMode}
//             onFeedback={handleFeedback}
//             onSkip={handleSkip}
//           />
//         )}

//         {phase === 'feedback' && currentFb && (
//           <FeedbackView
//             feedback={currentFb}
//             onRetry={handleReRecord}
//             onNext={handleNext}
//             isLast={currentIdx + 1 >= total}
//           />
//         )}
//       </div>

//       {/* Progress dots */}
//       <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)',
//         display: 'flex', gap: 5, justifyContent: 'center', flexShrink: 0 }}>
//         {questions.map((_, i) => {
//           const done   = i < currentIdx || (i === currentIdx && phase === 'feedback');
//           const active = i === currentIdx;
//           return (
//             <div key={i} style={{
//               width: active ? 20 : 8, height: 8, borderRadius: 99,
//               background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--surface-3)',
//               transition: 'all 0.3s ease',
//             }} />
//           );
//         })}
//       </div>
//     </div>
//   );
// };

// export default VideoInterviewSession;

























// import React, { useState, useRef, useEffect } from 'react';
// import {
//   X, Video, Mic, Square, Play, Loader,
//   RotateCcw, Volume2, ChevronDown, ChevronUp,
//   CheckCircle, AlertCircle, SkipForward, ChevronRight
// } from 'lucide-react';

// /* ─────────────────────────────────────────
//    SCORE RING
// ───────────────────────────────────────── */
// const ScoreRing = ({ score, size = 64, label }) => {
//   const r    = (size / 2) - 5;
//   const circ = 2 * Math.PI * r;
//   const pct  = Math.max(0, Math.min(10, score || 0)) / 10;
//   const dash = circ * pct;
//   const color = pct >= 0.7 ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
//       <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
//           strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
//           style={{ transition: 'stroke-dasharray 0.8s ease' }} />
//         <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
//           style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
//             fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: 'var(--mono)' }}>
//           {score != null ? Number(score).toFixed(1) : '—'}
//         </text>
//       </svg>
//       {label && <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{label}</span>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    SCORE BAR
// ───────────────────────────────────────── */
// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct   = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 10 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>
//           {score != null ? `${score}/${max}` : '—'}
//         </span>
//       </div>
//       <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color,
//           borderRadius: 99, transition: 'width 0.7s ease' }} />
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    COLLAPSIBLE
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//       borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
//       <button onClick={() => setOpen(o => !o)} style={{
//         width: '100%', padding: '12px 16px', display: 'flex',
//         justifyContent: 'space-between', alignItems: 'center',
//         background: 'none', border: 'none', cursor: 'pointer',
//         color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)',
//       }}>
//         {title}
//         {open
//           ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
//           : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
//       </button>
//       {open && <div style={{ padding: '0 16px 14px' }}>{children}</div>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    FULL FEEDBACK VIEW  (same as VideoQuestion)
//    Extra prop: onNext — shows "Next Question" or "View Results" instead of "Done"
// ───────────────────────────────────────── */
// const FeedbackView = ({ feedback, onRetry, onNext, isLast }) => {
//   const f = feedback;
//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

//       {/* Overall score hero */}
//       <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//         borderRadius: 12, padding: '20px', marginBottom: 16,
//         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         flexWrap: 'wrap', gap: 16 }}>
//         <div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Overall Score</div>
//           <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
//             {f.overallScore != null ? Number(f.overallScore).toFixed(1) : '—'}
//             <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//           </div>
//         </div>
//         <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
//           <ScoreRing score={f.content?.answerRelevance} label="Relevance" />
//           <ScoreRing score={f.delivery?.clarity} label="Clarity" />
//           <ScoreRing score={f.naturalness?.score} label="Naturalness" />
//           {f.visual?.eyeContactEngagement != null && (
//             <ScoreRing score={f.visual.eyeContactEngagement} label="Eye Contact" />
//           )}
//         </div>
//       </div>

//       {/* Question */}
//       {f.question && (
//         <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
//           borderRadius: 10, padding: '10px 14px', marginBottom: 12,
//           fontSize: 13, color: 'var(--text-secondary)' }}>
//           <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginRight: 8 }}>Q:</span>
//           {f.question}
//         </div>
//       )}

//       {/* Transcript */}
//       {f.transcript && (
//         <Collapsible title="📝 Your Transcript">
//           <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
//             {f.transcript}
//           </p>
//         </Collapsible>
//       )}

//       {/* Content scores */}
//       {f.content && (
//         <Collapsible title="📚 Content Quality" defaultOpen>
//           <ScoreBar label="Answer Relevance" score={f.content.answerRelevance} />
//           <ScoreBar label="Completeness" score={f.content.completeness} />
//           <ScoreBar label="Structure & Flow" score={f.content.structure} />
//           <ScoreBar label="Examples & Specificity" score={f.content.examplesSpecificity} />
//         </Collapsible>
//       )}

//       {/* Delivery scores */}
//       {f.delivery && (
//         <Collapsible title="🎤 Delivery" defaultOpen>
//           <ScoreBar label="Clarity" score={f.delivery.clarity} />
//           <ScoreBar label="Confidence & Presentation" score={f.delivery.confidencePresentation} />
//           <ScoreBar label="Pacing" score={f.delivery.pacing} />
//           <ScoreBar label="Filler Words (fewer = better)" score={f.delivery.fillerWords} />
//         </Collapsible>
//       )}

//       {/* Visual — only for video */}
//       {f.visual && (f.visual.eyeContactEngagement != null || f.visual.postureProfessionalism != null) && (
//         <Collapsible title="👁 Visual Presence">
//           {f.visual.eyeContactEngagement != null && (
//             <ScoreBar label="Eye Contact & Engagement" score={f.visual.eyeContactEngagement} />
//           )}
//           {f.visual.postureProfessionalism != null && (
//             <ScoreBar label="Posture & Professionalism" score={f.visual.postureProfessionalism} />
//           )}
//         </Collapsible>
//       )}

//       {/* Naturalness */}
//       {f.naturalness && (
//         <Collapsible title="✨ Answer Naturalness">
//           <ScoreBar label="Naturalness Score" score={f.naturalness.score} />
//           {f.naturalness.notes && (
//             <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
//               {f.naturalness.notes}
//             </p>
//           )}
//         </Collapsible>
//       )}

//       {/* Strengths + Improvements */}
//       {(f.strengths?.length || f.improvements?.length) && (
//         <Collapsible title="💡 Coaching Notes" defaultOpen>
//           {f.strengths?.length > 0 && (
//             <div style={{ marginBottom: 12 }}>
//               <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>What worked well</div>
//               {f.strengths.map((s, i) => (
//                 <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
//                   <CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> {s}
//                 </div>
//               ))}
//             </div>
//           )}
//           {f.improvements?.length > 0 && (
//             <div>
//               <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>Areas to improve</div>
//               {f.improvements.map((s, i) => (
//                 <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
//                   <AlertCircle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} /> {s}
//                 </div>
//               ))}
//             </div>
//           )}
//         </Collapsible>
//       )}

//       {/* Suggested better answer */}
//       {f.suggestedBetterAnswer && (
//         <Collapsible title="🌟 Suggested Stronger Answer">
//           <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
//             {f.suggestedBetterAnswer}
//           </p>
//         </Collapsible>
//       )}

//       {/* Actions */}
//       <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
//         <button className="btn btn-ghost flex-1" onClick={onRetry}>
//           <RotateCcw size={14} /> Re-record
//         </button>
//         <button className="btn btn-primary flex-1" onClick={onNext}>
//           {isLast ? '🎯 View Full Results' : <>Next Question <ChevronRight size={14} /></>}
//         </button>
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    QUESTION RECORDER
//    Handles stream, recording, preview, submit for one question
// ───────────────────────────────────────── */
// const MAX_SECS = 180;

// const QuestionRecorder = ({ question, questionObj, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,   setPhase]   = useState('ready');   // ready|recording|preview|submitting|error
//   const [elapsed, setElapsed] = useState(0);
//   const [blob,    setBlob]    = useState(null);
//   const [error,   setError]   = useState('');
//   const [reading, setReading] = useState(true);      // TTS in progress

//   const videoRef  = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef = useRef(null);
//   const recRef    = useRef(null);
//   const chunksRef = useRef([]);
//   const timerRef  = useRef(null);

//   /* TTS — read question on mount */
//   useEffect(() => {
//     if (!window.speechSynthesis) { setReading(false); return; }
//     const utt  = new SpeechSynthesisUtterance(question);
//     utt.rate   = 0.92;
//     utt.onend  = () => setReading(false);
//     utt.onerror = () => setReading(false);
//     window.speechSynthesis.cancel();
//     window.speechSynthesis.speak(utt);
//     return () => { window.speechSynthesis.cancel(); };
//   }, [question]);

//   useEffect(() => () => {
//     stopStream();
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const stopStream = () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     streamRef.current = null;
//   };

//   const startStream = async () => {
//     try {
//       const constraints = mediaMode === 'video'
//         ? { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }
//         : { audio: true };
//       const s = await navigator.mediaDevices.getUserMedia(constraints);
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') {
//         videoRef.current.srcObject = s;
//         videoRef.current.play().catch(() => {});
//       }
//     } catch {
//       setError('Camera/microphone permission denied. Please allow access and retry.');
//     }
//   };

//   const startRecording = async () => {
//     setError('');
//     await startStream();
//     if (!streamRef.current) return;

//     chunksRef.current = [];
//     const mime = mediaMode === 'video'
//       ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
//       : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

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

//   /* attach blob to preview player */
//   useEffect(() => {
//     if (phase === 'preview' && blob && previewRef.current) {
//       const url = URL.createObjectURL(blob);
//       previewRef.current.src = url;
//       return () => URL.revokeObjectURL(url);
//     }
//   }, [phase, blob]);

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting');
//     setError('');
//     try {
//       const token = localStorage.getItem('token');
//       const form  = new FormData();
//       form.append('media', blob, 'recording.webm');
//       form.append('question', question);
//       form.append('media_type', mediaMode);
//       form.append('topic', questionObj?.topic || '');
//       form.append('bloom_level', questionObj?.bloomLevel || '');

//       const res  = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) {
//       setError(err.message);
//       setPhase('preview');
//     }
//   };

//   const reRecord = () => {
//     setBlob(null); setPhase('ready'); setElapsed(0); setError('');
//   };

//   const fmtTime = s =>
//     `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
//       {error && <div className="error-box">{error}</div>}

//       {/* Question card */}
//       <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
//         borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
//           {reading && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>🔊 Reading…</span>}
//           {questionObj?.topic && <span className="badge badge-muted" style={{ fontSize: 10 }}>{questionObj.topic}</span>}
//           {questionObj?.bloomLevel && <span className="badge badge-blue" style={{ fontSize: 10 }}>{questionObj.bloomLevel}</span>}
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {question}
//         </div>
//       </div>

//       {/* Camera preview / audio indicator */}
//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden',
//           background: '#000', aspectRatio: '16/9' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 12, right: 12,
//               background: 'rgba(244,63,94,0.9)', color: 'white',
//               padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
//               display: 'flex', alignItems: 'center', gap: 6 }}>
//               <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white',
//                 animation: 'pulse 1s ease infinite' }} />
//               {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}

//       {(phase === 'ready' || phase === 'recording') && mediaMode === 'audio' && (
//         <div style={{ height: 140, background: 'var(--surface-2)', borderRadius: 12,
//           display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
//           <div style={{ width: 60, height: 60, borderRadius: '50%',
//             background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)',
//             border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={24} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//             {phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Microphone ready'}
//           </div>
//         </div>
//       )}

//       {/* Timer bar */}
//       {phase === 'recording' && (
//         <div>
//           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
//             color: 'var(--text-muted)', marginBottom: 4 }}>
//             <span>{fmtTime(elapsed)}</span><span>Max {fmtTime(MAX_SECS)}</span>
//           </div>
//           <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//             <div style={{ height: '100%', borderRadius: 99, transition: 'width 1s linear',
//               background: elapsed > MAX_SECS * 0.8 ? 'var(--danger)' : 'var(--primary)',
//               width: `${(elapsed / MAX_SECS) * 100}%` }} />
//           </div>
//         </div>
//       )}

//       {/* Blob preview */}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', borderRadius: 12, background: '#000' }} />
//           : <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//               borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column',
//               alignItems: 'center', gap: 12 }}>
//               <Volume2 size={28} style={{ color: 'var(--primary)' }} />
//               <audio ref={previewRef} controls style={{ width: '100%' }} />
//             </div>
//       )}

//       {/* Controls */}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full btn-lg" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Listening…'
//               : <>{mediaMode === 'video' ? <Video size={16} /> : <Mic size={16} />} Start Recording</>}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip question"
//             style={{ padding: '0 16px', flexShrink: 0 }}>
//             <SkipForward size={15} />
//           </button>
//         </div>
//       )}

//       {phase === 'recording' && (
//         <button className="btn btn-full btn-lg" onClick={stopRecording}
//           style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)',
//             color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={14} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}

//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 10 }}>
//           <button className="btn btn-ghost flex-1" onClick={reRecord}>
//             <RotateCcw size={14} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={14} /> Submit for Feedback
//           </button>
//         </div>
//       )}

//       {phase === 'submitting' && (
//         <div style={{ minHeight: 100, display: 'flex', flexDirection: 'column',
//           alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
//           <Loader size={28} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
//             Analysing your response…
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
//             AI is reviewing your content, delivery, and presentation. Takes 10–20 seconds.
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN — VideoInterviewSession

//    Props:
//      questions   — array from PDF generation
//      chatId      — string
//      sessionId   — string (from generateFullExam)
//      mediaMode   — 'video' | 'audio'
//      onFinished  — (sessionResult) => void
//      onExit      — () => void
// ───────────────────────────────────────── */
// const VideoInterviewSession = ({
//   questions, chatId, sessionId, mediaMode = 'video', onFinished, onExit,
// }) => {
//   const [currentIdx, setCurrentIdx] = useState(0);
//   const [phase,      setPhase]      = useState('recording'); // 'recording' | 'feedback'
//   const [currentFb,  setCurrentFb]  = useState(null);
//   const [allResults, setAllResults]  = useState([]);
//   const [saving,     setSaving]      = useState(false);

//   const total   = questions.length;
//   const current = questions[currentIdx];

//   /* ── feedback received for current question ── */
//   const handleFeedback = (feedback) => {
//     const result = { question: current, feedback };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(feedback);
//     setPhase('feedback');
//   };

//   /* ── skip without recording ── */
//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     const next = [...allResults, result];
//     setAllResults(next);
//     advanceOrFinish(next);
//   };

//   /* ── re-record current question ── */
//   const handleReRecord = () => {
//     // Remove the last result (current question's feedback) so it can be redone
//     setAllResults(prev => prev.slice(0, -1));
//     setCurrentFb(null);
//     setPhase('recording');
//   };

//   /* ── next question or finish ── */
//   const handleNext = () => {
//     advanceOrFinish(allResults);
//   };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (currentIdx + 1 >= total) {
//       finishSession(results);
//     } else {
//       setCurrentIdx(i => i + 1);
//       setPhase('recording');
//     }
//   };

//   /* ── save to backend + call onFinished ── */
//   const finishSession = async (results) => {
//     setSaving(true);

//     // Build feedback map keyed by question ID
//     const feedbackMap = {};
//     let totalScore  = 0;
//     let scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;

//       if (skipped || !fb) {
//         feedbackMap[q.id] = {
//           type: 'video', topic: q.topic || 'General',
//           question: q.question, userAnswer: '[Skipped]',
//           correctAnswer: null, isCorrect: null,
//           understandingScore: 0, overallScore: null,
//           skipped: true, videoFeedback: null,
//           bloomLevel: q.bloomLevel, difficulty: q.difficulty,
//           awardedMarks: 0, maxMarks: 10,
//         };
//         return;
//       }

//       const score = fb.overallScore ?? 0;
//       totalScore  += score;
//       scoredCount += 1;

//       feedbackMap[q.id] = {
//         type: 'video', topic: q.topic || 'General',
//         question: q.question,
//         userAnswer: fb.transcript || '',
//         correctAnswer: null, isCorrect: null,
//         understandingScore: Math.round((score / 10) * 10),
//         overallScore: score,
//         videoFeedback: fb,           // full coaching JSON stored here
//         bloomLevel: q.bloomLevel, difficulty: q.difficulty,
//         awardedMarks: Math.round((score / 10) * 10 * 10) / 10,
//         maxMarks: 10,
//       };
//     });

//     const avgScore = scoredCount > 0
//       ? Math.round((totalScore / scoredCount) * 10) / 10
//       : 0;

//     // answers map: questionId → transcript (for SessionReview compatibility)
//     const answersMap = Object.fromEntries(
//       results
//         .filter(r => r.question?.id && !r.skipped)
//         .map(r => [r.question.id, r.feedback?.transcript || ''])
//     );

//     /* Save to backend */
//     try {
//       await fetch(`http://localhost:5000/api/chats/${chatId}/video-session/save`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${localStorage.getItem('token')}`,
//         },
//         body: JSON.stringify({
//           session_id:   sessionId,
//           questions:    questions,
//           answers:      answersMap,
//           feedback:     feedbackMap,
//           score:        avgScore,
//           session_type: 'video_full',
//         }),
//       });
//     } catch (err) {
//       console.warn('[VideoInterviewSession] save failed (non-fatal):', err);
//     } finally {
//       setSaving(false);
//     }

//     onFinished({
//       score:      avgScore,
//       results:    feedbackMap,
//       allResults: results,
//     });
//   };

//   const progressPct = (currentIdx / total) * 100;

//   if (saving) {
//     return (
//       <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
//         alignItems: 'center', justifyContent: 'center', gap: 16 }}>
//         <Loader size={36} className="vi-spin" style={{ color: 'var(--primary)' }} />
//         <div style={{ fontSize: 16, fontWeight: 700 }}>Saving your session…</div>
//       </div>
//     );
//   }

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

//       {/* Header */}
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
//         <div>
//           <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//             {mediaMode === 'video' ? '🎥' : '🎤'} Video Interview
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             Question {currentIdx + 1} of {total}
//             {phase === 'feedback' && ' · Feedback'}
//           </div>
//         </div>
//         <button className="btn btn-ghost btn-sm" onClick={onExit}
//           style={{ color: 'var(--text-muted)' }}>
//           <X size={14} /> Exit
//         </button>
//       </div>

//       {/* Progress bar */}
//       <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
//         <div style={{ height: '100%', background: 'var(--primary)',
//           width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
//       </div>

//       {/* Scrollable content */}
//       <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

//         {phase === 'recording' && current && (
//           <QuestionRecorder
//             key={`${currentIdx}-recording`}
//             question={current.question}
//             questionObj={current}
//             chatId={chatId}
//             mediaMode={mediaMode}
//             onFeedback={handleFeedback}
//             onSkip={handleSkip}
//           />
//         )}

//         {phase === 'feedback' && currentFb && (
//           <FeedbackView
//             feedback={currentFb}
//             onRetry={handleReRecord}
//             onNext={handleNext}
//             isLast={currentIdx + 1 >= total}
//           />
//         )}
//       </div>

//       {/* Question progress dots */}
//       <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)',
//         display: 'flex', gap: 5, justifyContent: 'center', flexShrink: 0 }}>
//         {questions.map((_, i) => {
//           const done   = i < currentIdx || (i === currentIdx && phase === 'feedback');
//           const active = i === currentIdx;
//           return (
//             <div key={i} style={{
//               width: active ? 20 : 8, height: 8, borderRadius: 99,
//               background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--surface-3)',
//               transition: 'all 0.3s ease',
//             }} />
//           );
//         })}
//       </div>
//     </div>
//   );
// };

// export default VideoInterviewSession;


















// import React, { useState, useRef, useEffect } from 'react';
// import {
//   X, Video, Mic, Square, Play, Loader, ChevronRight,
//   CheckCircle, AlertCircle, RotateCcw, Volume2, ChevronDown, ChevronUp,
//   SkipForward
// } from 'lucide-react';

// /* ─────────────────────────────────────────
//    SCORE RING
// ───────────────────────────────────────── */
// const ScoreRing = ({ score, size = 52, label }) => {
//   const r    = size / 2 - 4;
//   const circ = 2 * Math.PI * r;
//   const pct  = Math.max(0, Math.min(10, score || 0)) / 10;
//   const dash = circ * pct;
//   const color = pct >= 0.7 ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
//       <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={3.5} />
//         <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3.5}
//           strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
//           style={{ transition: 'stroke-dasharray 0.6s ease' }} />
//         <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
//           style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
//             fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: 'var(--mono)' }}>
//           {score != null ? Number(score).toFixed(1) : '—'}
//         </text>
//       </svg>
//       {label && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    SCORE BAR
// ───────────────────────────────────────── */
// const ScoreBar = ({ label, score, max = 10 }) => {
//   const pct   = Math.max(0, Math.min(max, score || 0)) / max * 100;
//   const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <div style={{ marginBottom: 8 }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
//         <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
//         <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'var(--mono)' }}>
//           {score != null ? `${score}/10` : '—'}
//         </span>
//       </div>
//       <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//         <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99,
//           transition: 'width 0.6s ease' }} />
//       </div>
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    COLLAPSIBLE
// ───────────────────────────────────────── */
// const Collapsible = ({ title, children, defaultOpen = false }) => {
//   const [open, setOpen] = useState(defaultOpen);
//   return (
//     <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
//       borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
//       <button onClick={() => setOpen(o => !o)} style={{
//         width: '100%', padding: '10px 14px', display: 'flex',
//         justifyContent: 'space-between', alignItems: 'center',
//         background: 'none', border: 'none', cursor: 'pointer',
//         color: 'var(--text-primary)', fontWeight: 600, fontSize: 13,
//         fontFamily: 'var(--font)',
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
//    MINI FEEDBACK (shown after each question)
// ───────────────────────────────────────── */
// const MiniFeedback = ({ feedback, onNext, isLast }) => (
//   <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//     {/* Score row */}
//     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//       background: 'var(--surface-2)', border: '1px solid var(--border)',
//       borderRadius: 12, padding: '14px 18px' }}>
//       <div>
//         <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3 }}>
//           Overall Score
//         </div>
//         <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>
//           {feedback.overallScore != null ? Number(feedback.overallScore).toFixed(1) : '—'}
//           <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
//         </div>
//       </div>
//       <div style={{ display: 'flex', gap: 16 }}>
//         <ScoreRing score={feedback.content?.answerRelevance} label="Relevance" />
//         <ScoreRing score={feedback.delivery?.clarity} label="Clarity" />
//         <ScoreRing score={feedback.naturalness?.score} label="Natural" />
//       </div>
//     </div>

//     {/* Strengths + improvements inline */}
//     {(feedback.strengths?.length || feedback.improvements?.length) && (
//       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
//         {feedback.strengths?.length > 0 && (
//           <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)',
//             borderRadius: 10, padding: '10px 12px' }}>
//             <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>
//               ✓ Strengths
//             </div>
//             {feedback.strengths.slice(0, 2).map((s, i) => (
//               <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>
//             ))}
//           </div>
//         )}
//         {feedback.improvements?.length > 0 && (
//           <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
//             borderRadius: 10, padding: '10px 12px' }}>
//             <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>
//               ↑ Improve
//             </div>
//             {feedback.improvements.slice(0, 2).map((s, i) => (
//               <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>• {s}</div>
//             ))}
//           </div>
//         )}
//       </div>
//     )}

//     <button className="btn btn-primary btn-full" onClick={onNext} style={{ marginTop: 4 }}>
//       {isLast ? '🎯 View Full Results' : <>Next Question <ChevronRight size={15} /></>}
//     </button>
//   </div>
// );

// /* ─────────────────────────────────────────
//    RECORDER — handles one question's record/preview/submit cycle
//    Props:
//      question    — string
//      questionObj — full question object (for metadata)
//      chatId      — string
//      mediaMode   — 'video' | 'audio'
//      onFeedback  — (feedbackObj) => void
//      onSkip      — () => void
// ───────────────────────────────────────── */
// const MAX_SECS     = 180;
// const FFMPEG_TIMEOUT = 120;

// const QuestionRecorder = ({ question, questionObj, chatId, mediaMode, onFeedback, onSkip }) => {
//   const [phase,     setPhase]     = useState('ready'); // ready|recording|preview|submitting|error
//   const [elapsed,   setElapsed]   = useState(0);
//   const [blob,      setBlob]      = useState(null);
//   const [error,     setError]     = useState('');
//   const [reading,   setReading]   = useState(true); // TTS reading question

//   const videoRef   = useRef(null);
//   const previewRef = useRef(null);
//   const streamRef  = useRef(null);
//   const recRef     = useRef(null);
//   const chunksRef  = useRef([]);
//   const timerRef   = useRef(null);

//   // TTS — read the question aloud on mount
//   useEffect(() => {
//     if (!window.speechSynthesis) { setReading(false); return; }
//     const utt = new SpeechSynthesisUtterance(question);
//     utt.rate = 0.92;
//     utt.onend = () => setReading(false);
//     utt.onerror = () => setReading(false);
//     window.speechSynthesis.cancel();
//     window.speechSynthesis.speak(utt);
//     return () => { window.speechSynthesis.cancel(); };
//   }, [question]);

//   // cleanup
//   useEffect(() => () => {
//     stopStream();
//     if (timerRef.current) clearInterval(timerRef.current);
//   }, []);

//   const stopStream = () => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     streamRef.current = null;
//   };

//   const startStream = async () => {
//     try {
//       const constraints = mediaMode === 'video'
//         ? { video: { facingMode: 'user', width: { ideal: 1280 } }, audio: true }
//         : { audio: true };
//       const s = await navigator.mediaDevices.getUserMedia(constraints);
//       streamRef.current = s;
//       if (videoRef.current && mediaMode === 'video') {
//         videoRef.current.srcObject = s;
//         videoRef.current.play().catch(() => {});
//       }
//     } catch {
//       setError('Camera/microphone permission denied.');
//     }
//   };

//   const startRecording = async () => {
//     setError('');
//     await startStream();
//     if (!streamRef.current) return;

//     chunksRef.current = [];
//     const mime = mediaMode === 'video'
//       ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
//       : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

//     const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
//     rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
//     rec.onstop = () => {
//       const b = new Blob(chunksRef.current, { type: mime });
//       setBlob(b);
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

//   const submitAnswer = async () => {
//     if (!blob) return;
//     setPhase('submitting');
//     setError('');
//     try {
//       const token = localStorage.getItem('token');
//       const form  = new FormData();
//       form.append('media', blob, `recording.webm`);
//       form.append('question', question);
//       form.append('media_type', mediaMode);
//       form.append('topic', questionObj?.topic || '');
//       form.append('bloom_level', questionObj?.bloomLevel || '');

//       const res  = await fetch(`http://localhost:5000/api/chats/${chatId}/video-question`, {
//         method: 'POST',
//         headers: { Authorization: `Bearer ${token}` },
//         body: form,
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Evaluation failed');
//       onFeedback(data.feedback);
//     } catch (err) {
//       setError(err.message);
//       setPhase('preview');
//     }
//   };

//   const reRecord = () => {
//     setBlob(null); setPhase('ready'); setElapsed(0); setError('');
//   };

//   const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
//       {error && <div className="error-box">{error}</div>}

//       {/* Question display */}
//       <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border-accent)',
//         borderRadius: 10, padding: '12px 16px' }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
//           {reading && (
//             <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
//               🔊 Reading…
//             </span>
//           )}
//           <span className="badge badge-muted" style={{ fontSize: 10 }}>{questionObj?.topic}</span>
//           <span className="badge badge-blue" style={{ fontSize: 10 }}>{questionObj?.bloomLevel}</span>
//         </div>
//         <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
//           {question}
//         </div>
//       </div>

//       {/* Camera/audio preview */}
//       {(phase === 'recording' || phase === 'ready') && mediaMode === 'video' && (
//         <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden',
//           background: '#000', aspectRatio: '16/9' }}>
//           <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           {phase === 'recording' && (
//             <div style={{ position: 'absolute', top: 10, right: 10,
//               background: 'rgba(244,63,94,0.9)', color: 'white',
//               padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 700,
//               display: 'flex', alignItems: 'center', gap: 5 }}>
//               <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'white',
//                 animation: 'pulse 1s ease infinite' }} />
//               {fmtTime(elapsed)}
//             </div>
//           )}
//         </div>
//       )}

//       {(phase === 'recording' || phase === 'ready') && mediaMode === 'audio' && (
//         <div style={{ height: 100, background: 'var(--surface-2)', borderRadius: 12,
//           display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
//           <div style={{ width: 48, height: 48, borderRadius: '50%',
//             background: phase === 'recording' ? 'rgba(244,63,94,0.1)' : 'rgba(99,102,241,0.1)',
//             border: `2px solid ${phase === 'recording' ? 'rgba(244,63,94,0.4)' : 'var(--border-accent)'}`,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             animation: phase === 'recording' ? 'pulse 1.5s ease infinite' : 'none' }}>
//             <Mic size={20} style={{ color: phase === 'recording' ? 'var(--danger)' : 'var(--primary)' }} />
//           </div>
//           <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
//             {phase === 'recording' ? `Recording… ${fmtTime(elapsed)}` : 'Ready to record'}
//           </div>
//         </div>
//       )}

//       {/* Timer progress bar */}
//       {phase === 'recording' && (
//         <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
//           <div style={{ height: '100%',
//             background: elapsed > MAX_SECS * 0.8 ? 'var(--danger)' : 'var(--primary)',
//             width: `${(elapsed / MAX_SECS) * 100}%`, transition: 'width 1s linear' }} />
//         </div>
//       )}

//       {/* Preview playback */}
//       {phase === 'preview' && blob && (
//         mediaMode === 'video'
//           ? <video ref={previewRef} controls style={{ width: '100%', borderRadius: 12, background: '#000' }} />
//           : <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16,
//               display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
//               <Volume2 size={24} style={{ color: 'var(--primary)' }} />
//               <audio ref={previewRef} controls style={{ width: '100%' }} />
//             </div>
//       )}

//       {/* Controls */}
//       {phase === 'ready' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-primary btn-full" onClick={startRecording} disabled={reading}>
//             {reading ? '🔊 Listen to question…' : (
//               <>{mediaMode === 'video' ? <Video size={14} /> : <Mic size={14} />} Start Recording</>
//             )}
//           </button>
//           <button className="btn btn-ghost" onClick={onSkip} title="Skip question"
//             style={{ padding: '0 14px' }}>
//             <SkipForward size={15} />
//           </button>
//         </div>
//       )}

//       {phase === 'recording' && (
//         <button className="btn btn-full" onClick={stopRecording}
//           style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.4)',
//             color: 'var(--danger)', fontWeight: 700 }}>
//           <Square size={13} fill="var(--danger)" /> Stop Recording
//         </button>
//       )}

//       {phase === 'preview' && (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <button className="btn btn-ghost flex-1" onClick={reRecord}>
//             <RotateCcw size={13} /> Re-record
//           </button>
//           <button className="btn btn-primary flex-1" onClick={submitAnswer}>
//             <Play size={13} /> Submit Answer
//           </button>
//         </div>
//       )}

//       {phase === 'submitting' && (
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
//           gap: 10, padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
//           <Loader size={16} className="vi-spin" style={{ color: 'var(--primary)' }} />
//           Analysing your answer…
//         </div>
//       )}
//     </div>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN — VideoInterviewSession
//    Props:
//      questions   — array from PDF generation
//      chatId      — string
//      mediaMode   — 'video' | 'audio'
//      onFinished  — (sessionResult) => void   called when all done
//      onExit      — () => void                exit without saving
// ───────────────────────────────────────── */
// const VideoInterviewSession = ({ questions, chatId, mediaMode = 'video', onFinished, onExit }) => {
//   const [currentIdx,  setCurrentIdx]  = useState(0);
//   const [phase,       setPhase]       = useState('recording'); // 'recording' | 'feedback' | 'done'
//   const [currentFb,   setCurrentFb]   = useState(null);       // feedback for current Q
//   const [allResults,  setAllResults]  = useState([]);          // accumulated [{question, feedback}]

//   const total   = questions.length;
//   const current = questions[currentIdx];

//   const handleFeedback = (feedback) => {
//     const result = { question: current, feedback };
//     setAllResults(prev => [...prev, result]);
//     setCurrentFb(feedback);
//     setPhase('feedback');
//   };

//   const handleSkip = () => {
//     const result = { question: current, feedback: null, skipped: true };
//     setAllResults(prev => [...prev, result]);
//     advanceOrFinish([...allResults, result]);
//   };

//   const handleNext = () => {
//     advanceOrFinish(allResults);
//   };

//   const advanceOrFinish = (results) => {
//     setCurrentFb(null);
//     if (currentIdx + 1 >= total) {
//       // Build session result object
//       buildAndFinish(results);
//     } else {
//       setCurrentIdx(i => i + 1);
//       setPhase('recording');
//     }
//   };

//   const buildAndFinish = (results) => {
//     // Build a feedback map keyed by question id (matches SessionReview expectations)
//     const feedbackMap = {};
//     let totalScore = 0;
//     let scoredCount = 0;

//     results.forEach(({ question: q, feedback: fb, skipped }) => {
//       if (!q?.id) return;
//       if (skipped || !fb) {
//         feedbackMap[q.id] = {
//           type:             'video',
//           topic:            q.topic || 'General',
//           question:         q.question,
//           userAnswer:       skipped ? '[Skipped]' : '[Not answered]',
//           correctAnswer:    null,
//           isCorrect:        null,
//           understandingScore: 0,
//           overallScore:     null,
//           skipped:          true,
//           videoFeedback:    null,
//           bloomLevel:       q.bloomLevel,
//           difficulty:       q.difficulty,
//           awardedMarks:     0,
//           maxMarks:         10,
//         };
//         return;
//       }

//       const score = fb.overallScore ?? 0;
//       totalScore  += score;
//       scoredCount += 1;

//       feedbackMap[q.id] = {
//         type:              'video',
//         topic:             q.topic || 'General',
//         question:          q.question,
//         userAnswer:        fb.transcript || '',
//         correctAnswer:     null,
//         isCorrect:         null,
//         understandingScore: Math.round((score / 10) * 10),
//         overallScore:      score,
//         videoFeedback:     fb,
//         bloomLevel:        q.bloomLevel,
//         difficulty:        q.difficulty,
//         awardedMarks:      Math.round((score / 10) * 10 * 10) / 10,
//         maxMarks:          10,
//       };
//     });

//     const avgScore = scoredCount > 0
//       ? Math.round((totalScore / scoredCount) * 10) / 10
//       : 0;

//     onFinished({
//       score:      avgScore,
//       results:    feedbackMap,
//       allResults: results,
//     });
//   };

//   const progressPct = ((currentIdx) / total) * 100;

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
//       {/* Header */}
//       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
//         <div>
//           <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
//             {mediaMode === 'video' ? '🎥' : '🎤'} Video Interview
//           </div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
//             Question {currentIdx + 1} of {total}
//           </div>
//         </div>
//         <button className="btn btn-ghost btn-sm" onClick={onExit}
//           style={{ color: 'var(--text-muted)' }}>
//           <X size={14} /> Exit
//         </button>
//       </div>

//       {/* Progress bar */}
//       <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
//         <div style={{ height: '100%', background: 'var(--primary)',
//           width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
//       </div>

//       {/* Content */}
//       <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
//         {phase === 'recording' && current && (
//           <QuestionRecorder
//             key={currentIdx}
//             question={current.question}
//             questionObj={current}
//             chatId={chatId}
//             mediaMode={mediaMode}
//             onFeedback={handleFeedback}
//             onSkip={handleSkip}
//           />
//         )}

//         {phase === 'feedback' && currentFb && (
//           <MiniFeedback
//             feedback={currentFb}
//             onNext={handleNext}
//             isLast={currentIdx + 1 >= total}
//           />
//         )}
//       </div>

//       {/* Question dots */}
//       <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)',
//         display: 'flex', gap: 5, justifyContent: 'center', flexShrink: 0 }}>
//         {questions.map((_, i) => {
//           const done = i < currentIdx || (i === currentIdx && phase === 'feedback');
//           const active = i === currentIdx;
//           return (
//             <div key={i} style={{
//               width: active ? 20 : 8, height: 8, borderRadius: 99,
//               background: done
//                 ? 'var(--success)'
//                 : active ? 'var(--primary)' : 'var(--surface-3)',
//               transition: 'all 0.3s ease',
//             }} />
//           );
//         })}
//       </div>
//     </div>
//   );
// };

// export default VideoInterviewSession;