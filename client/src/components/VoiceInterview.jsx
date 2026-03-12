import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, SkipForward, CheckCircle, Loader, Volume2, VolumeX } from 'lucide-react';

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const SILENCE_MS = 10_000;

const isTTSSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
const isSTTSupported = () =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/* ─────────────────────────────────────────
   COUNTDOWN RING  (pure component, no hooks)
───────────────────────────────────────── */
const CountdownRing = ({ seconds, total = 10 }) => {
  const r    = 22;
  const circ = 2 * Math.PI * r;
  const dash = circ * (seconds / total);
  const color = seconds > 5 ? 'var(--primary)' : seconds > 2 ? 'var(--warning)' : 'var(--danger)';
  return (
    <svg width={56} height={56} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
      <circle
        cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
      />
      <text
        x={28} y={28} textAnchor="middle" dominantBaseline="central"
        style={{
          transform: 'rotate(90deg)', transformOrigin: '28px 28px',
          fontSize: 14, fontWeight: 700, fill: color, fontFamily: 'var(--mono)',
        }}
      >
        {seconds}
      </text>
    </svg>
  );
};

/* ─────────────────────────────────────────
   MAIN COMPONENT

   phase:
     'reading'    TTS is speaking the question
     'buffering'  TTS done, 800ms echo-fade pause before STT auto-starts
     'listening'  STT active, silence timer running
     'submitting' All questions done, API call in progress
     'finished'   API returned, parent will unmount us
───────────────────────────────────────── */
const VoiceInterview = ({ questions, onSubmit, onExitToHome }) => {

  /* ══ ALL STATE — must all be declared before any return ══ */
  const [currentIndex,   setCurrentIndex]   = useState(0);
  const [phase,          setPhase]          = useState('reading');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [countdown,      setCountdown]      = useState(SILENCE_MS / 1000);
  const [ttsActive,      setTtsActive]      = useState(false);
  const [muteTTS,        setMuteTTS]        = useState(false);
  const [submitResult,   setSubmitResult]   = useState(null);

  /* ══ ALL REFS ══ */
  const recognitionRef       = useRef(null);
  const silenceTimerRef      = useRef(null);
  const countdownIntervalRef = useRef(null);
  const ttsDelayRef          = useRef(null);  // holds the 800ms buffer timer
  // Refs for values needed inside timer callbacks — avoids stale closures entirely
  const currentIndexRef = useRef(0);
  const answersRef      = useRef({});   // ground-truth answers store (never stale)
  const baseAnswerRef   = useRef('');   // accumulates final STT text for current question
  const advancingRef    = useRef(false); // guards against double-advance
  const questionsRef    = useRef(questions);
  questionsRef.current  = questions;    // keep current without triggering effects

  /* Keep currentIndexRef in sync with state */
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  /* ─────────────────────────────────────────
     STOP HELPERS
  ───────────────────────────────────────── */
  const stopTimers = useCallback(() => {
    if (silenceTimerRef.current)      { clearTimeout(silenceTimerRef.current);       silenceTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
  }, []);

  const stopSTT = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    stopTimers();
  }, [stopTimers]);

  const stopTTS = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch {}
    if (ttsDelayRef.current) { clearTimeout(ttsDelayRef.current); ttsDelayRef.current = null; }
    setTtsActive(false);
  }, []);

  /* ─────────────────────────────────────────
     ADVANCE — reads exclusively from refs, never stale
  ───────────────────────────────────────── */
  const advance = useCallback((reason) => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    stopSTT();
    stopTTS();

    const idx = currentIndexRef.current;
    const qs  = questionsRef.current;
    const qid = qs[idx]?.id;

    // Persist answer synchronously into ref before any state updates
    if (qid) {
      answersRef.current = {
        ...answersRef.current,
        [qid]: reason === 'skip' ? '' : baseAnswerRef.current.trim(),
      };
    }

    baseAnswerRef.current = '';
    setLiveTranscript('');

    const nextIdx = idx + 1;

    if (nextIdx >= qs.length) {
      // Last question answered — pad any missing entries and submit
      const finalAnswers = {};
      qs.forEach((q) => { finalAnswers[q.id] = answersRef.current[q.id] ?? ''; });
      answersRef.current = finalAnswers;
      setCurrentIndex(nextIdx);
      setPhase('submitting');
      // advancingRef stays true — we're done with questions
    } else {
      setCurrentIndex(nextIdx);
      setPhase('reading');
      advancingRef.current = false; // allow next question to advance
    }
  }, [stopSTT, stopTTS]);

  /* ─────────────────────────────────────────
     SILENCE TIMER — calls advance via stable ref
  ───────────────────────────────────────── */
  const startSilenceTimer = useCallback(() => {
    stopTimers();
    setCountdown(SILENCE_MS / 1000);

    let remaining = SILENCE_MS / 1000;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }, 1000);

    silenceTimerRef.current = setTimeout(() => {
      advance('timeout');
    }, SILENCE_MS);
  }, [stopTimers, advance]);

  /* ─────────────────────────────────────────
     STT
  ───────────────────────────────────────── */
  const startSTT = useCallback(() => {
    if (!isSTTSupported()) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    stopSTT();
    advancingRef.current = false;

    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang           = 'en-US';
    rec.continuous     = true;
    rec.interimResults = true;

    rec.onstart = () => {
      baseAnswerRef.current = '';
      setLiveTranscript('');
      setPhase('listening');
      startSilenceTimer();
    };

    rec.onresult = (event) => {
      // Any speech resets the silence countdown
      stopTimers();
      startSilenceTimer();

      let interim = '', finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res?.[0]?.transcript || '';
        if (!txt) continue;
        if (res.isFinal) finalText += txt;
        else interim += txt;
      }
      const base   = baseAnswerRef.current;
      const spoken = `${finalText} ${interim}`.trim();
      const spacer = base.trim().length && spoken.length ? ' ' : '';
      setLiveTranscript(base + spacer + spoken);
      if (finalText.trim()) {
        baseAnswerRef.current = (base + (base.trim() ? ' ' : '') + finalText.trim()).trim();
      }
    };

    // onerror — just stop; silence timer will handle advancing if needed
    rec.onerror = () => { stopTimers(); };
    // onend fires when browser cuts off; silence timer already handles advance
    rec.onend   = () => {};

    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.error('STT start failed', e); }
  }, [stopSTT, startSilenceTimer, stopTimers]);

  /* ─────────────────────────────────────────
     BUFFER → AUTO-START STT
     Called after TTS ends (or skipped).
     Waits 800ms for speaker echo to fade, then
     starts STT automatically. User can press
     "Start now" to skip the wait.
  ───────────────────────────────────────── */
  const startBufferThenSTT = useCallback(() => {
    if (ttsDelayRef.current) clearTimeout(ttsDelayRef.current);
    setPhase('buffering');
    ttsDelayRef.current = setTimeout(() => {
      ttsDelayRef.current = null;
      startSTT();
    }, 800);
  }, [startSTT]);

  /* ─────────────────────────────────────────
     TTS — auto-starts STT after 800ms buffer
  ───────────────────────────────────────── */
  const readQuestion = useCallback((q) => {
    stopTTS();

    if (!isTTSSupported() || muteTTS) {
      // No TTS — still buffer briefly so UI doesn't feel instant/jarring
      startBufferThenSTT();
      return;
    }

    const utter   = new SpeechSynthesisUtterance(q.question);
    utter.rate    = 0.95;
    utter.pitch   = 1;
    utter.onstart = () => setTtsActive(true);
    utter.onend   = () => { setTtsActive(false); startBufferThenSTT(); };
    utter.onerror = () => { setTtsActive(false); startBufferThenSTT(); };

    setPhase('reading');
    window.speechSynthesis.speak(utter);
  }, [muteTTS, stopTTS, startBufferThenSTT]);

  /* ─────────────────────────────────────────
     EFFECTS — all declared together, after all callbacks
  ───────────────────────────────────────── */

  // Trigger TTS whenever we enter 'reading' phase for a new question
  useEffect(() => {
    if (phase !== 'reading') return;
    const q = questionsRef.current[currentIndex];
    if (q) readQuestion(q);
  }, [currentIndex, phase, readQuestion]);

  // Fire API submit when phase hits 'submitting'
  useEffect(() => {
    if (phase !== 'submitting') return;
    const finalAnswers = { ...answersRef.current };
    questionsRef.current.forEach((q) => {
      if (!(q.id in finalAnswers)) finalAnswers[q.id] = '';
    });
    onSubmit(finalAnswers)
      .then((result) => setSubmitResult({ ok: true,  result, answers: finalAnswers }))
      .catch(()      => setSubmitResult({ ok: false, result: null, answers: finalAnswers }));
  }, [phase, onSubmit]);

  // Hand off to parent once submitResult arrives
  useEffect(() => {
    if (!submitResult) return;
    setPhase('finished');
    const t = setTimeout(() => {
      onExitToHome?.(submitResult.result, submitResult.answers);
    }, 80);
    return () => clearTimeout(t);
  }, [submitResult, onExitToHome]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSTT(); stopTTS();
      if (ttsDelayRef.current) clearTimeout(ttsDelayRef.current);
    };
  }, [stopSTT, stopTTS]);

  /* ─────────────────────────────────────────
     HANDLERS
  ───────────────────────────────────────── */
  const handleMuteToggle = () => {
    if (ttsActive) {
      stopTTS();
      setMuteTTS(true);
      startBufferThenSTT(); // jump straight to buffer → auto-start STT
    } else {
      setMuteTTS((m) => !m);
    }
  };

  /* ─────────────────────────────────────────
     DERIVED VALUES
  ───────────────────────────────────────── */
  const totalQ      = questions?.length || 0;
  const currentQ    = questions?.[Math.min(currentIndex, totalQ - 1)];
  const progressPct = totalQ > 0 ? (currentIndex / totalQ) * 100 : 0;
  const isLastQ     = currentIndex + 1 >= totalQ;

  /* ─────────────────────────────────────────
     RENDER — NO early returns before this point (hooks are all above)
  ───────────────────────────────────────── */
  if (phase === 'submitting' || phase === 'finished') {
    return (
      <div className="vi-container">
        <div className="vi-center-state">
          <div className="vi-spinner">
            <Loader size={32} className="vi-spin" />
          </div>
          <div className="vi-center-title">Evaluating your answers…</div>
          <div className="vi-center-sub">This may take a few seconds</div>
        </div>
      </div>
    );
  }

  return (
    <div className="vi-container">

      {/* ── Progress bar + counter ── */}
      <div className="vi-topbar">
        <div className="vi-progress-wrap">
          <div className="vi-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="vi-topbar-row">
          <span className="vi-q-counter">
            Question <strong>{Math.min(currentIndex + 1, totalQ)}</strong> of <strong>{totalQ}</strong>
          </span>
          <button
            className="btn btn-ghost btn-sm vi-mute-btn"
            onClick={handleMuteToggle}
            title={muteTTS ? 'Enable question reading' : 'Mute question reading'}
          >
            {muteTTS ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muteTTS ? 'Reading off' : 'Reading on'}
          </button>
        </div>
      </div>

      {/* ── Question card ── */}
      <div className="vi-question-card">
        <div className="vi-phase-badge">
          {phase === 'reading' && (
            <span className="vi-badge vi-badge-reading">
              <Volume2 size={12} /> Reading question…
            </span>
          )}
          {phase === 'buffering' && (
            <span className="vi-badge vi-badge-ready">
              <Mic size={12} /> Get ready…
            </span>
          )}
          {phase === 'listening' && (
            <span className="vi-badge vi-badge-listening">
              <Mic size={12} /> Listening…
            </span>
          )}
        </div>

        <div className="vi-question-text">{currentQ?.question}</div>

        {currentQ?.topic && (
          <div className="vi-question-meta">
            <span className="badge badge-muted">{currentQ.topic}</span>
            {currentQ?.bloomLevel && <span className="badge badge-blue">{currentQ.bloomLevel}</span>}
          </div>
        )}
      </div>

      {/* ── Answer area ── */}
      <div className="vi-answer-area">

        {phase === 'reading' && (
          <div className="vi-reading-indicator">
            <div className="vi-reading-dots"><span /><span /><span /></div>
            <span className="vi-reading-label">Reading your question aloud…</span>
          </div>
        )}

        {phase === 'buffering' && (
          <div className="vi-ready-prompt">
            <div className="vi-ready-icon vi-ready-icon--pulse"><Mic size={28} /></div>
            <p className="vi-ready-label">Microphone starting…</p>
          </div>
        )}

        {phase === 'listening' && (
          <>
            <div className="vi-mic-row">
              <div className="vi-mic-ring">
                <Mic size={22} style={{ color: 'var(--danger)' }} />
              </div>
              <CountdownRing seconds={countdown} total={SILENCE_MS / 1000} />
              <span className="vi-countdown-label">auto-advances on silence</span>
            </div>

            <div className="vi-transcript-box">
              {liveTranscript
                ? <p className="vi-transcript-text">{liveTranscript}</p>
                : <p className="vi-transcript-placeholder">Speak now — your answer will appear here…</p>
              }
            </div>
          </>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="vi-controls">

        {phase === 'reading' && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { stopTTS(); startBufferThenSTT(); }}
          >
            <Volume2 size={15} /> Skip Reading
          </button>
        )}

        {phase === 'buffering' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => advance('skip')}>
              <SkipForward size={15} /> Skip Question
            </button>
            <button className="btn btn-primary" onClick={() => {
              if (ttsDelayRef.current) { clearTimeout(ttsDelayRef.current); ttsDelayRef.current = null; }
              startSTT();
            }}>
              <Mic size={16} /> Start now
            </button>
          </>
        )}

        {phase === 'listening' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => advance('skip')}>
              <SkipForward size={15} /> Skip Question
            </button>
            <button className="btn btn-primary" onClick={() => advance('submit')}>
              <CheckCircle size={16} />
              {isLastQ ? 'Submit Final Answer' : 'Submit & Next'}
            </button>
          </>
        )}

      </div>
    </div>
  );
};

