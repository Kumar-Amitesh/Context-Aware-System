import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Mic, MicOff,AlertCircle } from 'lucide-react';

const QuestionRenderer = ({ questions, onSubmit, sessionId }) => {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [feedbacks, setFeedbacks] = useState({});

  useEffect(() => {
    const initialAnswers = {};
    questions.forEach((q) => {
      initialAnswers[q.id] = q.type === 'mcq' ? '' : '';
    });
    setAnswers(initialAnswers);
  }, [questions]);

  const handleInputChange = (id, value) => {
    setAnswers({ ...answers, [id]: value });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await onSubmit(answers);
      setResults(response);
      setSubmitted(true);
      
      // Extract feedback from response
      if (response.feedback) {
        setFeedbacks(response.feedback);
      }
    } catch (error) {
      console.error('Error submitting answers:', error);
      alert('Failed to submit answers. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startVoiceInput = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setListening(true);
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const activeQuestion = document.activeElement?.dataset?.questionId;
        if (activeQuestion) {
          handleInputChange(activeQuestion, transcript);
        }
      };
      
      recognition.onend = () => {
        setListening(false);
      };
      
      recognition.start();
    } else {
      alert('Speech recognition is not supported in your browser.');
    }
  };

   if (submitted && results) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${results.score >= 6 ? 'bg-green-100' : 'bg-orange-100'}`}>
              {results.score >= 6 ? (
                <CheckCircle className="text-green-600" size={48} />
              ) : (
                <AlertCircle className="text-orange-600" size={48} />
              )}
            </div>
            <h2 className="text-3xl font-bold text-gray-800">Test Submitted!</h2>
            <p className="text-xl text-gray-600 mt-2">Score: {results.score.toFixed(1)}/10</p>
          </div>

          <div className="space-y-6">
            {/* Feedback for each question */}
            {Object.keys(feedbacks).length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Question-wise Feedback:</h3>
                <div className="space-y-3">
                  {questions.map((q, idx) => {
                    const feedback = feedbacks[q.id];
                    if (!feedback) return null;
                    
                    return (
                      <div key={q.id} className="border rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-sm font-semibold">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-gray-700 mb-1">{q.question}</p>
                            {feedback.covered && feedback.covered.length > 0 && (
                              <div className="mt-2">
                                <span className="text-sm text-green-600 font-medium">✓ Covered:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {feedback.covered.map((concept, cIdx) => (
                                    <span key={cIdx} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                                      {concept}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {feedback.missing && feedback.missing.length > 0 && (
                              <div className="mt-2">
                                <span className="text-sm text-orange-600 font-medium">⚠ Missing:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {feedback.missing.map((concept, cIdx) => (
                                    <span key={cIdx} className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
                                      {concept}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weak Topics */}
            {results.weakTopics && results.weakTopics.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Areas to Improve:</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(results.weakTopics).map((topic, idx) => (
                    <span
                      key={idx}
                      className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-medium"
                    >
                      {topic} ({results.weakTopics[topic]} times)
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={() => {
                  setSubmitted(false);
                  setAnswers({});
                  setResults(null);
                  setFeedbacks({});
                }}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition"
              >
                Start New Practice
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Practice Questions</h2>
          <button
            onClick={startVoiceInput}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              listening
                ? 'bg-red-100 text-red-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {listening ? (
              <>
                <MicOff size={20} />
                <span>Listening...</span>
              </>
            ) : (
              <>
                <Mic size={20} />
                <span>Voice Answer</span>
              </>
            )}
          </button>
        </div>

        <div className="space-y-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="border-b border-gray-200 pb-8 last:border-0">
              <div className="flex gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-800">{q.question}</h3>
                  {q.topic && (
                    <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {q.topic}
                    </span>
                  )}
                </div>
              </div>

              {q.type === 'mcq' && (
                <div className="ml-11 space-y-2">
                  {q.options.map((opt, optIdx) => (
                    <label
                      key={optIdx}
                      className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === opt}
                        onChange={() => handleInputChange(q.id, opt)}
                        className="mr-3 w-4 h-4 text-indigo-600"
                      />
                      <span className="text-gray-700">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'descriptive' && (
                <div className="ml-11">
                  <textarea
                    data-question-id={q.id}
                    value={answers[q.id] || ''}
                    onChange={(e) => handleInputChange(q.id, e.target.value)}
                    placeholder="Type your answer here... (or use voice input)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-32"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    Click the voice input button and speak your answer
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || Object.keys(answers).length === 0}
          className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit Test'}
        </button>
      </div>
    </div>
  );
};

export default QuestionRenderer;