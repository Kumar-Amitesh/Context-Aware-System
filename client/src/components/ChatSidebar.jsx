import React from 'react';
import { MessageSquare, Plus, LogOut, Upload } from 'lucide-react';

const ChatSidebar = ({
  user,
  chats,
  currentChatId,
  onSelectChat,
  onCreateChat,
  onLogout,
  onUploadPDF,
  sidebarOpen,
}) => {
  const [uploadingPDF, setUploadingPDF] = React.useState(false);

  const handlePDFUpload = async (chatId, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadingPDF(true);
    try {
      await onUploadPDF(chatId, files);
    } catch (error) {
      console.error('Error uploading PDF:', error);
    } finally {
      setUploadingPDF(false);
      e.target.value = ''; // reset
    }
  };

  return (
    <div
      className={`${
        sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'
      } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden`}
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-indigo-600" size={24} />
            <h1 className="text-xl font-bold text-gray-800">Exam Prep AI</h1>
          </div>
        </div>

        <button
          onClick={onCreateChat}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={20} />
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Chat History
        </h2>

        <div className="space-y-2">
          {chats.map((chat) => (
            <div key={chat.chatId}>
              <div
                onClick={() => onSelectChat(chat.chatId)}
                className={`p-3 rounded-lg cursor-pointer transition ${
                  currentChatId === chat.chatId
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">
                      {chat.examType}
                      {chat.subject ? (
                        <span className="text-gray-500 font-normal"> • {chat.subject}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(chat.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* (optional) pdfCount chip */}
                  {typeof chat.pdfCount === 'number' && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {chat.pdfCount} PDFs
                    </span>
                  )}
                </div>

                {chat.weakTopics && chat.weakTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {chat.weakTopics.slice(0, 2).map((topic, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {currentChatId === chat.chatId && (
                <div className="mt-2 ml-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 cursor-pointer">
                    <Upload size={16} />
                    <span>{uploadingPDF ? 'Uploading...' : 'Upload PDF(s)'}</span>
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={(e) => handlePDFUpload(chat.chatId, e)}
                      className="hidden"
                      disabled={uploadingPDF}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Logout"
          >
            <LogOut size={20} className="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatSidebar;


























// import React from 'react';
// import { MessageSquare, Plus, LogOut, Upload } from 'lucide-react';

// const ChatSidebar = ({
//   user,
//   chats,
//   currentChatId,
//   onSelectChat,
//   onCreateChat,
//   onLogout,
//   onUploadPDF,
//   sidebarOpen,
// }) => {
//   const [uploadingPDF, setUploadingPDF] = React.useState(false);

//   const handlePDFUpload = async (chatId, e) => {
//     const file = e.target.files[0];
//     if (!file) return;

//     setUploadingPDF(true);
//     try {
//       await onUploadPDF(chatId, file);
//     } catch (error) {
//       console.error('Error uploading PDF:', error);
//     } finally {
//       setUploadingPDF(false);
//     }
//   };

//   return (
//     <div
//       className={`${
//         sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'
//       } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden`}
//     >
//       <div className="p-4 border-b border-gray-200">
//         <div className="flex items-center justify-between mb-4">
//           <div className="flex items-center gap-2">
//             <MessageSquare className="text-indigo-600" size={24} />
//             <h1 className="text-xl font-bold text-gray-800">Exam Prep AI</h1>
//           </div>
//         </div>

//         <button
//           onClick={onCreateChat}
//           className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
//         >
//           <Plus size={20} />
//           <span>New Chat</span>
//         </button>
//       </div>

//       <div className="flex-1 overflow-y-auto p-4">
//         <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">
//           Chat History
//         </h2>
//         <div className="space-y-2">
//           {chats.map((chat) => (
//             <div key={chat.chatId}>
//               <div
//                 onClick={() => onSelectChat(chat.chatId)}
//                 className={`p-3 rounded-lg cursor-pointer transition ${
//                   currentChatId === chat.chatId
//                     ? 'bg-indigo-50 border border-indigo-200'
//                     : 'hover:bg-gray-50 border border-transparent'
//                 }`}
//               >
//                 <div className="flex items-center justify-between mb-1">
//                   <span className="font-medium text-gray-800">
//                     {chat.examType}
//                   </span>
//                   <span className="text-xs text-gray-500">
//                     {new Date(chat.createdAt).toLocaleDateString()}
//                   </span>
//                 </div>
//                 {chat.weakTopics && chat.weakTopics.length > 0 && (
//                   <div className="flex flex-wrap gap-1 mt-2">
//                     {chat.weakTopics.slice(0, 2).map((topic, idx) => (
//                       <span
//                         key={idx}
//                         className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded"
//                       >
//                         {topic}
//                       </span>
//                     ))}
//                   </div>
//                 )}
//               </div>

//               {currentChatId === chat.chatId && (
//                 <div className="mt-2 ml-3">
//                   <label className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 cursor-pointer">
//                     <Upload size={16} />
//                     <span>Upload PDF</span>
//                     <input
//                       type="file"
//                       accept=".pdf"
//                       onChange={(e) => handlePDFUpload(chat.chatId, e)}
//                       className="hidden"
//                       id={`pdf-upload-${chat.chatId}`}
//                       disabled={uploadingPDF}
//                     />
//                   </label>
//                 </div>
//               )}
//             </div>
//           ))}
//         </div>
//       </div>

//       <div className="p-4 border-t border-gray-200">
//         <div className="flex items-center justify-between">
//           <div>
//             <p className="text-sm font-medium text-gray-800">{user.name}</p>
//             <p className="text-xs text-gray-500">{user.email}</p>
//           </div>
//           <button
//             onClick={onLogout}
//             className="p-2 hover:bg-gray-100 rounded-lg transition"
//             title="Logout"
//           >
//             <LogOut size={20} className="text-gray-600" />
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default ChatSidebar;