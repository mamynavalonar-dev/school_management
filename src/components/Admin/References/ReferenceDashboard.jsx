import React, { useState } from 'react';
import LevelManagement from './LevelManagement';
import SpecializationManagement from './SpecializationManagement';
import EvaluationTypeManagement from './EvaluationTypeManagement';
import BuildingManagement from './BuildingManagement';
import RoomTypeManagement from './RoomTypeManagement';

const ReferenceDashboard = () => {
  const [activeTab, setActiveTab] = useState('levels');

  const tabs = [
    { id: 'levels', label: 'Niveaux', component: <LevelManagement /> },
    { id: 'specializations', label: 'Spécialisations', component: <SpecializationManagement /> },
    { id: 'evaluationTypes', label: "Types d'évaluation", component: <EvaluationTypeManagement /> },
    { id: 'buildings', label: 'Bâtiments', component: <BuildingManagement /> },
    { id: 'roomTypes', label: 'Types de salles', component: <RoomTypeManagement /> },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Gestion des référentiels</h1>
      <div className="border-b dark:border-gray-700 mb-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        {tabs.find(t => t.id === activeTab)?.component}
      </div>
    </div>
  );
};

export default ReferenceDashboard;