export default VoiceInterview;




















// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { Mic, SkipForward, CheckCircle, Loader, Volume2, VolumeX } from 'lucide-react';

// /* ─────────────────────────────────────────
//    CONSTANTS
// ───────────────────────────────────────── */
// const SILENCE_MS = 10_000;

// const isTTSSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
// const isSTTSupported = () =>
//   typeof window !== 'undefined' &&
//   ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

// /* ─────────────────────────────────────────
//    COUNTDOWN RING  (pure component, no hooks)
// ───────────────────────────────────────── */
// const CountdownRing = ({ seconds, total = 10 }) => {
//   const r    = 22;
//   const circ = 2 * Math.PI * r;
//   const dash = circ * (seconds / total);
//   const color = seconds > 5 ? 'var(--primary)' : seconds > 2 ? 'var(--warning)' : 'var(--danger)';
//   return (
//     <svg width={56} height={56} style={{ transform: 'rotate(-90deg)' }}>
//       <circle cx={28} cy={28} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
//       <circle
//         cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4}
//         strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
//         style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
//       />
//       <text
//         x={28} y={28} textAnchor="middle" dominantBaseline="central"
//         style={{
//           transform: 'rotate(90deg)', transformOrigin: '28px 28px',
//           fontSize: 14, fontWeight: 700, fill: color, fontFamily: 'var(--mono)',
//         }}
//       >
//         {seconds}
//       </text>
//     </svg>
//   );
// };

