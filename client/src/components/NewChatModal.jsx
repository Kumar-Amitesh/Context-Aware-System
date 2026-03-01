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


























// import React, { useState } from 'react';
// import { Upload, X } from 'lucide-react';

// const examTemplates = {
//   CAT: { mcq: 5, descriptive: 2, marks: 10 },
//   FAT: { mcq: 0, descriptive: 10, marks: 10 },
//   LAB: { mcq: 0, descriptive: 0, marks: 0 },
// };

// const NewChatModal = ({ onClose, onCreate }) => {
//   const [examType, setExamType] = useState('');
//   const [bloomLevel, setBloomLevel] = useState('easy');
//   const [customPattern, setCustomPattern] = useState({
//     mcq: 5,
//     descriptive: 2,
//     marks: 10,
//   });

//   const [pdfFile, setPdfFile] = useState(null);

//   const handleCreate = () => {
//     if (!examType) return;

//     let pattern;

//     if (examType === 'Custom') {
//       pattern = customPattern;
//     } else {
//       pattern = examTemplates[examType];
//     }

//     const chatData = {
//       examType,
//       bloomLevel,
//       questionPattern: pattern,
//     };

//     onCreate(chatData, pdfFile);
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

//         {/* Exam Type */}
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

//         {/* Bloom Level */}
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

//         {/* Custom Pattern Only */}
//         {examType === 'Custom' && (
//           <div className="mt-4 space-y-2">
//             <label className="block mb-2">MCQ Pattern</label>

//             <input
//               type="number"
//               placeholder="MCQ Count"
//               value={customPattern.mcq}
//               onChange={(e) =>
//                 setCustomPattern({ ...customPattern, mcq: Number(e.target.value) })
//               }
//               className="w-full border p-2 rounded"
//             />

//             <label className="block mb-2">Descriptive Pattern</label>
//             <input
//               type="number"
//               placeholder="Descriptive Count"
//               value={customPattern.descriptive}
//               onChange={(e) =>
//                 setCustomPattern({ ...customPattern, descriptive: Number(e.target.value) })
//               }
//               className="w-full border p-2 rounded"
//             />

//             <label className="block mb-2">Marks Per Question</label>
//             <input
//               type="number"
//               placeholder="Marks Per Question"
//               value={customPattern.marks}
//               onChange={(e) =>
//                 setCustomPattern({ ...customPattern, marks: Number(e.target.value) })
//               }
//               className="w-full border p-2 rounded"
//             />
//           </div>
//         )}

//         {/* PDF Upload */}
//         {/* <div className="mt-4">
//           <label className="block mb-1">Upload Study Material</label>
//           <input
//             type="file"
//             accept=".pdf"
//             onChange={(e) => setPdfFile(e.target.files[0])}
//           />
//         </div> */}

//         {/* Buttons */}
//         <div className="flex gap-3 mt-6">
//           <button
//             onClick={onClose}
//             className="flex-1 border p-2 rounded"
//           >
//             Cancel
//           </button>

//           <button
//             onClick={handleCreate}
//             className="flex-1 bg-indigo-600 text-white p-2 rounded"
//           >
//             Create Session
//           </button>
//         </div>

//       </div>
//     </div>
//   );
// };

// export default NewChatModal;










// import React, { useState } from 'react';
// import { Upload, X } from 'lucide-react';

// const NewChatModal = ({ onClose, onCreate }) => {
//   const [examType, setExamType] = useState('');
//   const [questionPattern, setQuestionPattern] = useState({
//     mcqCount: 5,
//     descriptiveCount: 2,
//     marksPerQuestion: 10,
//   });
//   const [pdfFile, setPdfFile] = useState(null);
//   const [uploading, setUploading] = useState(false);

//   const handleCreate = async () => {
//     if (!examType) return;

//     const chatData = {
//       examType,
//       questionPattern,
//     };

