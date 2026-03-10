import React, { useState } from 'react';
import { X, Brain, Hash, Minus } from 'lucide-react';

const BLOOM_OPTIONS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

const QUESTION_TYPE_OPTIONS = [
  { key: 'mcq', label: 'MCQ' },
  { key: 'fill_blank', label: 'Fill in the Blank' },
  { key: 'descriptive', label: 'Descriptive' },
  { key: 'true_false', label: 'True / False' },
];

const NewChatModal = ({ onClose, onCreate }) => {
  const [examType, setExamType] = useState('General');
  const [selectedBlooms, setSelectedBlooms] = useState(['Understand']);
  const [questionTypes, setQuestionTypes] = useState({
    mcq:         { enabled: true,  count: '5', marks: '1',  negativeMarks: '0' },
    fill_blank:  { enabled: false, count: '0', marks: '1',  negativeMarks: '0' },
    descriptive: { enabled: true,  count: '2', marks: '10', negativeMarks: '0' },
    true_false:  { enabled: false, count: '0', marks: '1',  negativeMarks: '0' },
  });

  const toggleBloom = (bloom) => {
    setSelectedBlooms((prev) => {
      const next = prev.includes(bloom) ? prev.filter((b) => b !== bloom) : [...prev, bloom];
      return next.length ? next : ['Understand'];
    });
  };

  const updateQT = (key, field, value) =>
    setQuestionTypes((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const toggleQT = (key) =>
    setQuestionTypes((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));

  const handleCreate = () => {
    if (!examType.trim()) { alert('Please enter exam type'); return; }
    const enabledQT = Object.fromEntries(
      Object.entries(questionTypes)
        .filter(([, cfg]) => cfg.enabled)
        .map(([key, cfg]) => [key, {
          count: Number(cfg.count) || 0,
          marks: Number(cfg.marks) || 0,
          negativeMarks: key === 'descriptive' ? 0 : Number(cfg.negativeMarks) || 0,
        }])
    );
    const total = Object.values(enabledQT).reduce((a, c) => a + c.count, 0);
    if (total <= 0) { alert('Please select at least one question type with count > 0'); return; }
    onCreate({ examType: examType.trim(), bloomLevels: selectedBlooms, questionTypes: enabledQT });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">New Exam Session</div>
            <div className="modal-subtitle">Configure your practice session</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Exam type */}
          <div className="form-section">
            <div className="form-label">
              <Hash size={13} /> Exam Type
            </div>
            <input
              className="input"
              type="text"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="General, CAT, Midterm, Final…"
            />
          </div>

          {/* Bloom levels */}
          <div className="form-section">
            <div className="form-label"><Brain size={13} /> Bloom's Levels</div>
            <div className="bloom-grid">
              {BLOOM_OPTIONS.map((bloom) => (
                <label key={bloom} className={`bloom-chip ${selectedBlooms.includes(bloom) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedBlooms.includes(bloom)}
                    onChange={() => toggleBloom(bloom)}
                  />
                  {bloom}
                </label>
              ))}
            </div>
          </div>

          {/* Question types */}
          <div className="form-section">
            <div className="form-label">Question Types & Marks</div>
            {QUESTION_TYPE_OPTIONS.map((qType) => {
              const cfg = questionTypes[qType.key];
              return (
                <div key={qType.key} className={`qtype-block ${cfg.enabled ? 'active' : ''}`}>
                  <div className="qtype-header">
                    <label className="qtype-toggle">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={() => toggleQT(qType.key)}
                      />
                      {qType.label}
                    </label>
                    <span className={`badge ${cfg.enabled ? 'badge-primary' : 'badge-muted'}`}>
                      {cfg.enabled ? 'On' : 'Off'}
                    </span>
                  </div>

                  {cfg.enabled && (
                    <div className="qtype-fields">
                      <div>
                        <div className="field-label">Questions</div>
                        <input
                          className="input"
                          type="number" min={0}
                          value={cfg.count}
                          onChange={(e) => updateQT(qType.key, 'count', e.target.value)}
                          style={{ padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <div className="field-label">Marks Each</div>
                        <input
                          className="input"
                          type="number" min={0}
                          value={cfg.marks}
                          onChange={(e) => updateQT(qType.key, 'marks', e.target.value)}
                          style={{ padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <div className="field-label">Negative</div>
                        <input
                          className="input"
                          type="number" min={0}
                          value={cfg.negativeMarks}
                          onChange={(e) => updateQT(qType.key, 'negativeMarks', e.target.value)}
                          disabled={qType.key === 'descriptive'}
                          style={{ padding: '7px 10px', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={handleCreate}>Create Session</button>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;




















// import React, { useState } from 'react';
// import { X } from 'lucide-react';

// const BLOOM_OPTIONS = [
//   'Remember',
//   'Understand',
//   'Apply',
//   'Analyze',
//   'Evaluate',
//   'Create',
// ];

// const QUESTION_TYPE_OPTIONS = [
//   { key: 'mcq', label: 'MCQ' },
//   { key: 'fill_blank', label: 'Fill in the Blanks' },
//   { key: 'descriptive', label: 'Descriptive' },
//   { key: 'true_false', label: 'True / False' },
// ];

// const NewChatModal = ({ onClose, onCreate }) => {
//   const [examType, setExamType] = useState('General');

//   const [selectedBlooms, setSelectedBlooms] = useState(['Understand']);

//   const [questionTypes, setQuestionTypes] = useState({
//     mcq: { enabled: true, count: '5', marks: '1', negativeMarks: '0' },
//     fill_blank: { enabled: false, count: '0', marks: '1', negativeMarks: '0' },
//     descriptive: { enabled: true, count: '2', marks: '10', negativeMarks: '0' },
//     true_false: { enabled: false, count: '0', marks: '1', negativeMarks: '0' },
//   });

//   const toggleBloom = (bloom) => {
//     setSelectedBlooms((prev) => {
//       if (prev.includes(bloom)) {
//         const next = prev.filter((b) => b !== bloom);
//         return next.length ? next : ['Understand'];
//       }
//       return [...prev, bloom];
//     });
//   };

//   const updateQuestionType = (typeKey, field, value) => {
//     setQuestionTypes((prev) => ({
//       ...prev,
//       [typeKey]: {
//         ...prev[typeKey],
//         [field]: value,
//       },
//     }));
//   };

//   const toggleQuestionType = (typeKey) => {
//     setQuestionTypes((prev) => ({
//       ...prev,
//       [typeKey]: {
//         ...prev[typeKey],
//         enabled: !prev[typeKey].enabled,
//       },
//     }));
//   };

//   const handleCreate = () => {
//     if (!examType.trim()) {
//       alert('Please enter exam type');
//       return;
//     }

//     const enabledQuestionTypes = Object.fromEntries(
//       Object.entries(questionTypes)
//         .filter(([, cfg]) => cfg.enabled)
//         .map(([key, cfg]) => [
//           key,
//           {
//             count: Number(cfg.count) || 0,
//             marks: Number(cfg.marks) || 0,
//             negativeMarks:
//               key === 'descriptive' ? 0 : Number(cfg.negativeMarks) || 0,
//           },
//         ])
//     );

//     const totalSelectedQuestions = Object.values(enabledQuestionTypes).reduce(
//       (acc, cfg) => acc + cfg.count,
//       0
//     );

//     if (totalSelectedQuestions <= 0) {
//       alert('Please select at least one question type with count > 0');
//       return;
//     }

//     onCreate({
//       examType: examType.trim(),
//       bloomLevels: selectedBlooms,
//       questionTypes: enabledQuestionTypes,
//     });
//   };

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
//       <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
//         <div className="flex items-center justify-between border-b px-6 py-4">
//           <div>
//             <h2 className="text-xl font-semibold text-gray-900">
//               Start New Exam Session
//             </h2>
//             <p className="mt-1 text-sm text-gray-500">
//               Configure exam type, Bloom levels, and question pattern.
//             </p>
//           </div>

//           <button
//             type="button"
//             onClick={onClose}
//             aria-label="Close modal"
//             className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
//           >
//             <X size={20} />
//           </button>
//         </div>

//         <div className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-5">
//           <section>
//             <label
//               htmlFor="examType"
//               className="mb-2 block text-sm font-medium text-gray-700"
//             >
//               Exam Type
//             </label>
//             <input
//               id="examType"
//               name="examType"
//               type="text"
//               value={examType}
//               onChange={(e) => setExamType(e.target.value)}
//               placeholder="General, CAT, FAT, Midterm, Final..."
//               autoComplete="off"
//               className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
//             />
//             <p className="mt-2 text-xs text-gray-500">
//               Use any custom name for this exam session.
//             </p>
//           </section>

//           <section>
//             <div className="mb-3">
//               <h3 className="text-sm font-medium text-gray-700">Bloom Levels</h3>
//               <p className="text-xs text-gray-500">
//                 Select one or more cognitive levels.
//               </p>
//             </div>

//             <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
//               {BLOOM_OPTIONS.map((bloom) => {
//                 const inputId = `bloom-${bloom.toLowerCase()}`;
//                 const active = selectedBlooms.includes(bloom);

//                 return (
//                   <label
//                     key={bloom}
//                     htmlFor={inputId}
//                     className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
//                       active
//                         ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
//                         : 'border-gray-200 bg-white hover:border-gray-300'
//                     }`}
//                   >
//                     <input
//                       id={inputId}
//                       name="bloomLevels"
//                       type="checkbox"
//                       checked={active}
//                       onChange={() => toggleBloom(bloom)}
//                       className="h-4 w-4"
//                     />
//                     <span className="text-sm font-medium text-gray-800">
//                       {bloom}
//                     </span>
//                   </label>
//                 );
//               })}
//             </div>
//           </section>

//           <section>
//             <div className="mb-3">
//               <h3 className="text-sm font-medium text-gray-700">Question Types</h3>
//               <p className="text-xs text-gray-500">
//                 Enable the types you want and define marks distribution.
//               </p>
//             </div>

//             <div className="space-y-4">
//               {QUESTION_TYPE_OPTIONS.map((qType) => {
//                 const cfg = questionTypes[qType.key];
//                 const toggleId = `${qType.key}-enabled`;

//                 return (
//                   <div
//                     key={qType.key}
//                     className={`rounded-2xl border p-4 transition ${
//                       cfg.enabled
//                         ? 'border-indigo-200 bg-indigo-50/40'
//                         : 'border-gray-200 bg-gray-50'
//                     }`}
//                   >
//                     <div className="mb-4 flex items-center justify-between">
//                       <label
//                         htmlFor={toggleId}
//                         className="flex cursor-pointer items-center gap-3"
//                       >
//                         <input
//                           id={toggleId}
//                           name={`${qType.key}_enabled`}
//                           type="checkbox"
//                           checked={cfg.enabled}
//                           onChange={() => toggleQuestionType(qType.key)}
//                           className="h-4 w-4"
//                         />
//                         <span className="text-sm font-semibold text-gray-800">
//                           {qType.label}
//                         </span>
//                       </label>

//                       <span
//                         className={`rounded-full px-3 py-1 text-xs font-medium ${
//                           cfg.enabled
//                             ? 'bg-indigo-100 text-indigo-700'
//                             : 'bg-gray-200 text-gray-600'
//                         }`}
//                       >
//                         {cfg.enabled ? 'Enabled' : 'Disabled'}
//                       </span>
//                     </div>

//                     <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
//                       <div>
//                         <label
//                           htmlFor={`${qType.key}-count`}
//                           className="mb-1 block text-xs font-medium text-gray-600"
//                         >
//                           No. of Questions
//                         </label>
//                         <input
//                           id={`${qType.key}-count`}
//                           name={`${qType.key}_count`}
//                           type="number"
//                           value={cfg.count}
//                           onChange={(e) =>
//                             updateQuestionType(qType.key, 'count', e.target.value)
//                           }
//                           disabled={!cfg.enabled}
//                           min={0}
//                           className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
//                         />
//                       </div>

//                       <div>
//                         <label
//                           htmlFor={`${qType.key}-marks`}
//                           className="mb-1 block text-xs font-medium text-gray-600"
//                         >
//                           Marks Each
//                         </label>
//                         <input
//                           id={`${qType.key}-marks`}
//                           name={`${qType.key}_marks`}
//                           type="number"
//                           value={cfg.marks}
//                           onChange={(e) =>
//                             updateQuestionType(qType.key, 'marks', e.target.value)
//                           }
//                           disabled={!cfg.enabled}
//                           min={0}
//                           className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
//                         />
//                       </div>

//                       <div>
//                         <label
//                           htmlFor={`${qType.key}-negativeMarks`}
//                           className="mb-1 block text-xs font-medium text-gray-600"
//                         >
//                           Negative Marks
//                         </label>
//                         <input
//                           id={`${qType.key}-negativeMarks`}
//                           name={`${qType.key}_negativeMarks`}
//                           type="number"
//                           value={cfg.negativeMarks}
//                           onChange={(e) =>
//                             updateQuestionType(
//                               qType.key,
//                               'negativeMarks',
//                               e.target.value
//                             )
//                           }
//                           disabled={!cfg.enabled || qType.key === 'descriptive'}
//                           min={0}
//                           className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
//                         />
//                       </div>
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           </section>
//         </div>

//         <div className="flex gap-3 border-t px-6 py-4">
//           <button
//             type="button"
//             onClick={onClose}
//             className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
//           >
//             Cancel
//           </button>

//           <button
//             type="button"
//             onClick={handleCreate}
//             className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
//           >
//             Create Session
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default NewChatModal;