// /* ─────────────────────────────────────────
//    MAIN COMPONENT

//    phase:
//      'reading'    TTS is speaking the question
//      'ready'      TTS done, waiting for user to press Start Answering
//      'listening'  STT active, silence timer running
//      'submitting' All questions done, API call in progress
//      'finished'   API returned, parent will unmount us
// ───────────────────────────────────────── */
// const VoiceInterview = ({ questions, onSubmit, onExitToHome }) => {

//   /* ══ ALL STATE — must all be declared before any return ══ */
//   const [currentIndex,   setCurrentIndex]   = useState(0);
//   const [phase,          setPhase]          = useState('reading');
//   const [liveTranscript, setLiveTranscript] = useState('');
//   const [countdown,      setCountdown]      = useState(SILENCE_MS / 1000);
//   const [ttsActive,      setTtsActive]      = useState(false);
//   const [muteTTS,        setMuteTTS]        = useState(false);
//   const [submitResult,   setSubmitResult]   = useState(null);

//   /* ══ ALL REFS ══ */
//   const recognitionRef       = useRef(null);
//   const silenceTimerRef      = useRef(null);
//   const countdownIntervalRef = useRef(null);
//   // Refs for values needed inside timer callbacks — avoids stale closures entirely
//   const currentIndexRef = useRef(0);
//   const answersRef      = useRef({});   // ground-truth answers store (never stale)
//   const baseAnswerRef   = useRef('');   // accumulates final STT text for current question
//   const advancingRef    = useRef(false); // guards against double-advance
//   const questionsRef    = useRef(questions);
//   questionsRef.current  = questions;    // keep current without triggering effects

