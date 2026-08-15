import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import apiService from '../../services/api';
import './Auth.css';

const Auth = ({ onBack }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useApp();

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiService.login({ username: username.trim(), password });
      if (response.success && response.data) {
        const userData = { ...response.data };
        delete userData.token;
        delete userData.csrf_token;
        setUser(userData);
      } else {
        setError(response.message || 'Échec de la connexion.');
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <button
        type="button"
        className="auth-back-button"
        onClick={() => {
          if (onBack) onBack();
          else if (window.history.length > 1) window.history.back();
          else window.location.assign('/');
        }}
        aria-label="Retourner à la page précédente"
      >
        <ArrowLeft size={22} aria-hidden="true" />
        <span>Retour à l’accueil</span>
      </button>

      <div className="form-container">
        <div className="col col-1">
          <div className="image-layer">
            <div className="form-image-main auth-sun" aria-hidden="true" />
            <div className="form-image-1 auth-cloud" aria-hidden="true" />
            <div className="form-image-2 auth-cloud" aria-hidden="true" />
            <div className="form-image-3 auth-cloud" aria-hidden="true" />
          </div>
          <p className="featured-words">
            Gérez votre <span>succès</span> académique, <br /> commencez ici !
          </p>
        </div>

        <div className="col col-2 auth-login-column">
          <div className="login-form auth-login-only">
            <div className="form-title">
              <span>IDENTIFIEZ-VOUS ICI !</span>
              <small>Accès réservé aux comptes créés par l’administration ou la direction.</small>
            </div>
            <form className="form-inputs" onSubmit={handleLogin}>
              <div className="input-box">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nom d'utilisateur"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  disabled={loading}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <User className="field-icon field-icon-left" size={20} aria-hidden="true" />
              </div>
              <div className="input-box">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <Lock className="field-icon field-icon-left" size={20} aria-hidden="true" />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
              <div className="forget-pass">
                <button
                  type="button"
                  onClick={() => setError('Pour réinitialiser votre mot de passe, contactez un administrateur ou un directeur.')}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="input-box">
                <button type="submit" className="input-submit" disabled={loading}>
                  <span>{loading ? 'Connexion en cours…' : 'Se connecter'}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              </div>
            </form>
            {error && <p className="error-message">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
