import { useRef, useState } from 'react';
import { Image, Link, Loader2, Upload, X } from 'lucide-react';
import apiService from '../../services/api';

const PhotoPicker = ({ value, onChange, label = 'Photo' }) => {
  const [mode, setMode] = useState(value ? 'url' : 'file');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const chooseButtonRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choisissez une image JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La photo doit peser moins de 5 Mo.');
      return;
    }
    try {
      setUploading(true);
      const response = await apiService.uploadProfilePhoto(file);
      onChange(response?.data?.url || '');
    } catch (err) {
      setError(err.message || "Impossible d'importer la photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFileSelection = async (event) => {
    const input = event.currentTarget;
    const scrollHost = input.closest('.user-unified-form-scroll');
    const previousScrollTop = scrollHost?.scrollTop ?? null;
    await upload(input.files?.[0]);
    requestAnimationFrame(() => {
      if (scrollHost && previousScrollTop !== null) scrollHost.scrollTop = previousScrollTop;
      chooseButtonRef.current?.focus({ preventScroll: true });
    });
  };

  return <section className="rounded-2xl border dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/50 p-4">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="font-bold flex items-center gap-2"><Image size={18} /> {label}</h3>
      {value && <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 text-sm text-red-600"><X size={16} /> Retirer</button>}
    </div>
    <div className="flex gap-2 mb-3" role="tablist" aria-label="Source de la photo">
      <button type="button" onClick={() => setMode('file')} className={`flex-1 inline-flex justify-center items-center gap-2 rounded-xl px-3 py-2 font-semibold ${mode === 'file' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border dark:border-gray-700'}`}><Upload size={17} /> Depuis mon PC</button>
      <button type="button" onClick={() => setMode('url')} className={`flex-1 inline-flex justify-center items-center gap-2 rounded-xl px-3 py-2 font-semibold ${mode === 'url' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border dark:border-gray-700'}`}><Link size={17} /> Adresse web</button>
    </div>
    {value && <div className="flex justify-center mb-3"><img src={value} alt="Aperçu du profil" className="w-28 h-28 rounded-2xl object-cover border-4 border-white dark:border-gray-700 shadow" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></div>}
    {mode === 'file' ? <div className="photo-file-trigger-v4 rounded-xl border-2 border-dashed dark:border-gray-700 p-5 text-center hover:border-blue-500">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1} disabled={uploading} onChange={handleFileSelection} />
      <button ref={chooseButtonRef} type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="w-full disabled:cursor-wait disabled:opacity-70">
        {uploading ? <Loader2 className="animate-spin mx-auto text-blue-600" /> : <Upload className="mx-auto text-gray-400" />}
        <strong className="block mt-2">{uploading ? 'Import en cours…' : 'Choisir une photo'}</strong>
        <small className="text-gray-500">JPG, PNG ou WEBP · 5 Mo maximum</small>
      </button>
    </div> : <label className="block"><span className="block text-sm font-semibold mb-1">URL HTTPS de l’image</span><input type="url" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="https://exemple.com/photo.jpg" className="w-full rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" /></label>}
    {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
  </section>;
};

export default PhotoPicker;
