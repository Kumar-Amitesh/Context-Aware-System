import React, { useState } from 'react';
import { X } from 'lucide-react';

const BLOOM_OPTIONS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
];

const QUESTION_TYPE_OPTIONS = [
  { key: 'mcq', label: 'MCQ' },
  { key: 'fill_blank', label: 'Fill in the Blanks' },
  { key: 'descriptive', label: 'Descriptive' },
  { key: 'true_false', label: 'True / False' },
];

const NewChatModal = ({ onClose, onCreate }) => {
  const [examType, setExamType] = useState('General');

  const [selectedBlooms, setSelectedBlooms] = useState(['Understand']);

  const [questionTypes, setQuestionTypes] = useState({
    mcq: { enabled: true, count: '5', marks: '1', negativeMarks: '0' },
    fill_blank: { enabled: false, count: '0', marks: '1', negativeMarks: '0' },
    descriptive: { enabled: true, count: '2', marks: '10', negativeMarks: '0' },
    true_false: { enabled: false, count: '0', marks: '1', negativeMarks: '0' },
  });

  const toggleBloom = (bloom) => {
    setSelectedBlooms((prev) => {
      if (prev.includes(bloom)) {
        const next = prev.filter((b) => b !== bloom);
        return next.length ? next : ['Understand'];
      }
      return [...prev, bloom];
    });
  };

  const updateQuestionType = (typeKey, field, value) => {
    setQuestionTypes((prev) => ({
      ...prev,
      [typeKey]: {
        ...prev[typeKey],
        [field]: value,
      },
    }));
  };

  const toggleQuestionType = (typeKey) => {
    setQuestionTypes((prev) => ({
      ...prev,
      [typeKey]: {
        ...prev[typeKey],
        enabled: !prev[typeKey].enabled,
      },
    }));
  };

  const handleCreate = () => {
    if (!examType.trim()) {
      alert('Please enter exam type');
      return;
    }

    const enabledQuestionTypes = Object.fromEntries(
      Object.entries(questionTypes)
        .filter(([, cfg]) => cfg.enabled)
        .map(([key, cfg]) => [
          key,
          {
            count: Number(cfg.count) || 0,
            marks: Number(cfg.marks) || 0,
            negativeMarks:
              key === 'descriptive' ? 0 : Number(cfg.negativeMarks) || 0,
          },
        ])
    );

    const totalSelectedQuestions = Object.values(enabledQuestionTypes).reduce(
      (acc, cfg) => acc + cfg.count,
      0
    );

    if (totalSelectedQuestions <= 0) {
      alert('Please select at least one question type with count > 0');
      return;
    }

    onCreate({
      examType: examType.trim(),
      bloomLevels: selectedBlooms,
      questionTypes: enabledQuestionTypes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Start New Exam Session
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Configure exam type, Bloom levels, and question pattern.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <label
              htmlFor="examType"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Exam Type
            </label>
            <input
              id="examType"
              name="examType"
              type="text"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="General, CAT, FAT, Midterm, Final..."
              autoComplete="off"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <p className="mt-2 text-xs text-gray-500">
              Use any custom name for this exam session.
            </p>
          </section>

          <section>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-gray-700">Bloom Levels</h3>
              <p className="text-xs text-gray-500">
                Select one or more cognitive levels.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {BLOOM_OPTIONS.map((bloom) => {
                const inputId = `bloom-${bloom.toLowerCase()}`;
                const active = selectedBlooms.includes(bloom);

                return (
                  <label
                    key={bloom}
                    htmlFor={inputId}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      id={inputId}
                      name="bloomLevels"
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleBloom(bloom)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium text-gray-800">
                      {bloom}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h3 className="text-sm font-medium text-gray-700">Question Types</h3>
              <p className="text-xs text-gray-500">
                Enable the types you want and define marks distribution.
              </p>
            </div>

            <div className="space-y-4">
              {QUESTION_TYPE_OPTIONS.map((qType) => {
                const cfg = questionTypes[qType.key];
                const toggleId = `${qType.key}-enabled`;

                return (
                  <div
                    key={qType.key}
                    className={`rounded-2xl border p-4 transition ${
                      cfg.enabled
                        ? 'border-indigo-200 bg-indigo-50/40'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <label
                        htmlFor={toggleId}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          id={toggleId}
                          name={`${qType.key}_enabled`}
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={() => toggleQuestionType(qType.key)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm font-semibold text-gray-800">
                          {qType.label}
                        </span>
                      </label>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          cfg.enabled
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {cfg.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`${qType.key}-count`}
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          No. of Questions
                        </label>
                        <input
                          id={`${qType.key}-count`}
                          name={`${qType.key}_count`}
                          type="number"
                          value={cfg.count}
                          onChange={(e) =>
                            updateQuestionType(qType.key, 'count', e.target.value)
                          }
                          disabled={!cfg.enabled}
                          min={0}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`${qType.key}-marks`}
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          Marks Each
                        </label>
                        <input
                          id={`${qType.key}-marks`}
                          name={`${qType.key}_marks`}
                          type="number"
                          value={cfg.marks}
                          onChange={(e) =>
                            updateQuestionType(qType.key, 'marks', e.target.value)
                          }
                          disabled={!cfg.enabled}
                          min={0}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`${qType.key}-negativeMarks`}
                          className="mb-1 block text-xs font-medium text-gray-600"
                        >
                          Negative Marks
                        </label>
                        <input
                          id={`${qType.key}-negativeMarks`}
                          name={`${qType.key}_negativeMarks`}
                          type="number"
                          value={cfg.negativeMarks}
                          onChange={(e) =>
                            updateQuestionType(
                              qType.key,
                              'negativeMarks',
                              e.target.value
                            )
                          }
                          disabled={!cfg.enabled || qType.key === 'descriptive'}
                          min={0}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Create Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;





























// import React, { useState } from 'react';
// import { X } from 'lucide-react';

// const examTemplates = {
//   CAT: { mcqCount: 5, descCount: 2, mcqMarks: 1, descMarks: 10 },
//   FAT: { mcqCount: 0, descCount: 10, mcqMarks: 0, descMarks: 10 },
//   LAB: { mcqCount: 0, descCount: 0, mcqMarks: 0, descMarks: 0 },
// };

// const NewChatModal = ({ onClose, onCreate }) => {
//   const [examType, setExamType] = useState('');
//   const [bloomLevel, setBloomLevel] = useState('easy');

//   // ✅ UPDATED: separate marks
//   const [customPattern, setCustomPattern] = useState({
//     mcqCount: 5,
//     descCount: 2,
//     mcqMarks: 1,
//     descMarks: 10,
//   });

//   const handleCreate = () => {
//     if (!examType) return;

//     const pattern = examType === 'Custom' ? customPattern : examTemplates[examType];

//     const chatData = {
//       examType,
//       bloomLevel,
//       questionPattern: pattern,
//     };

//     onCreate(chatData);
//   };

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
//       <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
//         <div className="flex justify-between mb-4">
//           <h2 className="text-xl font-bold">Start New Exam Session</h2>
//           <button onClick={onClose}>
//             <X />
//           </button>
//         </div>

//         <label className="block mb-2">Exam Type</label>
//         <select
//           value={examType}
//           onChange={(e) => setExamType(e.target.value)}
//           className="w-full border p-2 rounded"
//         >
//           <option value="">Select Exam</option>
//           <option value="CAT">CAT</option>
//           <option value="FAT">FAT</option>
//           <option value="LAB">LAB</option>
//           <option value="Custom">Custom</option>
//         </select>

//         <label className="block mt-4 mb-2">Difficulty Level (Bloom)</label>
//         <select
//           value={bloomLevel}
//           onChange={(e) => setBloomLevel(e.target.value)}
//           className="w-full border p-2 rounded"
//         >
//           <option value="easy">Easy (Remember)</option>
//           <option value="medium">Medium (Understand)</option>
//           <option value="hard">Hard (Analyze)</option>
//         </select>

//         {examType === 'Custom' && (
//           <div className="mt-4 space-y-2">
//             <label className="block mb-2">MCQ</label>
//             <input
//               type="number"
//               placeholder="MCQ Count"
//               value={customPattern.mcqCount}
//               onChange={(e) => setCustomPattern({ ...customPattern, mcqCount: Number(e.target.value) })}
//               className="w-full border p-2 rounded"
//             />
//             <input
//               type="number"
//               placeholder="Marks per MCQ"
//               value={customPattern.mcqMarks}
//               onChange={(e) => setCustomPattern({ ...customPattern, mcqMarks: Number(e.target.value) })}
//               className="w-full border p-2 rounded"
//             />

//             <label className="block mt-2 mb-2">Descriptive</label>
//             <input
//               type="number"
//               placeholder="Descriptive Count"
//               value={customPattern.descCount}
//               onChange={(e) => setCustomPattern({ ...customPattern, descCount: Number(e.target.value) })}
//               className="w-full border p-2 rounded"
//             />
//             <input
//               type="number"
//               placeholder="Marks per Descriptive"
//               value={customPattern.descMarks}
//               onChange={(e) => setCustomPattern({ ...customPattern, descMarks: Number(e.target.value) })}
//               className="w-full border p-2 rounded"
//             />
//           </div>
//         )}

//         <div className="flex gap-3 mt-6">
//           <button onClick={onClose} className="flex-1 border p-2 rounded">
//             Cancel
//           </button>

//           <button onClick={handleCreate} className="flex-1 bg-indigo-600 text-white p-2 rounded">
//             Create Session
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default NewChatModal;
