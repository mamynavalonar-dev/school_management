import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { getTrashUsers, purgeTrashUser, restoreTrashUser } from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';

const roleName = { admin: 'Administrateur', directeur: 'Directeur', teacher: 'Enseignant', student: 'Étudiant' };

const Trash = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { success, error: notifyError } = useNotifications();

  const load = useCallback(async () => {
    try { setLoading(true); setItems(await getTrashUsers()); }
    catch (error) { notifyError(error.message || 'Impossible de charger la corbeille.'); }
    finally { setLoading(false); }
  }, [notifyError]);

  useEffect(() => { load(); }, [load]);

  const restore = async (item) => {
    if (!window.confirm(`Restaurer le compte de ${item.name} ?`)) return;
    try { await restoreTrashUser(item.id); success('Compte restauré.'); await load(); }
    catch (error) { notifyError(error.message || 'Restauration impossible.'); }
  };

  const purge = async (item) => {
    const confirmation = window.prompt(`Suppression irréversible de « ${item.name} ». Tapez SUPPRIMER pour confirmer.`);
    if (confirmation !== 'SUPPRIMER') return;
    try { await purgeTrashUser(item.id); success('Compte purgé définitivement.'); await load(); }
    catch (error) { notifyError(error.message || 'Purge impossible.'); }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3"><Trash2 className="text-red-600" /> Corbeille</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Les comptes supprimés restent restaurables jusqu’à leur purge définitive.</p></div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-gray-700"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 mb-6 flex gap-3"><ShieldAlert className="text-amber-700 flex-none" /><p className="text-sm text-amber-900 dark:text-amber-100"><strong>Suppression en deux étapes.</strong> « Restaurer » remet le compte en service. « Supprimer définitivement » anonymise irréversiblement les données de connexion et d’identité tout en conservant les identifiants techniques nécessaires aux historiques scolaires, de paie et de messagerie.</p></div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-x-auto">
        <table className="w-full"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="text-left p-4">Compte</th><th className="text-left p-4">Rôle</th><th className="text-left p-4">Supprimé le</th><th className="text-left p-4">Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t dark:border-gray-700"><td className="p-4"><strong className="block">{item.name}</strong><small className="text-gray-500">{item.email}</small></td><td className="p-4">{roleName[item.role] || item.role}</td><td className="p-4">{item.deleted_at ? new Date(item.deleted_at.replace(' ', 'T') + 'Z').toLocaleString('fr-FR') : '—'}</td><td className="p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => restore(item)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 text-green-700"><ArchiveRestore size={17} /> Restaurer</button><button type="button" onClick={() => purge(item)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700"><Trash2 size={17} /> Supprimer définitivement</button></div></td></tr>)}</tbody></table>
        {!loading && items.length === 0 && <p className="p-8 text-center text-gray-500">La corbeille est vide.</p>}
        {loading && <p className="p-8 text-center text-gray-500">Chargement…</p>}
      </div>
    </div>
  );
};

export default Trash;
