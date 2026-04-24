import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import apiService from '../../services/api.jsx';
import soleilImg from '../../assets/soleil.jpg';
import nuageImg from '../../assets/nuage.jpg';
import './Auth.css';

const Auth = () => {
  const [isLoginView, setIsLoginView] = useState(true);
  const { setUser } = useApp();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await apiService.login({ 
        email: loginEmail, 
        password: loginPassword 
      });
      
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        setError(response.message || 'Ã‰chec de la connexion.');
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await apiService.register({ 
        name: registerName, 
        email: registerEmail, 
        password: registerPassword 
      });
      
      if (response.success) {
        setIsLoginView(true);
        setError('');
        setRegisterName('');
        setRegisterEmail('');
        setRegisterPassword('');
      } else {
        setError(response.message || 'Ã‰chec de l\'inscription.');
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="form-container">
        <div className={`col col-1 ${!isLoginView ? 'col-1-register' : ''}`}>
          <div className="image-layer">
            <img src={soleilImg} alt="Sun" className="form-image-main fi-2" />
            <img src={nuageImg} alt="Cloud" className="form-image-1 fi-1" />
            <img src={nuageImg} alt="Cloud" className="form-image-2 fi-1" />
            <img src={nuageImg} alt="Cloud" className="form-image-3 fi-1" />
          </div>
          <p className="featured-words">
            GÃ©rez votre <span>succÃ¨s</span> acadÃ©mique, <br /> commencez ici !
          </p>
        </div>
        
        <div className="col col-2">
          <div className="btn-box">
            <button
              className="btn btn-1"
              id="login"
              onClick={() => setIsLoginView(true)}
              style={{ backgroundColor: isLoginView ? '#21264D' : 'rgba(255, 255, 255, 0.2)' }}
              disabled={loading}
            >
              Sign In
            </button>
            <button
              className="btn btn-2"
              id="register"
              onClick={() => setIsLoginView(false)}
              style={{ backgroundColor: !isLoginView ? '#21264D' : 'rgba(255, 255, 255, 0.2)' }}
              disabled={loading}
            >
              Sign Up
            </button>
          </div>

          <div className="login-form" style={{ left: isLoginView ? '50%' : '150%', opacity: isLoginView ? 1 : 0 }}>
            <div className="form-title">
              <span>Sign In</span>
            </div>
            <form className="form-inputs" onSubmit={handleLogin}>
              <div className="input-box">
                <input
                  type="email"
                  className="input-field"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                />
                <i className="bx bx-user icon"></i>
              </div>
              <div className="input-box">
                <input
                  type="password"
                  className="input-field"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <i className="bx bx-lock-alt icon"></i>
              </div>
              <div className="forget-pass">
                <a href="#">Forgot Password</a>
              </div>
              <div className="input-box">
                <button type="submit" className="input-submit" disabled={loading}>
                  <span>{loading ? 'Connexion...' : 'Sign In'}</span>
                  <i className="bx bx-right-arrow-alt"></i>
                </button>
              </div>
            </form>
            {error && isLoginView && <p className="error-message">{error}</p>}
          </div>

          <div className="register-form" style={{ left: isLoginView ? '-50%' : '50%', opacity: isLoginView ? 0 : 1 }}>
            <div className="form-title">
              <span>Sign Up</span>
            </div>
            <form className="form-inputs" onSubmit={handleRegister}>
              <div className="input-box">
                <input
                  type="text"
                  className="input-field"
                  placeholder="User Name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="name"
                />
                <i className="bx bx-user icon"></i>
              </div>
              <div className="input-box">
                <input
                  type="email"
                  className="input-field"
                  placeholder="Email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                />
                <i className="bx bx-envelope icon"></i>
              </div>
              <div className="input-box">
                <input
                  type="password"
                  className="input-field"
                  placeholder="Password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <i className="bx bx-lock-alt icon"></i>
              </div>
              <div className="input-box">
                <button type="submit" className="input-submit" disabled={loading}>
                  <span>{loading ? 'Inscription...' : 'Sign Up'}</span>
                  <i className="bx bx-right-arrow-alt"></i>
                </button>
              </div>
            </form>
            {error && !isLoginView && <p className="error-message">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
