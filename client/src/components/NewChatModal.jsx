import React, { useState } from 'react';
import { X } from 'lucide-react';

const examTemplates = {
  CAT: { mcqCount: 5, descCount: 2, mcqMarks: 1, descMarks: 10 },
  FAT: { mcqCount: 0, descCount: 10, mcqMarks: 0, descMarks: 10 },
  LAB: { mcqCount: 0, descCount: 0, mcqMarks: 0, descMarks: 0 },
};

const NewChatModal = ({ onClose, onCreate }) => {
  const [examType, setExamType] = useState('');
  const [bloomLevel, setBloomLevel] = useState('easy');

  // ✅ UPDATED: separate marks
  const [customPattern, setCustomPattern] = useState({
    mcqCount: 5,
    descCount: 2,
    mcqMarks: 1,
    descMarks: 10,
  });

  const handleCreate = () => {
    if (!examType) return;

    const pattern = examType === 'Custom' ? customPattern : examTemplates[examType];

    const chatData = {
      examType,
      bloomLevel,
      questionPattern: pattern,
    };

    onCreate(chatData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-bold">Start New Exam Session</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </div>

        <label className="block mb-2">Exam Type</label>
        <select
          value={examType}
          onChange={(e) => setExamType(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="">Select Exam</option>
          <option value="CAT">CAT</option>
          <option value="FAT">FAT</option>
          <option value="LAB">LAB</option>
          <option value="Custom">Custom</option>
        </select>

        <label className="block mt-4 mb-2">Difficulty Level (Bloom)</label>
        <select
          value={bloomLevel}
          onChange={(e) => setBloomLevel(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="easy">Easy (Remember)</option>
          <option value="medium">Medium (Understand)</option>
          <option value="hard">Hard (Analyze)</option>
        </select>

        {examType === 'Custom' && (
          <div className="mt-4 space-y-2">
            <label className="block mb-2">MCQ</label>
            <input
              type="number"
              placeholder="MCQ Count"
              value={customPattern.mcqCount}
              onChange={(e) => setCustomPattern({ ...customPattern, mcqCount: Number(e.target.value) })}
              className="w-full border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Marks per MCQ"
              value={customPattern.mcqMarks}
              onChange={(e) => setCustomPattern({ ...customPattern, mcqMarks: Number(e.target.value) })}
              className="w-full border p-2 rounded"
            />

            <label className="block mt-2 mb-2">Descriptive</label>
            <input
              type="number"
              placeholder="Descriptive Count"
              value={customPattern.descCount}
              onChange={(e) => setCustomPattern({ ...customPattern, descCount: Number(e.target.value) })}
              className="w-full border p-2 rounded"
            />
            <input
              type="number"
              placeholder="Marks per Descriptive"
              value={customPattern.descMarks}
              onChange={(e) => setCustomPattern({ ...customPattern, descMarks: Number(e.target.value) })}
              className="w-full border p-2 rounded"
            />
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border p-2 rounded">
            Cancel
          </button>

          <button onClick={handleCreate} className="flex-1 bg-indigo-600 text-white p-2 rounded">
            Create Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;
