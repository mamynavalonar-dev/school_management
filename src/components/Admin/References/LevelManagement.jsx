import React, { useCallback, useState, useEffect } from 'react';
import apiService from '../../../services/api';
import { useNotifications } from '../../../hooks/useNotifications';

const LevelManagement = () => {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(30);
  const { success, error } = useNotifications();

  const load = useCallback(async () => {
    try {
      const res = await apiService.getLevels();
      setItems(res.data || []);
    } catch (err) {
      error('Erreur de chargement des niveaux');
    }
  }, [error]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      error('Le nom est requis');
      return;
    }
    try {
      if (editing) {
        await apiService.updateLevel(editing.id, { name: name.trim(), capacity });
        success('Niveau modifié');
      } else {
        await apiService.createLevel({ name: name.trim(), capacity });
        success('Niveau ajouté');
      }
      setShowModal(false);
      load();
    } catch (err) {
      error(err.message || 'Erreur');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce niveau ?')) return;
    try {
      await apiService.deleteLevel(id);
      success('Niveau supprimé');
      load();
    } catch (err) {
      error(err.message || 'Erreur');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Gestion des niveaux</h2>
        <button
          onClick={() => { setEditing(null); setName(''); setCapacity(30); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Ajouter un niveau
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Capacité</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t dark:border-gray-700">
                <td className="p-3">{item.name}</td>
                <td className="p-3">{item.capacity}</td>
                <td className="p-3">
                  <button
                    onClick={() => { setEditing(item); setName(item.name); setCapacity(item.capacity); setShowModal(true); }}
                    className="text-blue-600 hover:text-blue-800 mr-3"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <div className="p-6 text-center text-gray-500">Aucun niveau</div>
        )}
      </div>

      {showModal && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{editing ? 'Modifier' : 'Ajouter'} un niveau</h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Capacité</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={e => setCapacity(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  min="1"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LevelManagement;
