// src/components/Rooms/Rooms.jsx
// Fichier complet avec les modifications

import { useCallback, useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Building, Users, Settings, Save, CalendarClock, X } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import apiService from '../../services/api';
import { canManageFeature } from '../../utils/permissions';

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAvailability, setFilterAvailability] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [formData, setFormData] = useState({
    number: '', name: '', building: '', floor: 1, capacity: 30,
    room_type: '', equipment: '', is_available: true
  });

  // États pour les référentiels dynamiques
  const [buildings, setBuildings] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);

  // États pour les réservations
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingRoom, setBookingRoom] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    title: '', booking_date: '', start_time: '', end_time: ''
  });

  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();

  const canManageRooms = canManageFeature(user, 'rooms');
  const canBookRooms = canManageFeature(user, 'room-bookings');

  const loadRooms = useCallback(async () => {
    try {
      setLoading(true);
      const roomsRes = await apiService.getRooms();
      setRooms(roomsRes?.data ?? []);

      const [buildingsResult, roomTypesResult] = await Promise.allSettled([
        apiService.getBuildings(),
        apiService.getRoomTypes(),
      ]);
      if (buildingsResult.status === 'fulfilled') setBuildings(buildingsResult.value?.data ?? []);
      if (roomTypesResult.status === 'fulfilled') setRoomTypes(roomTypesResult.value?.data ?? []);
      if (buildingsResult.status === 'rejected' || roomTypesResult.status === 'rejected') {
        notifyError("Certains filtres de salles n'ont pas pu être chargés.");
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
      notifyError('Impossible de charger la liste des salles.');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const filteredRooms = rooms.filter(room =>
    (room.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     room.name?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterBuilding || room.building === filterBuilding) &&
    (!filterType || room.room_type === filterType) &&
    (!filterAvailability || (filterAvailability === 'available' && !!Number(room.is_available)) || (filterAvailability === 'unavailable' && !Number(room.is_available)))
  );

  const resetFormData = useCallback(() => {
    setFormData({
      number: '', name: '', building: buildings.length > 0 ? buildings[0].name : '', floor: 1, capacity: 30,
      room_type: roomTypes.length > 0 ? roomTypes[0].name : '', equipment: '', is_available: true
    });
  }, [buildings, roomTypes]);

  const handleAdd = useCallback(() => {
    setModalType('add');
    setSelectedRoom(null);
    resetFormData();
    setShowModal(true);
  }, [resetFormData]);

  useEffect(() => {
    if (intent?.action === 'add') {
      if (canManageRooms) {
        handleAdd();
      } else {
        notifyError("Vous n'avez pas l'autorisation d'ajouter une salle.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, canManageRooms, handleAdd, notifyError]);

  const handleEdit = (room) => {
    setModalType('edit');
    setSelectedRoom(room);
    setFormData({ ...room, is_available: !!Number(room.is_available) });
    setShowModal(true);
  };

  const handleView = (room) => {
    setModalType('view');
    setSelectedRoom(room);
    setShowModal(true);
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette salle ?')) return;
    try {
      const res = await apiService.deleteRoom(roomId);
      if (res?.success === false) throw new Error(res.message);
      setRooms(prev => prev.filter(room => room.id !== roomId));
      success('Salle supprimée avec succès.');
    } catch (err) {
      console.error('Failed to delete room:', err);
      notifyError(err.message || 'Échec de la suppression de la salle.');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalType === 'add') {
        const res = await apiService.createRoom(formData);
        if (res?.success === false) throw new Error(res.message);
        success('Salle ajoutée avec succès.');
      } else if (modalType === 'edit') {
        const res = await apiService.updateRoom(selectedRoom.id, formData);
        if (res?.success === false) throw new Error(res.message);
        success('Salle modifiée avec succès.');
      }
      setShowModal(false);
      await loadRooms();
    } catch (err) {
      console.error('Failed to save room:', err);
      notifyError(err.message || "Échec de l'enregistrement de la salle.");
    }
  };

  const getRoomTypeColor = (type) => {
    switch (type) {
      case 'Amphithéâtre': return 'bg-purple-100 text-purple-800';
      case 'Salle informatique': return 'bg-blue-100 text-blue-800';
      case 'Laboratoire': return 'bg-green-100 text-green-800';
      case 'Salle de conférence': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const totalCapacity = filteredRooms.reduce((sum, room) => sum + Number(room.capacity || 0), 0);
  const availableRooms = filteredRooms.filter(r => !!Number(r.is_available)).length;

  // Gestion des réservations
  const openBookingModal = async (room) => {
    setBookingRoom(room);
    setBookingForm({ title: '', booking_date: '', start_time: '', end_time: '' });
    setShowBookingModal(true);
    setBookingsLoading(true);
    try {
      const res = await apiService.getRoomBookings(room.id);
      setBookings(res?.data ?? []);
    } catch (err) {
      console.error('Failed to load bookings:', err);
      notifyError('Impossible de charger les réservations de cette salle.');
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleBookingInputChange = (e) => {
    const { name, value } = e.target;
    setBookingForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!bookingForm.title || !bookingForm.booking_date || !bookingForm.start_time || !bookingForm.end_time) {
      notifyError('Merci de remplir tous les champs de la réservation.');
      return;
    }
    try {
      const res = await apiService.createRoomBooking({
        room_id: bookingRoom.id,
        ...bookingForm,
      });
      if (res?.success === false) throw new Error(res.message);
      success('Salle réservée avec succès.');
      setBookingForm({ title: '', booking_date: '', start_time: '', end_time: '' });
      const refreshed = await apiService.getRoomBookings(bookingRoom.id);
      setBookings(refreshed?.data ?? []);
    } catch (err) {
      console.error('Failed to create booking:', err);
      notifyError(err.message || 'Échec de la réservation.');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Annuler cette réservation ?')) return;
    try {
      const res = await apiService.cancelRoomBooking(bookingId);
      if (res?.success === false) throw new Error(res.message);
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      success('Réservation annulée.');
    } catch (err) {
      console.error('Failed to cancel booking:', err);
      notifyError(err.message || "Échec de l'annulation.");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Gestion des Salles</h2>
        <div className="animate-pulse bg-gray-200 rounded-lg h-48"></div>
      </div>
    );
  }

  return (
    <div className="rooms-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Salles</h1>
        <p className="text-gray-600 dark:text-gray-400">Gérez les ressources et leur capacité dans l'établissement</p>
      </div>

      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher par nom ou numéro..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {canManageRooms && (
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"><Plus size={20} />Nouvelle salle</button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterBuilding} onChange={(e) => setFilterBuilding(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
            <option value="">Tous les bâtiments</option>
            {buildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
            <option value="">Tous les types</option>
            {roomTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select value={filterAvailability} onChange={(e) => setFilterAvailability(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
            <option value="">Disponibilité</option>
            <option value="available">Disponible</option>
            <option value="unavailable">Indisponible</option>
          </select>
          <button onClick={() => { setFilterBuilding(''); setFilterType(''); setFilterAvailability(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 px-3 py-2">Réinitialiser</button>
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Salles</h3><p className="text-3xl font-bold text-blue-600">{filteredRooms.length}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Disponibles</h3><p className="text-3xl font-bold text-green-600">{availableRooms}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Capacité Totale</h3><p className="text-3xl font-bold text-purple-600">{totalCapacity}</p></div>
      </div>

      <div className="rooms-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRooms.map(room => (
          <div key={room.id} className="room-card bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div><h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">{room.name}</h3><p className="text-sm text-gray-500 font-medium">{room.number}</p></div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoomTypeColor(room.room_type)}`}>{room.room_type}</span>
              </div>
              <div className="room-info space-y-2 mb-4">
                <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400"><Building size={16} className="mr-2 text-blue-500" />{room.building} - Étage {room.floor}</div>
                <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400"><Users size={16} className="mr-2 text-green-500" />Capacité: {room.capacity} places</div>
                <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400"><Settings size={16} className="mr-2 text-purple-500" />{Number(room.is_available) ? 'Disponible' : 'Indisponible'}</div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                <div className="flex space-x-1">
                  <button onClick={() => handleView(room)} className="text-blue-600 hover:text-blue-800 p-2 rounded-lg" title="Voir"><Eye size={18} /></button>
                  {canManageRooms && (
                    <>
                      <button onClick={() => handleEdit(room)} className="text-green-600 hover:text-green-800 p-2 rounded-lg" title="Modifier"><Edit size={18} /></button>
                      <button onClick={() => handleDelete(room.id)} className="text-red-600 hover:text-red-800 p-2 rounded-lg" title="Supprimer"><Trash2 size={18} /></button>
                    </>
                  )}
                </div>
                {canBookRooms && (
                  <button onClick={() => openBookingModal(room)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium" title="Réserver un créneau">
                    <CalendarClock size={16} /> Réserver
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Ajout/Modification/Détails */}
      {showModal && (
        <div className="modal-overlay app-modal-layer bg-black bg-opacity-50">
          <div className="modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {modalType === 'add' && 'Nouvelle Salle'}
              {modalType === 'edit' && 'Modifier la Salle'}
              {modalType === 'view' && `Détails de la Salle : ${selectedRoom?.name}`}
            </h2>

            {modalType === 'view' && selectedRoom && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div><label className="block text-sm font-medium text-gray-500">Numéro</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.number}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Nom</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.name}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Bâtiment</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.building}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Étage</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.floor}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Capacité</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.capacity} places</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Type</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.room_type}</p></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-500">Équipements</label><p className="text-base text-gray-900 dark:text-gray-100">{selectedRoom.equipment || 'Non spécifié'}</p></div>
                <div><label className="block text-sm font-medium text-gray-500">Disponibilité</label><p className={`text-base font-semibold ${Number(selectedRoom.is_available) ? 'text-green-600' : 'text-red-600'}`}>{Number(selectedRoom.is_available) ? 'Disponible' : 'Indisponible'}</p></div>
                <div className="flex justify-end pt-4 mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">Fermer</button>
                </div>
              </div>
            )}

            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro</label><input type="text" name="number" value={formData.number} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bâtiment</label>
                    <select name="building" value={formData.building} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner</option>
                      {buildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Étage</label><input type="number" name="floor" value={formData.floor} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacité</label><input type="number" name="capacity" value={formData.capacity} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de salle</label>
                    <select name="room_type" value={formData.room_type} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner</option>
                      {roomTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Équipements</label><textarea name="equipment" value={formData.equipment} onChange={handleInputChange} placeholder="Ex: Projecteur, Tableau interactif..." rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                <div className="flex items-center"><input type="checkbox" name="is_available" checked={formData.is_available} onChange={handleInputChange} className="h-4 w-4 rounded" /><label className="ml-2 text-sm text-gray-700 dark:text-gray-300">Disponible</label></div>
                <div className="flex justify-end pt-4 border-t dark:border-gray-700 space-x-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Fermer</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={18} /> {modalType === 'add' ? 'Ajouter' : 'Sauvegarder'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Réservations */}
      {showBookingModal && bookingRoom && (
        <div className="modal-overlay app-modal-layer bg-black bg-opacity-50">
          <div className="modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Réservations — {bookingRoom.name}</h2>
              <button onClick={() => setShowBookingModal(false)} className="text-gray-500 hover:text-gray-700"><X size={22} /></button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-4 mb-6 pb-6 border-b dark:border-gray-700">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titre</label><input type="text" name="title" value={bookingForm.title} onChange={handleBookingInputChange} placeholder="Ex: Réunion pédagogique" required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label><input type="date" name="booking_date" value={bookingForm.booking_date} onChange={handleBookingInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Début</label><input type="time" name="start_time" value={bookingForm.start_time} onChange={handleBookingInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fin</label><input type="time" name="end_time" value={bookingForm.end_time} onChange={handleBookingInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
              </div>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                <CalendarClock size={18} /> Réserver ce créneau
              </button>
            </form>

            <h3 className="text-lg font-semibold mb-3">Réservations à venir</h3>
            {bookingsLoading ? (
              <div className="animate-pulse bg-gray-200 rounded-lg h-24"></div>
            ) : bookings.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">Aucune réservation à venir pour cette salle.</p>
            ) : (
              <div className="space-y-2">
                {bookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{b.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(b.booking_date).toLocaleDateString()} · {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)} · {b.booked_by_name}
                      </p>
                    </div>
                    <button onClick={() => handleCancelBooking(b.id)} className="text-red-600 hover:text-red-800 p-2 rounded-lg" title="Annuler"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
