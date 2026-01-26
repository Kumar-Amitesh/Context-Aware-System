import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { authAPI } from '../services/api';

const AuthPage = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let response;
      if (isLogin) {
        response = await authAPI.login({
          email: formData.email,
          password: formData.password,
        });
      } else {
        response = await authAPI.register({
          email: formData.email,
          password: formData.password,
          name: formData.name,
        });
      }

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLogin(user);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
  <div className="auth-card">
    <div className="auth-header">
      <div className="auth-icon">
        <MessageSquare size={32} />
      </div>
      <h1>Exam Prep AI</h1>
      <p>Your intelligent study companion</p>
    </div>

    {error && <div className="error-box">{error}</div>}

    <div className="auth-tabs">
      <button
        className={isLogin ? 'active' : ''}
        onClick={() => setIsLogin(true)}
      >
        Login
      </button>
      <button
        className={!isLogin ? 'active' : ''}
        onClick={() => setIsLogin(false)}
      >
        Register
      </button>
    </div>

    <form className="auth-form" onSubmit={handleSubmit}>
      {!isLogin && (
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      )}

      <input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />

      <input
        type="password"
        placeholder="Password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
      />

      <button className="auth-submit" disabled={loading}>
        {loading ? 'Processing...' : isLogin ? 'Login' : 'Create Account'}
      </button>
    </form>
  </div>
</div>

  );
};

export default AuthPage;