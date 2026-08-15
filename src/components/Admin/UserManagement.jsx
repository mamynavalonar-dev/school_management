import React, { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import UserForm from './UserForm';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import {
  getAdminUsers,
  getAdminUser,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from '../../services/api';

const UserManagement = () => {
  const { user: currentUser } = useApp();
  const { success, error: notifyError } = useNotifications();
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch users from API
  // FIX : utilisait fetch() directement sans le header Authorization: Bearer,
  // ce qui pouvait retomber sur un $_SESSION périmé côté PHP (cookie de
  // session non synchronisé avec le token en sessionStorage) et déclencher
  // "Accès refusé - privilèges administrateur ou directeur requis" (403)
  // même pour un compte admin valide. getAdminUsers() (services/api.js)
  // pose déjà ce header via apiRequest/getAuthHeaders().
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUsers(filters);
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Une erreur est survenue pendant le chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load users on mount and when filters change
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);



  // modal-scroll-lock-v4
  useEffect(() => {
    if (!showForm) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [showForm]);  const handleCreate = () => {
    setEditingUser(null);
    setShowForm(true);
  };

  const handleEdit = async (user) => {
    if (currentUser?.role === 'directeur' && ['admin', 'directeur'].includes(user.role)) {
      notifyError("Un directeur ne peut pas modifier un compte administrateur ou directeur.");
      return;
    }
    try {
      const fullUser = await getAdminUser(user.id);
      setEditingUser(fullUser);
      setShowForm(true);
    } catch (err) {
      notifyError(err.message || "Impossible de charger le profil complet de l'utilisateur.");
    }
  };

  const handleDelete = async (targetUser) => {
    if (currentUser?.role !== 'admin') {
      notifyError("Seul un administrateur peut supprimer un compte. Utilisez plutôt le statut « Suspendu ».");
      return;
    }
    if (!window.confirm(`Supprimer le compte de ${targetUser.name} ? Son accès sera révoqué, mais les historiques scolaires et administratifs seront conservés.`)) return;
    try {
      await deleteAdminUser(targetUser.id);
      // Remove from local state
      setUsers(users.filter(user => user.id !== targetUser.id));
      success('Compte supprimé et accès révoqué.');
    } catch (err) {
      console.error('Failed to delete user:', err);
      notifyError(err.message || "Impossible de supprimer l'utilisateur.");
    }
  };

  const handleFormSubmit = async (data) => {
    try {
      const result = editingUser
        ? await updateAdminUser(editingUser.id, data)
        : await createAdminUser(data);

      // Refresh users list
      await loadUsers();
      setShowForm(false);
      setEditingUser(null);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to save user:', err);
      // Erreur métier (ex: email déjà utilisé) ou technique : on la remonte
      // au modal plutôt que de casser toute la page "Gestion des utilisateurs".
      return { success: false, message: err.message || "Impossible d'enregistrer l'utilisateur." };
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Gestion des utilisateurs</h2>
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-200 rounded-lg h-96"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4 text-red-600">Erreur</h2>
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadUsers}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Gestion des utilisateurs
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Nouvel utilisateur
          </button>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <label className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Filtrer par rôle:</label>
            <select
              value={filters.role || ''}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  role: e.target.value || undefined
                }));
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-2xl font-medium"
            >
              <option value="">Tous les rôles</option>
              <option value="student">Étudiant</option>
              <option value="teacher">Enseignant</option>
              <option value="admin">Administrateur</option>
              <option value="directeur">Directeur</option>
            </select>

            <button
              onClick={() => setFilters({})}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* User List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Liste des utilisateurs ({users.length})
          </h2>
        </div>

        {users.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            Aucun utilisateur trouvé
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => (
              <div key={user.id} className="px-2 py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      {user.name ? (
                        user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()
                      ) : (
                        'U'
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                      {user.name || 'Utilisateur sans nom'}
                    </p>
                    <p className="text-xl font-medium text-gray-500 dark:text-gray-400 truncate">
                      @{user.username} · {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xl">
                  {/* Role Badge */}
                  <span
                    className={`px-2 py-1 rounded-full text-2xl font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        : user.role === 'teacher'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : user.role === 'directeur'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}
                  >
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`px-2 py-1 rounded-full text-2xl font-medium ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : user.status === 'suspended'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}
                  >
                    {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                  </span>

                  {/* Actions */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Modifier"
                    >
                      <Pencil size={19} />
                    </button>

                    <button
                      onClick={() => handleDelete(user)}
                      className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-800"
                      title="Supprimer"
                      disabled={currentUser?.role !== 'admin' || String(currentUser?.id) === String(user.id)}
                    >
                      <Trash2 size={22} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Form Modal/Panel */}
      {showForm && createPortal(
<div className="app-modal-layer bg-black/60 backdrop-blur-sm">
          <div className="app-modal-dialog bg-white dark:bg-gray-800 rounded-2xl w-full max-w-6xl shadow-2xl border dark:border-gray-700">
            <div className="app-modal-header flex justify-between items-start px-6 py-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
                {editingUser ? `Modifier l'utilisateur` : 'Nouvel utilisateur'}
              </h2>
              <button
                onClick={handleFormCancel}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label="Fermer"
              >
                <X className="h-10 w-10" strokeWidth={2} />
              </button>
            </div>

            <div className="app-modal-body user-management-modal-body">
              <UserForm user={editingUser} onSubmit={handleFormSubmit} onCancel={handleFormCancel} actorRole={currentUser?.role} actorId={currentUser?.id} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default UserManagement;
