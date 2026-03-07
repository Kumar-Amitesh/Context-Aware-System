import React, { useState, useEffect, useRef } from "react";
import { CheckCircle, XCircle, Mic, MicOff, HelpCircle, Trash2 } from "lucide-react";

const QuestionRenderer = ({ questions, onSubmit, sessionId, onExitToHome }) => {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ per-question listening state
  const [listeningQid, setListeningQid] = useState(null);

  const recognitionRef = useRef(null);
  const baseAnswerRef = useRef({}); // { [qid]: string }

  const silenceTimerRef = useRef(null);
  const SILENCE_MS = 10_000;

  useEffect(() => {
    const initialAnswers = {};
    (questions || []).forEach((q) => {
      initialAnswers[q.id] = ""; // for MCQ this will become "A"/"B"... when selected
    });
    setAnswers(initialAnswers);

    // cleanup on unmount / questions change
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        // ignore
      } finally {
        recognitionRef.current = null;
        setListeningQid(null);
      }

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      baseAnswerRef.current = {};
    };
  }, [questions]);

  const stripOptionPrefix = (s) => {
    const txt = (s ?? "").toString().trim();
    return txt.replace(/^[A-D]\s*[\)\.\:\-]\s*/i, "").trim();
  };

  const handleInputChange = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));

    // ✅ if user is typing while mic is on, keep base in sync
    if (listeningQid === id) {
      baseAnswerRef.current[id] = value;
    }
  };

  const isSpeechSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      stopVoice();
    }, SILENCE_MS);
  };

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // ignore
    } finally {
      recognitionRef.current = null;
      setListeningQid(null);

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }
  };

  const clearAnswer = (qid) => {
    if (listeningQid === qid) stopVoice();
    setAnswers((prev) => ({ ...prev, [qid]: "" }));
    baseAnswerRef.current[qid] = "";
  };

  const startVoiceForQuestion = (qid) => {
    if (!isSpeechSupported) {
      alert("Speech recognition is not supported (try Chrome/Edge).");
      return;
    }

    // stop any existing recognition
    stopVoice();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListeningQid(qid);
      baseAnswerRef.current[qid] = answers[qid] || "";
      resetSilenceTimer();
    };

    recognition.onresult = (event) => {
      resetSilenceTimer();

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res?.[0]?.transcript || "";
        if (!txt) continue;

        if (res.isFinal) finalText += txt;
        else interim += txt;
      }

      setAnswers((prev) => {
        const base = baseAnswerRef.current[qid] ?? (prev[qid] || "");
        const combinedSpoken = `${finalText} ${interim}`.trim();
        const spacer = base.trim().length && combinedSpoken.length ? " " : "";
        return { ...prev, [qid]: base + spacer + combinedSpoken };
      });

      // move final chunk into base so interim doesn't duplicate
      if (finalText.trim().length) {
        const base = baseAnswerRef.current[qid] || "";
        const spacer = base.trim().length ? " " : "";
        baseAnswerRef.current[qid] = (base + spacer + finalText.trim()).trim();
      }
    };

    recognition.onerror = () => stopVoice();
    recognition.onend = () => stopVoice();

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await onSubmit(answers);
      setResults(response);
      setSubmitted(true);
      stopVoice();
    } catch (error) {
      console.error("Error submitting answers:", error);
      alert("Failed to submit answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const optionLetter = (optIdx) => String.fromCharCode(65 + optIdx); // A/B/C/D...

  // const mcqUserPretty = (q) => {
  //   const letter = answers[q.id];
  //   if (!letter) return null;
  //   const idx = letter.charCodeAt(0) - 65;
  //   const text = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
  //   return `${letter}. ${text || ""}`.trim();
  // };

    const mcqUserPretty = (q) => {
      const letter = answers[q.id];
      if (!letter) return null;
      const idx = letter.charCodeAt(0) - 65;
      const text = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
      return `${letter}. ${stripOptionPrefix(text || "")}`.trim();
  };

  const prettyMcqFromLetter = (q, letter) => {
    if (!letter) return null;
    const L = letter.toString().trim().charAt(0).toUpperCase();
    const idx = L.charCodeAt(0) - 65;
    const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
    return `${L}. ${stripOptionPrefix(rawOpt)}`.trim();
  };

  // ---------------- REVIEW MODE ----------------
  if (submitted && results) {
    const review = results.results || {};

    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-gray-800">Review</h2>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  // ✅ go back to answering screen (keep answers)
                  setSubmitted(false);
                  setResults(null);
                }}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
              >
                Back to Questions
              </button>

              <button
                onClick={() => {
                  // ✅ exit the session entirely (if your app supports it)
                  stopVoice();
                  setSubmitted(false);
                  setResults(null);
                  setAnswers({});
                  onExitToHome?.();
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Exit to Home
              </button>
            </div>
          </div>

          {/* ✅ show weak topics returned by backend */}
          {results.weakTopicList?.length > 0 && (
            <div className="mb-6 p-4 rounded-lg border bg-orange-50">
              <div className="font-medium text-orange-800 mb-2">Next Focus Areas</div>
              <div className="flex flex-wrap gap-2">
                {results.weakTopicList.map((t, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 text-xs bg-white border border-orange-200 text-orange-800 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {questions.map((q, idx) => {
              const r = review[q.id];
              const isMCQ = q.type === "mcq";
              const isDesc = q.type === "descriptive";

              const isCorrect = r?.isCorrect;
              const score = typeof r?.understandingScore === "number" ? r.understandingScore : null;

              return (
                <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
                  <div className="flex gap-3 mb-3">
                    <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
                      {idx + 1}
                    </span>

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>

                        <div className="flex items-center gap-2">
                          {isMCQ && typeof isCorrect === "boolean" && (
                            isCorrect ? (
                              <CheckCircle className="text-green-600" size={22} />
                            ) : (
                              <XCircle className="text-red-600" size={22} />
                            )
                          )}

                          {isDesc && score !== null && (
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                              Score: {score}/10
                            </span>
                          )}
                        </div>
                      </div>

                      {r?.topic && (
                        <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                          {r.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ml-11 space-y-3">
                    <div className="p-3 rounded border bg-gray-50">
                      <div className="text-xs text-gray-500 mb-1">Your Answer</div>
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {isMCQ ? (
                          // mcqUserPretty(q) 
                          prettyMcqFromLetter(q, answers[q.id]) || <span className="text-gray-400">Not answered</span> || <span className="text-gray-400">Not answered</span>
                        ) : (
                          answers[q.id] || <span className="text-gray-400">Not answered</span>
                        )}
                      </div>
                    </div>

                    {isMCQ && (
                      <div className="p-3 rounded border">
                        <div className="text-xs text-gray-500 mb-1">Correct Answer</div>
                        <div className="text-gray-800">
                          {/* {r?.correctAnswer ?? <span className="text-gray-400">—</span>} */}
                          {r?.correctAnswer ? prettyMcqFromLetter(q, r.correctAnswer) : <span className="text-gray-400">—</span>}
                        </div>
                      </div>
                    )}

                    {(r?.explanation || r?.sampleAnswer || (r?.missing && r.missing.length)) && (
                      <div className="p-4 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <HelpCircle size={18} className="text-indigo-600" />
                          <span className="font-medium text-gray-800">Explanation</span>
                        </div>

                        {r?.explanation && (
                          <p className="text-gray-700 whitespace-pre-wrap">{r.explanation}</p>
                        )}

                        {isDesc && r?.sampleAnswer && (
                          <div className="mt-3">
                            <div className="text-sm font-semibold text-gray-800 mb-1">Sample Answer</div>
                            <div className="text-gray-700 whitespace-pre-wrap">{r.sampleAnswer}</div>
                          </div>
                        )}

                        {isDesc && r?.missing && r.missing.length > 0 && (
                          <div className="mt-3">
                            <div className="text-sm font-semibold text-orange-700 mb-1">Missing Concepts</div>
                            <div className="flex flex-wrap gap-1">
                              {r.missing.map((m, i) => (
                                <span key={i} className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t flex items-center justify-between">
            <div className="text-sm text-gray-500">Session ID: {sessionId}</div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Final Score</div>
              <div className="text-2xl font-bold text-gray-800">
                {typeof results.score === "number" ? `${results.score.toFixed(1)}/10` : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- TEST TAKING MODE ----------------
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Practice Questions</h2>

          {!isSpeechSupported && (
            <div className="text-xs text-gray-500">Voice input not supported (try Chrome/Edge).</div>
          )}
        </div>

        <div className="space-y-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
              <div className="flex gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>
                  {q.topic && (
                    <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {q.topic}
                    </span>
                  )}
                </div>
              </div>

              {q.type === "mcq" && (
                <div className="ml-11 space-y-2">
                  {(q.options || []).map((opt, optIdx) => {
                    const letter = optionLetter(optIdx);
                    return (
                      <label
                        key={optIdx}
                        className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={answers[q.id] === letter}
                          onChange={() => handleInputChange(q.id, letter)} // ✅ store letter
                          className="mr-3 w-4 h-4 text-indigo-600"
                        />
                        {/* <span className="text-gray-700">{opt}</span> */}
                        <span className="text-gray-700">{stripOptionPrefix(opt)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.type === "descriptive" && (
                <div className="ml-11">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-500">Speak to type (auto-stops after 10s silence)</div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => (listeningQid === q.id ? stopVoice() : startVoiceForQuestion(q.id))}
                        disabled={!isSpeechSupported}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg transition border ${
                          listeningQid === q.id
                            ? "bg-red-50 text-red-600 border-red-200"
                            : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={listeningQid === q.id ? "Stop listening" : "Start voice input"}
                      >
                        {listeningQid === q.id ? <MicOff size={18} /> : <Mic size={18} />}
                        <span className="text-sm">{listeningQid === q.id ? "Listening…" : "Speak"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => clearAnswer(q.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg transition border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        title="Clear answer"
                      >
                        <Trash2 size={18} />
                        <span className="text-sm">Clear</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => handleInputChange(q.id, e.target.value)}
                    placeholder="Type your answer here... (or use mic)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-32"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || (Object.keys(answers).length === 0)}
          className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Test"}
        </button>
      </div>
    </div>
  );
};

export default QuestionRenderer;
