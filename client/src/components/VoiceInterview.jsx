import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Loader, Radio, Volume2, AlertCircle, CheckCircle2 } from 'lucide-react';
import './LiveVoiceInterview.css';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const WS_BASE = 'ws://localhost:5000';
const PCM_SAMPLE_RATE = 16000;   // Gemini Live expects 16kHz PCM input
const PLAYBACK_RATE   = 24000;   // Gemini Live outputs 24kHz PCM

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIO HELPERS
───────────────────────────────────────────────────────────────────────────── */

/** Convert Float32Array → Int16 PCM → base64 */
function float32ToBase64Pcm(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** base64 PCM → Float32Array for Web Audio playback */
function base64PcmToFloat32(b64, sampleRate = PLAYBACK_RATE) {
  const binary = atob(b64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16   = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
  return float32;
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIO QUEUE  — plays PCM chunks sequentially without gaps
───────────────────────────────────────────────────────────────────────────── */
class AudioQueue {
  constructor(audioCtx) {
    this.ctx       = audioCtx;
    this.nextTime  = 0;
    this.playing   = false;
  }

  enqueue(float32Data) {
    const buf = this.ctx.createBuffer(1, float32Data.length, PLAYBACK_RATE);
    buf.copyToChannel(float32Data, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    const start = Math.max(now, this.nextTime);
    src.start(start);
    this.nextTime = start + buf.duration;
    this.playing  = true;
    src.onended   = () => { if (this.nextTime <= this.ctx.currentTime) this.playing = false; };
  }

  clear() {
    this.nextTime = 0;
    this.playing  = false;
    // AudioBufferSourceNodes can't be stopped externally after start,
    // but clearing nextTime means new chunks play from "now" after a barge-in.
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────────────────────────────────────────── */
const StatusBadge = ({ phase }) => {
  const map = {
    connecting:   { icon: <Loader size={12} className="li-spin" />,  label: 'Connecting…',    color: '#a78bfa' },
    ready:        { icon: <Radio  size={12} />,                       label: 'Live',            color: '#34d399' },
    interviewer:  { icon: <Volume2 size={12} />,                      label: 'Interviewer speaking', color: '#60a5fa' },
    listening:    { icon: <Mic   size={12} />,                        label: 'Listening…',     color: '#f87171' },
    thinking:     { icon: <Loader size={12} className="li-spin" />,   label: 'Thinking…',      color: '#fbbf24' },
    done:         { icon: <CheckCircle2 size={12} />,                 label: 'Complete',        color: '#34d399' },
    error:        { icon: <AlertCircle  size={12} />,                 label: 'Error',           color: '#f87171' },
  };
  const s = map[phase] || map.ready;
  return (
    <span className="li-status-badge" style={{ '--badge-color': s.color }}>
      {s.icon} {s.label}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   WAVEFORM VISUALISER  (canvas, reads analyser node)
───────────────────────────────────────────────────────────────────────────── */
const Waveform = ({ analyserRef, active }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (!analyserRef.current || !active) {
        // idle flat line
        ctx.strokeStyle = 'rgba(148,163,184,0.3)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        return;
      }

      const bufLen = analyserRef.current.fftSize;
      const data   = new Float32Array(bufLen);
      analyserRef.current.getFloatTimeDomainData(data);

      ctx.strokeStyle = 'rgba(96,165,250,0.85)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      const step = W / bufLen;
      for (let i = 0; i < bufLen; i++) {
        const x = i * step;
        const y = (data[i] * 0.8 + 1) / 2 * H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef, active]);

  return <canvas ref={canvasRef} className="li-waveform" width={600} height={80} />;
};

/* ─────────────────────────────────────────────────────────────────────────────
   TRANSCRIPT PANEL
───────────────────────────────────────────────────────────────────────────── */
const TranscriptPanel = ({ entries }) => {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries]);

  return (
    <div className="li-transcript-panel">
      {entries.length === 0 && (
        <p className="li-transcript-empty">Transcript will appear here as the interview progresses…</p>
      )}
      {entries.map((e, i) => (
        <div key={i} className={`li-transcript-entry li-entry-${e.role}`}>
          <span className="li-entry-role">{e.role === 'interviewer' ? '🎙 Interviewer' : '🧑 You'}</span>
          <span className="li-entry-text">{e.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
const VoiceInterview = ({ questions, sessionId, onFinished, onExit }) => {

  /* ── state ── */
  const [phase,      setPhase]      = useState('connecting');   // see StatusBadge map
  const [muted,      setMuted]      = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [error,      setError]      = useState(null);
  const [qProgress,  setQProgress]  = useState(0);   // rough question counter from server

  /* ── refs ── */
  const wsRef          = useRef(null);
  const audioCtxRef    = useRef(null);
  const audioQueueRef  = useRef(null);
  const analyserRef    = useRef(null);
  const micStreamRef   = useRef(null);
  const processorRef   = useRef(null);   // ScriptProcessorNode (legacy, widest support)
  const mutedRef       = useRef(false);
  const interviewerBufRef = useRef(''); // accumulate partial interviewer transcript

  /* keep mutedRef in sync */
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  /* ── append transcript entry (merge consecutive same-role chunks) ── */
  const appendTranscript = useCallback((role, text) => {
    setTranscript(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + ' ' + text }];
      }
      return [...prev, { role, text }];
    });
  }, []);

  /* ── start microphone capture ── */
  const startMic = useCallback(async (audioCtx) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: PCM_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    micStreamRef.current = stream;

    const source   = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    // ScriptProcessorNode — deprecated but works everywhere; worklet adds complexity
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (mutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const pcmData = float32ToBase64Pcm(e.inputBuffer.getChannelData(0));
      wsRef.current.send(JSON.stringify({ type: 'audio_chunk', data: pcmData }));
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);   // must be connected to run
    processorRef.current = processor;
  }, []);

  /* ── connect WebSocket ── */
  useEffect(() => {
    const token = localStorage.getItem('token');
    const url   = `${WS_BASE}/ws/live-interview/${sessionId}?token=${token}`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: PLAYBACK_RATE });
    audioCtxRef.current  = audioCtx;
    audioQueueRef.current = new AudioQueue(audioCtx);

    ws.onopen = () => setPhase('connecting');

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {

        case 'proxy_ready':
          // backend connected to Gemini, waiting for setup ack
          break;

        case 'gemini_ready':
          // Gemini session is live — start mic
          try {
            await startMic(audioCtx);
            setPhase('ready');
          } catch {
            setError('Microphone access denied. Please allow microphone and refresh.');
            setPhase('error');
          }
          break;

        case 'audio_chunk': {
          // Play Gemini's audio response
          setPhase('interviewer');
          const float32 = base64PcmToFloat32(msg.data);
          audioQueueRef.current.enqueue(float32);
          break;
        }

        case 'interviewer_transcript':
          // Accumulate partial transcripts
          interviewerBufRef.current += msg.text;
          break;

        case 'turn_complete':
          // Flush interviewer transcript buffer
          if (interviewerBufRef.current.trim()) {
            appendTranscript('interviewer', interviewerBufRef.current.trim());
            // Detect question progress (rough: count '?' chars in the text)
            if (interviewerBufRef.current.includes('?')) {
              setQProgress(p => Math.min(p + 1, questions.length));
            }
            interviewerBufRef.current = '';
          }
          setPhase('listening');
          break;

        case 'candidate_transcript':
          if (msg.text?.trim()) appendTranscript('candidate', msg.text.trim());
          break;

        case 'interrupted':
          // Gemini stopped speaking (barge-in) — clear audio queue
          audioQueueRef.current.clear();
          setPhase('listening');
          break;

        case 'interview_done':
          setPhase('done');
          ws.close();
          setTimeout(() => onFinished?.(), 1500);
          break;

        case 'error':
          setError(msg.detail || 'Unknown error from server');
          setPhase('error');
          break;

        default:
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed. Check server logs.');
      setPhase('error');
    };

    ws.onclose = () => {
      if (phase !== 'done') setPhase('error');
    };

    return () => {
      ws.close();
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      processorRef.current?.disconnect();
      audioCtx.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);   // only run once on mount

  /* ── handlers ── */
  const handleMuteToggle = () => {
    setMuted(m => !m);
    if (!muted) {
      // send audioStreamEnd so Gemini doesn't wait for more input
      wsRef.current?.send(JSON.stringify({ type: 'audio_stream_end' }));
    }
  };

  const handleExit = () => {
    wsRef.current?.close();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    onExit?.();
  };

  /* ── render ── */
  const isMicActive = phase === 'listening' || phase === 'ready';
  const progress    = questions.length > 0 ? (qProgress / questions.length) * 100 : 0;

  return (
    <div className="li-container">

      {/* ── progress bar ── */}
      <div className="li-progress-track">
        <div className="li-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* ── header ── */}
      <div className="li-header">
        <div className="li-header-left">
          <div className="li-logo-dot" />
          <span className="li-logo-label">Live Interview</span>
          <StatusBadge phase={phase} />
        </div>
        <div className="li-header-right">
          <span className="li-q-count">
            {qProgress} / {questions.length} questions
          </span>
          <button className="li-btn li-btn-danger" onClick={handleExit} title="End interview">
            <PhoneOff size={16} /> End
          </button>
        </div>
      </div>

      {/* ── waveform ── */}
      <div className="li-waveform-wrap">
        <Waveform analyserRef={analyserRef} active={isMicActive && !muted} />
        <div className="li-waveform-label">
          {muted
            ? <><MicOff size={13} /> Microphone muted</>
            : isMicActive
              ? <><Mic size={13} className="li-pulse-icon" /> Listening for your voice</>
              : phase === 'interviewer'
                ? <><Volume2 size={13} /> Interviewer speaking</>
                : phase === 'connecting' || phase === 'ready'
                  ? <><Loader size={13} className="li-spin" /> Setting up session…</>
                  : null
          }
        </div>
      </div>

      {/* ── error banner ── */}
      {error && (
        <div className="li-error-banner">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── done banner ── */}
      {phase === 'done' && (
        <div className="li-done-banner">
          <CheckCircle2 size={18} /> Interview complete! Processing your results…
        </div>
      )}

      {/* ── transcript ── */}
      <TranscriptPanel entries={transcript} />

      {/* ── controls ── */}
      <div className="li-controls">
        <button
          className={`li-btn li-btn-mute ${muted ? 'li-btn-muted' : ''}`}
          onClick={handleMuteToggle}
          disabled={phase === 'connecting' || phase === 'done' || phase === 'error'}
        >
          {muted ? <><MicOff size={16} /> Unmute</> : <><Mic size={16} /> Mute</>}
        </button>

        <div className="li-hint">
          {phase === 'listening' && !muted && 'Speak naturally — Gemini will hear you and respond in real time'}
          {phase === 'interviewer' && 'You can interrupt by speaking'}
          {phase === 'thinking' && 'Gemini is thinking…'}
          {muted && 'You are muted — interviewer cannot hear you'}
        </div>
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
//      'buffering'  TTS done, 800ms echo-fade pause before STT auto-starts
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
//   const ttsDelayRef          = useRef(null);  // holds the 800ms buffer timer
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
//     if (ttsDelayRef.current) { clearTimeout(ttsDelayRef.current); ttsDelayRef.current = null; }
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
//      BUFFER → AUTO-START STT
//      Called after TTS ends (or skipped).
//      Waits 800ms for speaker echo to fade, then
//      starts STT automatically. User can press
//      "Start now" to skip the wait.
//   ───────────────────────────────────────── */
//   const startBufferThenSTT = useCallback(() => {
//     if (ttsDelayRef.current) clearTimeout(ttsDelayRef.current);
//     setPhase('buffering');
//     ttsDelayRef.current = setTimeout(() => {
//       ttsDelayRef.current = null;
//       startSTT();
//     }, 800);
//   }, [startSTT]);

//   /* ─────────────────────────────────────────
//      TTS — auto-starts STT after 800ms buffer
//   ───────────────────────────────────────── */
//   const readQuestion = useCallback((q) => {
//     stopTTS();

//     if (!isTTSSupported() || muteTTS) {
//       // No TTS — still buffer briefly so UI doesn't feel instant/jarring
//       startBufferThenSTT();
//       return;
//     }

//     const utter   = new SpeechSynthesisUtterance(q.question);
//     utter.rate    = 0.95;
//     utter.pitch   = 1;
//     utter.onstart = () => setTtsActive(true);
//     utter.onend   = () => { setTtsActive(false); startBufferThenSTT(); };
//     utter.onerror = () => { setTtsActive(false); startBufferThenSTT(); };

//     setPhase('reading');
//     window.speechSynthesis.speak(utter);
//   }, [muteTTS, stopTTS, startBufferThenSTT]);

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
//     return () => {
//       stopSTT(); stopTTS();
//       if (ttsDelayRef.current) clearTimeout(ttsDelayRef.current);
//     };
//   }, [stopSTT, stopTTS]);

//   /* ─────────────────────────────────────────
//      HANDLERS
//   ───────────────────────────────────────── */
//   const handleMuteToggle = () => {
//     if (ttsActive) {
//       stopTTS();
//       setMuteTTS(true);
//       startBufferThenSTT(); // jump straight to buffer → auto-start STT
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
//           {phase === 'buffering' && (
//             <span className="vi-badge vi-badge-ready">
//               <Mic size={12} /> Get ready…
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

//         {phase === 'buffering' && (
//           <div className="vi-ready-prompt">
//             <div className="vi-ready-icon vi-ready-icon--pulse"><Mic size={28} /></div>
//             <p className="vi-ready-label">Microphone starting…</p>
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
//             onClick={() => { stopTTS(); startBufferThenSTT(); }}
//           >
//             <Volume2 size={15} /> Skip Reading
//           </button>
//         )}

//         {phase === 'buffering' && (
//           <>
//             <button className="btn btn-ghost btn-sm" onClick={() => advance('skip')}>
//               <SkipForward size={15} /> Skip Question
//             </button>
//             <button className="btn btn-primary" onClick={() => {
//               if (ttsDelayRef.current) { clearTimeout(ttsDelayRef.current); ttsDelayRef.current = null; }
//               startSTT();
//             }}>
//               <Mic size={16} /> Start now
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