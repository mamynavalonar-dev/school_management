import { useCallback, useEffect, useRef, useState } from 'react';
import './DemoReadinessGate.css';

const URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/demo-readiness.php' : '/api/demo-readiness.php';
const clampRetry = (v) => Math.min(30, Math.max(3, Number.isFinite(Number(v)) ? Math.round(Number(v)) : 10));
const copy = {
  checking: ['Préparation de la démonstration','Vérification des services nécessaires…'],
  waking: ['Préparation de la démonstration','La base de données gratuite est en cours de démarrage.'],
  connecting: ['Connexion à la base de données','Le service est actif. Finalisation de la connexion…'],
  unavailable: ['Service temporairement indisponible','Une nouvelle tentative sera effectuée automatiquement.'],
  configuration_error: ['Configuration de démonstration indisponible','Le réveil automatique doit être vérifié.'],
  wake_error: ['Démarrage temporairement indisponible','Une nouvelle tentative sera effectuée automatiquement.'],
  provider_unavailable: ['Vérification du service de données','Le fournisseur met plus de temps à répondre.'],
};

export default function DemoReadinessGate({ children }) {
  const [ready,setReady] = useState(false);
  const [status,setStatus] = useState('checking');
  const [message,setMessage] = useState(copy.checking[1]);
  const [retry,setRetry] = useState(10);
  const [attempt,setAttempt] = useState(0);
  const timer = useRef(null);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    clearTimeout(timer.current);
    setAttempt((n)=>n+1);
    const controller = new AbortController();
    const abort = setTimeout(()=>controller.abort(),12000);
    try {
      const response = await fetch(URL,{headers:{Accept:'application/json'},credentials:'include',cache:'no-store',signal:controller.signal});
      let payload={}; try { payload=await response.json(); } catch { payload = {}; }
      if (!mounted.current) return;
      if (response.ok && payload?.status === 'ready') { setReady(true); return; }
      const next = String(payload?.status || 'unavailable');
      const seconds = clampRetry(payload?.retryAfter);
      setStatus(next); setMessage(String(payload?.message || copy[next]?.[1] || copy.unavailable[1])); setRetry(seconds);
      timer.current=setTimeout(check,seconds*1000);
    } catch {
      if (!mounted.current) return;
      setStatus('unavailable'); setMessage('Le serveur se réveille. Nouvelle tentative automatique…'); setRetry(10);
      timer.current=setTimeout(check,10000);
    } finally { clearTimeout(abort); }
  },[]);

  useEffect(()=>{ mounted.current=true; check(); return ()=>{ mounted.current=false; clearTimeout(timer.current); }; },[check]);
  if (ready) return children;
  const c = copy[status] || copy.unavailable;
  const active = ['checking','waking','connecting','provider_unavailable'].includes(status);
  return <main className="demo-wake-screen" role="status" aria-live="polite"><section className="demo-wake-card">
    <div className="demo-wake-brand"><span>SM</span> School Management</div><div className="demo-wake-spinner" />
    <h1>{c[0]}</h1><p className="demo-wake-lead">{message || c[1]}</p>
    <div className="demo-wake-steps"><div className="ready">✓ <span>Serveur web disponible</span></div><div className={active?'active':''}>{active?'•':'!'} <span>Base de données</span></div><div>○ <span>Ouverture de l'application</span></div></div>
    <p className="demo-wake-note">Les services gratuits peuvent se mettre en veille lorsqu'ils sont inactifs. Le redémarrage peut prendre quelques instants.</p>
    <button type="button" onClick={check}>Réessayer maintenant</button><p className="demo-wake-meta">Tentative {attempt} · nouvelle vérification dans environ {retry} s</p>
  </section></main>;
}
