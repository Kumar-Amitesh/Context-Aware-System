import React, { useState, useEffect, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import AuthPage from './components/AuthPage';
import ChatSidebar from './components/ChatSidebar';
import NewChatModal from './components/NewChatModal';
import QuestionRenderer from './components/QuestionRenderer';
import PracticeSession from './components/PracticeSession';
import SessionReview from './components/SessionReview';
import { chatAPI, questionAPI } from './services/api';
import './App.css';

const App = () => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfs, setPdfs] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [reviewSession, setReviewSession] = useState(null);

  const pdfPollRef = useRef(null);

  const loadChats = async () => {
    try {
      const response = await chatAPI.getChats();
      setChats(response.data || []);
    } catch (error) { console.error('Error loading chats:', error); }
  };

  const loadPDFs = async (chatId) => {
    try {
      const response = await chatAPI.getPDFs(chatId);
      setPdfs(response.data || []);
      return response.data || [];
    } catch (error) { console.error('Error loading PDFs:', error); return []; }
  };

  const loadSessionHistory = async (chatId) => {
    try {
      const response = await chatAPI.getChatHistory(chatId);
      setSessionHistory(response.data || []);
    } catch (error) { console.error('Error loading session history:', error); }
  };

  const getSubjectForChat = (chat) => {
    if (chat?.subject) return chat.subject;
    if (chat?.examConfig?.subject) return chat.examConfig.subject;
    if (chat?.examConfigSubject) return chat.examConfigSubject;
    return null;
  };

  const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
    const hasProcessing = (currentPdfs || []).some((p) => !p.processed && !p.error);
    if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
    if (!chatId || !hasProcessing) return;
    pdfPollRef.current = setInterval(async () => {
      const latest = await loadPDFs(chatId);
      const stillProcessing = (latest || []).some((p) => !p.processed && !p.error);
      if (!stillProcessing) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
    }, 2000);
  };

  useEffect(() => { if (user) loadChats(); }, [user]);

  useEffect(() => {
    if (!currentChatId) return;
    (async () => {
      const latestPdfs = await loadPDFs(currentChatId);
      await loadSessionHistory(currentChatId);
      setReviewSession(null);
      startPdfPollingIfNeeded(currentChatId, latestPdfs);
    })();
    return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
  }, [currentChatId]);

  const handleLogin = (userData) => {
    setUser(userData); setCurrentChatId(null); setQuestions(null); setCurrentSession(null); setReviewSession(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setUser(null); setCurrentChatId(null); setQuestions(null); setCurrentSession(null);
    setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
  };

  const handleCreateChat = async (chatData) => {
    try {
      const questionTypes = chatData.questionTypes || {};
      const totalQuestions = Object.values(questionTypes).reduce((acc, cfg) => acc + (Number(cfg?.count) || 0), 0);
      const chatRequestData = {
        examType: chatData.examType,
        bloomLevels: chatData.bloomLevels,
        examConfig: {
          totalQuestions, questionTypes,
          mcq: { count: questionTypes?.mcq?.count || 0, marks: questionTypes?.mcq?.marks || 0 },
          descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 },
        },
      };
      const response = await chatAPI.createChat(chatRequestData);
      const newChat = {
        chatId: response.data.chatId, examType: chatData.examType, createdAt: new Date().toISOString(),
        weakTopics: [], pdfCount: 0, subject: null, bloomLevels: chatData.bloomLevels || [],
        examConfig: chatRequestData.examConfig, analytics: [],
      };
      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(response.data.chatId);
      setShowNewChatModal(false); setQuestions(null); setCurrentSession(null); setReviewSession(null);
    } catch (error) {
      console.error('Error creating chat:', error);
      alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUploadPDF = async (chatId, filesOrFile) => {
    try {
      const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
      setPdfs((prev) => [...prev, ...files.map((f) => ({
        pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name, type: 'pending',
        processed: false, error: null, uploadedAt: new Date().toISOString(),
      }))]);
      for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
      const latest = await loadPDFs(chatId);
      setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
      startPdfPollingIfNeeded(chatId, latest);
      alert('PDF(s) uploaded successfully. Processing in background...');
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.error || error.message;
      if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
      alert('Failed to upload PDF: ' + msg);
      await loadPDFs(chatId);
    }
  };

  const handleGenerateFullExam = async (chatId) => {
    try {
      const response = await questionAPI.generateFullExam(chatId);
      setQuestions(response.data.questions); setCurrentSession(response.data.sessionId); setReviewSession(null);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.error || error.message;
      if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
      else alert('Failed to generate questions: ' + msg);
      throw error;
    }
  };

  const handleGenerateWeakExam = async (chatId) => {
    try {
      const response = await questionAPI.generateWeakExam(chatId);
      setQuestions(response.data.questions); setCurrentSession(response.data.sessionId); setReviewSession(null);
      return response.data;
    } catch (error) {
      alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleSubmitTest = async (answers) => {
    if (!currentSession) return;
    try {
      const response = await questionAPI.submitAnswers(currentSession, answers);
      const updatedChats = chats.map((chat) => {
        if (chat.chatId === currentChatId) {
          const weakTopics = response.data.weakTopicList || Object.keys(response.data.weakTopics || {}).slice(0, 5);
          return { ...chat, weakTopics, analytics: response.data.analytics || chat.analytics || [] };
        }
        return chat;
      });
      setChats(updatedChats);
      await loadSessionHistory(currentChatId);
      return response.data;
    } catch (error) {
      alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleSelectChat = (chatId) => {
    setCurrentChatId(chatId); setQuestions(null); setCurrentSession(null); setPdfs([]); setReviewSession(null);
  };

  const currentChat = chats.find((c) => c.chatId === currentChatId);
  const subjectName = getSubjectForChat(currentChat);
  const hasAnyPDF = pdfs.length > 0;
  const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
  const canGenerate = hasAnyPDF && allProcessed;

  if (!user) return <AuthPage onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <ChatSidebar
        user={user} chats={chats} currentChatId={currentChatId}
        onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)}
        onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen}
      />

      <div className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {currentChat && (
              <div>
                <div className="topbar-title">
                  {currentChat.examType} Preparation
                  {subjectName && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>}
                </div>
                <div className="topbar-sub">
                  {pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed
                </div>
              </div>
            )}
          </div>

          {currentChat?.weakTopics?.length > 0 && (
            <div className="topbar-weak-tags">
              {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
                <span key={idx} className="badge badge-warning">{topic}</span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="content-area">
          {!currentChatId ? (
            <div className="empty-state">
              <div className="empty-state-card">
                <div className="empty-icon">
                  <Menu size={32} />
                </div>
                <h3>No chat selected</h3>
                <p>Select an existing chat or create a new one to start your exam prep</p>
                <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
                  Start a new session
                </button>
              </div>
            </div>
          ) : reviewSession ? (
            <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />
          ) : questions ? (
            <QuestionRenderer
              questions={questions} onSubmit={handleSubmitTest} sessionId={currentSession}
              onExitToHome={() => { setQuestions(null); setCurrentSession(null); }}
            />
          ) : (
            <PracticeSession
              chat={currentChat} pdfs={pdfs} sessionHistory={sessionHistory}
              onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
              onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
              onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
              onOpenHistorySession={(session) => setReviewSession(session)}
              canGenerate={canGenerate} allProcessed={allProcessed} hasAnyPDF={hasAnyPDF}
            />
          )}
        </div>
      </div>

      {showNewChatModal && (
        <NewChatModal onClose={() => setShowNewChatModal(false)} onCreate={handleCreateChat} />
      )}
    </div>
  );
};

export default App;




















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import { chatAPI, questionAPI } from './services/api';
// import './App.css';

// const App = () => {
//   const [user, setUser] = useState(() => {
//     const savedUser = localStorage.getItem('user');
//     return savedUser ? JSON.parse(savedUser) : null;
//   });

//   const [chats, setChats] = useState([]);
//   const [currentChatId, setCurrentChatId] = useState(null);
//   const [showNewChatModal, setShowNewChatModal] = useState(false);

//   const [questions, setQuestions] = useState(null);
//   const [currentSession, setCurrentSession] = useState(null);

//   const [sidebarOpen, setSidebarOpen] = useState(true);
//   const [pdfs, setPdfs] = useState([]);
//   const [sessionHistory, setSessionHistory] = useState([]);

//   const [reviewSession, setReviewSession] = useState(null);

//   const pdfPollRef = useRef(null);

//   const loadChats = async () => {
//     try {
//       const response = await chatAPI.getChats();
//       setChats(response.data || []);
//     } catch (error) {
//       console.error('Error loading chats:', error);
//     }
//   };

//   const loadPDFs = async (chatId) => {
//     try {
//       const response = await chatAPI.getPDFs(chatId);
//       setPdfs(response.data || []);
//       return response.data || [];
//     } catch (error) {
//       console.error('Error loading PDFs:', error);
//       return [];
//     }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try {
//       const response = await chatAPI.getChatHistory(chatId);
//       setSessionHistory(response.data || []);
//     } catch (error) {
//       console.error('Error loading session history:', error);
//     }
//   };

//   const getSubjectForChat = (chat) => {
//     if (chat?.subject) return chat.subject;
//     if (chat?.examConfig?.subject) return chat.examConfig.subject;
//     if (chat?.examConfigSubject) return chat.examConfigSubject;
//     return null;
//   };

//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     const hasProcessing = (currentPdfs || []).some((p) => !p.processed && !p.error);

//     if (pdfPollRef.current) {
//       clearInterval(pdfPollRef.current);
//       pdfPollRef.current = null;
//     }

//     if (!chatId || !hasProcessing) return;

//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);

//       const stillProcessing = (latest || []).some((p) => !p.processed && !p.error);
//       if (!stillProcessing) {
//         clearInterval(pdfPollRef.current);
//         pdfPollRef.current = null;
//       }
//     }, 2000);
//   };

//   useEffect(() => {
//     if (user) loadChats();
//   }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;

//     (async () => {
//       const latestPdfs = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, latestPdfs);
//     })();

//     return () => {
//       if (pdfPollRef.current) {
//         clearInterval(pdfPollRef.current);
//         pdfPollRef.current = null;
//       }
//     };
//   }, [currentChatId]);

//   const handleLogin = (userData) => {
//     setUser(userData);
//     setCurrentChatId(null);
//     setQuestions(null);
//     setCurrentSession(null);
//     setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token');
//     localStorage.removeItem('user');
//     setUser(null);
//     setCurrentChatId(null);
//     setQuestions(null);
//     setCurrentSession(null);
//     setReviewSession(null);
//     setChats([]);
//     setPdfs([]);
//     setSessionHistory([]);
//   };

//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce(
//         (acc, cfg) => acc + (Number(cfg?.count) || 0),
//         0
//       );

//       const chatRequestData = {
//         examType: chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig: {
//           totalQuestions,
//           questionTypes,
//           mcq: {
//             count: questionTypes?.mcq?.count || 0,
//             marks: questionTypes?.mcq?.marks || 0,
//           },
//           descriptive: {
//             count: questionTypes?.descriptive?.count || 0,
//             marks: questionTypes?.descriptive?.marks || 0,
//           },
//         },
//       };

//       const response = await chatAPI.createChat(chatRequestData);

//       const newChat = {
//         chatId: response.data.chatId,
//         examType: chatData.examType,
//         createdAt: new Date().toISOString(),
//         weakTopics: [],
//         pdfCount: 0,
//         subject: null,
//         bloomLevels: chatData.bloomLevels || [],
//         examConfig: chatRequestData.examConfig,
//         analytics: [],
//       };

//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(response.data.chatId);
//       setShowNewChatModal(false);
//       setQuestions(null);
//       setCurrentSession(null);
//       setReviewSession(null);
//     } catch (error) {
//       console.error('Error creating chat:', error);
//       alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];

//       setPdfs((prev) => [
//         ...prev,
//         ...files.map((f) => ({
//           pdfId: `temp_${Date.now()}_${f.name}`,
//           filename: f.name,
//           type: 'pending',
//           processed: false,
//           error: null,
//           uploadedAt: new Date().toISOString(),
//         })),
//       ]);

//       for (const file of files) {
//         await chatAPI.uploadPDF(chatId, file);
//       }

//       const latest = await loadPDFs(chatId);

//       setChats((prev) =>
//         prev.map((c) =>
//           c.chatId === chatId ? { ...c, pdfCount: latest.length } : c
//         )
//       );

//       startPdfPollingIfNeeded(chatId, latest);

//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;

//       if (status === 409) {
//         alert(msg);
//         await loadPDFs(chatId);
//         return;
//       }

//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       setQuestions(response.data.questions);
//       setCurrentSession(response.data.sessionId);
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       console.error('Error generating questions:', error);
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;

//       if (status === 429) {
//         alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       } else {
//         alert('Failed to generate questions: ' + msg);
//       }
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setQuestions(response.data.questions);
//       setCurrentSession(response.data.sessionId);
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       console.error('Error generating weak questions:', error);
//       const errorMsg = error.response?.data?.error || error.message;
//       alert('Failed to generate weak topics questions: ' + errorMsg);
//       throw error;
//     }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!currentSession) return;

//     try {
//       const response = await questionAPI.submitAnswers(currentSession, answers);

//       const updatedChats = chats.map((chat) => {
//         if (chat.chatId === currentChatId) {
//           const weakTopics =
//             response.data.weakTopicList ||
//             Object.keys(response.data.weakTopics || {}).slice(0, 5);

//           return {
//             ...chat,
//             weakTopics,
//             analytics: response.data.analytics || chat.analytics || [],
//           };
//         }
//         return chat;
//       });

//       setChats(updatedChats);

//       await loadSessionHistory(currentChatId);

//       return response.data;
//     } catch (error) {
//       console.error('Error submitting test:', error);
//       alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId);
//     setQuestions(null);
//     setCurrentSession(null);
//     setPdfs([]);
//     setReviewSession(null);
//   };

//   const currentChat = chats.find((c) => c.chatId === currentChatId);
//   const subjectName = getSubjectForChat(currentChat);

//   const hasAnyPDF = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate = hasAnyPDF && allProcessed;

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="flex h-screen bg-gray-50">
//       <ChatSidebar
//         user={user}
//         chats={chats}
//         currentChatId={currentChatId}
//         onSelectChat={handleSelectChat}
//         onCreateChat={() => setShowNewChatModal(true)}
//         onLogout={handleLogout}
//         onUploadPDF={handleUploadPDF}
//         sidebarOpen={sidebarOpen}
//       />

//       <div className="flex-1 flex flex-col overflow-hidden">
//         <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
//           <div className="flex items-center gap-3">
//             <button
//               onClick={() => setSidebarOpen(!sidebarOpen)}
//               className="p-2 hover:bg-gray-100 rounded-lg transition lg:hidden"
//             >
//               {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
//             </button>

//             {currentChat && (
//               <div>
//                 <h2 className="text-lg font-semibold text-gray-800">
//                   {currentChat.examType} Preparation
//                   {subjectName ? (
//                     <span className="ml-2 text-sm font-medium text-gray-500">
//                       • {subjectName}
//                     </span>
//                   ) : null}
//                 </h2>
//                 <p className="text-sm text-gray-500">
//                   {pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed
//                 </p>
//               </div>
//             )}
//           </div>

//           {currentChat && currentChat.weakTopics && currentChat.weakTopics.length > 0 && (
//             <div className="hidden md:flex items-center gap-2">
//               <span className="text-sm text-gray-600">Weak Topics:</span>
//               <div className="flex gap-1">
//                 {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
//                   <span
//                     key={idx}
//                     className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded"
//                   >
//                     {topic}
//                   </span>
//                 ))}
//               </div>
//             </div>
//           )}
//         </div>

//         <div className="flex-1 overflow-y-auto p-4 md:p-6">
//           {!currentChatId ? (
//             <div className="flex items-center justify-center h-full">
//               <div className="text-center">
//                 <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
//                   <Menu className="text-gray-400" size={40} />
//                 </div>
//                 <h3 className="text-xl font-semibold text-gray-600 mb-2">No chat selected</h3>
//                 <p className="text-gray-500 mb-4">Select a chat or create a new one to get started</p>
//                 <button
//                   onClick={() => setShowNewChatModal(true)}
//                   className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
//                 >
//                   Create New Chat
//                 </button>
//               </div>
//             </div>
//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />
//           ) : questions ? (
//             <QuestionRenderer
//               questions={questions}
//               onSubmit={handleSubmitTest}
//               sessionId={currentSession}
//               onExitToHome={() => {
//                 setQuestions(null);
//                 setCurrentSession(null);
//               }}
//             />
//           ) : (
//             <PracticeSession
//               chat={currentChat}
//               pdfs={pdfs}
//               sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate}
//               allProcessed={allProcessed}
//               hasAnyPDF={hasAnyPDF}
//             />
//           )}
//         </div>
//       </div>

//       {showNewChatModal && (
//         <NewChatModal onClose={() => setShowNewChatModal(false)} onCreate={handleCreateChat} />
//       )}
//     </div>
//   );
// };

// export default App;