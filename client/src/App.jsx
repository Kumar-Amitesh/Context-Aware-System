import React, { useState, useEffect, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import AuthPage from './components/AuthPage';
import ChatSidebar from './components/ChatSidebar';
import NewChatModal from './components/NewChatModal';
import QuestionRenderer from './components/QuestionRenderer';
import PracticeSession from './components/PracticeSession';
import SessionReview from './components/SessionReview';
import VoiceInterview from './components/VoiceInterview';
import VideoInterviewSession from './components/VideoInterviewSession';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import FlashcardDeck from './components/FlashcardDeck';
import JDInterviewPanel from './components/JDInterviewPanel';
import { authAPI, chatAPI, questionAPI } from './services/api';
import './App.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
const getExamConfig = (chat) => {
  if (!chat?.examConfig) return {};
  try {
    return typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
  } catch { return {}; }
};

const getChatSessionMode    = (chat) => getExamConfig(chat).sessionMode    || 'normal';
const getChatVideoMediaMode = (chat) => getExamConfig(chat).videoMediaMode || 'video';
const isJDChat              = (chat) => getExamConfig(chat).chatType === 'jd';

const App = () => {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  });
  const [authVerified,     setAuthVerified]     = useState(false);
  const [chats,            setChats]            = useState([]);
  const [currentChatId,    setCurrentChatId]    = useState(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [prefilledExamType,setPrefilledExamType]= useState('');
  const [activeSession,    setActiveSession]    = useState(null);
  const [sidebarOpen,      setSidebarOpen]      = useState(true);
  const [pdfs,             setPdfs]             = useState([]);
  const [sessionHistory,   setSessionHistory]   = useState([]);
  const [reviewSession,    setReviewSession]    = useState(null);
  const [showAnalytics,    setShowAnalytics]    = useState(false);
  const [showFlashcards,   setShowFlashcards]   = useState(false);

  const pdfPollRef = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setUser(null); setAuthVerified(true); return; }
    authAPI.getMe()
      .then((res) => {
        const verified = res.data;
        setUser(verified);
        localStorage.setItem('user', JSON.stringify(verified));
        setAuthVerified(true);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setAuthVerified(true);
      });
  }, []);

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadChats = async () => {
    try { const res = await chatAPI.getChats(); setChats(res.data || []); }
    catch (e) { console.error(e); }
  };

  const loadPDFs = async (chatId) => {
    try { const res = await chatAPI.getPDFs(chatId); setPdfs(res.data || []); return res.data || []; }
    catch { return []; }
  };

  const loadSessionHistory = async (chatId) => {
    try { const res = await chatAPI.getChatHistory(chatId); setSessionHistory(res.data || []); }
    catch (e) { console.error(e); }
  };

  const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
    if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
    if (!chatId || !(currentPdfs || []).some((p) => !p.processed && !p.error)) return;
    pdfPollRef.current = setInterval(async () => {
      const latest = await loadPDFs(chatId);
      if (!(latest || []).some((p) => !p.processed && !p.error)) {
        clearInterval(pdfPollRef.current); pdfPollRef.current = null;
      }
    }, 2000);
  };

  useEffect(() => { if (user) loadChats(); }, [user]);

  useEffect(() => {
    if (!currentChatId) return;
    const chat = chats.find(c => c.chatId === currentChatId);
    if (isJDChat(chat)) {
      loadSessionHistory(currentChatId);
      return;
    }
    (async () => {
      const lp = await loadPDFs(currentChatId);
      await loadSessionHistory(currentChatId);
      setReviewSession(null);
      startPdfPollingIfNeeded(currentChatId, lp);
    })();
    return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
  }, [currentChatId]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleLogin = (u) => {
    setUser(u); setCurrentChatId(null); setActiveSession(null); setReviewSession(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setUser(null); setCurrentChatId(null); setActiveSession(null);
    setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
  };

  // ── Unified create handler ────────────────────────────────────────────────
  // NewChatModal calls onCreate with either:
  //   { examType, bloomLevels, ... }            — exam session
  //   { chatType:'jd', label, roleTitle, ... }  — JD interview session
  const handleCreateChat = async (chatData) => {
    try {
      // ── JD interview path ──────────────────────────────────────────────
      if (chatData.chatType === 'jd') {
        const { label, roleTitle = '', company = '' } = chatData;
        const examConfig = {
          chatType:      'jd',
          jdLabel:       label,
          roleTitle,
          company,
          sessionMode:   'normal',
          questionTypes: {},
        };
        const res = await chatAPI.createChat({
          examType:    label + (roleTitle ? ` - ${roleTitle}` : '') + (company ? ` @ ${company}` : ''),
          bloomLevels: [],
          examConfig,
        });
        const newChat = {
          chatId:      res.data.chatId,
          examType:    label,
          createdAt:   new Date().toISOString(),
          weakTopics:  [], pdfCount: 0,
          subject:     roleTitle || null,
          bloomLevels: [],
          examConfig,
          analytics:   [],
        };
        setChats((prev) => [newChat, ...prev]);
        setCurrentChatId(res.data.chatId);
        setShowNewChatModal(false);
        setActiveSession(null); setReviewSession(null);
        return;
      }

      // ── Exam path ──────────────────────────────────────────────────────
      const examConfig = {
        ...chatData.examConfig,
        sessionMode:    chatData.sessionMode    || 'normal',
        videoMediaMode: chatData.videoMediaMode || 'video',
        questionTypes:  chatData.questionTypes  || {},
      };
      const res = await chatAPI.createChat({
        examType:    chatData.examType,
        bloomLevels: chatData.bloomLevels,
        examConfig,
      });
      const newChat = {
        chatId:      res.data.chatId,
        examType:    chatData.examType,
        createdAt:   new Date().toISOString(),
        weakTopics:  [], pdfCount: 0, subject: null,
        bloomLevels: chatData.bloomLevels || [],
        examConfig,
        analytics:   [],
      };
      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(res.data.chatId);
      setShowNewChatModal(false);
      setActiveSession(null); setReviewSession(null);
    } catch (error) {
      alert('Failed to create session: ' + (error.response?.data?.error || error.message));
    }
  };

  // ── Upload PDF ────────────────────────────────────────────────────────────
  const handleUploadPDF = async (chatId, filesOrFile) => {
    try {
      const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
      setPdfs((prev) => [...prev, ...files.map((f) => ({
        pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name,
        type: 'pending', processed: false, error: null, uploadedAt: new Date().toISOString(),
      }))]);
      for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
      const latest = await loadPDFs(chatId);
      setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
      startPdfPollingIfNeeded(chatId, latest);
      alert('PDF(s) uploaded successfully. Processing in background...');
    } catch (error) {
      const status = error.response?.status;
      const msg    = error.response?.data?.error || error.message;
      if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
      alert('Failed to upload PDF: ' + msg);
      await loadPDFs(chatId);
    }
  };

  // ── Exam generation ───────────────────────────────────────────────────────
  const handleGenerateFullExam = async (chatId) => {
    try {
      const res  = await questionAPI.generateFullExam(chatId);
      const mode = getChatSessionMode(chats.find(c => c.chatId === chatId));
      setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode });
      setReviewSession(null);
      return res.data;
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleGenerateWeakExam = async (chatId) => {
    try {
      const res  = await questionAPI.generateWeakExam(chatId);
      const mode = getChatSessionMode(chats.find(c => c.chatId === chatId));
      setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode });
      setReviewSession(null);
      return res.data;
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleSubmitTest = async (answers) => {
    if (!activeSession?.sessionId) return;
    try {
      const res = await questionAPI.submitAnswers(activeSession.sessionId, answers);
      setChats((prev) => prev.map((chat) => {
        if (chat.chatId !== currentChatId) return chat;
        const wt = res.data.weakTopicList || Object.keys(res.data.weakTopics || {}).slice(0, 5);
        return { ...chat, weakTopics: wt, analytics: res.data.analytics || chat.analytics || [] };
      }));
      await loadSessionHistory(currentChatId);
      return res.data;
    } catch (error) {
      alert('Failed to submit: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleVoiceInterviewFinished = async () => {
    // const sessionQuestions = activeSession?.questions || [];
    // const sessionId        = activeSession?.sessionId;
    // setActiveSession(null);
    // if (result) {
    //   setReviewSession({
    //     sessionId, type: 'voice_full', createdAt: new Date().toISOString(),
    //     score: result.score, questions: sessionQuestions,
    //     answers: answers || {}, feedback: result.results || {},
    //   });
    //   loadSessionHistory(currentChatId);
    // }
    setActiveSession(null);
    await loadSessionHistory(currentChatId);
  };

  const handleVideoInterviewFinished = (result) => {
    const sessionQuestions = activeSession?.questions || [];
    const sessionId        = activeSession?.sessionId;
    setActiveSession(null);
    if (result) {
      setReviewSession({
        sessionId, type: 'video_full', createdAt: new Date().toISOString(),
        score: result.score, questions: sessionQuestions,
        answers: Object.fromEntries(
          (result.allResults || []).filter(r => r.question?.id)
            .map(r => [r.question.id, r.feedback?.transcript || ''])
        ),
        feedback: result.results || {},
      });
      loadSessionHistory(currentChatId);
    }
  };

  const handleJDSessionFinished = () => {
    loadSessionHistory(currentChatId);
  };

  const handleSelectChat = (chatId) => {
    setCurrentChatId(chatId);
    setActiveSession(null); setPdfs([]); setReviewSession(null);
    setShowAnalytics(false); setShowFlashcards(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentChat        = chats.find((c) => c.chatId === currentChatId);
  const currentChatIsJD    = isJDChat(currentChat);
  const hasAnyPDF          = pdfs.length > 0;
  const allProcessed       = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
  const canGenerate        = hasAnyPDF && allProcessed;
  const sessionMode        = getChatSessionMode(currentChat);
  const isVoiceActive      = activeSession?.mode === 'voice';
  const isVideoActive      = activeSession?.mode === 'video';
  const chatVideoMediaMode = getChatVideoMediaMode(currentChat);

  if (!authVerified) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <AuthPage onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <ChatSidebar
        user={user} chats={chats} currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={() => { setPrefilledExamType(''); setShowNewChatModal(true); }}
        onLogout={handleLogout}
        onUploadPDF={handleUploadPDF}
        sidebarOpen={sidebarOpen}
      />

      <div className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {currentChat && (
              <div>
                <div className="topbar-title">
                  {currentChatIsJD
                    ? `💼 ${getExamConfig(currentChat).jdLabel || 'Job Interview Prep'}`
                    : `${currentChat.examType} Preparation`}
                </div>
                <div className="topbar-sub">
                  {currentChatIsJD
                    ? (() => {
                        const cfg   = getExamConfig(currentChat);
                        const parts = [cfg.roleTitle, cfg.company].filter(Boolean);
                        return parts.length ? parts.join(' · ') : 'Job Interview Prep';
                      })()
                    : `${(pdfs || []).filter(p => p.processed).length} / ${(pdfs || []).length} PDFs processed`
                  }
                  {isVoiceActive && <span style={{ color: 'var(--accent)',   marginLeft: 8 }}>· Voice Interview</span>}
                  {isVideoActive && <span style={{ color: 'var(--success)',  marginLeft: 8 }}>· Video Interview</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="content-area">
          {!currentChatId ? (
            <div className="empty-state">
              <div className="empty-state-card">
                <div className="empty-icon"><Menu size={32} /></div>
                <h3>No session selected</h3>
                <p>Select an existing session or create a new one</p>
                <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
                  New Session
                </button>
              </div>
            </div>

          ) : currentChatIsJD ? (
            <JDInterviewPanel
              chat={currentChat}
              chatId={currentChatId}
              sessionHistory={sessionHistory}
              onSessionFinished={handleJDSessionFinished}
            />

          ) : reviewSession ? (
            <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />

          ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
            // <VoiceInterview
            //   questions={activeSession.questions}
            //   onSubmit={handleSubmitTest}
            //   onExitToHome={handleVoiceInterviewFinished}
            // />
            <VoiceInterview
              questions={activeSession.questions}
              sessionId={activeSession.sessionId}
              onFinished={handleVoiceInterviewFinished}
              onExit={() => setActiveSession(null)}
            />

          ) : activeSession?.mode === 'video' && activeSession.questions?.length > 0 ? (
            <VideoInterviewSession
              questions={activeSession.questions}
              chatId={currentChatId}
              sessionId={activeSession.sessionId}
              mediaMode={chatVideoMediaMode}
              onFinished={handleVideoInterviewFinished}
              onExit={() => setActiveSession(null)}
            />

          ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
            <QuestionRenderer
              questions={activeSession.questions}
              onSubmit={handleSubmitTest}
              sessionId={activeSession.sessionId}
              onExitToHome={() => setActiveSession(null)}
            />

          ) : (
            <PracticeSession
              chat={currentChat}
              pdfs={pdfs}
              sessionHistory={sessionHistory}
              onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
              onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
              onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
              onOpenHistorySession={(session) => setReviewSession(session)}
              canGenerate={canGenerate}
              allProcessed={allProcessed}
              hasAnyPDF={hasAnyPDF}
              onNewSessionPrefilled={(examType) => {
                setPrefilledExamType(examType || '');
                setShowNewChatModal(true);
              }}
              onOpenAnalytics={() => setShowAnalytics(true)}
              onOpenFlashcards={() => setShowFlashcards(true)}
              sessionMode={sessionMode}
            />
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showAnalytics && currentChat && !currentChatIsJD && (
        <AnalyticsDashboard
          chat={currentChat} sessionHistory={sessionHistory}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showFlashcards && currentChat && !currentChatIsJD && (
        <FlashcardDeck
          chat={currentChat} chatId={currentChatId}
          onClose={() => setShowFlashcards(false)}
        />
      )}

      {showNewChatModal && (
        <NewChatModal
          onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }}
          onCreate={handleCreateChat}
          defaultExamType={prefilledExamType}
        />
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
// import JDNewSessionModal from './components/JDNewSessionModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// import VideoInterviewSession from './components/VideoInterviewSession';
// import AnalyticsDashboard from './components/AnalyticsDashboard';
// import FlashcardDeck from './components/FlashcardDeck';
// import JDInterviewPanel from './components/JDInterviewPanel';
// import { authAPI, chatAPI, questionAPI } from './services/api';
// import './App.css';

// // ── Helpers ───────────────────────────────────────────────────────────────────
// const getExamConfig = (chat) => {
//   if (!chat?.examConfig) return {};
//   try {
//     return typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//   } catch { return {}; }
// };

// const getChatSessionMode  = (chat) => getExamConfig(chat).sessionMode  || 'normal';
// const getChatVideoMediaMode = (chat) => getExamConfig(chat).videoMediaMode || 'video';
// const isJDChat            = (chat) => getExamConfig(chat).chatType === 'jd';

// const App = () => {
//   const [user, setUser] = useState(() => {
//     const u = localStorage.getItem('user');
//     return u ? JSON.parse(u) : null;
//   });
//   const [authVerified,      setAuthVerified]      = useState(false);
//   const [chats,             setChats]             = useState([]);
//   const [currentChatId,     setCurrentChatId]     = useState(null);
//   const [showNewChatModal,  setShowNewChatModal]  = useState(false);
//   const [showJDModal,       setShowJDModal]       = useState(false);
//   const [prefilledExamType, setPrefilledExamType] = useState('');
//   const [activeSession,     setActiveSession]     = useState(null);
//   const [sidebarOpen,       setSidebarOpen]       = useState(true);
//   const [pdfs,              setPdfs]              = useState([]);
//   const [sessionHistory,    setSessionHistory]    = useState([]);
//   const [reviewSession,     setReviewSession]     = useState(null);
//   const [showAnalytics,     setShowAnalytics]     = useState(false);
//   const [showFlashcards,    setShowFlashcards]    = useState(false);

//   const pdfPollRef = useRef(null);

//   // ── Auth ─────────────────────────────────────────────────────────────────────
//   useEffect(() => {
//     const token = localStorage.getItem('token');
//     if (!token) { setUser(null); setAuthVerified(true); return; }
//     authAPI.getMe()
//       .then((res) => {
//         const verified = res.data;
//         setUser(verified);
//         localStorage.setItem('user', JSON.stringify(verified));
//         setAuthVerified(true);
//       })
//       .catch(() => {
//         localStorage.removeItem('token');
//         localStorage.removeItem('user');
//         setUser(null);
//         setAuthVerified(true);
//       });
//   }, []);

//   // ── Data loaders ─────────────────────────────────────────────────────────────
//   const loadChats = async () => {
//     try { const res = await chatAPI.getChats(); setChats(res.data || []); }
//     catch (e) { console.error(e); }
//   };

//   const loadPDFs = async (chatId) => {
//     try { const res = await chatAPI.getPDFs(chatId); setPdfs(res.data || []); return res.data || []; }
//     catch { return []; }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try { const res = await chatAPI.getChatHistory(chatId); setSessionHistory(res.data || []); }
//     catch (e) { console.error(e); }
//   };

//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !(currentPdfs || []).some((p) => !p.processed && !p.error)) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       if (!(latest || []).some((p) => !p.processed && !p.error)) {
//         clearInterval(pdfPollRef.current); pdfPollRef.current = null;
//       }
//     }, 2000);
//   };

//   useEffect(() => { if (user) loadChats(); }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;
//     const chat = chats.find(c => c.chatId === currentChatId);
//     if (isJDChat(chat)) {
//       loadSessionHistory(currentChatId);
//       return;
//     }
//     (async () => {
//       const lp = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, lp);
//     })();
//     return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
//   }, [currentChatId]);

//   // ── Auth handlers ─────────────────────────────────────────────────────────────
//   const handleLogin = (u) => {
//     setUser(u); setCurrentChatId(null); setActiveSession(null); setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token'); localStorage.removeItem('user');
//     setUser(null); setCurrentChatId(null); setActiveSession(null);
//     setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
//   };

//   // ── Create exam session ───────────────────────────────────────────────────────
//   const handleCreateChat = async (chatData) => {
//     try {
//       const examConfig = {
//         ...chatData.examConfig,
//         sessionMode:    chatData.sessionMode    || 'normal',
//         videoMediaMode: chatData.videoMediaMode || 'video',
//         questionTypes:  chatData.questionTypes  || {},
//       };
//       const res = await chatAPI.createChat({
//         examType:    chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig:  examConfig,
//       });
//       const newChat = {
//         chatId:      res.data.chatId,
//         examType:    chatData.examType,
//         createdAt:   new Date().toISOString(),
//         weakTopics:  [], pdfCount: 0, subject: null,
//         bloomLevels: chatData.bloomLevels || [],
//         examConfig,
//         analytics:   [],
//       };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(res.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null); setReviewSession(null);
//     } catch (error) {
//       alert('Failed to create session: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   // ── Create JD interview session ───────────────────────────────────────────────
//   // Called from JDNewSessionModal with { label, roleTitle, company }
//   const handleCreateJDChat = async ({ label, roleTitle, company }) => {
//     const examConfig = {
//       chatType:    'jd',
//       jdLabel:     label,
//       roleTitle:   roleTitle || '',
//       company:     company   || '',
//       sessionMode: 'normal',
//       questionTypes: {},
//     };
//     const res = await chatAPI.createChat({
//       examType:    label+(roleTitle ? ` - ${roleTitle}` : '')+(company ? ` @ ${company}` : ''), 
//       // examType is used as fallback display name in some places
//       bloomLevels: [],
//       examConfig,
//     });
//     const newChat = {
//       chatId:      res.data.chatId,
//       examType:    label,
//       createdAt:   new Date().toISOString(),
//       weakTopics:  [], pdfCount: 0,
//       subject:     roleTitle || null,
//       bloomLevels: [],
//       examConfig,
//       analytics:   [],
//     };
//     setChats((prev) => [newChat, ...prev]);
//     setCurrentChatId(res.data.chatId);
//     setShowJDModal(false);
//     setActiveSession(null); setReviewSession(null);
//     // Modal's loading state will stop after this resolves (no throw = success)
//   };

//   // ── Upload PDF ────────────────────────────────────────────────────────────────
//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({
//         pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name,
//         type: 'pending', processed: false, error: null, uploadedAt: new Date().toISOString(),
//       }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   // ── Exam generation ───────────────────────────────────────────────────────────
//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const res = await questionAPI.generateFullExam(chatId);
//       const mode = getChatSessionMode(chats.find(c => c.chatId === chatId));
//       setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode });
//       setReviewSession(null);
//       return res.data;
//     } catch (error) {
//       alert('Failed: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const res = await questionAPI.generateWeakExam(chatId);
//       const mode = getChatSessionMode(chats.find(c => c.chatId === chatId));
//       setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode });
//       setReviewSession(null);
//       return res.data;
//     } catch (error) {
//       alert('Failed: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const res = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       setChats((prev) => prev.map((chat) => {
//         if (chat.chatId !== currentChatId) return chat;
//         const wt = res.data.weakTopicList || Object.keys(res.data.weakTopics || {}).slice(0, 5);
//         return { ...chat, weakTopics: wt, analytics: res.data.analytics || chat.analytics || [] };
//       }));
//       await loadSessionHistory(currentChatId);
//       return res.data;
//     } catch (error) {
//       alert('Failed to submit: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       setReviewSession({
//         sessionId, type: 'voice_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: answers || {}, feedback: result.results || {},
//       });
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleVideoInterviewFinished = (result) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       setReviewSession({
//         sessionId, type: 'video_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: Object.fromEntries(
//           (result.allResults || []).filter(r => r.question?.id)
//             .map(r => [r.question.id, r.feedback?.transcript || ''])
//         ),
//         feedback: result.results || {},
//       });
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleJDSessionFinished = () => {
//     loadSessionHistory(currentChatId);
//   };

//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId);
//     setActiveSession(null); setPdfs([]); setReviewSession(null);
//     setShowAnalytics(false); setShowFlashcards(false);
//   };

//   // ── Derived ───────────────────────────────────────────────────────────────────
//   const currentChat        = chats.find((c) => c.chatId === currentChatId);
//   const currentChatIsJD    = isJDChat(currentChat);
//   const hasAnyPDF          = pdfs.length > 0;
//   const allProcessed       = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate        = hasAnyPDF && allProcessed;
//   const sessionMode        = getChatSessionMode(currentChat);
//   const isVoiceActive      = activeSession?.mode === 'voice';
//   const isVideoActive      = activeSession?.mode === 'video';
//   const chatVideoMediaMode = getChatVideoMediaMode(currentChat);

//   if (!authVerified) {
//     return (
//       <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
//         <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</div>
//       </div>
//     );
//   }

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar
//         user={user} chats={chats} currentChatId={currentChatId}
//         onSelectChat={handleSelectChat}
//         onCreateChat={() => setShowNewChatModal(true)}
//         onCreateJDChat={() => setShowJDModal(true)}
//         onLogout={handleLogout}
//         onUploadPDF={handleUploadPDF}
//         sidebarOpen={sidebarOpen}
//       />

//       <div className="main-content">
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
//               {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
//             </button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChatIsJD
//                     ? `💼 ${getExamConfig(currentChat).jdLabel || 'Job Interview Prep'}`
//                     : `${currentChat.examType} Preparation`}
//                 </div>
//                 <div className="topbar-sub">
//                   {currentChatIsJD
//                     ? (() => {
//                         const cfg = getExamConfig(currentChat);
//                         const parts = [cfg.roleTitle, cfg.company].filter(Boolean);
//                         return parts.length ? parts.join(' · ') : 'Job Interview Prep';
//                       })()
//                     : `${(pdfs || []).filter(p => p.processed).length} / ${(pdfs || []).length} PDFs processed`
//                   }
//                   {isVoiceActive && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>}
//                   {isVideoActive && <span style={{ color: 'var(--success)', marginLeft: 8 }}>· Video Interview</span>}
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>

//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state">
//               <div className="empty-state-card">
//                 <div className="empty-icon"><Menu size={32} /></div>
//                 <h3>No session selected</h3>
//                 <p>Select an existing session or create a new one</p>
//                 <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
//                   <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
//                     New exam session
//                   </button>
//                   <button
//                     className="btn btn-outline"
//                     onClick={() => setShowJDModal(true)}
//                     style={{ borderColor: 'rgba(245,158,11,0.4)', color: 'var(--warning)' }}
//                   >
//                     New job interview
//                   </button>
//                 </div>
//               </div>
//             </div>

//           ) : currentChatIsJD ? (
//             <JDInterviewPanel
//               chat={currentChat}
//               chatId={currentChatId}
//               sessionHistory={sessionHistory}
//               onSessionFinished={handleJDSessionFinished}
//             />

//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />

//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               onExitToHome={handleVoiceInterviewFinished}
//             />

//           ) : activeSession?.mode === 'video' && activeSession.questions?.length > 0 ? (
//             <VideoInterviewSession
//               questions={activeSession.questions}
//               chatId={currentChatId}
//               sessionId={activeSession.sessionId}
//               mediaMode={chatVideoMediaMode}
//               onFinished={handleVideoInterviewFinished}
//               onExit={() => setActiveSession(null)}
//             />

//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               sessionId={activeSession.sessionId}
//               onExitToHome={() => setActiveSession(null)}
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
//               onNewSessionPrefilled={(examType) => {
//                 setPrefilledExamType(examType || '');
//                 setShowNewChatModal(true);
//               }}
//               onOpenAnalytics={() => setShowAnalytics(true)}
//               onOpenFlashcards={() => setShowFlashcards(true)}
//               sessionMode={sessionMode}
//             />
//           )}
//         </div>
//       </div>

//       {/* ── Modals ─────────────────────────────────────────────────────────── */}
//       {showAnalytics && currentChat && !currentChatIsJD && (
//         <AnalyticsDashboard
//           chat={currentChat} sessionHistory={sessionHistory}
//           onClose={() => setShowAnalytics(false)}
//         />
//       )}

//       {showFlashcards && currentChat && !currentChatIsJD && (
//         <FlashcardDeck
//           chat={currentChat} chatId={currentChatId}
//           onClose={() => setShowFlashcards(false)}
//         />
//       )}

//       {showJDModal && (
//         <JDNewSessionModal
//           onClose={() => setShowJDModal(false)}
//           onCreate={handleCreateJDChat}
//         />
//       )}

//       {showNewChatModal && (
//         <NewChatModal
//           onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }}
//           onCreate={handleCreateChat}
//           defaultExamType={prefilledExamType}
//         />
//       )}
//     </div>
//   );
// };

// export default App;





















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// import VideoInterviewSession from './components/VideoInterviewSession';
// import AnalyticsDashboard from './components/AnalyticsDashboard';
// import FlashcardDeck from './components/FlashcardDeck';
// // import JDInterviewPanel from './components/JDInterviewPanel';
// import { authAPI, chatAPI, questionAPI } from './services/api';
// import './App.css';

// // ── Read session mode from DB-stored examConfig (never from frontend state) ────
// const getChatSessionMode = (chat) => {
//   if (!chat?.examConfig) return 'normal';
//   try {
//     const config = typeof chat.examConfig === 'string'
//       ? JSON.parse(chat.examConfig) : chat.examConfig;
//     return config.sessionMode || 'normal';
//   } catch { return 'normal'; }
// };

// const getChatVideoMediaMode = (chat) => {
//   if (!chat?.examConfig) return 'video';
//   try {
//     const config = typeof chat.examConfig === 'string'
//       ? JSON.parse(chat.examConfig) : chat.examConfig;
//     return config.videoMediaMode || 'video';
//   } catch { return 'video'; }
// };

// const App = () => {
//   // ── Auth: initialize from localStorage for instant display,
//   //    but always verify with GET /api/auth/me on mount ───────────────────────
//   const [user, setUser] = useState(() => {
//     const u = localStorage.getItem('user');
//     return u ? JSON.parse(u) : null;
//   });
//   const [authVerified, setAuthVerified] = useState(false);

//   const [chats,           setChats]           = useState([]);
//   const [currentChatId,   setCurrentChatId]   = useState(null);
//   const [showNewChatModal,setShowNewChatModal] = useState(false);
//   const [prefilledExamType,setPrefilledExamType] = useState('');
//   const [activeSession,   setActiveSession]   = useState(null);
//   const [sidebarOpen,     setSidebarOpen]     = useState(true);
//   const [pdfs,            setPdfs]            = useState([]);
//   const [sessionHistory,  setSessionHistory]  = useState([]);
//   const [reviewSession,   setReviewSession]   = useState(null);
//   const [showAnalytics,   setShowAnalytics]   = useState(false);
//   const [showFlashcards,  setShowFlashcards]  = useState(false);
//   // const [showJDPanel,     setShowJDPanel]     = useState(false);

//   const pdfPollRef = useRef(null);

//   // ── Verify user token on app mount ─────────────────────────────────────────
//   useEffect(() => {
//     const token = localStorage.getItem('token');
//     if (!token) { setUser(null); setAuthVerified(true); return; }

//     authAPI.getMe()
//       .then((res) => {
//         const verifiedUser = res.data;
//         setUser(verifiedUser);
//         // Refresh localStorage with the backend-authoritative user object
//         localStorage.setItem('user', JSON.stringify(verifiedUser));
//         setAuthVerified(true);
//       })
//       .catch(() => {
//         // Token expired or invalid — clear everything
//         localStorage.removeItem('token');
//         localStorage.removeItem('user');
//         setUser(null);
//         setAuthVerified(true);
//       });
//   }, []);

//   const loadChats = async () => {
//     try { const res = await chatAPI.getChats(); setChats(res.data || []); }
//     catch (e) { console.error(e); }
//   };

//   const loadPDFs = async (chatId) => {
//     try { const res = await chatAPI.getPDFs(chatId); setPdfs(res.data || []); return res.data || []; }
//     catch { return []; }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try { const res = await chatAPI.getChatHistory(chatId); setSessionHistory(res.data || []); }
//     catch (e) { console.error(e); }
//   };

//   // ── PDF polling: every 2s while any PDF is unprocessed ─────────────────────
//   // NOTE on polling vs SSE: Simple polling every 2s is fine for this use case.
//   // PDFs typically finish in 15-60s and there's at most a few per session.
//   // SSE would need server-side changes and added complexity for minimal gain.
//   // Long-polling would be appropriate only if we had 100s of concurrent uploads.
//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     const hasPending = (currentPdfs || []).some((p) => !p.processed && !p.error);
//     if (!chatId || !hasPending) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       if (!(latest || []).some((p) => !p.processed && !p.error)) {
//         clearInterval(pdfPollRef.current);
//         pdfPollRef.current = null;
//       }
//     }, 2000);
//   };

//   useEffect(() => { if (user) loadChats(); }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => {
//       const lp = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, lp);
//     })();
//     return () => {
//       if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     };
//   }, [currentChatId]);

//   const handleLogin = (u) => {
//     setUser(u);
//     setCurrentChatId(null);
//     setActiveSession(null);
//     setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token');
//     localStorage.removeItem('user');
//     setUser(null);
//     setCurrentChatId(null);
//     setActiveSession(null);
//     setReviewSession(null);
//     setChats([]);
//     setPdfs([]);
//     setSessionHistory([]);
//   };

//   const handleCreateChat = async (chatData) => {
//     try {
//       // Send all config as-is — backend validates and sanitizes
//       const res = await chatAPI.createChat({
//         examType:    chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig:  chatData.examConfig,
//       });

//       const newChat = {
//         chatId:      res.data.chatId,
//         examType:    chatData.examType,
//         createdAt:   new Date().toISOString(),
//         weakTopics:  [],
//         pdfCount:    0,
//         subject:     null,
//         bloomLevels: chatData.bloomLevels || [],
//         examConfig:  chatData.examConfig,
//         analytics:   [],
//       };

//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(res.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null);
//       setReviewSession(null);
//     } catch (error) {
//       alert('Failed to create session: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [
//         ...prev,
//         ...files.map((f) => ({
//           pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name,
//           type: 'pending', processed: false, error: null,
//           uploadedAt: new Date().toISOString(),
//         })),
//       ]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   // ── Question generation — mode is always derived from chat's examConfig in DB
//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const res = await questionAPI.generateFullExam(chatId);
//       const sessionMode = getChatSessionMode(chats.find(c => c.chatId === chatId));
//       setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: sessionMode });
//       setReviewSession(null);
//       return res.data;
//     } catch (error) {
//       const m = error.response?.data?.error || error.message;
//       alert('Failed: ' + m);
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const res = await questionAPI.generateWeakExam(chatId);
//       const sessionMode = getChatSessionMode(chats.find(c => c.chatId === chatId));
//       setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: sessionMode });
//       setReviewSession(null);
//       return res.data;
//     } catch (error) {
//       alert('Failed: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const res = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       setChats((prev) => prev.map((chat) => {
//         if (chat.chatId !== currentChatId) return chat;
//         const wt = res.data.weakTopicList || Object.keys(res.data.weakTopics || {}).slice(0, 5);
//         return { ...chat, weakTopics: wt, analytics: res.data.analytics || chat.analytics || [] };
//       }));
//       await loadSessionHistory(currentChatId);
//       return res.data;
//     } catch (error) {
//       alert('Failed to submit: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       setReviewSession({
//         sessionId, type: 'voice_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: answers || {}, feedback: result.results || {},
//       });
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleVideoInterviewFinished = (result) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       setReviewSession({
//         sessionId, type: 'video_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: Object.fromEntries(
//           (result.allResults || [])
//             .filter(r => r.question?.id)
//             .map(r => [r.question.id, r.feedback?.transcript || ''])
//         ),
//         feedback: result.results || {},
//       });
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId);
//     setActiveSession(null);
//     setPdfs([]);
//     setReviewSession(null);
//     setShowAnalytics(false);
//     setShowFlashcards(false);
//     // setShowJDPanel(false);
//   };

//   // ── Derived values ──────────────────────────────────────────────────────────
//   const currentChat     = chats.find((c) => c.chatId === currentChatId);
//   const hasAnyPDF       = pdfs.length > 0;
//   const allProcessed    = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate     = hasAnyPDF && allProcessed;
//   const sessionMode     = getChatSessionMode(currentChat);
//   const isVoiceActive   = activeSession?.mode === 'voice';
//   const isVideoActive   = activeSession?.mode === 'video';
//   const chatVideoMediaMode = getChatVideoMediaMode(currentChat);
//   const subjectName     = currentChat?.subject || currentChat?.examConfig?.subject || null;

//   // Show loading state while verifying token (avoids flash to login)
//   if (!authVerified) {
//     return (
//       <div style={{
//         height: '100vh', display: 'flex', alignItems: 'center',
//         justifyContent: 'center', background: 'var(--bg)',
//       }}>
//         <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading…</div>
//       </div>
//     );
//   }

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar
//         user={user} chats={chats} currentChatId={currentChatId}
//         onSelectChat={handleSelectChat}
//         onCreateChat={() => setShowNewChatModal(true)}
//         onLogout={handleLogout}
//         onUploadPDF={handleUploadPDF}
//         sidebarOpen={sidebarOpen}
//       />

//       <div className="main-content">
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
//               {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
//             </button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChat.examType} Preparation
//                   {subjectName && (
//                     <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>
//                   )}
//                 </div>
//                 <div className="topbar-sub">
//                   {(pdfs || []).filter((p) => p.processed).length} / {(pdfs || []).length} PDFs processed
//                   {isVoiceActive && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>}
//                   {isVideoActive && <span style={{ color: 'var(--success)', marginLeft: 8 }}>· Video Interview</span>}
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>

//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state">
//               <div className="empty-state-card">
//                 <div className="empty-icon"><Menu size={32} /></div>
//                 <h3>No session selected</h3>
//                 <p>Select an existing session or create a new one</p>
//                 <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
//                   Start a new session
//                 </button>
//               </div>
//             </div>

//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />

//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               onExitToHome={handleVoiceInterviewFinished}
//             />

//           ) : activeSession?.mode === 'video' && activeSession.questions?.length > 0 ? (
//             <VideoInterviewSession
//               questions={activeSession.questions}
//               chatId={currentChatId}
//               sessionId={activeSession.sessionId}
//               mediaMode={chatVideoMediaMode}
//               onFinished={handleVideoInterviewFinished}
//               onExit={() => setActiveSession(null)}
//             />

//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               sessionId={activeSession.sessionId}
//               onExitToHome={() => setActiveSession(null)}
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
//               onNewSessionPrefilled={(examType) => {
//                 setPrefilledExamType(examType || '');
//                 setShowNewChatModal(true);
//               }}
//               onOpenAnalytics={() => setShowAnalytics(true)}
//               onOpenFlashcards={() => setShowFlashcards(true)}
//               // onOpenJDPanel={() => setShowJDPanel(true)}
//               sessionMode={sessionMode}
//             />
//           )}
//         </div>
//       </div>

//       {/* ── Modals / Panels ──────────────────────────────────────────────────── */}
//       {showAnalytics && currentChat && (
//         <AnalyticsDashboard
//           chat={currentChat}
//           sessionHistory={sessionHistory}
//           onClose={() => setShowAnalytics(false)}
//         />
//       )}

//       {showFlashcards && currentChat && (
//         <FlashcardDeck
//           chat={currentChat}
//           chatId={currentChatId}
//           onClose={() => setShowFlashcards(false)}
//         />
//       )}

//       {/* ── JD Interview Panel (new isolated feature) ────────────────────────── */}
//       {/* {showJDPanel && currentChat && (
//         <JDInterviewPanel
//           chat={currentChat}
//           chatId={currentChatId}
//           onClose={() => setShowJDPanel(false)}
//         />
//       )} */}

//       {showNewChatModal && (
//         <NewChatModal
//           onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }}
//           onCreate={handleCreateChat}
//           defaultExamType={prefilledExamType}
//         />
//       )}
//     </div>
//   );
// };

// export default App;




















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// import VideoInterviewSession from './components/VideoInterviewSession';
// import AnalyticsDashboard from './components/AnalyticsDashboard';
// import FlashcardDeck from './components/FlashcardDeck';
// import { chatAPI, questionAPI } from './services/api';
// import './App.css';

// const chatIsVoiceMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//     if (config.session_mode === 'video') return false;
//     const qt = config.questionTypes || {};
//     const keys = Object.keys(qt).filter((k) => (qt[k]?.count || 0) > 0);
//     return keys.length === 1 && keys[0] === 'descriptive';
//   } catch { return false; }
// };

// const chatIsVideoMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//     return config.session_mode === 'video';
//   } catch { return false; }
// };

// const App = () => {
//   const [user, setUser] = useState(() => { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; });
//   const [chats, setChats] = useState([]);
//   const [currentChatId, setCurrentChatId] = useState(null);
//   const [showNewChatModal, setShowNewChatModal] = useState(false);
//   const [prefilledExamType, setPrefilledExamType] = useState('');
//   const [activeSession, setActiveSession] = useState(null);
//   const [sidebarOpen, setSidebarOpen] = useState(true);
//   const [pdfs, setPdfs] = useState([]);
//   const [sessionHistory, setSessionHistory] = useState([]);
//   const [reviewSession, setReviewSession] = useState(null);
//   const [showAnalytics, setShowAnalytics] = useState(false);
//   const [showFlashcards, setShowFlashcards] = useState(false);
//   const pdfPollRef = useRef(null);

//   const loadChats = async () => { try { const res = await chatAPI.getChats(); setChats(res.data || []); } catch (e) { console.error(e); } };
//   const loadPDFs = async (chatId) => { try { const res = await chatAPI.getPDFs(chatId); setPdfs(res.data || []); return res.data || []; } catch (e) { return []; } };
//   const loadSessionHistory = async (chatId) => { try { const res = await chatAPI.getChatHistory(chatId); setSessionHistory(res.data || []); } catch (e) { console.error(e); } };
//   const getSubjectForChat = (chat) => chat?.subject || chat?.examConfig?.subject || null;

//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !(currentPdfs || []).some((p) => !p.processed && !p.error)) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       if (!(latest || []).some((p) => !p.processed && !p.error)) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     }, 2000);
//   };

//   useEffect(() => { if (user) loadChats(); }, [user]);
//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => { const lp = await loadPDFs(currentChatId); await loadSessionHistory(currentChatId); setReviewSession(null); startPdfPollingIfNeeded(currentChatId, lp); })();
//     return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
//   }, [currentChatId]);

//   const handleLogin = (u) => { setUser(u); setCurrentChatId(null); setActiveSession(null); setReviewSession(null); };
//   const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setCurrentChatId(null); setActiveSession(null); setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]); };

//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce((a, c) => a + (Number(c?.count) || 0), 0);
//       const examConfig = { totalQuestions, questionTypes, mcq: { count: questionTypes?.mcq?.count || 0, marks: questionTypes?.mcq?.marks || 0 }, descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 } };
//       if (chatData.sessionMode === 'video') { examConfig.session_mode = 'video'; examConfig.video_media_mode = chatData.videoMediaMode || 'video'; }
//       const res = await chatAPI.createChat({ examType: chatData.examType, bloomLevels: chatData.bloomLevels, examConfig });
//       const newChat = { chatId: res.data.chatId, examType: chatData.examType, createdAt: new Date().toISOString(), weakTopics: [], pdfCount: 0, subject: null, bloomLevels: chatData.bloomLevels || [], examConfig, analytics: [] };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(res.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null); setReviewSession(null);
//     } catch (error) { alert('Failed to create chat: ' + (error.response?.data?.error || error.message)); }
//   };

//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({ pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name, type: 'pending', processed: false, error: null, uploadedAt: new Date().toISOString() }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status; const msg = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg); await loadPDFs(chatId);
//     }
//   };

//   const handleGenerateFullExam = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'normal' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateWeakExam = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'normal' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };
//   const handleGenerateVoiceFull = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'voice' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateVoiceWeak = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'voice' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };
//   const handleGenerateVideoFull = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'video' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateVideoWeak = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'video' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const res = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       setChats((prev) => prev.map((chat) => { if (chat.chatId !== currentChatId) return chat; const wt = res.data.weakTopicList || Object.keys(res.data.weakTopics || {}).slice(0, 5); return { ...chat, weakTopics: wt, analytics: res.data.analytics || chat.analytics || [] }; }));
//       await loadSessionHistory(currentChatId); return res.data;
//     } catch (error) { alert('Failed to submit: ' + (error.response?.data?.error || error.message)); throw error; }
//   };

//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || []; const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) { setReviewSession({ sessionId, type: 'voice_full', createdAt: new Date().toISOString(), score: result.score, questions: sessionQuestions, answers: answers || {}, feedback: result.results || {} }); loadSessionHistory(currentChatId); }
//   };

//   const handleVideoInterviewFinished = (result) => {
//     const sessionQuestions = activeSession?.questions || []; const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       const fakeSession = {
//         sessionId, type: 'video_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: Object.fromEntries((result.allResults || []).filter(r => r.question?.id).map(r => [r.question.id, r.feedback?.transcript || ''])),
//         feedback: result.results || {},
//       };
//       setReviewSession(fakeSession);
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleSelectChat = (chatId) => { setCurrentChatId(chatId); setActiveSession(null); setPdfs([]); setReviewSession(null); setShowAnalytics(false); setShowFlashcards(false); };

//   const currentChat = chats.find((c) => c.chatId === currentChatId);
//   const subjectName = getSubjectForChat(currentChat);
//   const hasAnyPDF = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate = hasAnyPDF && allProcessed;
//   const isVoiceActive = activeSession?.mode === 'voice';
//   const isVideoActive = activeSession?.mode === 'video';

//   const chatVideoMediaMode = (() => {
//     if (!currentChat?.examConfig) return 'video';
//     try { const cfg = typeof currentChat.examConfig === 'string' ? JSON.parse(currentChat.examConfig) : currentChat.examConfig; return cfg.video_media_mode || 'video'; } catch { return 'video'; }
//   })();

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar user={user} chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)} onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen} />
//       <div className="main-content">
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <X size={20} /> : <Menu size={20} />}</button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChat.examType} Preparation
//                   {subjectName && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>}
//                 </div>
//                 <div className="topbar-sub">
//                   {(pdfs || []).filter((p) => p.processed).length} / {(pdfs || []).length} PDFs processed
//                   {isVoiceActive && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>}
//                   {isVideoActive && <span style={{ color: 'var(--success)', marginLeft: 8 }}>· Video Interview</span>}
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state"><div className="empty-state-card"><div className="empty-icon"><Menu size={32} /></div><h3>No chat selected</h3><p>Select an existing chat or create a new one</p><button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>Start a new session</button></div></div>
//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />
//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview questions={activeSession.questions} onSubmit={handleSubmitTest} onExitToHome={handleVoiceInterviewFinished} />
//           ) : activeSession?.mode === 'video' && activeSession.questions?.length > 0 ? (
//             <VideoInterviewSession questions={activeSession.questions} chatId={currentChatId} sessionId={activeSession.sessionId} mediaMode={chatVideoMediaMode} onFinished={handleVideoInterviewFinished} onExit={() => setActiveSession(null)} />
//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer questions={activeSession.questions} onSubmit={handleSubmitTest} sessionId={activeSession.sessionId} onExitToHome={() => setActiveSession(null)} />
//           ) : (
//             <PracticeSession
//               chat={currentChat} pdfs={pdfs} sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onGenerateVoiceFull={() => handleGenerateVoiceFull(currentChatId)}
//               onGenerateVoiceWeak={() => handleGenerateVoiceWeak(currentChatId)}
//               onGenerateVideoFull={() => handleGenerateVideoFull(currentChatId)}
//               onGenerateVideoWeak={() => handleGenerateVideoWeak(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate} allProcessed={allProcessed} hasAnyPDF={hasAnyPDF}
//               onNewSessionPrefilled={(examType) => { setPrefilledExamType(examType || ''); setShowNewChatModal(true); }}
//               onOpenAnalytics={() => setShowAnalytics(true)}
//               onOpenFlashcards={() => setShowFlashcards(true)}
//             />
//           )}
//         </div>
//       </div>

//       {showAnalytics && currentChat && <AnalyticsDashboard chat={currentChat} sessionHistory={sessionHistory} onClose={() => setShowAnalytics(false)} />}
//       {showFlashcards && currentChat && <FlashcardDeck chat={currentChat} chatId={currentChatId} onClose={() => setShowFlashcards(false)} />}
//       {showNewChatModal && <NewChatModal onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }} onCreate={handleCreateChat} defaultExamType={prefilledExamType} />}
//     </div>
//   );
// };

// export default App;

















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// import VideoInterviewSession from './components/VideoInterviewSession';
// import AnalyticsDashboard from './components/AnalyticsDashboard';
// import FlashcardDeck from './components/FlashcardDeck';
// // import VideoQuestion from './components/VideoQuestion';
// import { chatAPI, questionAPI } from './services/api';
// import './App.css';

// const chatIsVoiceMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//     if (config.session_mode === 'video') return false;
//     const qt = config.questionTypes || {};
//     const keys = Object.keys(qt).filter((k) => (qt[k]?.count || 0) > 0);
//     return keys.length === 1 && keys[0] === 'descriptive';
//   } catch { return false; }
// };

// const chatIsVideoMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string' ? JSON.parse(chat.examConfig) : chat.examConfig;
//     return config.session_mode === 'video';
//   } catch { return false; }
// };

// const App = () => {
//   const [user, setUser] = useState(() => { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; });
//   const [chats, setChats] = useState([]);
//   const [currentChatId, setCurrentChatId] = useState(null);
//   const [showNewChatModal, setShowNewChatModal] = useState(false);
//   const [prefilledExamType, setPrefilledExamType] = useState('');
//   const [activeSession, setActiveSession] = useState(null);
//   const [sidebarOpen, setSidebarOpen] = useState(true);
//   const [pdfs, setPdfs] = useState([]);
//   const [sessionHistory, setSessionHistory] = useState([]);
//   const [reviewSession, setReviewSession] = useState(null);
//   const [showAnalytics, setShowAnalytics] = useState(false);
//   const [showFlashcards, setShowFlashcards] = useState(false);
//   const [showVideoQ, setShowVideoQ] = useState(false);
//   const pdfPollRef = useRef(null);

//   const loadChats = async () => { try { const res = await chatAPI.getChats(); setChats(res.data || []); } catch (e) { console.error(e); } };
//   const loadPDFs = async (chatId) => { try { const res = await chatAPI.getPDFs(chatId); setPdfs(res.data || []); return res.data || []; } catch (e) { return []; } };
//   const loadSessionHistory = async (chatId) => { try { const res = await chatAPI.getChatHistory(chatId); setSessionHistory(res.data || []); } catch (e) { console.error(e); } };
//   const getSubjectForChat = (chat) => chat?.subject || chat?.examConfig?.subject || null;

//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !(currentPdfs || []).some((p) => !p.processed && !p.error)) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       if (!(latest || []).some((p) => !p.processed && !p.error)) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     }, 2000);
//   };

//   useEffect(() => { if (user) loadChats(); }, [user]);
//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => { const lp = await loadPDFs(currentChatId); await loadSessionHistory(currentChatId); setReviewSession(null); startPdfPollingIfNeeded(currentChatId, lp); })();
//     return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
//   }, [currentChatId]);

//   const handleLogin = (u) => { setUser(u); setCurrentChatId(null); setActiveSession(null); setReviewSession(null); };
//   const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setCurrentChatId(null); setActiveSession(null); setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]); };

//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce((a, c) => a + (Number(c?.count) || 0), 0);
//       const examConfig = { totalQuestions, questionTypes, mcq: { count: questionTypes?.mcq?.count || 0, marks: questionTypes?.mcq?.marks || 0 }, descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 } };
//       if (chatData.sessionMode === 'video') { examConfig.session_mode = 'video'; examConfig.video_media_mode = chatData.videoMediaMode || 'video'; }
//       const res = await chatAPI.createChat({ examType: chatData.examType, bloomLevels: chatData.bloomLevels, examConfig });
//       const newChat = { chatId: res.data.chatId, examType: chatData.examType, createdAt: new Date().toISOString(), weakTopics: [], pdfCount: 0, subject: null, bloomLevels: chatData.bloomLevels || [], examConfig, analytics: [] };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(res.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null); setReviewSession(null);
//     } catch (error) { alert('Failed to create chat: ' + (error.response?.data?.error || error.message)); }
//   };

//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({ pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name, type: 'pending', processed: false, error: null, uploadedAt: new Date().toISOString() }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status; const msg = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg); await loadPDFs(chatId);
//     }
//   };

//   const handleGenerateFullExam = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'normal' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateWeakExam = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'normal' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };
//   const handleGenerateVoiceFull = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'voice' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateVoiceWeak = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'voice' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };
//   const handleGenerateVideoFull = async (chatId) => {
//     try { const res = await questionAPI.generateFullExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'video' }); setReviewSession(null); return res.data; }
//     catch (error) { const s = error.response?.status; const m = error.response?.data?.error || error.message; if (s === 429) alert('Rate limit hit. Retry in ~30s.'); else alert('Failed: ' + m); throw error; }
//   };
//   const handleGenerateVideoWeak = async (chatId) => {
//     try { const res = await questionAPI.generateWeakExam(chatId); setActiveSession({ questions: res.data.questions, sessionId: res.data.sessionId, mode: 'video' }); setReviewSession(null); return res.data; }
//     catch (error) { alert('Failed: ' + (error.response?.data?.error || error.message)); throw error; }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const res = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       setChats((prev) => prev.map((chat) => { if (chat.chatId !== currentChatId) return chat; const wt = res.data.weakTopicList || Object.keys(res.data.weakTopics || {}).slice(0, 5); return { ...chat, weakTopics: wt, analytics: res.data.analytics || chat.analytics || [] }; }));
//       await loadSessionHistory(currentChatId); return res.data;
//     } catch (error) { alert('Failed to submit: ' + (error.response?.data?.error || error.message)); throw error; }
//   };

//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || []; const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) { setReviewSession({ sessionId, type: 'voice_full', createdAt: new Date().toISOString(), score: result.score, questions: sessionQuestions, answers: answers || {}, feedback: result.results || {} }); loadSessionHistory(currentChatId); }
//   };

//   const handleVideoInterviewFinished = (result) => {
//     const sessionQuestions = activeSession?.questions || []; const sessionId = activeSession?.sessionId;
//     setActiveSession(null);
//     if (result) {
//       const fakeSession = {
//         sessionId, type: 'video_full', createdAt: new Date().toISOString(),
//         score: result.score, questions: sessionQuestions,
//         answers: Object.fromEntries((result.allResults || []).filter(r => r.question?.id).map(r => [r.question.id, r.feedback?.transcript || ''])),
//         feedback: result.results || {},
//       };
//       setReviewSession(fakeSession);
//       loadSessionHistory(currentChatId);
//     }
//   };

//   const handleSelectChat = (chatId) => { setCurrentChatId(chatId); setActiveSession(null); setPdfs([]); setReviewSession(null); setShowAnalytics(false); setShowFlashcards(false); setShowVideoQ(false); };

//   const currentChat = chats.find((c) => c.chatId === currentChatId);
//   const subjectName = getSubjectForChat(currentChat);
//   const hasAnyPDF = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate = hasAnyPDF && allProcessed;
//   const isVoiceActive = activeSession?.mode === 'voice';
//   const isVideoActive = activeSession?.mode === 'video';

//   const chatVideoMediaMode = (() => {
//     if (!currentChat?.examConfig) return 'video';
//     try { const cfg = typeof currentChat.examConfig === 'string' ? JSON.parse(currentChat.examConfig) : currentChat.examConfig; return cfg.video_media_mode || 'video'; } catch { return 'video'; }
//   })();

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar user={user} chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)} onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen} />
//       <div className="main-content">
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <X size={20} /> : <Menu size={20} />}</button>
//             {currentChat && (<div><div className="topbar-title">{currentChat.examType} Preparation{subjectName && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>}</div><div className="topbar-sub">{pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed{isVoiceActive && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>}{isVideoActive && <span style={{ color: 'var(--success)', marginLeft: 8 }}>· Video Interview</span>}</div></div>)}
//           </div>
//           {currentChat?.weakTopics?.length > 0 && !isVoiceActive && !isVideoActive && (<div className="topbar-weak-tags">{currentChat.weakTopics.slice(0, 2).map((t, i) => <span key={i} className="badge badge-warning">{t}</span>)}</div>)}
//         </div>
//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state"><div className="empty-state-card"><div className="empty-icon"><Menu size={32} /></div><h3>No chat selected</h3><p>Select an existing chat or create a new one</p><button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>Start a new session</button></div></div>
//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />
//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview questions={activeSession.questions} onSubmit={handleSubmitTest} onExitToHome={handleVoiceInterviewFinished} />
//           ) : activeSession?.mode === 'video' && activeSession.questions?.length > 0 ? (
//             <VideoInterviewSession questions={activeSession.questions} chatId={currentChatId} sessionId={activeSession.sessionId} mediaMode={chatVideoMediaMode} onFinished={handleVideoInterviewFinished} onExit={() => setActiveSession(null)} />
//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer questions={activeSession.questions} onSubmit={handleSubmitTest} sessionId={activeSession.sessionId} onExitToHome={() => setActiveSession(null)} />
//           ) : (
//             <PracticeSession
//               chat={currentChat} pdfs={pdfs} sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onGenerateVoiceFull={() => handleGenerateVoiceFull(currentChatId)}
//               onGenerateVoiceWeak={() => handleGenerateVoiceWeak(currentChatId)}
//               onGenerateVideoFull={() => handleGenerateVideoFull(currentChatId)}
//               onGenerateVideoWeak={() => handleGenerateVideoWeak(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate} allProcessed={allProcessed} hasAnyPDF={hasAnyPDF}
//               onNewSessionPrefilled={(examType) => { setPrefilledExamType(examType || ''); setShowNewChatModal(true); }}
//               onOpenAnalytics={() => setShowAnalytics(true)}
//               onOpenFlashcards={() => setShowFlashcards(true)}
//               // onOpenVideoQuestion={() => setShowVideoQ(true)}
//             />
//           )}
//         </div>
//       </div>

//       {showAnalytics && currentChat && <AnalyticsDashboard chat={currentChat} sessionHistory={sessionHistory} onClose={() => setShowAnalytics(false)} />}
//       {showFlashcards && currentChat && <FlashcardDeck chat={currentChat} chatId={currentChatId} onClose={() => setShowFlashcards(false)} />}
//       {/* {showVideoQ && currentChat && <VideoQuestion chat={currentChat} chatId={currentChatId} onClose={() => setShowVideoQ(false)} />} */}
//       {showNewChatModal && <NewChatModal onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }} onCreate={handleCreateChat} defaultExamType={prefilledExamType} />}
//     </div>
//   );
// };

// export default App;


















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// /* ── NEW feature imports ── */
// import AnalyticsDashboard from './components/AnalyticsDashboard';
// import FlashcardDeck from './components/FlashcardDeck';
// import VideoQuestion from './components/VideoQuestion';

// import { chatAPI, questionAPI } from './services/api';
// import './App.css';

// const chatIsVoiceMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string'
//       ? JSON.parse(chat.examConfig)
//       : chat.examConfig;
//     const qt = config.questionTypes || {};
//     const keys = Object.keys(qt).filter((k) => (qt[k]?.count || 0) > 0);
//     return keys.length === 1 && keys[0] === 'descriptive';
//   } catch { return false; }
// };

// const App = () => {
//   const [user, setUser] = useState(() => {
//     const savedUser = localStorage.getItem('user');
//     return savedUser ? JSON.parse(savedUser) : null;
//   });

//   const [chats,            setChats]            = useState([]);
//   const [currentChatId,    setCurrentChatId]    = useState(null);
//   const [showNewChatModal, setShowNewChatModal]  = useState(false);
//   const [prefilledExamType, setPrefilledExamType] = useState('');
//   const [activeSession,    setActiveSession]    = useState(null);
//   const [sidebarOpen,      setSidebarOpen]      = useState(true);
//   const [pdfs,             setPdfs]             = useState([]);
//   const [sessionHistory,   setSessionHistory]   = useState([]);
//   const [reviewSession,    setReviewSession]    = useState(null);

//   /* ── NEW feature visibility state (3 lines added) ── */
//   const [showAnalytics,    setShowAnalytics]    = useState(false);
//   const [showFlashcards,   setShowFlashcards]   = useState(false);
//   const [showVideoQ,       setShowVideoQ]       = useState(false);

//   const pdfPollRef = useRef(null);

//   /* ──────────────────── data loaders ──────────────────── */
//   const loadChats = async () => {
//     try {
//       const response = await chatAPI.getChats();
//       setChats(response.data || []);
//     } catch (error) { console.error('Error loading chats:', error); }
//   };

//   const loadPDFs = async (chatId) => {
//     try {
//       const response = await chatAPI.getPDFs(chatId);
//       setPdfs(response.data || []);
//       return response.data || [];
//     } catch (error) { console.error('Error loading PDFs:', error); return []; }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try {
//       const response = await chatAPI.getChatHistory(chatId);
//       setSessionHistory(response.data || []);
//     } catch (error) { console.error('Error loading session history:', error); }
//   };

//   const getSubjectForChat = (chat) => {
//     if (chat?.subject) return chat.subject;
//     if (chat?.examConfig?.subject) return chat.examConfig.subject;
//     if (chat?.examConfigSubject) return chat.examConfigSubject;
//     return null;
//   };

//   /* ──────────────────── PDF polling ──────────────────── */
//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     const hasProcessing = (currentPdfs || []).some((p) => !p.processed && !p.error);
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !hasProcessing) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       const stillProcessing = (latest || []).some((p) => !p.processed && !p.error);
//       if (!stillProcessing) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     }, 2000);
//   };

//   /* ──────────────────── effects ──────────────────── */
//   useEffect(() => { if (user) loadChats(); }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => {
//       const latestPdfs = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, latestPdfs);
//     })();
//     return () => {
//       if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     };
//   }, [currentChatId]);

//   /* ──────────────────── auth ──────────────────── */
//   const handleLogin = (userData) => {
//     setUser(userData);
//     setCurrentChatId(null); setActiveSession(null);
//     setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token'); localStorage.removeItem('user');
//     setUser(null); setCurrentChatId(null); setActiveSession(null);
//     setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
//   };

//   /* ──────────────────── chat creation ──────────────────── */
//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes  = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce((acc, cfg) => acc + (Number(cfg?.count) || 0), 0);
//       const chatRequestData = {
//         examType:    chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig: {
//           totalQuestions,
//           questionTypes,
//           mcq:         { count: questionTypes?.mcq?.count         || 0, marks: questionTypes?.mcq?.marks         || 0 },
//           descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 },
//         },
//       };
//       const response = await chatAPI.createChat(chatRequestData);
//       const newChat = {
//         chatId:      response.data.chatId,
//         examType:    chatData.examType,
//         createdAt:   new Date().toISOString(),
//         weakTopics:  [],
//         pdfCount:    0,
//         subject:     null,
//         bloomLevels: chatData.bloomLevels || [],
//         examConfig:  chatRequestData.examConfig,
//         analytics:   [],
//       };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(response.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null); setReviewSession(null);
//     } catch (error) {
//       console.error('Error creating chat:', error);
//       alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   /* ──────────────────── PDF upload ──────────────────── */
//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({
//         pdfId:      `temp_${Date.now()}_${f.name}`,
//         filename:   f.name,
//         type:       'pending',
//         processed:  false,
//         error:      null,
//         uploadedAt: new Date().toISOString(),
//       }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   /* ──────────────────── question generation ──────────────────── */
//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'normal' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       else alert('Failed to generate questions: ' + msg);
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'normal' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleGenerateVoiceFull = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'voice' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       else alert('Failed to generate questions: ' + msg);
//       throw error;
//     }
//   };

//   const handleGenerateVoiceWeak = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'voice' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   /* ──────────────────── submit ──────────────────── */
//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const response = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       const updatedChats = chats.map((chat) => {
//         if (chat.chatId === currentChatId) {
//           const weakTopics = response.data.weakTopicList ||
//             Object.keys(response.data.weakTopics || {}).slice(0, 5);
//           return { ...chat, weakTopics, analytics: response.data.analytics || chat.analytics || [] };
//         }
//         return chat;
//       });
//       setChats(updatedChats);
//       await loadSessionHistory(currentChatId);
//       return response.data;
//     } catch (error) {
//       alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   /* ──────────────────── voice interview exit ──────────────────── */
//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId        = activeSession?.sessionId;
//     setActiveSession(null);

//     if (result) {
//       const fakeSession = {
//         sessionId,
//         type:      'voice_full',
//         createdAt: new Date().toISOString(),
//         score:     result.score,
//         questions: sessionQuestions,
//         answers:   answers || {},
//         feedback:  result.results || {},
//       };
//       setReviewSession(fakeSession);
//     }
//   };

//   /* ──────────────────── navigation ──────────────────── */
//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId);
//     setActiveSession(null); setPdfs([]); setReviewSession(null);
//     /* close any open feature overlays when switching chats */
//     setShowAnalytics(false); setShowFlashcards(false); setShowVideoQ(false);
//   };

//   /* ──────────────────── derived ──────────────────── */
//   const currentChat  = chats.find((c) => c.chatId === currentChatId);
//   const subjectName  = getSubjectForChat(currentChat);
//   const hasAnyPDF    = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate  = hasAnyPDF && allProcessed;
//   const isVoiceActive = activeSession?.mode === 'voice';

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar
//         user={user} chats={chats} currentChatId={currentChatId}
//         onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)}
//         onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen}
//       />

//       <div className="main-content">
//         {/* Topbar */}
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
//               {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
//             </button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChat.examType} Preparation
//                   {subjectName && (
//                     <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>
//                   )}
//                 </div>
//                 <div className="topbar-sub">
//                   {pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed
//                   {isVoiceActive && (
//                     <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>

//           {currentChat?.weakTopics?.length > 0 && !isVoiceActive && (
//             <div className="topbar-weak-tags">
//               {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
//                 <span key={idx} className="badge badge-warning">{topic}</span>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Content */}
//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state">
//               <div className="empty-state-card">
//                 <div className="empty-icon">
//                   <Menu size={32} />
//                 </div>
//                 <h3>No chat selected</h3>
//                 <p>Select an existing chat or create a new one to start your exam prep</p>
//                 <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
//                   Start a new session
//                 </button>
//               </div>
//             </div>

//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />

//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               onExitToHome={handleVoiceInterviewFinished}
//             />

//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               sessionId={activeSession.sessionId}
//               onExitToHome={() => setActiveSession(null)}
//             />

//           ) : (
//             <PracticeSession
//               chat={currentChat}
//               pdfs={pdfs}
//               sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onGenerateVoiceFull={() => handleGenerateVoiceFull(currentChatId)}
//               onGenerateVoiceWeak={() => handleGenerateVoiceWeak(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate}
//               allProcessed={allProcessed}
//               hasAnyPDF={hasAnyPDF}
//               onNewSessionPrefilled={(examType) => {
//                 setPrefilledExamType(examType || '');
//                 setShowNewChatModal(true);
//               }}
//               /* ── NEW feature handlers (3 lines) ── */
//               onOpenAnalytics={() => setShowAnalytics(true)}
//               onOpenFlashcards={() => setShowFlashcards(true)}
//               onOpenVideoQuestion={() => setShowVideoQ(true)}
//             />
//           )}
//         </div>
//       </div>

//       {/* ── NEW feature modals — rendered as portals above everything ── */}
//       {showAnalytics && currentChat && (
//         <AnalyticsDashboard
//           chat={currentChat}
//           sessionHistory={sessionHistory}
//           onClose={() => setShowAnalytics(false)}
//         />
//       )}

//       {showFlashcards && currentChat && (
//         <FlashcardDeck
//           chat={currentChat}
//           chatId={currentChatId}
//           onClose={() => setShowFlashcards(false)}
//         />
//       )}

//       {showVideoQ && currentChat && (
//         <VideoQuestion
//           chat={currentChat}
//           chatId={currentChatId}
//           onClose={() => setShowVideoQ(false)}
//         />
//       )}

//       {showNewChatModal && (
//         <NewChatModal
//           onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }}
//           onCreate={handleCreateChat}
//           defaultExamType={prefilledExamType}
//         />
//       )}
//     </div>
//   );
// };

// export default App;






















// import React, { useState, useEffect, useRef } from 'react';
// import { Menu, X } from 'lucide-react';
// import AuthPage from './components/AuthPage';
// import ChatSidebar from './components/ChatSidebar';
// import NewChatModal from './components/NewChatModal';
// import QuestionRenderer from './components/QuestionRenderer';
// import PracticeSession from './components/PracticeSession';
// import SessionReview from './components/SessionReview';
// import VoiceInterview from './components/VoiceInterview';
// import { chatAPI, questionAPI } from './services/api';
// import './App.css';

// /* ── infer voice mode from examConfig (no backend field needed) ── */
// const chatIsVoiceMode = (chat) => {
//   if (!chat?.examConfig) return false;
//   try {
//     const config = typeof chat.examConfig === 'string'
//       ? JSON.parse(chat.examConfig)
//       : chat.examConfig;
//     const qt = config.questionTypes || {};
//     const keys = Object.keys(qt).filter((k) => (qt[k]?.count || 0) > 0);
//     return keys.length === 1 && keys[0] === 'descriptive';
//   } catch { return false; }
// };

// const App = () => {
//   const [user, setUser] = useState(() => {
//     const savedUser = localStorage.getItem('user');
//     return savedUser ? JSON.parse(savedUser) : null;
//   });

//   const [chats,            setChats]            = useState([]);
//   const [currentChatId,    setCurrentChatId]    = useState(null);
//   const [showNewChatModal, setShowNewChatModal]  = useState(false);
//   const [prefilledExamType, setPrefilledExamType] = useState('');
//   // Single atomic object — set in one setState call to avoid any race between
//   // questions arriving and the voice flag being set.
//   // Shape: null | { questions: [], sessionId: string, mode: 'normal' | 'voice' }
//   const [activeSession,    setActiveSession]    = useState(null);
//   const [sidebarOpen,      setSidebarOpen]      = useState(true);
//   const [pdfs,             setPdfs]             = useState([]);
//   const [sessionHistory,   setSessionHistory]   = useState([]);
//   const [reviewSession,    setReviewSession]    = useState(null);

//   const pdfPollRef = useRef(null);

//   /* ──────────────────── data loaders ──────────────────── */
//   const loadChats = async () => {
//     try {
//       const response = await chatAPI.getChats();
//       setChats(response.data || []);
//     } catch (error) { console.error('Error loading chats:', error); }
//   };

//   const loadPDFs = async (chatId) => {
//     try {
//       const response = await chatAPI.getPDFs(chatId);
//       setPdfs(response.data || []);
//       return response.data || [];
//     } catch (error) { console.error('Error loading PDFs:', error); return []; }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try {
//       const response = await chatAPI.getChatHistory(chatId);
//       setSessionHistory(response.data || []);
//     } catch (error) { console.error('Error loading session history:', error); }
//   };

//   const getSubjectForChat = (chat) => {
//     if (chat?.subject) return chat.subject;
//     if (chat?.examConfig?.subject) return chat.examConfig.subject;
//     if (chat?.examConfigSubject) return chat.examConfigSubject;
//     return null;
//   };

//   /* ──────────────────── PDF polling ──────────────────── */
//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     const hasProcessing = (currentPdfs || []).some((p) => !p.processed && !p.error);
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !hasProcessing) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       const stillProcessing = (latest || []).some((p) => !p.processed && !p.error);
//       if (!stillProcessing) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     }, 2000);
//   };

//   /* ──────────────────── effects ──────────────────── */
//   useEffect(() => { if (user) loadChats(); }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => {
//       const latestPdfs = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, latestPdfs);
//     })();
//     return () => {
//       if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     };
//   }, [currentChatId]);

//   /* ──────────────────── auth ──────────────────── */
//   const handleLogin = (userData) => {
//     setUser(userData);
//     setCurrentChatId(null); setActiveSession(null);
//     setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token'); localStorage.removeItem('user');
//     setUser(null); setCurrentChatId(null); setActiveSession(null);
//     setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
//   };

//   /* ──────────────────── chat creation ──────────────────── */
//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes  = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce((acc, cfg) => acc + (Number(cfg?.count) || 0), 0);
//       const chatRequestData = {
//         examType:    chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig: {
//           totalQuestions,
//           questionTypes,
//           // keep legacy flat fields for backwards compat
//           mcq:         { count: questionTypes?.mcq?.count         || 0, marks: questionTypes?.mcq?.marks         || 0 },
//           descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 },
//         },
//       };
//       const response = await chatAPI.createChat(chatRequestData);
//       const newChat = {
//         chatId:      response.data.chatId,
//         examType:    chatData.examType,
//         createdAt:   new Date().toISOString(),
//         weakTopics:  [],
//         pdfCount:    0,
//         subject:     null,
//         bloomLevels: chatData.bloomLevels || [],
//         examConfig:  chatRequestData.examConfig,
//         analytics:   [],
//       };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(response.data.chatId);
//       setShowNewChatModal(false);
//       setActiveSession(null); setReviewSession(null);
//     } catch (error) {
//       console.error('Error creating chat:', error);
//       alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   /* ──────────────────── PDF upload ──────────────────── */
//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({
//         pdfId:      `temp_${Date.now()}_${f.name}`,
//         filename:   f.name,
//         type:       'pending',
//         processed:  false,
//         error:      null,
//         uploadedAt: new Date().toISOString(),
//       }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   /* ──────────────────── question generation ──────────────────── */
//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'normal' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       else alert('Failed to generate questions: ' + msg);
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'normal' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   /* ── voice interview generation — reuses same endpoints ── */
//   const handleGenerateVoiceFull = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       // Single setState — questions and mode set atomically, no race possible
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'voice' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       const status = error.response?.status;
//       const msg    = error.response?.data?.error || error.message;
//       if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       else alert('Failed to generate questions: ' + msg);
//       throw error;
//     }
//   };

//   const handleGenerateVoiceWeak = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setActiveSession({ questions: response.data.questions, sessionId: response.data.sessionId, mode: 'voice' });
//       setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   /* ──────────────────── submit ──────────────────── */
//   const handleSubmitTest = async (answers) => {
//     if (!activeSession?.sessionId) return;
//     try {
//       const response = await questionAPI.submitAnswers(activeSession.sessionId, answers);
//       const updatedChats = chats.map((chat) => {
//         if (chat.chatId === currentChatId) {
//           const weakTopics = response.data.weakTopicList ||
//             Object.keys(response.data.weakTopics || {}).slice(0, 5);
//           return { ...chat, weakTopics, analytics: response.data.analytics || chat.analytics || [] };
//         }
//         return chat;
//       });
//       setChats(updatedChats);
//       await loadSessionHistory(currentChatId);
//       return response.data;
//     } catch (error) {
//       alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   /* ──────────────────── voice interview exit ──────────────────── */
//   const handleVoiceInterviewFinished = (result, answers) => {
//     const sessionQuestions = activeSession?.questions || [];
//     const sessionId        = activeSession?.sessionId;
//     setActiveSession(null);

//     if (result) {
//       const fakeSession = {
//         sessionId,
//         type:      'voice_full',
//         createdAt: new Date().toISOString(),
//         score:     result.score,
//         questions: sessionQuestions,
//         answers:   answers || {},       // ← actual transcripts passed up from VoiceInterview
//         feedback:  result.results || {},
//       };
//       setReviewSession(fakeSession);
//     }
//   };

//   /* ──────────────────── navigation ──────────────────── */
//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId);
//     setActiveSession(null); setPdfs([]); setReviewSession(null);
//   };

//   /* ──────────────────── derived ──────────────────── */
//   const currentChat  = chats.find((c) => c.chatId === currentChatId);
//   const subjectName  = getSubjectForChat(currentChat);
//   const hasAnyPDF    = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate  = hasAnyPDF && allProcessed;
//   const isVoiceActive = activeSession?.mode === 'voice';

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar
//         user={user} chats={chats} currentChatId={currentChatId}
//         onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)}
//         onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen}
//       />

//       <div className="main-content">
//         {/* Topbar */}
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
//               {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
//             </button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChat.examType} Preparation
//                   {subjectName && (
//                     <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>
//                   )}
//                 </div>
//                 <div className="topbar-sub">
//                   {pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed
//                   {isVoiceActive && (
//                     <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· Voice Interview</span>
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>

//           {currentChat?.weakTopics?.length > 0 && !isVoiceActive && (
//             <div className="topbar-weak-tags">
//               {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
//                 <span key={idx} className="badge badge-warning">{topic}</span>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Content */}
//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state">
//               <div className="empty-state-card">
//                 <div className="empty-icon">
//                   <Menu size={32} />
//                 </div>
//                 <h3>No chat selected</h3>
//                 <p>Select an existing chat or create a new one to start your exam prep</p>
//                 <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
//                   Start a new session
//                 </button>
//               </div>
//             </div>

//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />

//           ) : activeSession?.mode === 'voice' && activeSession.questions?.length > 0 ? (
//             <VoiceInterview
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               onExitToHome={handleVoiceInterviewFinished}
//             />

//           ) : activeSession?.mode === 'normal' && activeSession.questions?.length > 0 ? (
//             <QuestionRenderer
//               questions={activeSession.questions}
//               onSubmit={handleSubmitTest}
//               sessionId={activeSession.sessionId}
//               onExitToHome={() => setActiveSession(null)}
//             />

//           ) : (
//             <PracticeSession
//               chat={currentChat}
//               pdfs={pdfs}
//               sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onGenerateVoiceFull={() => handleGenerateVoiceFull(currentChatId)}
//               onGenerateVoiceWeak={() => handleGenerateVoiceWeak(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate}
//               allProcessed={allProcessed}
//               hasAnyPDF={hasAnyPDF}
//               onNewSessionPrefilled={(examType) => {
//                 setPrefilledExamType(examType || '');
//                 setShowNewChatModal(true);
//               }}
//             />
//           )}
//         </div>
//       </div>

//       {showNewChatModal && (
//         <NewChatModal
//           onClose={() => { setShowNewChatModal(false); setPrefilledExamType(''); }}
//           onCreate={handleCreateChat}
//           defaultExamType={prefilledExamType}
//         />
//       )}
//     </div>
//   );
// };

// export default App;
















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
//     } catch (error) { console.error('Error loading chats:', error); }
//   };

//   const loadPDFs = async (chatId) => {
//     try {
//       const response = await chatAPI.getPDFs(chatId);
//       setPdfs(response.data || []);
//       return response.data || [];
//     } catch (error) { console.error('Error loading PDFs:', error); return []; }
//   };

//   const loadSessionHistory = async (chatId) => {
//     try {
//       const response = await chatAPI.getChatHistory(chatId);
//       setSessionHistory(response.data || []);
//     } catch (error) { console.error('Error loading session history:', error); }
//   };

//   const getSubjectForChat = (chat) => {
//     if (chat?.subject) return chat.subject;
//     if (chat?.examConfig?.subject) return chat.examConfig.subject;
//     if (chat?.examConfigSubject) return chat.examConfigSubject;
//     return null;
//   };

//   const startPdfPollingIfNeeded = (chatId, currentPdfs) => {
//     const hasProcessing = (currentPdfs || []).some((p) => !p.processed && !p.error);
//     if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     if (!chatId || !hasProcessing) return;
//     pdfPollRef.current = setInterval(async () => {
//       const latest = await loadPDFs(chatId);
//       const stillProcessing = (latest || []).some((p) => !p.processed && !p.error);
//       if (!stillProcessing) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; }
//     }, 2000);
//   };

//   useEffect(() => { if (user) loadChats(); }, [user]);

//   useEffect(() => {
//     if (!currentChatId) return;
//     (async () => {
//       const latestPdfs = await loadPDFs(currentChatId);
//       await loadSessionHistory(currentChatId);
//       setReviewSession(null);
//       startPdfPollingIfNeeded(currentChatId, latestPdfs);
//     })();
//     return () => { if (pdfPollRef.current) { clearInterval(pdfPollRef.current); pdfPollRef.current = null; } };
//   }, [currentChatId]);

//   const handleLogin = (userData) => {
//     setUser(userData); setCurrentChatId(null); setQuestions(null); setCurrentSession(null); setReviewSession(null);
//   };

//   const handleLogout = () => {
//     localStorage.removeItem('token'); localStorage.removeItem('user');
//     setUser(null); setCurrentChatId(null); setQuestions(null); setCurrentSession(null);
//     setReviewSession(null); setChats([]); setPdfs([]); setSessionHistory([]);
//   };

//   const handleCreateChat = async (chatData) => {
//     try {
//       const questionTypes = chatData.questionTypes || {};
//       const totalQuestions = Object.values(questionTypes).reduce((acc, cfg) => acc + (Number(cfg?.count) || 0), 0);
//       const chatRequestData = {
//         examType: chatData.examType,
//         bloomLevels: chatData.bloomLevels,
//         examConfig: {
//           totalQuestions, questionTypes,
//           mcq: { count: questionTypes?.mcq?.count || 0, marks: questionTypes?.mcq?.marks || 0 },
//           descriptive: { count: questionTypes?.descriptive?.count || 0, marks: questionTypes?.descriptive?.marks || 0 },
//         },
//       };
//       const response = await chatAPI.createChat(chatRequestData);
//       const newChat = {
//         chatId: response.data.chatId, examType: chatData.examType, createdAt: new Date().toISOString(),
//         weakTopics: [], pdfCount: 0, subject: null, bloomLevels: chatData.bloomLevels || [],
//         examConfig: chatRequestData.examConfig, analytics: [],
//       };
//       setChats((prev) => [newChat, ...prev]);
//       setCurrentChatId(response.data.chatId);
//       setShowNewChatModal(false); setQuestions(null); setCurrentSession(null); setReviewSession(null);
//     } catch (error) {
//       console.error('Error creating chat:', error);
//       alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
//     }
//   };

//   const handleUploadPDF = async (chatId, filesOrFile) => {
//     try {
//       const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
//       setPdfs((prev) => [...prev, ...files.map((f) => ({
//         pdfId: `temp_${Date.now()}_${f.name}`, filename: f.name, type: 'pending',
//         processed: false, error: null, uploadedAt: new Date().toISOString(),
//       }))]);
//       for (const file of files) { await chatAPI.uploadPDF(chatId, file); }
//       const latest = await loadPDFs(chatId);
//       setChats((prev) => prev.map((c) => c.chatId === chatId ? { ...c, pdfCount: latest.length } : c));
//       startPdfPollingIfNeeded(chatId, latest);
//       alert('PDF(s) uploaded successfully. Processing in background...');
//     } catch (error) {
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;
//       if (status === 409) { alert(msg); await loadPDFs(chatId); return; }
//       alert('Failed to upload PDF: ' + msg);
//       await loadPDFs(chatId);
//     }
//   };

//   const handleGenerateFullExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateFullExam(chatId);
//       setQuestions(response.data.questions); setCurrentSession(response.data.sessionId); setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       const status = error.response?.status;
//       const msg = error.response?.data?.error || error.message;
//       if (status === 429) alert('Gemini rate limit hit. Please retry in ~30 seconds.');
//       else alert('Failed to generate questions: ' + msg);
//       throw error;
//     }
//   };

//   const handleGenerateWeakExam = async (chatId) => {
//     try {
//       const response = await questionAPI.generateWeakExam(chatId);
//       setQuestions(response.data.questions); setCurrentSession(response.data.sessionId); setReviewSession(null);
//       return response.data;
//     } catch (error) {
//       alert('Failed to generate weak topics questions: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleSubmitTest = async (answers) => {
//     if (!currentSession) return;
//     try {
//       const response = await questionAPI.submitAnswers(currentSession, answers);
//       const updatedChats = chats.map((chat) => {
//         if (chat.chatId === currentChatId) {
//           const weakTopics = response.data.weakTopicList || Object.keys(response.data.weakTopics || {}).slice(0, 5);
//           return { ...chat, weakTopics, analytics: response.data.analytics || chat.analytics || [] };
//         }
//         return chat;
//       });
//       setChats(updatedChats);
//       await loadSessionHistory(currentChatId);
//       return response.data;
//     } catch (error) {
//       alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
//       throw error;
//     }
//   };

//   const handleSelectChat = (chatId) => {
//     setCurrentChatId(chatId); setQuestions(null); setCurrentSession(null); setPdfs([]); setReviewSession(null);
//   };

//   const currentChat = chats.find((c) => c.chatId === currentChatId);
//   const subjectName = getSubjectForChat(currentChat);
//   const hasAnyPDF = pdfs.length > 0;
//   const allProcessed = pdfs.length > 0 && pdfs.every((p) => p.processed || p.error);
//   const canGenerate = hasAnyPDF && allProcessed;

//   if (!user) return <AuthPage onLogin={handleLogin} />;

//   return (
//     <div className="app-shell">
//       <ChatSidebar
//         user={user} chats={chats} currentChatId={currentChatId}
//         onSelectChat={handleSelectChat} onCreateChat={() => setShowNewChatModal(true)}
//         onLogout={handleLogout} onUploadPDF={handleUploadPDF} sidebarOpen={sidebarOpen}
//       />

//       <div className="main-content">
//         {/* Topbar */}
//         <div className="topbar">
//           <div className="topbar-left">
//             <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
//               {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
//             </button>
//             {currentChat && (
//               <div>
//                 <div className="topbar-title">
//                   {currentChat.examType} Preparation
//                   {subjectName && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {subjectName}</span>}
//                 </div>
//                 <div className="topbar-sub">
//                   {pdfs.filter((p) => p.processed).length} / {pdfs.length} PDFs processed
//                 </div>
//               </div>
//             )}
//           </div>

//           {currentChat?.weakTopics?.length > 0 && (
//             <div className="topbar-weak-tags">
//               {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
//                 <span key={idx} className="badge badge-warning">{topic}</span>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Content */}
//         <div className="content-area">
//           {!currentChatId ? (
//             <div className="empty-state">
//               <div className="empty-state-card">
//                 <div className="empty-icon">
//                   <Menu size={32} />
//                 </div>
//                 <h3>No chat selected</h3>
//                 <p>Select an existing chat or create a new one to start your exam prep</p>
//                 <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
//                   Start a new session
//                 </button>
//               </div>
//             </div>
//           ) : reviewSession ? (
//             <SessionReview session={reviewSession} onBack={() => setReviewSession(null)} />
//           ) : questions ? (
//             <QuestionRenderer
//               questions={questions} onSubmit={handleSubmitTest} sessionId={currentSession}
//               onExitToHome={() => { setQuestions(null); setCurrentSession(null); }}
//             />
//           ) : (
//             <PracticeSession
//               chat={currentChat} pdfs={pdfs} sessionHistory={sessionHistory}
//               onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
//               onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
//               onUploadPDF={(files) => handleUploadPDF(currentChatId, files)}
//               onOpenHistorySession={(session) => setReviewSession(session)}
//               canGenerate={canGenerate} allProcessed={allProcessed} hasAnyPDF={hasAnyPDF}
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