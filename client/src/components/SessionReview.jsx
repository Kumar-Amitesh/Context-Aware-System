import React from "react";
import { ArrowLeft, CheckCircle, XCircle, HelpCircle } from "lucide-react";

const SessionReview = ({ session, onBack }) => {
  const questions = session?.questions || [];
  const answers = session?.answers || {};
  const results = session?.feedback || {}; // backend stores per-question details here

  const optionLetter = (optIdx) => String.fromCharCode(65 + optIdx);

  const stripOptionPrefix = (s) => {
    const txt = (s ?? "").toString().trim();
    return txt.replace(/^[A-D]\s*[\)\.\:\-]\s*/i, "").trim();
  };

  // const prettyMcqAnswer = (q, letter) => {
  //   if (!letter) return null;
  //   const idx = letter.charCodeAt(0) - 65;
  //   const text = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
  //   return `${letter}. ${text || ""}`.trim();
  // };

    const prettyMcqAnswer = (q, letter) => {
      if (!letter) return null;
      const idx = letter.charCodeAt(0) - 65;
      const text = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
      return `${letter}. ${stripOptionPrefix(text || "")}`.trim();
    };

    const prettyMcqFromLetter = (q, letter) => {
      if (!letter) return null;

      // if backend ever sends "B. ...." keep only the letter
      const L = letter.toString().trim().charAt(0).toUpperCase();
      const idx = L.charCodeAt(0) - 65;

      const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
      const cleanOpt = stripOptionPrefix(rawOpt);

      return `${L}. ${cleanOpt}`.trim();
    };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition"
          >
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className="text-right">
            <div className="text-sm text-gray-500">
              {session?.type ? session.type.replace("_", " ") : "session"} •{" "}
              {session?.createdAt ? new Date(session.createdAt).toLocaleString() : ""}
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-2">Session Review</h2>

        <div className="mt-6 space-y-8">
          {questions.map((q, idx) => {
            const r = results[q.id];
            const userAns = answers[q.id];

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

                    {(r?.topic || q.topic) && (
                      <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        {r?.topic || q.topic}
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-11 space-y-3">
                  <div className="p-3 rounded border bg-gray-50">
                    <div className="text-xs text-gray-500 mb-1">Your Answer</div>
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {isMCQ ? (
                        prettyMcqFromLetter(q, userAns) || <span className="text-gray-400">Not answered</span>
                        ) : (
                          userAns ?? <span className="text-gray-400">Not answered</span>
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

        <div className="mt-8 pt-6 border-t">
          <div className="text-right">
            <div className="text-sm text-gray-500">Final Score</div>
            <div className="text-2xl font-bold text-gray-800">
              {typeof session?.score === "number" ? `${session.score.toFixed(1)}/10` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionReview;