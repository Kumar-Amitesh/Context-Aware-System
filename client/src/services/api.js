// services/api.js
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
};

export const chatAPI = {
  getChats: () => api.get('/chats'),
  createChat: (data) => api.post('/chats', data),
  retryPDF: (pdfId) => api.post(`/pdfs/${pdfId}/retry`),
  uploadPDF: (chatId, file) => {
    const formData = new FormData();
    formData.append('pdf', file);
    return api.post(`/chats/${chatId}/pdfs`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  getPDFs: (chatId) => api.get(`/chats/${chatId}/pdfs`),
  getChatHistory: (chatId) => api.get(`/chats/${chatId}/history`),
};

export const questionAPI = {
  generateFullExam: (chatId) => api.post(`/chats/${chatId}/questions/generate/full`),
  generateWeakExam: (chatId) => api.post(`/chats/${chatId}/questions/generate/weak`),
  submitAnswers: (sessionId, answers) => 
    api.post(`/sessions/${sessionId}/submit`, { answers }),

  // OPTIONAL (only if you add GET /api/sessions/<sid> backend)
  // getSession: (sessionId) => api.get(`/sessions/${sessionId}`),
};

export default api;