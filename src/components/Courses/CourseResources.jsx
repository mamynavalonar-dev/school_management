import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileText, ShieldCheck, Trash2, Upload, Users, X, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import apiService, {
  downloadCourseResource,
  getCourseResourceAccessRoster,
  reviewCourseResource,
  setCourseResourceAccessOverride,
  uploadCourseResource,
} from '../../services/api';
import { canManageFeature } from '../../utils/permissions';

const typeLabel = { lesson: 'Leçon', exercise: 'Exercice', other: 'Autre' };
const statusLabel = {
  pending: ['En attente', 'bg-amber-100 text-amber-800'],
  approved: ['Validé', 'bg-green-100 text-green-800'],
  rejected: ['Refusé', 'bg-red-100 text-red-800'],
};

const CourseResources = ({ courseId, courseName, onClose }) => {
  const [resources, setResources] = useState([]);
  const [access, setAccess] = useState(null);
  const [roster, setRoster] = useState([]);
  const [showRoster, setShowRoster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [resourceType, setResourceType] = useState('lesson');
  const [file, setFile] = useState(null);
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const isTeacher = user?.role === 'teacher' && canManageFeature(user, 'courses');
  const isDirection = ['admin', 'directeur'].includes(user?.role);

  const loadResources = async () => {
    try {
      setLoading(true); setBlockedMessage('');
      const res = await apiService.getCourseResources(courseId);
      const payload = res?.data ?? res;
      if (Array.isArray(payload)) { setResources(payload); setAccess(null); }
      else { setResources(payload?.resources ?? []); setAccess(payload?.access ?? null); }
    } catch (error) {
      setResources([]);
      setBlockedMessage(error.message || 'Impossible de charger les documents de ce cours.');
    } finally { setLoading(false); }
  };

  const loadRoster = async () => {
    try { setRoster(await getCourseResourceAccessRoster(courseId)); setShowRoster(true); }
    catch (error) { notifyError(error.message || 'Impossible de charger le suivi des accès.'); }
  };

  useEffect(() => { if (courseId) loadResources(); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!title.trim() || !file) return notifyError('Choisissez un fichier et indiquez un titre.');
    try {
      setUploading(true);
      await uploadCourseResource(courseId, title.trim(), file, resourceType);
      setTitle(''); setFile(null); setResourceType('lesson');
      success('Document envoyé à la direction pour validation.');
      await loadResources();
    } catch (error) { notifyError(error.message || 'Échec du dépôt du document.'); }
    finally { setUploading(false); }
  };

  const handleDownload = async (resource) => {
    try { await downloadCourseResource(resource.id, resource.original_name || resource.title || 'document'); }
    catch (error) { notifyError(error.message || 'Téléchargement impossible.'); }
  };

  const handleDelete = async (resource) => {
    if (!window.confirm(`Supprimer « ${resource.title} » ?`)) return;
    try { await apiService.deleteCourseResource(resource.id); success('Document supprimé.'); await loadResources(); }
    catch (error) { notifyError(error.message || 'Suppression impossible.'); }
  };

  const handleReview = async (resource, status) => {
    const note = status === 'rejected' ? (window.prompt('Motif du refus (facultatif) :', resource.review_note || '') || '') : '';
    try { await reviewCourseResource(resource.id, status, note); success(status === 'approved' ? 'Document validé.' : 'Document refusé.'); await loadResources(); }
    catch (error) { notifyError(error.message || 'Décision impossible.'); }
  };

  const toggleOverride = async (student) => {
    const grant = !Number(student.override_allowed);
    let reason = '';
    if (grant) reason = window.prompt('Motif de la dérogation d’accès :', 'Autorisation exceptionnelle de la direction') || '';
    try {
      await setCourseResourceAccessOverride({ studentId: student.student_id, courseId, isAllowed: grant, reason });
      success(grant ? 'Dérogation accordée.' : 'Dérogation retirée.');
      await loadRoster();
    } catch (error) { notifyError(error.message || 'Impossible de modifier la dérogation.'); }
  };

  return (
    <section className="rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <header className="p-5 border-b dark:border-gray-700 flex items-start justify-between gap-4">
        <div><h3 className="text-xl font-bold flex items-center gap-2"><FileText size={21} /> Documents pédagogiques</h3><p className="text-sm text-gray-500">{courseName || 'Cours'} · leçons et exercices contrôlés par la direction</p></div>
        {onClose && <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Fermer"><X size={20} /></button>}
      </header>

      <div className="p-5 space-y-5">
        {isTeacher && (
          <form onSubmit={handleUpload} className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 grid md:grid-cols-[1fr_12rem] gap-3">
            <div><label className="block text-sm font-semibold mb-1">Titre</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Chapitre 4 — Intégrales" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800" /></div>
            <div><label className="block text-sm font-semibold mb-1">Type</label><select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800"><option value="lesson">Leçon</option><option value="exercise">Exercice</option><option value="other">Autre</option></select></div>
            <div className="md:col-span-2 flex flex-wrap items-end gap-3"><label className="flex-1 min-w-64"><span className="block text-sm font-semibold mb-1">Fichier</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800" /></label><button type="submit" disabled={uploading || !file || !title.trim()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"><Upload size={18} /> {uploading ? 'Envoi…' : 'Déposer'}</button></div>
            <p className="md:col-span-2 text-xs text-blue-800 dark:text-blue-200">Chaque nouveau document reste invisible aux étudiants jusqu’à validation par la direction.</p>
          </form>
        )}

        {isDirection && (
          <div className="flex justify-end"><button type="button" onClick={showRoster ? () => setShowRoster(false) : loadRoster} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-700"><Users size={18} /> {showRoster ? 'Masquer le suivi des accès' : 'Suivi droits / écolage'}</button></div>
        )}

        {showRoster && isDirection && (
          <div className="rounded-xl border dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="text-left p-3">Étudiant</th><th className="text-left p-3">Paiement</th><th className="text-left p-3">Accès</th><th className="text-left p-3">Dérogation</th></tr></thead><tbody>{roster.map((student) => <tr key={student.student_id} className="border-t dark:border-gray-700"><td className="p-3"><strong>{student.first_name} {student.last_name}</strong><small className="block text-gray-500">{student.student_number}</small></td><td className="p-3">{student.fee_status}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${student.access_allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{student.access_allowed ? 'Autorisé' : 'Bloqué'}</span></td><td className="p-3"><button type="button" onClick={() => toggleOverride(student)} className={`px-3 py-1.5 rounded-lg border ${Number(student.override_allowed) ? 'border-red-200 text-red-700' : 'border-blue-200 text-blue-700'}`}>{Number(student.override_allowed) ? 'Retirer la dérogation' : 'Autoriser exceptionnellement'}</button></td></tr>)}</tbody></table>
            {roster.length === 0 && <p className="p-4 text-gray-500">Aucun étudiant inscrit à ce cours.</p>}
          </div>
        )}

        {access && <div className={`rounded-xl border p-3 text-sm ${access.allowed ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-red-200 bg-red-50 dark:bg-red-950/20'}`}><strong>{access.allowed ? 'Accès pédagogique autorisé' : 'Accès pédagogique bloqué'}</strong><p>{access.reason}</p></div>}
        {blockedMessage && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-red-800 dark:text-red-200"><strong>Documents indisponibles</strong><p className="mt-1 text-sm">{blockedMessage}</p></div>}

        {loading ? <p className="text-gray-500 py-4">Chargement des documents…</p> : resources.length === 0 ? <p className="text-gray-500 py-4">Aucun document disponible.</p> : (
          <div className="space-y-2">{resources.map((resource) => {
            const badge = statusLabel[resource.review_status] || statusLabel.pending;
            return <article key={resource.id} className="rounded-xl border dark:border-gray-700 p-4 flex flex-wrap items-center gap-3"><span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 grid place-items-center"><FileText size={20} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{resource.title}</strong><span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">{typeLabel[resource.resource_type] || 'Document'}</span>{user?.role !== 'student' && <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge[1]}`}>{badge[0]}</span>}</div><small className="text-gray-500">{resource.original_name} · {Math.ceil(Number(resource.size_bytes || 0) / 1024)} Ko{resource.teacher_name ? ` · ${resource.teacher_name}` : ''}</small>{resource.review_note && <p className="text-xs text-red-600 mt-1">Direction : {resource.review_note}</p>}</div><button type="button" onClick={() => handleDownload(resource)} className="p-2 rounded-lg text-blue-700 hover:bg-blue-50" title="Télécharger"><Download size={19} /></button>{isDirection && resource.review_status !== 'approved' && <button type="button" onClick={() => handleReview(resource, 'approved')} className="p-2 rounded-lg text-green-700 hover:bg-green-50" title="Valider"><CheckCircle2 size={19} /></button>}{isDirection && resource.review_status !== 'rejected' && <button type="button" onClick={() => handleReview(resource, 'rejected')} className="p-2 rounded-lg text-red-700 hover:bg-red-50" title="Refuser"><XCircle size={19} /></button>}{(isTeacher || isDirection) && <button type="button" onClick={() => handleDelete(resource)} className="p-2 rounded-lg text-red-700 hover:bg-red-50" title="Supprimer"><Trash2 size={19} /></button>}</article>;
          })}</div>
        )}

        {isDirection && <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 text-xs text-gray-600 dark:text-gray-300 flex gap-2"><ShieldCheck size={17} className="flex-none" /> Les étudiants ne reçoivent que les documents validés. L’accès est automatique si le compte de frais est « Paid » ou « Exempt », sinon une dérogation de la direction est nécessaire.</div>}
      </div>
    </section>
  );
};

export default CourseResources;