//   /* Keep currentIndexRef in sync with state */
//   useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

//   /* ─────────────────────────────────────────
//      STOP HELPERS
//   ───────────────────────────────────────── */
//   const stopTimers = useCallback(() => {
//     if (silenceTimerRef.current)      { clearTimeout(silenceTimerRef.current);       silenceTimerRef.current = null; }
//     if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
//   }, []);

//   const stopSTT = useCallback(() => {
//     try { recognitionRef.current?.stop(); } catch {}
//     recognitionRef.current = null;
//     stopTimers();
//   }, [stopTimers]);

//   const stopTTS = useCallback(() => {
//     try { window.speechSynthesis?.cancel(); } catch {}
//     setTtsActive(false);
//   }, []);

//   /* ─────────────────────────────────────────
//      ADVANCE — reads exclusively from refs, never stale
//   ───────────────────────────────────────── */
//   const advance = useCallback((reason) => {
//     if (advancingRef.current) return;
//     advancingRef.current = true;

//     stopSTT();
//     stopTTS();

//     const idx = currentIndexRef.current;
//     const qs  = questionsRef.current;
//     const qid = qs[idx]?.id;

//     // Persist answer synchronously into ref before any state updates
//     if (qid) {
//       answersRef.current = {
//         ...answersRef.current,
//         [qid]: reason === 'skip' ? '' : baseAnswerRef.current.trim(),
//       };
//     }

