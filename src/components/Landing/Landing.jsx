import { Rocket } from 'lucide-react';
import './Landing.css';

const Landing = ({ onStart }) => {
  return (
    <div className="landing-container">
      <header className="landing-header">
        {/* Vous pouvez remplacer ce div par votre composant Logo */}
        <div className="logo-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3z"></path>
            <path d="M14 3h7v7h-7z"></path>
            <path d="M14 14h7v7h-7z"></path>
            <path d="M3 14h7v7H3z"></path>
          </svg>
          <span>UniversityMS</span>
        </div>
      </header>
      <main className="landing-main">
        <h1 className="landing-title">
          Optimisez la Gestion de Votre Université avec UniversityMS
        </h1>
        <p className="landing-subtitle">
          Une solution complète et intuitive pour les étudiants, les enseignants et l'administration.
        </p>
        <button className="landing-button" onClick={onStart}>
          Commencer
          <Rocket size={20} />
        </button>
      </main>
    </div>
  );
};

export default Landing;


