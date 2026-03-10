import React from 'react';
import { ArrowLeft, CheckCircle, XCircle, HelpCircle } from 'lucide-react';

const SessionReview = ({ session, onBack }) => {
  const questions = session?.questions || [];
  const answers = session?.answers || {};
  const results = session?.feedback || {};

  const stripOptionPrefix = (s) => (s ?? '').toString().trim().replace(/^[A-D]\s*[\)\.\:\-]\s*/i, '').trim();

  const prettyMcqFromLetter = (q, letter) => {
    if (!letter) return null;
    const L = letter.toString().trim().charAt(0).toUpperCase();
    const idx = L.charCodeAt(0) - 65;
    const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : '';
    return `${L}. ${stripOptionPrefix(rawOpt)}`.trim();
  };

  const diffBadge = (d) => {
    if (!d) return null;
    const cls = d === 'easy' ? 'badge-success' : d === 'medium' ? 'badge-yellow' : 'badge-danger';
    return <span className={`badge ${cls}`}>{d}</span>;
  };

  return (
    <div className="review-page">
      {/* Nav */}
      <div className="review-nav">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="review-meta">
          {session?.type ? session.type.replace('_', ' ') : 'Session'} ·{' '}
          {session?.createdAt ? new Date(session.createdAt).toLocaleString() : ''}
        </div>
      </div>

      {/* Score */}
      <div className="score-hero" style={{ marginBottom: 20 }}>
        <div>
          <div className="score-label">Session Score</div>
          <div className="score-value">
            {typeof session?.score === 'number' ? `${session.score.toFixed(1)}/10` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="score-label">Questions</div>
          <div className="marks-value">{questions.length}</div>
        </div>
      </div>

      {/* Questions */}
      {questions.map((q, idx) => {
        const r = results[q.id] || {};
        const userAns = answers[q.id];
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {diffBadge(r?.difficulty)}
                    {isObjective && typeof r?.isCorrect === 'boolean' && (
                      r.isCorrect
                        ? <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                        : <XCircle size={20} style={{ color: 'var(--danger)' }} />
                    )}
                    {isDesc && score !== null && <span className="badge badge-muted">Score: {score}/10</span>}
                  </div>
                </div>
                <div className="question-meta">
                  {(r?.topic || q.topic) && <span className="badge badge-muted">{r?.topic || q.topic}</span>}
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
                  {isMCQ ? (prettyMcqFromLetter(q, userAns) || <span style={{ color: 'var(--text-muted)' }}>Not answered</span>)
                    : (userAns ?? <span style={{ color: 'var(--text-muted)' }}>Not answered</span>)}
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
                  {r?.explanation && (
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{r.explanation}</p>
                  )}
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
    </div>
  );
};

export default SessionReview;
























// import React from "react";
// import { ArrowLeft, CheckCircle, XCircle, HelpCircle } from "lucide-react";

// const SessionReview = ({ session, onBack }) => {
//   const questions = session?.questions || [];
//   const answers = session?.answers || {};
//   const results = session?.feedback || {};

//   const stripOptionPrefix = (s) => {
//     const txt = (s ?? "").toString().trim();
//     return txt.replace(/^[A-D]\s*[\)\.\:\-]\s*/i, "").trim();
//   };

//   const prettyMcqFromLetter = (q, letter) => {
//     if (!letter) return null;
//     const L = letter.toString().trim().charAt(0).toUpperCase();
//     const idx = L.charCodeAt(0) - 65;
//     const rawOpt = Array.isArray(q.options) && idx >= 0 ? q.options[idx] : "";
//     const cleanOpt = stripOptionPrefix(rawOpt);
//     return `${L}. ${cleanOpt}`.trim();
//   };

//   return (
//     <div className="max-w-4xl mx-auto">
//       <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
//         <div className="flex items-center justify-between mb-4">
//           <button
//             onClick={onBack}
//             className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition"
//           >
//             <ArrowLeft size={18} />
//             <span>Back</span>
//           </button>

//           <div className="text-right">
//             <div className="text-sm text-gray-500">
//               {session?.type ? session.type.replace("_", " ") : "session"} •{" "}
//               {session?.createdAt ? new Date(session.createdAt).toLocaleString() : ""}
//             </div>
//           </div>
//         </div>

//         <h2 className="text-2xl font-bold text-gray-800 mb-2">Session Review</h2>

//         <div className="mt-6 space-y-8">
//           {questions.map((q, idx) => {
//             const r = results[q.id] || {};
//             const userAns = answers[q.id];

//             const isMCQ = q.type === "mcq";
//             const isTF = q.type === "true_false";
//             const isFill = q.type === "fill_blank";
//             const isDesc = q.type === "descriptive";
//             const isObjective = isMCQ || isTF || isFill;

//             const isCorrect = r?.isCorrect;
//             const score = typeof r?.understandingScore === "number" ? r.understandingScore : null;

//             return (
//               <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
//                 <div className="flex gap-3 mb-3">
//                   <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
//                     {idx + 1}
//                   </span>

//                   <div className="flex-1">
//                     <div className="flex items-start justify-between gap-3">
//                       <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>

//                       <div className="flex items-center gap-2">
//                         {r?.difficulty && (
//                           <span className={`text-xs px-2 py-1 rounded ${
//                             r.difficulty === "easy"
//                               ? "bg-green-100 text-green-700"
//                               : r.difficulty === "medium"
//                               ? "bg-yellow-100 text-yellow-700"
//                               : "bg-red-100 text-red-700"
//                           }`}>
//                             {r.difficulty}
//                           </span>
//                         )}

//                         {isObjective && typeof isCorrect === "boolean" && (
//                           isCorrect ? (
//                             <CheckCircle className="text-green-600" size={22} />
//                           ) : (
//                             <XCircle className="text-red-600" size={22} />
//                           )
//                         )}

//                         {isDesc && score !== null && (
//                           <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
//                             Score: {score}/10
//                           </span>
//                         )}
//                       </div>
//                     </div>

//                     <div className="flex flex-wrap gap-2 mt-1">
//                       {(r?.topic || q.topic) && (
//                         <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
//                           {r?.topic || q.topic}
//                         </span>
//                       )}

//                       {(r?.bloomLevel || q?.bloomLevel) && (
//                         <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
//                           {r?.bloomLevel || q?.bloomLevel}
//                         </span>
//                       )}
//                     </div>
//                   </div>
//                 </div>

//                 <div className="ml-11 space-y-3">
//                   <div className="p-3 rounded border bg-gray-50">
//                     <div className="text-xs text-gray-500 mb-1">Your Answer</div>
//                     <div className="text-gray-800 whitespace-pre-wrap">
//                       {isMCQ ? (
//                         prettyMcqFromLetter(q, userAns) || <span className="text-gray-400">Not answered</span>
//                       ) : (
//                         userAns ?? <span className="text-gray-400">Not answered</span>
//                       )}
//                     </div>
//                   </div>

//                   {isObjective && (
//                     <div className="p-3 rounded border">
//                       <div className="text-xs text-gray-500 mb-1">Correct Answer</div>
//                       <div className="text-gray-800">
//                         {r?.correctAnswer ? (
//                           isMCQ ? prettyMcqFromLetter(q, r.correctAnswer) : r.correctAnswer
//                         ) : (
//                           <span className="text-gray-400">—</span>
//                         )}
//                       </div>
//                     </div>
//                   )}

//                   {r?.maxMarks !== undefined && r?.maxMarks !== null && (
//                     <div className="p-3 rounded border">
//                       <div className="text-xs text-gray-500 mb-1">Marks</div>
//                       <div className="text-gray-800">
//                         <span className="font-medium">{Number(r?.awardedMarks || 0).toFixed(1)}</span>
//                         <span className="text-gray-500"> / {r.maxMarks}</span>
//                         {r?.negativeMarks > 0 && (
//                           <span className="ml-2 text-xs text-red-600">
//                             (-{r.negativeMarks} for wrong)
//                           </span>
//                         )}
//                       </div>
//                     </div>
//                   )}

//                   {(r?.explanation || r?.sampleAnswer || (r?.missing && r.missing.length)) && (
//                     <div className="p-4 rounded-lg border">
//                       <div className="flex items-center gap-2 mb-2">
//                         <HelpCircle size={18} className="text-indigo-600" />
//                         <span className="font-medium text-gray-800">Explanation</span>
//                       </div>

//                       {r?.explanation && (
//                         <p className="text-gray-700 whitespace-pre-wrap">{r.explanation}</p>
//                       )}

//                       {isDesc && r?.sampleAnswer && (
//                         <div className="mt-3">
//                           <div className="text-sm font-semibold text-gray-800 mb-1">Sample Answer</div>
//                           <div className="text-gray-700 whitespace-pre-wrap">{r.sampleAnswer}</div>
//                         </div>
//                       )}

//                       {isDesc && r?.missing && r.missing.length > 0 && (
//                         <div className="mt-3">
//                           <div className="text-sm font-semibold text-orange-700 mb-1">Missing Concepts</div>
//                           <div className="flex flex-wrap gap-1">
//                             {r.missing.map((m, i) => (
//                               <span key={i} className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
//                                 {m}
//                               </span>
//                             ))}
//                           </div>
//                         </div>
//                       )}
//                     </div>
//                   )}
//                 </div>
//               </div>
//             );
//           })}
//         </div>

//         <div className="mt-8 pt-6 border-t">
//           <div className="text-right">
//             <div className="text-sm text-gray-500">Final Score</div>
//             <div className="text-2xl font-bold text-gray-800">
//               {typeof session?.score === "number" ? `${session.score.toFixed(1)}/10` : "—"}
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default SessionReview;