//     baseAnswerRef.current = '';
//     setLiveTranscript('');

//     const nextIdx = idx + 1;

//     if (nextIdx >= qs.length) {
//       // Last question answered — pad any missing entries and submit
//       const finalAnswers = {};
//       qs.forEach((q) => { finalAnswers[q.id] = answersRef.current[q.id] ?? ''; });
//       answersRef.current = finalAnswers;
//       setCurrentIndex(nextIdx);
//       setPhase('submitting');
//       // advancingRef stays true — we're done with questions
//     } else {
//       setCurrentIndex(nextIdx);
//       setPhase('reading');
//       advancingRef.current = false; // allow next question to advance
//     }
//   }, [stopSTT, stopTTS]);

//   /* ─────────────────────────────────────────
//      SILENCE TIMER — calls advance via stable ref
//   ───────────────────────────────────────── */
//   const startSilenceTimer = useCallback(() => {
//     stopTimers();
//     setCountdown(SILENCE_MS / 1000);

//     let remaining = SILENCE_MS / 1000;
//     countdownIntervalRef.current = setInterval(() => {
//       remaining -= 1;
//       setCountdown(Math.max(0, remaining));
//       if (remaining <= 0) {
//         clearInterval(countdownIntervalRef.current);
//         countdownIntervalRef.current = null;
//       }
//     }, 1000);

//     silenceTimerRef.current = setTimeout(() => {
//       advance('timeout');
//     }, SILENCE_MS);
//   }, [stopTimers, advance]);

//   /* ─────────────────────────────────────────
//      STT
//   ───────────────────────────────────────── */
//   const startSTT = useCallback(() => {
//     if (!isSTTSupported()) {
//       alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
//       return;
//     }
//     stopSTT();
//     advancingRef.current = false;

//     const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang           = 'en-US';
//     rec.continuous     = true;
//     rec.interimResults = true;

//     rec.onstart = () => {
//       baseAnswerRef.current = '';
//       setLiveTranscript('');
//       setPhase('listening');
//       startSilenceTimer();
//     };

//     rec.onresult = (event) => {
//       // Any speech resets the silence countdown
//       stopTimers();
//       startSilenceTimer();

//       let interim = '', finalText = '';
//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         const res = event.results[i];
//         const txt = res?.[0]?.transcript || '';
//         if (!txt) continue;
//         if (res.isFinal) finalText += txt;
//         else interim += txt;
//       }
//       const base   = baseAnswerRef.current;
//       const spoken = `${finalText} ${interim}`.trim();
//       const spacer = base.trim().length && spoken.length ? ' ' : '';
//       setLiveTranscript(base + spacer + spoken);
//       if (finalText.trim()) {
//         baseAnswerRef.current = (base + (base.trim() ? ' ' : '') + finalText.trim()).trim();
//       }
//     };

