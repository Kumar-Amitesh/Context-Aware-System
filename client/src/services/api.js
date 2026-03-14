import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  login:    (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  // Verify token with DB on app init — never trust localStorage alone
  getMe:    ()     => api.get('/auth/me'),
};

export const chatAPI = {
  getChats:       ()             => api.get('/chats'),
  createChat:     (data)         => api.post('/chats', data),
  retryPDF:       (pdfId)        => api.post(`/pdfs/${pdfId}/retry`),
  uploadPDF:      (chatId, file) => {
    const formData = new FormData();
    formData.append('pdf', file);
    return api.post(`/chats/${chatId}/pdfs`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getPDFs:        (chatId) => api.get(`/chats/${chatId}/pdfs`),
  getChatHistory: (chatId) => api.get(`/chats/${chatId}/history`),
};

export const questionAPI = {
  generateFullExam: (chatId)             => api.post(`/chats/${chatId}/questions/generate/full`),
  generateWeakExam: (chatId)             => api.post(`/chats/${chatId}/questions/generate/weak`),
  submitAnswers:    (sessionId, answers) => api.post(`/sessions/${sessionId}/submit`, { answers }),
};

// ─── JD Interview Prep API ─────────────────────────────────────────────────────
// Matches routes in jd_routes.py and jd_session_routes.py exactly.
// To remove this feature: delete jdAPI + JDInterviewPanel.js + JDSessionReview.js
export const jdAPI = {
  // JD upload & management (jd_routes.py)
  uploadText: (chatId, text) =>
    api.post(`/chats/${chatId}/jd/upload-text`, { text }),
  uploadFile: (chatId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/chats/${chatId}/jd/upload-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getJD:    (chatId) => api.get(`/chats/${chatId}/jd`),
  deleteJD: (chatId) => api.delete(`/chats/${chatId}/jd`),

  // Session: generate questions + create DB session (jd_session_routes.py)
  // Body: { count, type, session_mode: 'normal'|'voice'|'video' }
  generateSession: (chatId, count, type, sessionMode) =>
    api.post(`/chats/${chatId}/jd/session/generate`, {
      count,
      type,
      session_mode: sessionMode,
    }),

  // Submit text/voice answers → LLM feedback → saved to history
  submitSession: (sessionId, answers) =>
    api.post(`/jd-sessions/${sessionId}/submit`, { answers }),

  // Video JD sessions reuse the existing video-session/save endpoint
  saveVideoSession: (chatId, payload) =>
    api.post(`/chats/${chatId}/video-session/save`, payload),
};

export default api;























// // services/api.js
// import axios from 'axios';

// const API_BASE = 'http://localhost:5000/api';

// const api = axios.create({
//   baseURL: API_BASE,
//   headers: {
//     'Content-Type': 'application/json',
//   },
// });

// // Add token to requests
// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem('token');
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

// export const authAPI = {
//   login: (data) => api.post('/auth/login', data),
//   register: (data) => api.post('/auth/register', data),
// };

// export const chatAPI = {
//   getChats: () => api.get('/chats'),
//   createChat: (data) => api.post('/chats', data),
//   retryPDF: (pdfId) => api.post(`/pdfs/${pdfId}/retry`),
//   uploadPDF: (chatId, file) => {
//     const formData = new FormData();
//     formData.append('pdf', file);
//     return api.post(`/chats/${chatId}/pdfs`, formData, {
//       headers: {
//         'Content-Type': 'multipart/form-data',
//       },
//     });
//   },
//   getPDFs: (chatId) => api.get(`/chats/${chatId}/pdfs`),
//   getChatHistory: (chatId) => api.get(`/chats/${chatId}/history`),
// };

// export const questionAPI = {
//   generateFullExam: (chatId) => api.post(`/chats/${chatId}/questions/generate/full`),
//   generateWeakExam: (chatId) => api.post(`/chats/${chatId}/questions/generate/weak`),
//   submitAnswers: (sessionId, answers) => 
//     api.post(`/sessions/${sessionId}/submit`, { answers }),

//   // OPTIONAL (only if you add GET /api/sessions/<sid> backend)
//   // getSession: (sessionId) => api.get(`/sessions/${sessionId}`),
// };

// export default api;