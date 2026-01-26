import React, { useState, useEffect } from 'react';
import { Send, Upload, AlertCircle, FileText, History, Check, Clock } from 'lucide-react';

const PracticeSession = ({
  chat,
  pdfs,
  sessionHistory,
  onGenerateFullExam,
  onGenerateWeakExam,
  onUploadPDF,
}) => {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      await onUploadPDF(chat.chatId, file);
    } catch (error) {
      console.error('Error uploading PDF:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateFullQuestions = async () => {
    setGenerating(true);
    try {
      await onGenerateFullExam();
    } catch (error) {
      console.error('Error generating questions:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateWeakQuestions = async () => {
    if (!chat.weakTopics || chat.weakTopics.length === 0) {
      alert('No weak topics identified yet. Complete a test first.');
      return;
    }
    
    setGenerating(true);
    try {
      await onGenerateWeakExam();
    } catch (error) {
      console.error('Error generating weak questions:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left Column - Actions */}
      <div className="lg:w-2/3">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-4">
              <Send className="text-indigo-600" size={40} />
            </div>
            
            <h3 className="text-2xl font-semibold text-gray-800 mb-2">
              {chat.examType} Preparation
            </h3>
            
            <p className="text-gray-600 mb-6">
              Upload study materials and generate practice questions tailored to your needs
            </p>
          </div>

          {/* PDF Upload Section */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700">Study Materials</h4>
              <label className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 cursor-pointer">
                <Upload size={16} />
                <span>{uploading ? 'Uploading...' : 'Upload PDF'}</span>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePDFUpload}
                  className="hidden"
                  id="pdf-upload"
                  disabled={uploading}
                />
              </label>
            </div>
            
            {pdfs.length > 0 ? (
              <div className="space-y-2">
                {pdfs.map((pdf, idx) => (
                  <div key={pdf.pdfId} className="flex items-center justify-between p-3 bg-white rounded border">
                    <div className="flex items-center gap-3">
                      <FileText size={20} className="text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{pdf.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-1 rounded ${pdf.processed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {pdf.processed ? 'Processed' : 'Processing...'}
                          </span>
                          <span className="text-xs text-gray-500">{pdf.type}</span>
                        </div>
                      </div>
                    </div>
                    {pdf.error && (
                      <span className="text-xs text-red-600">Error: {pdf.error}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No PDFs uploaded yet. Upload syllabus, notes, or previous question papers.
              </p>
            )}
          </div>

          {/* Weak Topics Section */}
          {chat.weakTopics && chat.weakTopics.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={20} className="text-orange-500" />
                <h4 className="font-medium text-gray-700">Focus Areas</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {chat.weakTopics.map((topic, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-medium"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleGenerateFullQuestions}
              disabled={generating}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Clock size={20} />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Send size={20} />
                  <span>Generate Full Practice Test</span>
                </>
              )}
            </button>
            
            <button
              onClick={handleGenerateWeakQuestions}
              disabled={generating || !chat.weakTopics || chat.weakTopics.length === 0}
              className="w-full px-6 py-3 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition font-medium disabled:border-gray-300 disabled:text-gray-400 flex items-center justify-center gap-2"
            >
              <AlertCircle size={20} />
              <span>Focus on Weak Topics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column - History */}
      <div className="lg:w-1/3">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <History size={20} className="text-gray-600" />
            <h4 className="font-medium text-gray-700">Practice History</h4>
          </div>
          
          {sessionHistory.length > 0 ? (
            <div className="space-y-3">
              {sessionHistory.slice(0, 5).map((session) => (
                <div key={session.sessionId} className="p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-800 capitalize">
                      {session.type.replace('_', ' ')}
                    </span>
                    {session.score !== null && (
                      <span className={`px-2 py-1 text-xs rounded ${session.score >= 7 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {session.score}/10
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock size={12} />
                    <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    <span className="ml-auto">{session.questions?.length || 0} questions</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No practice sessions yet. Generate your first test!
            </p>
          )}
          
          {sessionHistory.length > 5 && (
            <button className="w-full mt-4 text-sm text-indigo-600 hover:text-indigo-700">
              View all history →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PracticeSession;