//     // onerror — just stop; silence timer will handle advancing if needed
//     rec.onerror = () => { stopTimers(); };
//     // onend fires when browser cuts off; silence timer already handles advance
//     rec.onend   = () => {};

//     recognitionRef.current = rec;
//     try { rec.start(); } catch (e) { console.error('STT start failed', e); }
//   }, [stopSTT, startSilenceTimer, stopTimers]);

//   /* ─────────────────────────────────────────
//      TTS — does NOT auto-start STT on end
//      After reading → phase becomes 'ready'
//      User must press "Start Answering" button
//   ───────────────────────────────────────── */
//   const readQuestion = useCallback((q) => {
//     stopTTS();

//     if (!isTTSSupported() || muteTTS) {
//       setPhase('ready');
//       return;
//     }

//     const utter   = new SpeechSynthesisUtterance(q.question);
//     utter.rate    = 0.95;
//     utter.pitch   = 1;
//     utter.onstart = () => setTtsActive(true);
//     utter.onend   = () => { setTtsActive(false); setPhase('ready'); };
//     utter.onerror = () => { setTtsActive(false); setPhase('ready'); };

//     setPhase('reading');
//     window.speechSynthesis.speak(utter);
//   }, [muteTTS, stopTTS]);

//   /* ─────────────────────────────────────────
//      EFFECTS — all declared together, after all callbacks
//   ───────────────────────────────────────── */

//   // Trigger TTS whenever we enter 'reading' phase for a new question
//   useEffect(() => {
//     if (phase !== 'reading') return;
//     const q = questionsRef.current[currentIndex];
//     if (q) readQuestion(q);
//   }, [currentIndex, phase, readQuestion]);

//   // Fire API submit when phase hits 'submitting'
//   useEffect(() => {
//     if (phase !== 'submitting') return;
//     const finalAnswers = { ...answersRef.current };
//     questionsRef.current.forEach((q) => {
//       if (!(q.id in finalAnswers)) finalAnswers[q.id] = '';
//     });
//     onSubmit(finalAnswers)
//       .then((result) => setSubmitResult({ ok: true,  result, answers: finalAnswers }))
//       .catch(()      => setSubmitResult({ ok: false, result: null, answers: finalAnswers }));
//   }, [phase, onSubmit]);

//   // Hand off to parent once submitResult arrives
//   useEffect(() => {
//     if (!submitResult) return;
//     setPhase('finished');
//     const t = setTimeout(() => {
//       onExitToHome?.(submitResult.result, submitResult.answers);
//     }, 80);
//     return () => clearTimeout(t);
//   }, [submitResult, onExitToHome]);

//   // Cleanup on unmount
//   useEffect(() => {
//     return () => { stopSTT(); stopTTS(); };
//   }, [stopSTT, stopTTS]);

//   /* ─────────────────────────────────────────
//      HANDLERS
//   ───────────────────────────────────────── */
//   const handleMuteToggle = () => {
//     if (ttsActive) {
//       stopTTS();
//       setMuteTTS(true);
//       setPhase('ready');
//     } else {
//       setMuteTTS((m) => !m);
//     }
//   };

//   /* ─────────────────────────────────────────
//      DERIVED VALUES
//   ───────────────────────────────────────── */
//   const totalQ      = questions?.length || 0;
//   const currentQ    = questions?.[Math.min(currentIndex, totalQ - 1)];
//   const progressPct = totalQ > 0 ? (currentIndex / totalQ) * 100 : 0;
//   const isLastQ     = currentIndex + 1 >= totalQ;

//   /* ─────────────────────────────────────────
//      RENDER — NO early returns before this point (hooks are all above)
//   ───────────────────────────────────────── */
//   if (phase === 'submitting' || phase === 'finished') {
//     return (
//       <div className="vi-container">
//         <div className="vi-center-state">
//           <div className="vi-spinner">
//             <Loader size={32} className="vi-spin" />
//           </div>
//           <div className="vi-center-title">Evaluating your answers…</div>
//           <div className="vi-center-sub">This may take a few seconds</div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="vi-container">

