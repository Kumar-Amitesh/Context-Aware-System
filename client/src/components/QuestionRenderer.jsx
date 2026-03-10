import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Mic, MicOff, HelpCircle, Trash2, ArrowRight } from 'lucide-react';

const QuestionRenderer = ({ questions, onSubmit, sessionId, onExitToHome }) => {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [listeningQid, setListeningQid] = useState(null);

  const recognitionRef = useRef(null);
  const baseAnswerRef = useRef({});
  const silenceTimerRef = useRef(null);
  const SILENCE_MS = 10_000;

  useEffect(() => {
    const init = {};
    (questions || []).forEach((q) => { init[q.id] = ''; });
    setAnswers(init);
    return () => {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setListeningQid(null);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      baseAnswerRef.current = {};
    };
  }, [questions]);

  const stripOptionPrefix = (s) => (s ?? '').toString().trim().replace(/^[A-D]\s*[\)\.\:\-]\s*/i, '').trim();
  const optionLetter = (i) => String.fromCharCode(65 + i);

  const prettyMcqFromLetter = (q, letter) => {
    if (!letter) return null;
    const L = letter.toString().trim().charAt(0).toUpperCase();
    const idx = L.charCodeAt(0) - 65;
    const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : '';
    return `${L}. ${stripOptionPrefix(rawOpt)}`.trim();
  };

  const handleInputChange = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (listeningQid === id) baseAnswerRef.current[id] = value;
  };

  const isSpeechSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => stopVoice(), SILENCE_MS);
  };

  const stopVoice = () => {
    try { recognitionRef.current?.stop(); } catch {}
    finally {
      recognitionRef.current = null;
      setListeningQid(null);
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    }
  };

  const clearAnswer = (qid) => {
    if (listeningQid === qid) stopVoice();
    setAnswers((prev) => ({ ...prev, [qid]: '' }));
    baseAnswerRef.current[qid] = '';
  };

  const startVoiceForQuestion = (qid) => {
    if (!isSpeechSupported) { alert('Speech recognition not supported (try Chrome/Edge).'); return; }
    stopVoice();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => { setListeningQid(qid); baseAnswerRef.current[qid] = answers[qid] || ''; resetSilenceTimer(); };
    rec.onresult = (event) => {
      resetSilenceTimer();
      let interim = '', finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res?.[0]?.transcript || '';
        if (!txt) continue;
        if (res.isFinal) finalText += txt; else interim += txt;
      }
      setAnswers((prev) => {
        const base = baseAnswerRef.current[qid] ?? (prev[qid] || '');
        const spoken = `${finalText} ${interim}`.trim();
        const spacer = base.trim().length && spoken.length ? ' ' : '';
        return { ...prev, [qid]: base + spacer + spoken };
      });
      if (finalText.trim().length) {
        const base = baseAnswerRef.current[qid] || '';
        baseAnswerRef.current[qid] = (base + (base.trim() ? ' ' : '') + finalText.trim()).trim();
      }
    };
    rec.onerror = () => stopVoice();
    rec.onend = () => stopVoice();
    recognitionRef.current = rec;
    rec.start();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await onSubmit(answers);
      setResults(response);
      setSubmitted(true);
      stopVoice();
    } catch (err) {
      console.error(err);
      alert('Failed to submit answers. Please try again.');
    } finally { setSubmitting(false); }
  };

  const answeredCount = Object.values(answers).filter((v) => String(v || '').trim() !== '').length;

  const diffBadge = (d) => {
    if (!d) return null;
    const cls = d === 'easy' ? 'badge-success' : d === 'medium' ? 'badge-yellow' : 'badge-danger';
    return <span className={`badge ${cls}`}>{d}</span>;
  };

  /* ─── REVIEW ─── */
  if (submitted && results) {
    const review = results.results || {};
    return (
      <div className="review-page">
        {/* Score hero */}
        <div className="score-hero">
          <div>
            <div className="score-label">Total Score</div>
            <div className="score-value">
              {typeof results.score === 'number' ? `${results.score.toFixed(1)}/10` : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="score-label">Marks</div>
            <div className="marks-value">
              {results.rawMarks?.toFixed(1) || '0'} / {results.totalMarks?.toFixed(1) || '0'}
            </div>
          </div>
        </div>

        {/* Weak topics */}
        {results.weakTopicList?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)', marginBottom: 8 }}>
              Next Focus Areas
            </div>
            <div className="config-row">
              {results.weakTopicList.map((t, i) => (
                <span key={i} className="badge badge-warning">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Analytics */}
        {results.analytics?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 12 }}>Learning Analytics</div>
            {results.analytics.slice(0, 3).map((item, idx) => (
              <div key={idx} className="analytics-card">
                <div className="analytics-row">
                  <span className="analytics-topic">{item.topic}</span>
                  <span className="analytics-score">Weakness: {Math.round((item.score || 0) * 100)}%</span>
                </div>
                {item.topWeakBlooms?.length > 0 && (
                  <div className="config-row mt-2">
                    {item.topWeakBlooms.map((b, i) => <span key={i} className="badge badge-blue">{b}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Questions */}
        {questions.map((q, idx) => {
          const r = review[q.id] || {};
          const isMCQ = q.type === 'mcq';
          const isObjective = ['mcq', 'true_false', 'fill_blank'].includes(q.type);
          const isDesc = q.type === 'descriptive';
          const score = typeof r?.understandingScore === 'number' ? r.understandingScore : null;

          return (
            <div key={q.id} className="question-review-block">
              <div className="q-review-header">
                <div className="question-number">{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div className="question-text">{q.question}</div>
                    <div className="flex gap-2 items-center" style={{ flexShrink: 0 }}>
                      {diffBadge(r?.difficulty || q?.difficulty)}
                      {isObjective && typeof r?.isCorrect === 'boolean' && (
                        r.isCorrect
                          ? <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                          : <XCircle size={20} style={{ color: 'var(--danger)' }} />
                      )}
                      {isDesc && score !== null && (
                        <span className="badge badge-muted">Score: {score}/10</span>
                      )}
                    </div>
                  </div>
                  <div className="question-meta">
                    {(r?.topic || q?.topic) && <span className="badge badge-muted">{r?.topic || q?.topic}</span>}
                    {(r?.bloomLevel || q?.bloomLevel) && <span className="badge badge-blue">{r?.bloomLevel || q?.bloomLevel}</span>}
                    {r?.maxMarks != null && (
                      <span className="badge badge-muted">
                        {Number(r?.awardedMarks || 0).toFixed(1)} / {r.maxMarks} marks
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="q-review-body">
                <div className="result-box">
                  <div className="result-box-label">Your Answer</div>
                  <div className="result-box-content">
                    {isMCQ ? (prettyMcqFromLetter(q, answers[q.id]) || <span style={{ color: 'var(--text-muted)' }}>Not answered</span>)
                      : (answers[q.id] || <span style={{ color: 'var(--text-muted)' }}>Not answered</span>)}
                  </div>
                </div>

                {isObjective && (
                  <div className="result-box">
                    <div className="result-box-label">Correct Answer</div>
                    <div className="result-box-content">
                      {r?.correctAnswer ? (isMCQ ? prettyMcqFromLetter(q, r.correctAnswer) : r.correctAnswer)
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </div>
                  </div>
                )}

                {(r?.explanation || r?.sampleAnswer || r?.missing?.length) && (
                  <div className="explanation-box">
                    <div className="explanation-title">
                      <HelpCircle size={16} /> Explanation
                    </div>
                    {r?.explanation && <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{r.explanation}</p>}
                    {isDesc && r?.sampleAnswer && (
                      <>
                        <div className="sample-answer-title">Sample Answer</div>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{r.sampleAnswer}</div>
                      </>
                    )}
                    {isDesc && r?.missing?.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>Missing Concepts</div>
                        <div className="config-row">
                          {r.missing.map((m, i) => <span key={i} className="badge badge-orange">{m}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Bottom nav */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => { setSubmitted(false); setResults(null); }}>
            Back to Questions
          </button>
          <button className="btn btn-primary" onClick={() => { stopVoice(); setSubmitted(false); setResults(null); setAnswers({}); onExitToHome?.(); }}>
            Exit to Home
          </button>
        </div>
      </div>
    );
  }

  /* ─── QUESTION FORM ─── */
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {questions.map((q, idx) => (
        <div key={q.id} className="question-card">
          <div className="question-header">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div className="question-number">{idx + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="question-text">{q.question}</div>
                <div className="question-meta">
                  {q.topic && <span className="badge badge-muted">{q.topic}</span>}
                  {diffBadge(q.difficulty)}
                  {q.bloomLevel && <span className="badge badge-blue">{q.bloomLevel}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="question-body">
            {q.type === 'mcq' && (
              (q.options || []).map((opt, optIdx) => {
                const letter = optionLetter(optIdx);
                return (
                  <label key={optIdx} className={`mcq-option ${answers[q.id] === letter ? 'selected' : ''}`}>
                    <input
                      type="radio" name={`q-${q.id}`}
                      checked={answers[q.id] === letter}
                      onChange={() => handleInputChange(q.id, letter)}
                    />
                    <span>{letter}. {stripOptionPrefix(opt)}</span>
                  </label>
                );
              })
            )}

            {q.type === 'true_false' && (
              ['True', 'False'].map((opt) => (
                <label key={opt} className={`mcq-option ${answers[q.id] === opt ? 'selected' : ''}`}>
                  <input
                    type="radio" name={`q-${q.id}`}
                    checked={answers[q.id] === opt}
                    onChange={() => handleInputChange(q.id, opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))
            )}

            {(q.type === 'descriptive' || q.type === 'fill_blank') && (
              <div>
                <div className="answer-controls">
                  <span className="answer-hint">
                    {q.type === 'fill_blank' ? 'Fill in the blank' : 'Auto-stops after 10s silence'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {q.type === 'descriptive' && (
                      <button
                        type="button"
                        className={`voice-btn ${listeningQid === q.id ? 'listening' : ''}`}
                        onClick={() => listeningQid === q.id ? stopVoice() : startVoiceForQuestion(q.id)}
                        disabled={!isSpeechSupported}
                      >
                        {listeningQid === q.id ? <MicOff size={14} /> : <Mic size={14} />}
                        {listeningQid === q.id ? 'Listening…' : 'Speak'}
                      </button>
                    )}
                    <button type="button" className="voice-btn" onClick={() => clearAnswer(q.id)}>
                      <Trash2 size={14} /> Clear
                    </button>
                  </div>
                </div>
                <textarea
                  className="input"
                  value={answers[q.id] || ''}
                  onChange={(e) => handleInputChange(q.id, e.target.value)}
                  placeholder={q.type === 'fill_blank' ? 'Type your answer…' : 'Type or use mic…'}
                />
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Sticky submit */}
      <div className="submit-bar">
        <div className="progress-text">
          <span className="progress-count">{answeredCount}</span> / {questions.length} answered
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting || answeredCount === 0}
        >
          {submitting ? 'Submitting…' : 'Submit Test'}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default QuestionRenderer;





























// import React, { useState, useEffect, useRef } from "react";
// import { CheckCircle, XCircle, Mic, MicOff, HelpCircle, Trash2 } from "lucide-react";

// const QuestionRenderer = ({ questions, onSubmit, sessionId, onExitToHome }) => {
//   const [answers, setAnswers] = useState({});
//   const [submitted, setSubmitted] = useState(false);
//   const [results, setResults] = useState(null);
//   const [submitting, setSubmitting] = useState(false);

//   const [listeningQid, setListeningQid] = useState(null);

//   const recognitionRef = useRef(null);
//   const baseAnswerRef = useRef({});
//   const silenceTimerRef = useRef(null);
//   const SILENCE_MS = 10_000;

//   useEffect(() => {
//     const initialAnswers = {};
//     (questions || []).forEach((q) => {
//       initialAnswers[q.id] = "";
//     });
//     setAnswers(initialAnswers);

//     return () => {
//       try {
//         recognitionRef.current?.stop();
//       } catch (e) {
//       } finally {
//         recognitionRef.current = null;
//         setListeningQid(null);
//       }

//       if (silenceTimerRef.current) {
//         clearTimeout(silenceTimerRef.current);
//         silenceTimerRef.current = null;
//       }

//       baseAnswerRef.current = {};
//     };
//   }, [questions]);

//   const stripOptionPrefix = (s) => {
//     const txt = (s ?? "").toString().trim();
//     return txt.replace(/^[A-D]\s*[\)\.\:\-]\s*/i, "").trim();
//   };

//   const handleInputChange = (id, value) => {
//     setAnswers((prev) => ({ ...prev, [id]: value }));
//     if (listeningQid === id) {
//       baseAnswerRef.current[id] = value;
//     }
//   };

//   const isSpeechSupported =
//     typeof window !== "undefined" &&
//     ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

//   const resetSilenceTimer = () => {
//     if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
//     silenceTimerRef.current = setTimeout(() => {
//       stopVoice();
//     }, SILENCE_MS);
//   };

//   const stopVoice = () => {
//     try {
//       recognitionRef.current?.stop();
//     } catch (e) {
//     } finally {
//       recognitionRef.current = null;
//       setListeningQid(null);

//       if (silenceTimerRef.current) {
//         clearTimeout(silenceTimerRef.current);
//         silenceTimerRef.current = null;
//       }
//     }
//   };

//   const clearAnswer = (qid) => {
//     if (listeningQid === qid) stopVoice();
//     setAnswers((prev) => ({ ...prev, [qid]: "" }));
//     baseAnswerRef.current[qid] = "";
//   };

//   const startVoiceForQuestion = (qid) => {
//     if (!isSpeechSupported) {
//       alert("Speech recognition is not supported (try Chrome/Edge).");
//       return;
//     }

//     stopVoice();

//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const recognition = new SpeechRecognition();

//     recognition.lang = "en-US";
//     recognition.continuous = true;
//     recognition.interimResults = true;

//     recognition.onstart = () => {
//       setListeningQid(qid);
//       baseAnswerRef.current[qid] = answers[qid] || "";
//       resetSilenceTimer();
//     };

//     recognition.onresult = (event) => {
//       resetSilenceTimer();

//       let interim = "";
//       let finalText = "";

//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         const res = event.results[i];
//         const txt = res?.[0]?.transcript || "";
//         if (!txt) continue;

//         if (res.isFinal) finalText += txt;
//         else interim += txt;
//       }

//       setAnswers((prev) => {
//         const base = baseAnswerRef.current[qid] ?? (prev[qid] || "");
//         const combinedSpoken = `${finalText} ${interim}`.trim();
//         const spacer = base.trim().length && combinedSpoken.length ? " " : "";
//         return { ...prev, [qid]: base + spacer + combinedSpoken };
//       });

//       if (finalText.trim().length) {
//         const base = baseAnswerRef.current[qid] || "";
//         const spacer = base.trim().length ? " " : "";
//         baseAnswerRef.current[qid] = (base + spacer + finalText.trim()).trim();
//       }
//     };

//     recognition.onerror = () => stopVoice();
//     recognition.onend = () => stopVoice();

//     recognitionRef.current = recognition;
//     recognition.start();
//   };

//   const handleSubmit = async () => {
//     setSubmitting(true);
//     try {
//       const response = await onSubmit(answers);
//       setResults(response);
//       setSubmitted(true);
//       stopVoice();
//     } catch (error) {
//       console.error("Error submitting answers:", error);
//       alert("Failed to submit answers. Please try again.");
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const optionLetter = (optIdx) => String.fromCharCode(65 + optIdx);

//   const prettyMcqFromLetter = (q, letter) => {
//     if (!letter) return null;
//     const L = letter.toString().trim().charAt(0).toUpperCase();
//     const idx = L.charCodeAt(0) - 65;
//     const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
//     return `${L}. ${stripOptionPrefix(rawOpt)}`.trim();
//   };

//   const answeredCount = Object.values(answers).filter(
//     (v) => String(v || "").trim() !== ""
//   ).length;

//   if (submitted && results) {
//     const review = results.results || {};

//     return (
//       <div className="max-w-4xl mx-auto">
//         <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
//           <div className="flex items-center justify-between mb-5">
//             <h2 className="text-2xl font-bold text-gray-800">Review</h2>

//             <div className="flex gap-2">
//               <button
//                 onClick={() => {
//                   setSubmitted(false);
//                   setResults(null);
//                 }}
//                 className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
//               >
//                 Back to Questions
//               </button>

//               <button
//                 onClick={() => {
//                   stopVoice();
//                   setSubmitted(false);
//                   setResults(null);
//                   setAnswers({});
//                   onExitToHome?.();
//                 }}
//                 className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
//               >
//                 Exit to Home
//               </button>
//             </div>
//           </div>

//           {results.weakTopicList?.length > 0 && (
//             <div className="mb-6 p-4 rounded-lg border bg-orange-50">
//               <div className="font-medium text-orange-800 mb-2">Next Focus Areas</div>
//               <div className="flex flex-wrap gap-2">
//                 {results.weakTopicList.map((t, i) => (
//                   <span
//                     key={i}
//                     className="px-3 py-1 text-xs bg-white border border-orange-200 text-orange-800 rounded-full"
//                   >
//                     {t}
//                   </span>
//                 ))}
//               </div>
//             </div>
//           )}

//           {results.analytics?.length > 0 && (
//             <div className="mb-6 p-4 rounded-lg border bg-indigo-50">
//               <div className="font-medium text-indigo-800 mb-3">Learning Analytics</div>
//               <div className="space-y-3">
//                 {results.analytics.slice(0, 3).map((item, idx) => (
//                   <div key={idx} className="p-3 bg-white rounded border">
//                     <div className="flex items-center justify-between mb-2">
//                       <div className="font-medium text-gray-800">{item.topic}</div>
//                       <div className="text-sm text-gray-600">
//                         Weakness: {Math.round((item.score || 0) * 100)}%
//                       </div>
//                     </div>

//                     <div className="text-xs text-gray-500 mb-2">Seen {item.seen || 0} times</div>

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

//           <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
//             <div className="flex justify-between items-center">
//               <div>
//                 <span className="text-sm text-gray-600">Total Score</span>
//                 <div className="text-3xl font-bold text-indigo-700">
//                   {typeof results.score === "number" ? `${results.score.toFixed(1)}/10` : "—"}
//                 </div>
//               </div>
//               <div className="text-right">
//                 <span className="text-sm text-gray-600">Marks</span>
//                 <div className="text-xl font-semibold text-gray-800">
//                   {results.rawMarks?.toFixed(1) || "0"} / {results.totalMarks?.toFixed(1) || "0"}
//                 </div>
//               </div>
//             </div>
//           </div>

//           <div className="space-y-8">
//             {questions.map((q, idx) => {
//               const r = review[q.id] || {};
//               const isMCQ = q.type === "mcq";
//               const isTF = q.type === "true_false";
//               const isFill = q.type === "fill_blank";
//               const isDesc = q.type === "descriptive";
//               const isObjective = isMCQ || isTF || isFill;

//               const isCorrect = r?.isCorrect;
//               const score = typeof r?.understandingScore === "number" ? r.understandingScore : null;

//               return (
//                 <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
//                   <div className="flex gap-3 mb-3">
//                     <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
//                       {idx + 1}
//                     </span>

//                     <div className="flex-1">
//                       <div className="flex items-start justify-between gap-3">
//                         <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>

//                         <div className="flex items-center gap-2">
//                           {(r?.difficulty || q?.difficulty) && (
//                             <span className={`text-xs px-2 py-1 rounded ${
//                               (r?.difficulty || q?.difficulty) === "easy"
//                                 ? "bg-green-100 text-green-700"
//                                 : (r?.difficulty || q?.difficulty) === "medium"
//                                 ? "bg-yellow-100 text-yellow-700"
//                                 : "bg-red-100 text-red-700"
//                             }`}>
//                               {r?.difficulty || q?.difficulty}
//                             </span>
//                           )}

//                           {isObjective && typeof isCorrect === "boolean" && (
//                             isCorrect ? (
//                               <CheckCircle className="text-green-600" size={22} />
//                             ) : (
//                               <XCircle className="text-red-600" size={22} />
//                             )
//                           )}

//                           {isDesc && score !== null && (
//                             <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
//                               Score: {score}/10
//                             </span>
//                           )}
//                         </div>
//                       </div>

//                       <div className="flex flex-wrap items-center gap-2 mt-1">
//                         {(r?.topic || q?.topic) && (
//                           <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
//                             {r?.topic || q?.topic}
//                           </span>
//                         )}

//                         {(r?.bloomLevel || q?.bloomLevel) && (
//                           <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
//                             {r?.bloomLevel || q?.bloomLevel}
//                           </span>
//                         )}
//                       </div>

//                       {r?.maxMarks !== undefined && r?.maxMarks !== null && (
//                         <div className="mt-2 text-sm">
//                           <span className="text-gray-600">Marks: </span>
//                           <span className="font-medium">{Number(r?.awardedMarks || 0).toFixed(1)}</span>
//                           <span className="text-gray-500"> / {r.maxMarks}</span>
//                           {r.negativeMarks > 0 && (
//                             <span className="ml-2 text-xs text-red-600">
//                               (-{r.negativeMarks} for wrong)
//                             </span>
//                           )}
//                         </div>
//                       )}
//                     </div>
//                   </div>

//                   <div className="ml-11 space-y-3">
//                     <div className="p-3 rounded border bg-gray-50">
//                       <div className="text-xs text-gray-500 mb-1">Your Answer</div>
//                       <div className="text-gray-800 whitespace-pre-wrap">
//                         {isMCQ ? (
//                           prettyMcqFromLetter(q, answers[q.id]) || <span className="text-gray-400">Not answered</span>
//                         ) : (
//                           answers[q.id] || <span className="text-gray-400">Not answered</span>
//                         )}
//                       </div>
//                     </div>

//                     {isObjective && (
//                       <div className="p-3 rounded border">
//                         <div className="text-xs text-gray-500 mb-1">Correct Answer</div>
//                         <div className="text-gray-800">
//                           {r?.correctAnswer ? (
//                             isMCQ ? prettyMcqFromLetter(q, r.correctAnswer) : r.correctAnswer
//                           ) : (
//                             <span className="text-gray-400">—</span>
//                           )}
//                         </div>
//                       </div>
//                     )}

//                     {(r?.explanation || r?.sampleAnswer || (r?.missing && r.missing.length)) && (
//                       <div className="p-4 rounded-lg border">
//                         <div className="flex items-center gap-2 mb-2">
//                           <HelpCircle size={18} className="text-indigo-600" />
//                           <span className="font-medium text-gray-800">Explanation</span>
//                         </div>

//                         {r?.explanation && (
//                           <p className="text-gray-700 whitespace-pre-wrap">{r.explanation}</p>
//                         )}

//                         {isDesc && r?.sampleAnswer && (
//                           <div className="mt-3">
//                             <div className="text-sm font-semibold text-gray-800 mb-1">Sample Answer</div>
//                             <div className="text-gray-700 whitespace-pre-wrap">{r.sampleAnswer}</div>
//                           </div>
//                         )}

//                         {isDesc && r?.missing && r.missing.length > 0 && (
//                           <div className="mt-3">
//                             <div className="text-sm font-semibold text-orange-700 mb-1">Missing Concepts</div>
//                             <div className="flex flex-wrap gap-1">
//                               {r.missing.map((m, i) => (
//                                 <span key={i} className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
//                                   {m}
//                                 </span>
//                               ))}
//                             </div>
//                           </div>
//                         )}
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="mt-8 pt-6 border-t flex items-center justify-between">
//             <div className="text-sm text-gray-500">Session ID: {sessionId}</div>
//             <div className="text-right">
//               <div className="text-sm text-gray-500">Final Score</div>
//               <div className="text-2xl font-bold text-gray-800">
//                 {typeof results.score === "number" ? `${results.score.toFixed(1)}/10` : "—"}
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="max-w-4xl mx-auto">
//       <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
//         <div className="flex items-center justify-between mb-6">
//           <h2 className="text-2xl font-bold text-gray-800">Practice Questions</h2>

//           {!isSpeechSupported && (
//             <div className="text-xs text-gray-500">Voice input not supported (try Chrome/Edge).</div>
//           )}
//         </div>

//         <div className="space-y-8">
//           {questions.map((q, idx) => (
//             <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
//               <div className="flex gap-3 mb-4">
//                 <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
//                   {idx + 1}
//                 </span>
//                 <div className="flex-1">
//                   <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>
//                   <div className="flex flex-wrap items-center gap-2 mt-1">
//                     {q.topic && (
//                       <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
//                         {q.topic}
//                       </span>
//                     )}
//                     {q.difficulty && (
//                       <span className={`text-xs px-2 py-1 rounded ${
//                         q.difficulty === "easy"
//                           ? "bg-green-100 text-green-700"
//                           : q.difficulty === "medium"
//                           ? "bg-yellow-100 text-yellow-700"
//                           : "bg-red-100 text-red-700"
//                       }`}>
//                         {q.difficulty}
//                       </span>
//                     )}
//                     {q.bloomLevel && (
//                       <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
//                         {q.bloomLevel}
//                       </span>
//                     )}
//                   </div>
//                 </div>
//               </div>

//               {q.type === "mcq" && (
//                 <div className="ml-11 space-y-2">
//                   {(q.options || []).map((opt, optIdx) => {
//                     const letter = optionLetter(optIdx);
//                     return (
//                       <label
//                         key={optIdx}
//                         className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition"
//                       >
//                         <input
//                           type="radio"
//                           name={`q-${q.id}`}
//                           checked={answers[q.id] === letter}
//                           onChange={() => handleInputChange(q.id, letter)}
//                           className="mr-3 w-4 h-4 text-indigo-600"
//                         />
//                         <span className="text-gray-700">{stripOptionPrefix(opt)}</span>
//                       </label>
//                     );
//                   })}
//                 </div>
//               )}

//               {q.type === "true_false" && (
//                 <div className="ml-11 space-y-2">
//                   {["True", "False"].map((opt) => (
//                     <label
//                       key={opt}
//                       className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition"
//                     >
//                       <input
//                         type="radio"
//                         name={`q-${q.id}`}
//                         checked={answers[q.id] === opt}
//                         onChange={() => handleInputChange(q.id, opt)}
//                         className="mr-3 w-4 h-4 text-indigo-600"
//                       />
//                       <span className="text-gray-700">{opt}</span>
//                     </label>
//                   ))}
//                 </div>
//               )}

//               {(q.type === "descriptive" || q.type === "fill_blank") && (
//                 <div className="ml-11">
//                   <div className="flex items-center justify-between mb-2">
//                     <div className="text-sm text-gray-500">
//                       {q.type === "fill_blank"
//                         ? "Fill in the blank"
//                         : "Speak to type (auto-stops after 10s silence)"}
//                     </div>

//                     <div className="flex items-center gap-2">
//                       {q.type === "descriptive" && (
//                         <button
//                           type="button"
//                           onClick={() => (listeningQid === q.id ? stopVoice() : startVoiceForQuestion(q.id))}
//                           disabled={!isSpeechSupported}
//                           className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg transition border ${
//                             listeningQid === q.id
//                               ? "bg-red-50 text-red-600 border-red-200"
//                               : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
//                           } disabled:opacity-50 disabled:cursor-not-allowed`}
//                           title={listeningQid === q.id ? "Stop listening" : "Start voice input"}
//                         >
//                           {listeningQid === q.id ? <MicOff size={18} /> : <Mic size={18} />}
//                           <span className="text-sm">{listeningQid === q.id ? "Listening…" : "Speak"}</span>
//                         </button>
//                       )}

//                       <button
//                         type="button"
//                         onClick={() => clearAnswer(q.id)}
//                         className="inline-flex items-center gap-2 px-3 py-2 rounded-lg transition border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
//                         title="Clear answer"
//                       >
//                         <Trash2 size={18} />
//                         <span className="text-sm">Clear</span>
//                       </button>
//                     </div>
//                   </div>

//                   <textarea
//                     value={answers[q.id] || ""}
//                     onChange={(e) => handleInputChange(q.id, e.target.value)}
//                     placeholder={q.type === "fill_blank" ? "Type your answer here..." : "Type your answer here... (or use mic)"}
//                     className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-32"
//                   />
//                 </div>
//               )}
//             </div>
//           ))}
//         </div>

//         <button
//           onClick={handleSubmit}
//           disabled={submitting || answeredCount === 0}
//           className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
//         >
//           {submitting ? "Submitting..." : "Submit Test"}
//         </button>
//       </div>
//     </div>
//   );
// };

// export default QuestionRenderer;
