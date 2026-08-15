import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, GraduationCap, ShieldCheck, User } from 'lucide-react';
import PhotoPicker from '../shared/PhotoPicker';

const FEATURES = [
  ['students', 'Étudiants'], ['teachers', 'Enseignants'], ['courses', 'Cours et matières'],
  ['rooms', 'Salles'], ['room-bookings', 'Réservations de salles'], ['planning', 'Planification'], ['evaluations', 'Évaluations'],
  ['grades', 'Notes et bulletins'], ['absences', 'Absences'],
  ['school-operations', 'Scolarité'], ['messaging', 'Messagerie'],
];

const emptyProfile = {
  first_name: '', last_name: '', phone: '', birth_date: '', birth_place: '', gender: '',
  nationality: '', profession: '', diploma: '', hire_date: '', department: '', title: '',
  specialization: '', city: '', postal_code: '', salary: '', contract_type: '',
  contract_start_date: '', contract_end_date: '', address: '', photo_url: '',
  emergency_contact_name: '', emergency_contact_phone: '', status: 'active',
};

const permissionDefaults = (role) => Object.fromEntries(FEATURES.map(([key]) => {
  const teacherView = ['students', 'teachers', 'courses', 'rooms', 'room-bookings', 'planning', 'evaluations', 'grades', 'absences', 'school-operations', 'messaging'];
  const teacherManage = ['courses', 'room-bookings', 'evaluations', 'grades', 'absences', 'school-operations', 'messaging'];
  const studentView = ['courses', 'rooms', 'room-bookings', 'planning', 'evaluations', 'grades', 'absences', 'messaging'];
  const studentManage = ['messaging'];
  return [key, {
    view: role === 'teacher' ? teacherView.includes(key) : studentView.includes(key),
    manage: role === 'teacher' ? teacherManage.includes(key) : studentManage.includes(key),
  }];
}));