//       {/* ── Progress bar + counter ── */}
//       <div className="vi-topbar">
//         <div className="vi-progress-wrap">
//           <div className="vi-progress-bar" style={{ width: `${progressPct}%` }} />
//         </div>
//         <div className="vi-topbar-row">
//           <span className="vi-q-counter">
//             Question <strong>{Math.min(currentIndex + 1, totalQ)}</strong> of <strong>{totalQ}</strong>
//           </span>
//           <button
//             className="btn btn-ghost btn-sm vi-mute-btn"
//             onClick={handleMuteToggle}
//             title={muteTTS ? 'Enable question reading' : 'Mute question reading'}
//           >
//             {muteTTS ? <VolumeX size={15} /> : <Volume2 size={15} />}
//             {muteTTS ? 'Reading off' : 'Reading on'}
//           </button>
//         </div>
//       </div>

//       {/* ── Question card ── */}
//       <div className="vi-question-card">
//         <div className="vi-phase-badge">
//           {phase === 'reading' && (
//             <span className="vi-badge vi-badge-reading">
//               <Volume2 size={12} /> Reading question…
//             </span>
//           )}
//           {phase === 'ready' && (
//             <span className="vi-badge vi-badge-ready">
//               <Mic size={12} /> Ready — press Start Answering
//             </span>
//           )}
//           {phase === 'listening' && (
//             <span className="vi-badge vi-badge-listening">
//               <Mic size={12} /> Listening…
//             </span>
//           )}
//         </div>

//         <div className="vi-question-text">{currentQ?.question}</div>

//         {currentQ?.topic && (
//           <div className="vi-question-meta">
//             <span className="badge badge-muted">{currentQ.topic}</span>
//             {currentQ?.bloomLevel && <span className="badge badge-blue">{currentQ.bloomLevel}</span>}
//           </div>
//         )}
//       </div>

//       {/* ── Answer area ── */}
//       <div className="vi-answer-area">

//         {phase === 'reading' && (
//           <div className="vi-reading-indicator">
//             <div className="vi-reading-dots"><span /><span /><span /></div>
//             <span className="vi-reading-label">Reading your question aloud…</span>
//           </div>
//         )}

//         {phase === 'ready' && (
//           <div className="vi-ready-prompt">
//             <div className="vi-ready-icon"><Mic size={28} /></div>
//             <p className="vi-ready-label">
//               Press <strong>Start Answering</strong> when you're ready to speak
//             </p>
//           </div>
//         )}

//         {phase === 'listening' && (
//           <>
//             <div className="vi-mic-row">
//               <div className="vi-mic-ring">
//                 <Mic size={22} style={{ color: 'var(--danger)' }} />
//               </div>
//               <CountdownRing seconds={countdown} total={SILENCE_MS / 1000} />
//               <span className="vi-countdown-label">auto-advances on silence</span>
//             </div>

//             <div className="vi-transcript-box">
//               {liveTranscript
//                 ? <p className="vi-transcript-text">{liveTranscript}</p>
//                 : <p className="vi-transcript-placeholder">Speak now — your answer will appear here…</p>
//               }
//             </div>
//           </>
//         )}
//       </div>

//       {/* ── Controls ── */}
//       <div className="vi-controls">

//         {phase === 'reading' && (
//           <button
//             className="btn btn-ghost btn-sm"
//             onClick={() => { stopTTS(); setPhase('ready'); }}
//           >
//             <Volume2 size={15} /> Skip Reading
//           </button>
//         )}

//         {phase === 'ready' && (
//           <>
//             <button className="btn btn-ghost btn-sm" onClick={() => advance('skip')}>
//               <SkipForward size={15} /> Skip Question
//             </button>
//             <button className="btn btn-primary" onClick={startSTT}>
//               <Mic size={16} /> Start Answering
//             </button>
//           </>
//         )}

//         {phase === 'listening' && (
//           <>
//             <button className="btn btn-ghost btn-sm" onClick={() => advance('skip')}>
//               <SkipForward size={15} /> Skip Question
//             </button>
//             <button className="btn btn-primary" onClick={() => advance('submit')}>
//               <CheckCircle size={16} />
//               {isLastQ ? 'Submit Final Answer' : 'Submit & Next'}
//             </button>
//           </>
//         )}

//       </div>
//     </div>
//   );
// };

// export default VoiceInterview;