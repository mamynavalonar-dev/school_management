import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { getAcademicPolicy, reactivateAcademicStudent, saveAcademicPolicy } from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';

const AcademicPolicyPanel = () => {
  const [data, setData] = useState({ policy: null, blocked_students: [], recent_alerts: [] });
  const [form, setForm] = useState({ warning_average_threshold: 10, repeat_min_average: 8, max_warnings_before_action: 3, max_repeat_count: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error: notifyError } = useNotifications();

  const load = async () => {
    try {
      setLoading(true);
      const result = await getAcademicPolicy();
      setData(result || {});
      if (result?.policy) setForm({
        warning_average_threshold: result.policy.warning_average_threshold,
        repeat_min_average: result.policy.repeat_min_average,
        max_warnings_before_action: result.policy.max_warnings_before_action,
        max_repeat_count: result.policy.max_repeat_count,
      });
    } catch (error) { notifyError(error.message || 'Impossible de charger la politique académique.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      await saveAcademicPolicy({
        warning_average_threshold: Number(form.warning_average_threshold),
        repeat_min_average: Number(form.repeat_min_average),
        max_warnings_before_action: Number(form.max_warnings_before_action),
        max_repeat_count: Number(form.max_repeat_count),
      });
      success('Politique académique enregistrée.'); await load();
    } catch (error) { notifyError(error.message || 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  };

  const reactivate = async (student) => {
    if (!window.confirm(`Réactiver le compte de ${student.first_name} ${student.last_name} et remettre ses avertissements actifs à zéro ?`)) return;
    try { await reactivateAcademicStudent(student.student_id); success('Compte réactivé.'); await load(); }
    catch (error) { notifyError(error.message || 'Réactivation impossible.'); }
  };

  if (loading) return <p className="py-8 text-center text-gray-500">Chargement de la politique académique…</p>;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert className="text-red-600" /> Politique de progression et avertissements</h2><p className="text-gray-500 mt-1">Les règles ci-dessous sont appliquées automatiquement lors de la publication d’un bulletin.</p></div><button type="button" onClick={load} className="p-2 rounded-lg border dark:border-gray-700" title="Actualiser"><RefreshCw size={18} /></button></div>

      <form onSubmit={submit} className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 rounded-2xl border dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/30">
        <PolicyField label="Seuil d’avertissement (/20)" hint="Moyenne finale strictement inférieure" type="number" step="0.01" min="0" max="20" value={form.warning_average_threshold} onChange={(value) => setForm({ ...form, warning_average_threshold: value })} />
        <PolicyField label="Note minimale pour redoubler (/20)" hint="En dessous : suspension après les avertissements" type="number" step="0.01" min="0" max="20" value={form.repeat_min_average} onChange={(value) => setForm({ ...form, repeat_min_average: value })} />
        <PolicyField label="Avertissements avant décision" hint="Nombre cumulé avant redoublement/suspension" type="number" min="1" max="20" value={form.max_warnings_before_action} onChange={(value) => setForm({ ...form, max_warnings_before_action: value })} />
        <PolicyField label="Redoublements maximum" hint="Après ce nombre, le compte peut être suspendu" type="number" min="0" max="10" value={form.max_repeat_count} onChange={(value) => setForm({ ...form, max_repeat_count: value })} />
        <div className="md:col-span-2 xl:col-span-4 flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 text-white disabled:opacity-50"><Save size={18} /> {saving ? 'Enregistrement…' : 'Enregistrer les règles'}</button></div>
      </form>

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3"><AlertTriangle className="text-amber-700 flex-none" /><div className="text-sm"><strong>Automatisation</strong><p>À chaque bulletin publié sous le seuil, l’étudiant reçoit un message et une notification. Après le nombre configuré d’avertissements, il est autorisé à redoubler si sa moyenne atteint le minimum et si son quota de redoublements n’est pas épuisé ; sinon son compte est suspendu automatiquement.</p></div></div>

      <section><h3 className="text-xl font-bold mb-3">Comptes bloqués automatiquement</h3><div className="overflow-x-auto rounded-xl border dark:border-gray-700"><table className="w-full"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="text-left p-3">Étudiant</th><th className="text-left p-3">Avertissements</th><th className="text-left p-3">Redoublements</th><th className="text-left p-3">Motif</th><th className="text-left p-3">Action</th></tr></thead><tbody>{(data.blocked_students || []).map((student) => <tr key={student.student_id} className="border-t dark:border-gray-700"><td className="p-3"><strong>{student.first_name} {student.last_name}</strong><small className="block text-gray-500">{student.student_number}</small></td><td className="p-3">{student.warning_count}</td><td className="p-3">{student.repeat_count}</td><td className="p-3 max-w-xl text-sm">{student.block_reason || 'Politique académique'}</td><td className="p-3"><button type="button" onClick={() => reactivate(student)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 text-green-700"><RotateCcw size={17} /> Réactiver</button></td></tr>)}</tbody></table>{!(data.blocked_students || []).length && <p className="p-6 text-center text-gray-500">Aucun compte étudiant bloqué par la politique académique.</p>}</div></section>
    </div>
  );
};

const PolicyField = ({ label, hint, value, onChange, ...props }) => <label><span className="block font-semibold mb-1">{label}</span><input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800" /><small className="text-gray-500">{hint}</small></label>;
export default AcademicPolicyPanel;