const UserForm = ({ user, onSubmit, onCancel, actorRole = 'admin', actorId = null }) => {
  const [formData, setFormData] = useState({
    name: '', username: '', email: '', password: '', confirmPassword: '', role: 'student', status: 'active',
    profile: { ...emptyProfile }, permissions: permissionDefaults('student'),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isEditMode = Boolean(user);
  const isOwnAccount = isEditMode && String(actorId) === String(user?.id);
  const hasRoleProfile = ['student', 'teacher'].includes(formData.role);

  useEffect(() => {
    if (!user) return;
    setFormData({
      name: user.name || '', username: user.username || '', email: user.email || '', password: '', confirmPassword: '',
      role: user.role || 'student', status: user.status || 'active',
      profile: { ...emptyProfile, ...(user.profile || {}) },
      permissions: user.permissions || permissionDefaults(user.role || 'student'),
    });
  }, [user]);

  const identityName = useMemo(() => {
    if (!hasRoleProfile) return formData.name.trim();
    return `${formData.profile.first_name} ${formData.profile.last_name}`.trim();
  }, [formData.name, formData.profile.first_name, formData.profile.last_name, hasRoleProfile]);

  const update = (name, value) => setFormData((current) => ({ ...current, [name]: value }));
  const updateProfile = (name, value) => setFormData((current) => ({
    ...current, profile: { ...current.profile, [name]: value },
  }));
  const changeRole = (role) => setFormData((current) => ({
    ...current, role, permissions: ['student', 'teacher'].includes(role) ? permissionDefaults(role) : {},
  }));
  const updatePermission = (key, field, checked) => setFormData((current) => {
    const previous = current.permissions[key] || { view: false, manage: false };
    const next = field === 'view'
      ? { view: checked, manage: checked ? previous.manage : false }
      : { view: checked || previous.view, manage: checked };
    return { ...current, permissions: { ...current.permissions, [key]: next } };
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!identityName) return setError('Le nom complet est requis.');
    const normalizedUsername = formData.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(normalizedUsername)) return setError("Le nom d'utilisateur doit contenir 3 à 50 caractères : lettres, chiffres, point, tiret ou underscore.");
    if (!/^\S+@\S+\.\S+$/.test(formData.email)) return setError("L'adresse e-mail est invalide.");
    if (!isEditMode && formData.password.length < 12) return setError('Le mot de passe doit contenir au moins 12 caractères.');
    if (formData.password && formData.password.length < 12) return setError('Le mot de passe doit contenir au moins 12 caractères.');
    if (formData.password !== formData.confirmPassword) return setError('Les mots de passe ne correspondent pas.');
    if (hasRoleProfile && (!formData.profile.first_name.trim() || !formData.profile.last_name.trim())) return setError('Le prénom et le nom du profil sont requis.');
    if (formData.profile.contract_end_date && formData.profile.contract_start_date && formData.profile.contract_end_date < formData.profile.contract_start_date) return setError('La fin du contrat ne peut pas précéder son début.');
    setLoading(true);
    try {
      const payload = { ...formData };
      delete payload.confirmPassword;
      payload.name = identityName;
      payload.username = normalizedUsername;
      if (!payload.password) delete payload.password;
      const result = await onSubmit(payload);
      if (!result?.success) throw new Error(result?.message || "L'enregistrement a échoué.");
      onCancel();
    } catch (submitError) {
      setError(submitError.message || "L'enregistrement a échoué.");
    } finally {
      setLoading(false);
    }
  };

  return <form onSubmit={handleSubmit} className="user-unified-form">
    <div className="user-unified-form-scroll space-y-5 px-6 py-5">
    <section className="rounded-2xl border dark:border-gray-700 p-5">
      <div className="flex items-center gap-3 mb-4"><User className="text-blue-600" /><div><h3 className="text-xl font-bold">Compte et rôle</h3><p className="text-gray-500">Le compte et son profil métier seront enregistrés en une seule opération.</p></div></div>
      <div className="grid md:grid-cols-2 gap-4">
        {!hasRoleProfile && <Input label="Nom complet *" value={formData.name} onChange={(value) => update('name', value)} />}
        {!hasRoleProfile && <Input label="Email *" type="email" value={formData.email} onChange={(value) => update('email', value)} />}
        <Input label="Nom d'utilisateur *" value={formData.username} onChange={(value) => update('username', value)} placeholder="ex. miles.morales" />
        <PasswordInput label={isEditMode ? 'Nouveau mot de passe' : 'Mot de passe *'} value={formData.password} onChange={(value) => update('password', value)} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
        <PasswordInput label="Confirmer le mot de passe" value={formData.confirmPassword} onChange={(value) => update('confirmPassword', value)} visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} />
        <Select label="Rôle" value={formData.role} onChange={changeRole} disabled={isOwnAccount || (actorRole === 'directeur' && ['admin', 'directeur'].includes(user?.role))} options={[...(actorRole === 'admin' ? [['admin', 'Administrateur'], ['directeur', 'Directeur']] : []), ['teacher', 'Enseignant'], ['student', 'Étudiant / Élève']]} />
        <Select label="Statut du compte" value={formData.status} onChange={(value) => update('status', value)} disabled={isOwnAccount} options={[["active", "Actif"], ["suspended", "Suspendu"], ["inactive", "Inactif"]]} />
        {isOwnAccount && <p className="md:col-span-2 text-sm text-amber-700 dark:text-amber-300">Pour éviter de verrouiller votre session, votre propre rôle et votre statut ne peuvent pas être modifiés ici.</p>}
      </div>
    </section>

    {formData.role === 'teacher' && <TeacherProfile profile={formData.profile} update={updateProfile} email={formData.email} updateEmail={(value) => update('email', value)} />}
    {formData.role === 'student' && <StudentProfile profile={formData.profile} update={updateProfile} email={formData.email} updateEmail={(value) => update('email', value)} />}

    {hasRoleProfile && <section className="rounded-2xl border dark:border-gray-700 p-5">
      <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-purple-600" /><div><h3 className="text-xl font-bold">Restrictions et droits d’accès</h3><p className="text-gray-500">« Accéder » affiche la fonctionnalité. « Gérer » autorise uniquement les workflows dédiés au rôle (ex. dépôt de cours, saisie pédagogique, messagerie). Les colonnes « Actions » des tableaux restent exclusivement réservées à l’administration et à la direction.</p></div></div>
      <div className="overflow-x-auto"><table className="w-full permission-table"><thead><tr className="border-b dark:border-gray-700"><th className="text-left py-2">Fonctionnalité</th><th className="text-center py-2">Accéder</th><th className="text-center py-2">Gérer</th></tr></thead><tbody>
        {FEATURES.map(([key, label]) => <tr key={key} className="border-b last:border-0 dark:border-gray-700"><td className="py-2 font-semibold">{label}</td><td className="text-center"><input type="checkbox" checked={Boolean(formData.permissions[key]?.view)} onChange={(event) => updatePermission(key, 'view', event.target.checked)} /></td><td className="text-center"><input type="checkbox" checked={Boolean(formData.permissions[key]?.manage)} onChange={(event) => updatePermission(key, 'manage', event.target.checked)} /></td></tr>)}
      </tbody></table></div>
      <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Règle globale : un compte Enseignant ou Étudiant ne reçoit jamais les boutons de la colonne « Actions » d’un tableau, même si « Gérer » est coché. Ce droit sert uniquement aux opérations pédagogiques explicitement prévues pour son rôle.</p>
    </section>}

    {error && <p className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-200 px-4 py-3" role="alert">{error}</p>}
    </div>
    <div className="user-form-actions flex justify-end gap-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
      <button type="button" onClick={onCancel} className="px-5 py-2.5 border dark:border-gray-700 rounded-xl">Annuler</button>
      <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl disabled:opacity-50">{loading ? 'Enregistrement…' : isEditMode ? 'Sauvegarder les modifications' : 'Créer le compte et le profil'}</button>
    </div>
  </form>;
};

const TeacherProfile = ({ profile, update, email, updateEmail }) => <ProfileSection icon={<GraduationCap className="text-orange-600" />} title="Profil professionnel" subtitle="Renseignez l’identité, l’affectation et le contrat dans des blocs lisibles. La photo peut être importée depuis le PC.">
  <Block title="Identité et coordonnées">
    <Input label="Prénom *" value={profile.first_name} onChange={(v) => update('first_name', v)} /><Input label="Nom *" value={profile.last_name} onChange={(v) => update('last_name', v)} /><Input label="Email *" type="email" value={email} onChange={updateEmail} /><Input label="Téléphone" type="tel" value={profile.phone} onChange={(v) => update('phone', v)} />
    <Input label="Date de naissance" type="date" value={profile.birth_date} onChange={(v) => update('birth_date', v)} /><Select label="Sexe" value={profile.gender} onChange={(v) => update('gender', v)} options={genderOptions} /><Input label="Nationalité" value={profile.nationality} onChange={(v) => update('nationality', v)} />
    <Input label="Profession" value={profile.profession} onChange={(v) => update('profession', v)} /><Input label="Diplôme" value={profile.diploma} onChange={(v) => update('diploma', v)} /><Input label="Date d’embauche" type="date" value={profile.hire_date} onChange={(v) => update('hire_date', v)} />
    <Input label="Département" value={profile.department} onChange={(v) => update('department', v)} /><Input label="Grade / Titre" value={profile.title} onChange={(v) => update('title', v)} />
  </Block>
  <Block title="Affectation, contrat et rémunération">
    <Input className="md:col-span-2 xl:col-span-3" label="Spécialisation" value={profile.specialization} onChange={(v) => update('specialization', v)} /><Input label="Ville" value={profile.city} onChange={(v) => update('city', v)} /><Input label="Code postal" value={profile.postal_code} onChange={(v) => update('postal_code', v)} /><Input label="Salaire" type="number" value={profile.salary} onChange={(v) => update('salary', v)} />
    <Input label="Type de contrat" placeholder="CDI, CDD, vacataire…" value={profile.contract_type} onChange={(v) => update('contract_type', v)} /><Input label="Début du contrat" type="date" value={profile.contract_start_date} onChange={(v) => update('contract_start_date', v)} /><Input label="Fin du contrat" type="date" value={profile.contract_end_date} onChange={(v) => update('contract_end_date', v)} />
    <Textarea className="md:col-span-2 xl:col-span-3" label="Adresse" value={profile.address} onChange={(v) => update('address', v)} /><Select label="Statut du profil" value={profile.status} onChange={(v) => update('status', v)} options={[["active", "Actif"], ["inactive", "Inactif"], ["on_leave", "En congé"]]} />
    <div className="md:col-span-2 xl:col-span-3"><PhotoPicker value={profile.photo_url} onChange={(v) => update('photo_url', v)} label="Photo de l’enseignant" /></div>
  </Block>
</ProfileSection>;

const StudentProfile = ({ profile, update, email, updateEmail }) => <ProfileSection icon={<GraduationCap className="text-green-600" />} title="Informations du profil" subtitle="Les champs sont regroupés pour éviter un long formulaire étroit. La photo peut venir du poste local ou d’une adresse web.">
  <Block title="Identité et état civil">
    <Input label="Prénom *" value={profile.first_name} onChange={(v) => update('first_name', v)} /><Input label="Nom *" value={profile.last_name} onChange={(v) => update('last_name', v)} /><Input label="Email *" type="email" value={email} onChange={updateEmail} /><Input label="Téléphone" type="tel" value={profile.phone} onChange={(v) => update('phone', v)} />
    <Input label="Date de naissance" type="date" value={profile.birth_date} onChange={(v) => update('birth_date', v)} /><Input label="Lieu de naissance" value={profile.birth_place} onChange={(v) => update('birth_place', v)} /><Select label="Sexe" value={profile.gender} onChange={(v) => update('gender', v)} options={genderOptions} /><Input label="Nationalité" value={profile.nationality} onChange={(v) => update('nationality', v)} /><Select label="Statut du profil" value={profile.status} onChange={(v) => update('status', v)} options={[["active", "Actif"], ["inactive", "Inactif"], ["graduated", "Diplômé"]]} />
  </Block>
  <Block title="Coordonnées">
    <Textarea className="md:col-span-2 xl:col-span-3" label="Adresse" value={profile.address} onChange={(v) => update('address', v)} /><Input label="Ville" value={profile.city} onChange={(v) => update('city', v)} /><Input label="Code postal" value={profile.postal_code} onChange={(v) => update('postal_code', v)} /><Input label="Contact d’urgence" value={profile.emergency_contact_name} onChange={(v) => update('emergency_contact_name', v)} /><Input label="Téléphone d’urgence" value={profile.emergency_contact_phone} onChange={(v) => update('emergency_contact_phone', v)} />
    <div className="md:col-span-2 xl:col-span-3"><PhotoPicker value={profile.photo_url} onChange={(v) => update('photo_url', v)} label="Photo de l’étudiant" /></div>
  </Block>
</ProfileSection>;

const ProfileSection = ({ icon, title, subtitle, children }) => <section className="space-y-4"><div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4 flex gap-3">{icon}<div><h3 className="text-xl font-bold">{title}</h3><p className="text-gray-600 dark:text-gray-300">{subtitle}</p></div></div>{children}</section>;
const Block = ({ title, children }) => <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 rounded-2xl border dark:border-gray-700 p-5"><h4 className="md:col-span-2 xl:col-span-3 text-lg font-bold border-b dark:border-gray-700 pb-2">{title}</h4>{children}</section>;
const Input = ({ label, value, onChange, type = 'text', placeholder = '', className = '' }) => <label className={className}><span className="block font-semibold mb-1">{label}</span><input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="w-full border dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5" /></label>;
const Textarea = ({ label, value, onChange, className = '' }) => <label className={className}><span className="block font-semibold mb-1">{label}</span><textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} rows="2" className="w-full border dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5" /></label>;
const genderOptions = [['', 'Non renseigné'], ['male', 'Masculin'], ['female', 'Féminin'], ['other', 'Autre']];
const Select = ({ label, value, onChange, options, disabled = false, className = '' }) => <label className={className}><span className="block font-semibold mb-1">{label}</span><select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full border dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5 disabled:opacity-60">{options.map(([key, text]) => <option key={key || 'empty'} value={key}>{text}</option>)}</select></label>;
const PasswordInput = ({ label, value, onChange, visible, onToggle }) => <label><span className="block font-semibold mb-1">{label}</span><span className="relative block"><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" className="w-full border dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5 pr-12" /><button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 px-3" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>;

export default UserForm;
