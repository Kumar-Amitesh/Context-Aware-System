import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import AuthPage from './components/AuthPage';
import ChatSidebar from './components/ChatSidebar';
import NewChatModal from './components/NewChatModal';
import QuestionRenderer from './components/QuestionRenderer';
import PracticeSession from './components/PracticeSession';
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
  const [loading, setLoading] = useState(false);
  const [pdfs, setPdfs] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);

  const loadChats = async () => {
    try {
      const response = await chatAPI.getChats();
      setChats(response.data);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  const loadPDFs = async (chatId) => {
    try {
      const response = await chatAPI.getPDFs(chatId);
      setPdfs(response.data);
    } catch (error) {
      console.error('Error loading PDFs:', error);
    }
  };

  const loadSessionHistory = async (chatId) => {
    try {
      const response = await chatAPI.getChatHistory(chatId);
      setSessionHistory(response.data);
    } catch (error) {
      console.error('Error loading session history:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadChats();
    }
  }, [user]);

  useEffect(() => {
    if (currentChatId) {
      loadPDFs(currentChatId);
      loadSessionHistory(currentChatId);
    }
  }, [currentChatId]);

  const handleLogin = (userData) => {
    setUser(userData);
    setCurrentChatId(null);
    setQuestions(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentChatId(null);
    setQuestions(null);
    setChats([]);
    setPdfs([]);
  };

  const handleCreateChat = async (chatData) => {
    try {
      // Transform data to match backend format
      const chatRequestData = {
        examType: chatData.examType,
        bloom: chatData.bloomLevel,
        examConfig: {
          totalQuestions: chatData.questionPattern.mcq + chatData.questionPattern.descriptive,
          mcq: {
            count: chatData.questionPattern.mcq,
            marks: chatData.questionPattern.marks
          },
          descriptive: {
            count: chatData.questionPattern.descriptive,
            marks: chatData.questionPattern.marks
          }
        }
      };

      const response = await chatAPI.createChat(chatRequestData);
      const newChat = {
        chatId: response.data.chatId,
        examType: chatData.examType,
        createdAt: new Date().toISOString(),
        weakTopics: [],
        pdfCount: 0
      };
      
      setChats([newChat, ...chats]);
      setCurrentChatId(response.data.chatId);
      setShowNewChatModal(false);
    } catch (error) {
      console.error('Error creating chat:', error);
      alert('Failed to create chat: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUploadPDF = async (chatId, file) => {
    try {
      await chatAPI.uploadPDF(chatId, file);
      loadPDFs(chatId);
      alert('PDF uploaded successfully. Processing in background...');
    } catch (error) {
      console.error('Error uploading PDF:', error);
      alert('Failed to upload PDF: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGenerateFullExam = async (chatId) => {
    try {
      const response = await questionAPI.generateFullExam(chatId);
      setQuestions(response.data.questions);
      setCurrentSession(response.data.sessionId);
      return response.data;
    } catch (error) {
      console.error('Error generating questions:', error);
      const errorMsg = error.response?.data?.error || error.message;
      alert('Failed to generate questions: ' + errorMsg);
      throw error;
    }
  };

  const handleGenerateWeakExam = async (chatId) => {
    try {
      const response = await questionAPI.generateWeakExam(chatId);
      setQuestions(response.data.questions);
      setCurrentSession(response.data.sessionId);
      return response.data;
    } catch (error) {
      console.error('Error generating weak questions:', error);
      const errorMsg = error.response?.data?.error || error.message;
      alert('Failed to generate weak topics questions: ' + errorMsg);
      throw error;
    }
  };

  const handleSubmitTest = async (answers) => {
    if (!currentSession) return;
    
    try {
      const response = await questionAPI.submitAnswers(currentSession, answers);
      
      // Update chat with weak topics
      const updatedChats = chats.map(chat => {
        if (chat.chatId === currentChatId) {
          const weakTopics = Object.keys(response.data.weakTopics || {});
          return {
            ...chat,
            weakTopics: weakTopics.slice(0, 5)
          };
        }
        return chat;
      });
      setChats(updatedChats);
      
      // Reload session history to show the new session
      loadSessionHistory(currentChatId);
      
      return response.data;
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('Failed to submit answers: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleSelectChat = (chatId) => {
    setCurrentChatId(chatId);
    setQuestions(null);
    setCurrentSession(null);
    setPdfs([]);
  };

  const currentChat = chats.find(c => c.chatId === currentChatId);

  if (!user) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        user={user}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={() => setShowNewChatModal(true)}
        onLogout={handleLogout}
        onUploadPDF={handleUploadPDF}
        sidebarOpen={sidebarOpen}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition lg:hidden"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            {currentChat && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  {currentChat.examType} Preparation
                </h2>
                <p className="text-sm text-gray-500">
                  {pdfs.filter(p => p.processed).length} PDFs processed
                </p>
              </div>
            )}
          </div>
          
          {currentChat && currentChat.weakTopics && currentChat.weakTopics.length > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-sm text-gray-600">Weak Topics:</span>
              <div className="flex gap-1">
                {currentChat.weakTopics.slice(0, 2).map((topic, idx) => (
                  <span key={idx} className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!currentChatId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                  <Menu className="text-gray-400" size={40} />
                </div>
                <h3 className="text-xl font-semibold text-gray-600 mb-2">
                  No chat selected
                </h3>
                <p className="text-gray-500 mb-4">
                  Select a chat or create a new one to get started
                </p>
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  Create New Chat
                </button>
              </div>
            </div>
          ) : questions ? (
            <QuestionRenderer
              questions={questions}
              onSubmit={handleSubmitTest}
              sessionId={currentSession}
            />
          ) : (
            <PracticeSession
              chat={currentChat}
              pdfs={pdfs}
              sessionHistory={sessionHistory}
              onGenerateFullExam={() => handleGenerateFullExam(currentChatId)}
              onGenerateWeakExam={() => handleGenerateWeakExam(currentChatId)}
              onUploadPDF={handleUploadPDF}
            />
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <NewChatModal
          onClose={() => setShowNewChatModal(false)}
          onCreate={handleCreateChat}
        />
      )}
    </div>
  );
};

export default App;