//     onCreate(chatData, pdfFile);
//   };

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
//       <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-2xl font-bold text-gray-800">Start New Chat</h2>
//           <button
//             onClick={onClose}
//             className="p-2 hover:bg-gray-100 rounded-lg transition"
//           >
//             <X size={20} />
//           </button>
//         </div>

//         <div className="space-y-4">
//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Select Exam Type
//             </label>
//             <select
//               value={examType}
//               onChange={(e) => setExamType(e.target.value)}
//               className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
//             >
//               <option value="">Choose exam...</option>
//               <option value="CAT">CAT</option>
//               <option value="GATE">GATE</option>
//               <option value="JEE">JEE</option>
//               <option value="NEET">NEET</option>
//               <option value="UPSC">UPSC</option>
//               <option value="University">University Exam</option>
//               <option value="Custom">Custom</option>
//             </select>
//           </div>

//           {examType && (
//             <div className="space-y-3">
//               <h3 className="font-medium text-gray-700">Question Pattern</h3>
              
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs text-gray-600 mb-1">
//                     MCQ Count
//                   </label>
//                   <input
//                     type="number"
//                     min="1"
//                     max="50"
//                     value={questionPattern.mcqCount}
//                     onChange={(e) =>
//                       setQuestionPattern({
//                         ...questionPattern,
//                         mcqCount: parseInt(e.target.value),
//                       })
//                     }
//                     className="w-full px-3 py-1 border border-gray-300 rounded-lg"
//                   />
//                 </div>
                
//                 <div>
//                   <label className="block text-xs text-gray-600 mb-1">
//                     Descriptive Count
//                   </label>
//                   <input
//                     type="number"
//                     min="0"
//                     max="20"
//                     value={questionPattern.descriptiveCount}
//                     onChange={(e) =>
//                       setQuestionPattern({
//                         ...questionPattern,
//                         descriptiveCount: parseInt(e.target.value),
//                       })
//                     }
//                     className="w-full px-3 py-1 border border-gray-300 rounded-lg"
//                   />
//                 </div>
//               </div>
              
//               <div>
//                 <label className="block text-xs text-gray-600 mb-1">
//                   Marks per Question
//                 </label>
//                 <input
//                   type="number"
//                   min="1"
//                   max="100"
//                   value={questionPattern.marksPerQuestion}
//                   onChange={(e) =>
//                     setQuestionPattern({
//                       ...questionPattern,
//                       marksPerQuestion: parseInt(e.target.value),
//                     })
//                   }
//                   className="w-full px-3 py-1 border border-gray-300 rounded-lg"
//                 />
//               </div>
//             </div>
//           )}

//           <div>
//             <label className="block text-sm font-medium text-gray-700 mb-2">
//               Upload Study Material (Optional)
//             </label>
//             <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-400 transition">
//               <Upload className="mx-auto text-gray-400 mb-2" size={24} />
//               <input
//                 type="file"
//                 accept=".pdf"
//                 onChange={(e) => setPdfFile(e.target.files[0])}
//                 className="hidden"
//                 id="pdf-upload"
//               />
//               <label
//                 htmlFor="pdf-upload"
//                 className="block text-sm text-gray-600 cursor-pointer hover:text-indigo-600 mb-1"
//               >
//                 {pdfFile ? pdfFile.name : 'Click to upload PDF'}
//               </label>
//               <p className="text-xs text-gray-500">
//                 Upload your syllabus, notes, or question papers
//               </p>
//               {pdfFile && (
//                 <button
//                   onClick={() => setPdfFile(null)}
//                   className="mt-2 text-xs text-red-600 hover:text-red-700"
//                 >
//                   Remove file
//                 </button>
//               )}
//             </div>
//           </div>

//           <div className="flex gap-3 pt-4">
//             <button
//               onClick={onClose}
//               className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleCreate}
//               disabled={!examType || uploading}
//               className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
//             >
//               {uploading ? 'Creating...' : 'Create Chat'}
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default NewChatModal;