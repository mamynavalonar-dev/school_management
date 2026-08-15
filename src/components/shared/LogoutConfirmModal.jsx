import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, X } from 'lucide-react';
import './LogoutConfirmModal.css';

const LogoutConfirmModal = ({ open, onCancel, onConfirm }) => {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="logout-confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="logout-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-description"
      >
        <button
          type="button"
          className="logout-confirm-close"
          onClick={onCancel}
          aria-label="Fermer la confirmation de déconnexion"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="logout-confirm-icon" aria-hidden="true">
          <LogOut size={27} />
        </div>

        <div className="logout-confirm-copy">
          <h2 id="logout-confirm-title">Se déconnecter ?</h2>
          <p id="logout-confirm-description">
            Voulez-vous vraiment fermer votre session sur cette application ?
          </p>
        </div>

        <div className="logout-confirm-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="logout-confirm-button logout-confirm-cancel"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="logout-confirm-button logout-confirm-submit"
            onClick={onConfirm}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default LogoutConfirmModal;
