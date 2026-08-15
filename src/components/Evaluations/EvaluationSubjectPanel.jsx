import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, FileUp, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import {
  deleteEvaluationSubject,
  downloadEvaluationSubject,
  getEvaluationSubject,
  reviewEvaluationSubject,
  uploadEvaluationSubject,
} from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';

const statusCopy = {
  pending: ['En attente de validation', 'bg-amber-100 text-amber-800'],
  approved: ['Validé par la direction', 'bg-green-100 text-green-800'],
  rejected: ['Refusé par la direction', 'bg-red-100 text-red-800'],
};

const EvaluationSubjectPanel = ({ evaluation, user }) => {
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const { success, error: notifyError } = useNotifications();
  const isDirection = ['admin', 'directeur'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  const load = async () => {
    try {
      setLoading(true);
      const data = await getEvaluationSubject(evaluation.id);
      setSubject(data);
      setReviewNote(data?.review_note || '');
    } catch (error) {
      notifyError(error.message || 'Impossible de charger le sujet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [evaluation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return notifyError('Choisissez le fichier du sujet.');
    try {
      setBusy(true);
      await uploadEvaluationSubject(evaluation.id, file);
      success('Sujet envoyé à la direction pour validation.');
      setFile(null);
      await load();
    } catch (error) {
      notifyError(error.message || 'Échec du dépôt du sujet.');
    } finally { setBusy(false); }
  };

  const review = async (decision) => {
    try {
      setBusy(true);
      await reviewEvaluationSubject(evaluation.id, decision, reviewNote);
      success(decision === 'approved' ? 'Sujet validé.' : 'Sujet refusé.');
      await load();
    } catch (error) {
      notifyError(error.message || 'Impossible d’enregistrer la décision.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Supprimer le sujet déposé ?')) return;
    try {
      setBusy(true);
      await deleteEvaluationSubject(evaluation.id);
      setSubject(null);
      success('Sujet supprimé.');
    } catch (error) { notifyError(error.message || 'Suppression impossible.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    try { await downloadEvaluationSubject(subject.id, subject.original_name || 'sujet-evaluation'); }
    catch (error) { notifyError(error.message || 'Téléchargement impossible.'); }
  };

  if (loading) return <div className="rounded-xl border dark:border-gray-700 p-4 text-gray-500">Chargement du sujet…</div>;

  return (
    <section className="rounded-2xl border dark:border-gray-700 p-5 space-y-4 bg-gray-50/70 dark:bg-gray-900/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 grid place-items-center"><FileCheck2 size={21} /></span>
          <div><h3 className="font-bold text-lg">Sujet de l’évaluation</h3><p className="text-sm text-gray-500">Le fichier est contrôlé par la direction avant sa mise à disposition.</p></div>
        </div>
        {subject?.review_status && <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusCopy[subject.review_status]?.[1] || 'bg-gray-100'}`}>{statusCopy[subject.review_status]?.[0] || subject.review_status}</span>}
      </div>

      {!subject && !isStudent && <p className="text-sm text-gray-500">Aucun sujet déposé pour cette évaluation.</p>}
      {subject && !isStudent && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><strong className="block truncate">{subject.original_name}</strong><small className="text-gray-500">{Math.ceil(Number(subject.size_bytes || 0) / 1024)} Ko · déposé le {new Date(subject.submitted_at).toLocaleString('fr-FR')}</small></div>
          <button type="button" onClick={download} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-gray-700"><Download size={17} /> Télécharger</button>
          {(isDirection || (isTeacher && subject.review_status !== 'approved')) && <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700"><Trash2 size={17} /> Supprimer</button>}
        </div>
      )}

      {isTeacher && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-64"><span className="block text-sm font-semibold mb-1">{subject ? 'Remplacer le sujet' : 'Déposer le sujet'}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] || null)} className="w-full border dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800" /></label>
          <button type="submit" disabled={busy || !file} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"><FileUp size={18} /> {busy ? 'Envoi…' : 'Envoyer à la direction'}</button>
        </form>
      )}

      {isDirection && subject && (
        <div className="space-y-3 border-t dark:border-gray-700 pt-4">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={19} className="text-blue-600" /> Validation de la direction</div>
          <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} rows={2} placeholder="Commentaire de validation ou motif du refus…" className="w-full border dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800" />
          <div className="flex gap-2 justify-end">
            <button type="button" disabled={busy} onClick={() => review('rejected')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-700"><XCircle size={18} /> Refuser</button>
            <button type="button" disabled={busy} onClick={() => review('approved')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white"><CheckCircle2 size={18} /> Valider le sujet</button>
          </div>
        </div>
      )}

      {isStudent && (
        subject?.available ? (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 flex items-center justify-between gap-3">
            <div><strong>Sujet disponible aujourd’hui</strong><p className="text-sm text-gray-600 dark:text-gray-300">Vous pouvez le télécharger uniquement le jour de l’évaluation.</p></div>
            <button type="button" onClick={download} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white"><Download size={18} /> Ouvrir le sujet</button>
          </div>
        ) : <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4"><strong>Sujet protégé</strong><p className="text-sm mt-1">{subject?.message || 'Aucun sujet n’est encore disponible.'} {subject?.release_date ? `Date prévue : ${new Date(subject.release_date).toLocaleDateString('fr-FR')}.` : ''}</p></div>
      )}
    </section>
  );
};

export default EvaluationSubjectPanel;
