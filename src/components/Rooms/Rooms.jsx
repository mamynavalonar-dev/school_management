import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Building, Users, Settings, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications'; // Importation ajoutÃ©e

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAvailability, setFilterAvailability] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [formData, setFormData] = useState({
    number: '', name: '', building: '', floor: 1, capacity: 30,
    room_type: 'Classroom', equipment: '', is_available: true
  });
  const { intent, clearIntent } = useUi();
  const { success } = useNotifications(); // Hook ajoutÃ© pour les notifications

  useEffect(() => {
    if (intent?.action === 'add') {
      handleAdd();
      clearIntent();
    }
  }, [intent, clearIntent]);

  const roomTypes = [
    { value: 'Classroom', label: 'Salle de cours' }, { value: 'Laboratory', label: 'Laboratoire' },
    { value: 'Amphitheater', label: 'AmphithÃ©Ã¢tre' }, { value: 'Conference', label: 'Salle de confÃ©rence' },
    { value: 'Computer', label: 'Salle informatique' }
  ];
  const buildings = ['BÃ¢timent A', 'BÃ¢timent B', 'BÃ¢timent C', 'BÃ¢timent D'];

  useEffect(() => {
    const mockRooms = [
      { id: 1, number: 'A101', name: 'AmphithÃ©Ã¢tre Principal', building: 'BÃ¢timent A', floor: 1, capacity: 150, room_type: 'Amphitheater', equipment: 'Projecteur 4K, SystÃ¨me audio, Microphones, Tableau interactif', is_available: true, current_usage: null, next_booking: 'Analyse NumÃ©rique - 14:00', utilization_rate: 85, maintenance_date: '2024-10-15' },
      { id: 2, number: 'B201', name: 'Salle Informatique 1', building: 'BÃ¢timent B', floor: 2, capacity: 30, room_type: 'Computer', equipment: '30 PC, Projecteur, Tableau blanc, Climatisation', is_available: false, current_usage: 'Programmation Web - L3 Info', next_booking: 'Bases de DonnÃ©es - 16:00', utilization_rate: 92, maintenance_date: '2024-09-30' }
    ];
    setRooms(mockRooms);
  }, []);

  const filteredRooms = rooms.filter(room =>
    (room.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
     room.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterBuilding || room.building === filterBuilding) &&
    (!filterType || room.room_type === filterType) &&
    (!filterAvailability || (filterAvailability === 'available' && room.is_available) || (filterAvailability === 'unavailable' && !room.is_available))
  );

  const resetFormData = () => {
    setFormData({
        number: '', name: '', building: 'BÃ¢timent A', floor: 1, capacity: 30,
        room_type: 'Classroom', equipment: '', is_available: true
    });
  };

  const handleAdd = () => {
    setModalType('add');
    setSelectedRoom(null);
    resetFormData();
    setShowModal(true);
  };

  const handleEdit = (room) => {
      setModalType('edit');
      setSelectedRoom(room);
      setFormData(room);
      setShowModal(true);
  };

  const handleView = (room) => {
      setModalType('view');
      setSelectedRoom(room);
      setShowModal(true);
  };
  
  // Fonction de suppression ajoutÃ©e
  const handleDelete = (roomId) => {
      if (window.confirm('ÃŠtes-vous sÃ»r de vouloir supprimer cette salle ?')) {
          setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
          success('Salle supprimÃ©e avec succÃ¨s.');
      }
  };


  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
      e.preventDefault();
      if (modalType === 'add') {
        const newRoom = {
          id: Math.max(...rooms.map(r => r.id), 0) + 1,
          ...formData,
          current_usage: null,
          next_booking: null,
          utilization_rate: 0,
          maintenance_date: new Date().toISOString().split('T')[0]
        };
        setRooms(prev => [...prev, newRoom]);
        success('Salle ajoutÃ©e avec succÃ¨s.');
      } else if (modalType === 'edit') {
        setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, ...formData } : r));
        success('Salle modifiÃ©e avec succÃ¨s.');
      }
      setShowModal(false);
  };

  const getRoomTypeColor = (type) => {
    switch (type) {
      case 'Amphitheater': return 'bg-purple-100 text-purple-800';
      case 'Computer': return 'bg-blue-100 text-blue-800';
      case 'Laboratory': return 'bg-green-100 text-green-800';
      case 'Conference': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const getUtilizationColor = (rate) => {
    if (rate >= 90) return 'text-red-600';
    if (rate >= 75) return 'text-orange-600';
    return 'text-green-600';
  };
  
  const totalCapacity = filteredRooms.reduce((sum, room) => sum + room.capacity, 0);
  const availableRooms = filteredRooms.filter(r => r.is_available).length;
  const averageUtilization = filteredRooms.length > 0 ?
    filteredRooms.reduce((sum, room) => sum + room.utilization_rate, 0) / filteredRooms.length : 0;

  return (
    <div className="rooms-container p-6 animate-fade-in">
       <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Salles</h1>
        <p className="text-gray-600 dark:text-gray-400">GÃ©rez les ressources et leur capacitÃ© dans l'Ã©tablissement</p>
      </div>

       <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher par nom ou numÃ©ro..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"><Plus size={20} />Nouvelle salle</button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterBuilding} onChange={(e) => setFilterBuilding(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-base"><option value="">Tous les bÃ¢timents</option>{buildings.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-base"><option value="">Tous les types</option>{roomTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <select value={filterAvailability} onChange={(e) => setFilterAvailability(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-base"><option value="">DisponibilitÃ©</option><option value="available">Disponible</option><option value="unavailable">Indisponible</option></select>
          <button onClick={() => { setFilterBuilding(''); setFilterType(''); setFilterAvailability(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 text-base px-3 py-2">RÃ©initialiser</button>
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Total Salles</h3><p className="text-3xl font-bold text-blue-600">{filteredRooms.length}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Disponibles</h3><p className="text-3xl font-bold text-green-600">{availableRooms}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">CapacitÃ© Totale</h3><p className="text-3xl font-bold text-purple-600">{totalCapacity}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Utilisation Moy.</h3><p className={`text-3xl font-bold ${getUtilizationColor(averageUtilization)}`}>{averageUtilization.toFixed(0)}%</p></div>
      </div>
      
      <div className="rooms-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRooms.map(room => (
          <div key={room.id} className="room-card bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div><h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">{room.name}</h3><p className="text-base text-gray-500 font-mono">{room.number}</p></div>
                <span className={`px-2 py-1 rounded-full text-base ${getRoomTypeColor(room.room_type)}`}>{room.room_type}</span>
              </div>
              <div className="room-info space-y-2 mb-4">
                 <div className="flex items-center text-base text-gray-600 dark:text-gray-400"><Building size={18} className="mr-2 text-blue-500" />{room.building} - Ã‰tage {room.floor}</div>
                 <div className="flex items-center text-base text-gray-600 dark:text-gray-400"><Users size={18} className="mr-2 text-green-500" />CapacitÃ©: {room.capacity} places</div>
                 <div className="flex items-center text-base text-gray-600 dark:text-gray-400"><Settings size={18} className="mr-2 text-purple-500" />Utilisation: <span className={getUtilizationColor(room.utilization_rate)}>{room.utilization_rate}%</span></div>
              </div>
              <div className="flex items-center justify-between pt-4 border dark:border-gray-700-t">
                <div><p className="text-base text-gray-500">Maintenance</p><p className="text-lg font-medium text-gray-700 dark:text-gray-300">{new Date(room.maintenance_date).toLocaleDateString()}</p></div>
                <div className="flex space-x-1">
                    <button onClick={() => handleView(room)} className="text-blue-600 hover:text-blue-800 p-2 rounded-lg" title="Voir"><Eye size={18} /></button>
                    <button onClick={() => handleEdit(room)} className="text-green-600 hover:text-green-800 p-2 rounded-lg" title="Modifier"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(room.id)} className="text-red-600 hover:text-red-800 p-2 rounded-lg" title="Supprimer"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

       {showModal && (
        <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {modalType === 'add' && 'Nouvelle Salle'}
              {modalType === 'edit' && 'Modifier la Salle'}
              {modalType === 'view' && `DÃ©tails de la Salle : ${selectedRoom.name}`}
            </h2>

            {/* BLOC POUR VOIR LES DÃ‰TAILS (CORRIGÃ‰) */}
            {modalType === 'view' && selectedRoom && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div><label className="block text-sm font-medium text-gray-500">NumÃ©ro</label><p className="text-base text-gray-900">{selectedRoom.number}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Nom</label><p className="text-base text-gray-900">{selectedRoom.name}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">BÃ¢timent</label><p className="text-base text-gray-900">{selectedRoom.building}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Ã‰tage</label><p className="text-base text-gray-900">{selectedRoom.floor}</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">CapacitÃ©</label><p className="text-base text-gray-900">{selectedRoom.capacity} places</p></div>
                  <div><label className="block text-sm font-medium text-gray-500">Type</label><p className="text-base text-gray-900">{selectedRoom.room_type}</p></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-500">Ã‰quipements</label><p className="text-base text-gray-900">{selectedRoom.equipment || 'Non spÃ©cifiÃ©'}</p></div>
                <div><label className="block text-sm font-medium text-gray-500">DisponibilitÃ©</label><p className={`text-base font-semibold ${selectedRoom.is_available ? 'text-green-600' : 'text-red-600'}`}>{selectedRoom.is_available ? 'Disponible' : 'Indisponible'}</p></div>
                <div className="flex justify-end pt-4 border dark:border-gray-700-t mt-6">
                   <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">Fermer</button>
                </div>
              </div>
            )}
            
            {/* BLOC POUR AJOUTER/MODIFIER (EXISTANT) */}
            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">NumÃ©ro</label><input type="text" name="number" value={formData.number} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">BÃ¢timent</label><select name="building" value={formData.building} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"><option value="">SÃ©lectionner</option>{buildings.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Ã‰tage</label><input type="number" name="floor" value={formData.floor} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">CapacitÃ©</label><input type="number" name="capacity" value={formData.capacity} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                      <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Type de salle</label><select name="room_type" value={formData.room_type} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"><option value="">SÃ©lectionner</option>{roomTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  </div>
                  <div><label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Ã‰quipements</label><textarea name="equipment" value={formData.equipment} onChange={handleInputChange} placeholder="Ex: Projecteur, Tableau interactif..." rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"></textarea></div>
                  <div className="flex items-center"><input type="checkbox" name="is_available" checked={formData.is_available} onChange={handleInputChange} className="h-4 w-4 rounded" /><label className="ml-2 text-base text-gray-700 dark:text-gray-300">Disponible</label></div>
                  <div className="flex justify-end pt-4 border dark:border-gray-700-t space-x-3">
                     <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">Fermer</button>
                     <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                         <Save size={18} /> {modalType === 'add' ? 'Ajouter' : 'Sauvegarder'}
                     </button>
                  </div>
              </form>
            )}
          </div>
        </div>
       )}
    </div>
  );
};

export default Rooms;
