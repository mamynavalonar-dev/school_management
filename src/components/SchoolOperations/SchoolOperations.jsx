import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign, BookOpenCheck, CalendarRange, CheckCircle2, ChevronDown,
  ClipboardCheck, CreditCard, Edit3, Eye, FileText, GraduationCap, Loader2,
  Plus, Printer, RefreshCw, Save, Search, ShieldAlert, Trash2, User, Users, X,
} from 'lucide-react';
import apiService from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import { useUi } from '../../context/UiContext';
import { canManageFeature } from '../../utils/permissions';
import AcademicPolicyPanel from './AcademicPolicyPanel';

const today = () => new Date().toISOString().slice(0, 10);
const schoolCurrency = localStorage.getItem('school_currency') || 'MGA';
const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: schoolCurrency, maximumFractionDigits: 2 }).format(Number(value || 0));
const dateLabel = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR') : '—';

const tabItems = [
  { id: 'years', label: 'Années et périodes', icon: CalendarRange },
  { id: 'groups', label: 'Classes et groupes', icon: Users },
  { id: 'attendance', label: 'Appels et émargements', icon: ClipboardCheck },
  { id: 'finance', label: 'Scolarité et paiements', icon: BadgeDollarSign, administrative: true },
  { id: 'academic-policy', label: 'Politique académique', icon: ShieldAlert, directionOnly: true },
];

const SchoolOperations = () => {
  const { user } = useApp();
  const { intent, clearIntent } = useUi();
  const { success, error: notifyError } = useNotifications();
  const canManage = canManageFeature(user, 'school-operations');
  const isDirection = ['admin', 'directeur'].includes(user?.role);
  const canManageAdministration = isDirection && canManage;
  const canManageAttendance = ['admin', 'directeur', 'teacher'].includes(user?.role) && canManage;
  const canTableActions = isDirection;
  const [tab, setTab] = useState(isDirection ? 'years' : 'attendance');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState({});
  const [refs, setRefs] = useState({ years: [], terms: [], levels: [], specializations: [], courses: [], teachers: [], students: [] });
  const [years, setYears] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [financeAccounts, setFinanceAccounts] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const requests = [
        apiService.getSchoolResource('overview'),
        apiService.getSchoolResource('reference_data'),
        apiService.getSchoolResource('academic_years'),
        apiService.getSchoolResource('groups'),
        apiService.getSchoolResource('sessions'),
      ];
      if (isDirection) requests.push(apiService.getSchoolResource('finance_accounts'));
      const [overviewRes, refsRes, yearsRes, groupsRes, sessionsRes, financeRes] = await Promise.all(requests);
      setOverview(overviewRes?.data || {});
      setRefs(refsRes?.data || {});
      setYears(yearsRes?.data || []);
      setGroups(groupsRes?.data || []);
      setSessions(sessionsRes?.data || []);
      setFinanceAccounts(financeRes?.data || []);
    } catch (err) {
      console.error('School operations loading error:', err);
      notifyError(err.message || 'Impossible de charger la scolarité. Exécutez la migration de base de données.');
    } finally {
      setLoading(false);
    }
  }, [isDirection, notifyError]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (intent?.action === 'dossier' && intent?.studentId) {
      if (isDirection) {
        setTab('finance');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('school:open-dossier', { detail: Number(intent.studentId) })), 0);
      } else {
        notifyError('Le dossier financier est réservé à l’administration et à la direction.');
      }
      clearIntent();
    }
  }, [clearIntent, intent, isDirection, notifyError]);

  if (loading) return <LoadingState />;

  const visibleTabs = tabItems.filter((item) => (!item.administrative || isDirection) && (!item.directionOnly || isDirection));
  return (
    <section className="p-6 school-operations">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide">Vie scolaire</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestion de la scolarité</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Années, classes, dossiers, appels de présence, émargements et règlements dans un parcours unique.</p>
        </div>
        <button type="button" onClick={loadAll} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
          <RefreshCw size={18} /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
        <Stat icon={CalendarRange} label="Année active" value={overview.active_year?.name || 'À définir'} color="blue" />
        <Stat icon={Users} label="Groupes actifs" value={overview.groups ?? 0} color="purple" />
        <Stat icon={GraduationCap} label="Élèves inscrits" value={overview.enrolled_students ?? 0} color="green" />
        <Stat icon={ClipboardCheck} label="Séances aujourd’hui" value={overview.sessions_today ?? 0} color="amber" />
        {isDirection && <Stat icon={BadgeDollarSign} label="Reste à encaisser" value={money(overview.pending_balance)} color="red" />}
      </div>

      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b dark:border-gray-700 p-2">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl whitespace-nowrap font-semibold ${tab === item.id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <Icon size={19} /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === 'years' && <YearsPanel years={years} refs={refs} canManage={canManageAdministration} canTableActions={canTableActions} saving={saving} setSaving={setSaving} reload={loadAll} success={success} notifyError={notifyError} />}
          {tab === 'groups' && <GroupsPanel groups={groups} refs={refs} canManage={canManageAdministration} saving={saving} setSaving={setSaving} reload={loadAll} success={success} notifyError={notifyError} />}
          {tab === 'attendance' && <AttendancePanel sessions={sessions} groups={groups} refs={refs} canManage={canManageAttendance} canTableActions={canTableActions} saving={saving} setSaving={setSaving} reload={loadAll} success={success} notifyError={notifyError} />}
          {tab === 'finance' && isDirection && <FinancePanel accounts={financeAccounts} refs={refs} reload={loadAll} saving={saving} setSaving={setSaving} success={success} notifyError={notifyError} />}
          {tab === 'academic-policy' && isDirection && <AcademicPolicyPanel />}
        </div>
      </div>
    </section>
  );
};

const YearsPanel = ({ years, refs, canManage, canTableActions, saving, setSaving, reload, success, notifyError }) => {
  const activeYear = refs.years?.find((year) => Number(year.is_active) === 1) || refs.years?.[0];
  const [showYearForm, setShowYearForm] = useState(false);
  const [showTermForm, setShowTermForm] = useState(false);
  const emptyYear = { id: '', name: '', start_date: '', end_date: '', is_active: true };
  const emptyTerm = { id: '', academic_year_id: activeYear?.id || '', name: '', start_date: '', end_date: '', is_active: false };
  const [yearForm, setYearForm] = useState(emptyYear);
  const [termForm, setTermForm] = useState(emptyTerm);

  const submit = async (event, resource, form, close) => {
    event.preventDefault();
    try {
      setSaving(true);
      if (form.id) await apiService.updateSchoolResource(resource, form.id, form);
      else await apiService.createSchoolResource(resource, form);
      success(resource === 'academic_years' ? 'Année scolaire enregistrée.' : 'Période enregistrée.');
      close(false);
      await reload();
    } catch (err) { notifyError(err.message); } finally { setSaving(false); }
  };

  const remove = async (resource, id) => {
    if (!window.confirm('Supprimer cet élément ? Les éléments déjà utilisés ne pourront pas être supprimés.')) return;
    try { await apiService.deleteSchoolResource(resource, id); success('Élément supprimé.'); await reload(); } catch (err) { notifyError(err.message); }
  };

  return (
    <div className="space-y-6">
      <PanelHeading title="Années scolaires et périodes" description="Définissez l’année active puis ses semestres, trimestres ou périodes pédagogiques.">
        {canManage && <div className="flex gap-2"><ActionButton onClick={() => { setTermForm(emptyTerm); setShowTermForm(true); }} icon={Plus} label="Ajouter une période" secondary /><ActionButton onClick={() => { setYearForm(emptyYear); setShowYearForm(true); }} icon={Plus} label="Créer une année" /></div>}
      </PanelHeading>

      {showYearForm && <InlineForm title={yearForm.id ? "Modifier l’année scolaire" : "Créer une année scolaire"} onClose={() => setShowYearForm(false)}>
        <form onSubmit={(event) => submit(event, 'academic_years', yearForm, setShowYearForm)} className="grid md:grid-cols-4 gap-3">
          <Input label="Année scolaire" placeholder="2026-2027" value={yearForm.name} onChange={(value) => setYearForm({ ...yearForm, name: value })} required />
          <Input label="Date de début" type="date" value={yearForm.start_date} onChange={(value) => setYearForm({ ...yearForm, start_date: value })} required />
          <Input label="Date de fin" type="date" value={yearForm.end_date} onChange={(value) => setYearForm({ ...yearForm, end_date: value })} />
          <div className="flex items-end gap-3"><CheckInput label="Définir comme active" checked={yearForm.is_active} onChange={(value) => setYearForm({ ...yearForm, is_active: value })} /><SubmitButton saving={saving} /></div>
        </form>
      </InlineForm>}

      {showTermForm && <InlineForm title={termForm.id ? 'Modifier la période' : 'Ajouter une période'} onClose={() => setShowTermForm(false)}>
        <form onSubmit={(event) => submit(event, 'terms', termForm, setShowTermForm)} className="grid md:grid-cols-5 gap-3">
          <Select label="Année" value={termForm.academic_year_id} onChange={(value) => setTermForm({ ...termForm, academic_year_id: value })} options={refs.years} required />
          <Input label="Nom" placeholder="Semestre 1" value={termForm.name} onChange={(value) => setTermForm({ ...termForm, name: value })} required />
          <Input label="Début" type="date" value={termForm.start_date} onChange={(value) => setTermForm({ ...termForm, start_date: value })} required />
          <Input label="Fin" type="date" value={termForm.end_date} onChange={(value) => setTermForm({ ...termForm, end_date: value })} required />
          <div className="flex items-end"><SubmitButton saving={saving} /></div>
        </form>
      </InlineForm>}

      <div className="overflow-x-auto rounded-xl border dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900"><tr><Th>Année</Th><Th>Début</Th><Th>Fin</Th><Th>Périodes</Th><Th>Groupes</Th><Th>État</Th>{canTableActions && <Th>Actions</Th>}</tr></thead>
          <tbody>{years.map((year) => <tr key={year.id} className="border-t dark:border-gray-700"><Td strong>{year.name}</Td><Td>{dateLabel(year.start_date)}</Td><Td>{dateLabel(year.end_date)}</Td><Td>{year.term_count}</Td><Td>{year.group_count}</Td><Td><StatusPill active={Number(year.is_active) === 1} activeLabel="Année active" inactiveLabel="Archivée" /></Td>{canTableActions && <Td><RowAction icon={Edit3} label="Modifier" onClick={() => { setYearForm({ ...year, is_active: Number(year.is_active) === 1 }); setShowYearForm(true); }} /><RowAction icon={Trash2} label="Supprimer" danger onClick={() => remove('academic_years', year.id)} /></Td>}</tr>)}</tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(refs.terms || []).map((term) => <div key={term.id} className="border dark:border-gray-700 rounded-xl p-4 flex justify-between gap-3"><div><p className="font-bold">{term.name}</p><p className="text-sm text-gray-500">{term.academic_year_name} · {dateLabel(term.start_date)} au {dateLabel(term.end_date)}</p></div>{canManage && <div className="flex"><RowAction icon={Edit3} label="Modifier" onClick={() => { setTermForm({ ...term, is_active: Number(term.is_active) === 1 }); setShowTermForm(true); }} /><RowAction icon={Trash2} label="Supprimer" danger onClick={() => remove('terms', term.id)} /></div>}</div>)}
        {!refs.terms?.length && <Empty text="Aucune période configurée." />}
      </div>
    </div>
  );
};

const GroupsPanel = ({ groups, refs, canManage, saving, setSaving, reload, success, notifyError }) => {
  const activeYear = refs.years?.find((year) => Number(year.is_active) === 1) || refs.years?.[0];
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [roster, setRoster] = useState(null);
  const emptyForm = { id: '', academic_year_id: activeYear?.id || '', level_id: '', specialization_id: '', name: '', capacity: 30, tuition_amount: 0, is_active: true };
  const [form, setForm] = useState(emptyForm);
  const filtered = groups.filter((group) => `${group.name} ${group.level_name} ${group.specialization_name || ''} ${group.academic_year_name}`.toLowerCase().includes(search.toLowerCase()));

  const submit = async (event) => {
    event.preventDefault();
    try { setSaving(true); if (form.id) await apiService.updateSchoolResource('groups', form.id, form); else await apiService.createSchoolResource('groups', form); success('Classe/groupe enregistré.'); setShowForm(false); await reload(); } catch (err) { notifyError(err.message); } finally { setSaving(false); }
  };
  const openRoster = async (group) => {
    try { const res = await apiService.getGroupRoster(group.id); setRoster({ group, students: res?.data || [] }); } catch (err) { notifyError(err.message); }
  };
  const remove = async (id) => { if (!window.confirm('Supprimer cette classe / ce groupe ?')) return; try { await apiService.deleteSchoolResource('groups', id); success('Groupe supprimé.'); await reload(); } catch (err) { notifyError(err.message); } };

  return <div className="space-y-5">
    <PanelHeading title="Classes, filières et groupes" description="Les niveaux et filières existants sont réutilisés ; le groupe représente la classe réelle d’une année donnée.">{canManage && <ActionButton onClick={() => { setForm(emptyForm); setShowForm(true); }} icon={Plus} label="Créer un groupe" />}</PanelHeading>
    {showForm && <InlineForm title={form.id ? 'Modifier la classe / le groupe' : 'Nouvelle classe / nouveau groupe'} onClose={() => setShowForm(false)}><form onSubmit={submit} className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
      <Select label="Année" value={form.academic_year_id} onChange={(value) => setForm({ ...form, academic_year_id: value })} options={refs.years} required />
      <Select label="Niveau / classe" value={form.level_id} onChange={(value) => setForm({ ...form, level_id: value })} options={refs.levels} required />
      <Select label="Filière" value={form.specialization_id} onChange={(value) => setForm({ ...form, specialization_id: value })} options={refs.specializations} allowEmpty />
      <Input label="Nom du groupe" placeholder="Groupe A" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
      <Input label="Capacité" type="number" value={form.capacity} onChange={(value) => setForm({ ...form, capacity: value })} required />
      <Input label="Scolarité" type="number" value={form.tuition_amount} onChange={(value) => setForm({ ...form, tuition_amount: value })} /><div className="md:col-span-3 xl:col-span-6 flex justify-end"><SubmitButton saving={saving} /></div>
    </form></InlineForm>}
    <SearchBox value={search} onChange={setSearch} placeholder="Rechercher par année, classe, groupe ou filière…" />
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map((group) => {
      const full = Number(group.enrolled_count) >= Number(group.capacity);
      return <article key={group.id} className="rounded-2xl border dark:border-gray-700 p-5 bg-gray-50/60 dark:bg-gray-900/30">
        <div className="flex justify-between gap-3"><div><p className="text-sm text-purple-600 font-semibold">{group.academic_year_name}</p><h3 className="text-xl font-bold">{group.level_name} — {group.name}</h3><p className="text-sm text-gray-500">{group.specialization_name || 'Tronc commun'}</p></div><span className={`h-fit px-3 py-1 rounded-full text-xs font-bold ${full ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{group.enrolled_count}/{group.capacity}</span></div>
        <div className="mt-4 flex justify-between text-sm"><span>Scolarité de référence</span><strong>{money(group.tuition_amount)}</strong></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><button type="button" onClick={() => openRoster(group)} className="inline-flex justify-center items-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 font-semibold hover:border-purple-500"><Eye size={18} /> Voir</button>{canManage && <><button type="button" onClick={() => { setForm({ ...group, is_active: Number(group.is_active) === 1 }); setShowForm(true); }} className="inline-flex justify-center items-center gap-2 px-3 py-2.5 rounded-xl text-blue-600 border border-blue-200"><Edit3 size={18} /> Modifier</button><button type="button" onClick={() => remove(group.id)} className="inline-flex justify-center items-center gap-2 px-3 py-2.5 rounded-xl text-red-600 border border-red-200"><Trash2 size={18} /> Supprimer</button></>}</div>
      </article>;
    })}</div>
    {!filtered.length && <Empty text="Aucun groupe ne correspond à la recherche." />}
    {roster && <RosterModal roster={roster} onClose={() => setRoster(null)} />}
  </div>;
};

const AttendancePanel = ({ sessions, groups, refs, canManage, canTableActions, saving, setSaving, reload, success, notifyError }) => {
  const activeYear = refs.years?.find((year) => Number(year.is_active) === 1) || refs.years?.[0];
  const [showForm, setShowForm] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [records, setRecords] = useState([]);
  const emptyForm = { id: '', academic_year_id: activeYear?.id || '', term_id: '', group_id: '', course_id: '', teacher_id: '', session_date: today(), start_time: '', end_time: '', session_type: 'Cours', lesson_title: '', lesson_summary: '', status: 'planned' };
  const [form, setForm] = useState(emptyForm);

  const submit = async (event) => {
    event.preventDefault();
    try { setSaving(true); if (form.id) await apiService.updateSchoolResource('sessions', form.id, form); else await apiService.createSchoolResource('sessions', form); success('Séance enregistrée. Vous pouvez maintenant faire l’appel.'); setShowForm(false); await reload(); } catch (err) { notifyError(err.message); } finally { setSaving(false); }
  };
  const openSheet = async (session) => {
    try {
      const res = await apiService.getGroupRoster(session.group_id, session.id);
      const rows = (res?.data || []).map((student) => ({ ...student, status: student.attendance_status || 'present', notes: student.attendance_notes || '' }));
      setRecords(rows); setSheet(session);
    } catch (err) { notifyError(err.message); }
  };
  const saveSheet = async (complete = false) => {
    try {
      setSaving(true);
      await apiService.saveAttendance({ session_id: sheet.id, complete, signed: complete, records: records.map(({ id, status, notes }) => ({ student_id: id, status, notes })) });
      success(complete ? 'Appel terminé et émargement enregistré.' : 'Appel enregistré.');
      setSheet(null); await reload();
    } catch (err) { notifyError(err.message); } finally { setSaving(false); }
  };
  const remove = async (id) => { if (!window.confirm('Supprimer cette séance et son appel ?')) return; try { await apiService.deleteSchoolResource('sessions', id); success('Séance supprimée.'); await reload(); } catch (err) { notifyError(err.message); } };

  return <div className="space-y-5">
    <PanelHeading title="Séances, appels et émargements" description="Créez une séance, marquez les présents/absents et signez l’émargement. Les absences sont automatiquement reportées dans le menu Absences."><ActionButton onClick={() => { setForm(emptyForm); setShowForm(true); }} icon={Plus} label="Planifier une séance" /></PanelHeading>
    {showForm && <InlineForm title={form.id ? 'Modifier la séance' : 'Nouvelle séance de cours'} onClose={() => setShowForm(false)}><form onSubmit={submit} className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">
      <Select label="Année" value={form.academic_year_id} onChange={(value) => setForm({ ...form, academic_year_id: value })} options={refs.years} required />
      <Select label="Période" value={form.term_id} onChange={(value) => setForm({ ...form, term_id: value })} options={(refs.terms || []).filter((term) => String(term.academic_year_id) === String(form.academic_year_id))} allowEmpty />
      <Select label="Classe / groupe" value={form.group_id} onChange={(value) => setForm({ ...form, group_id: value })} options={groups.map((group) => ({ ...group, name: `${group.level_name} — ${group.name}` }))} required />
      <Select label="Matière" value={form.course_id} onChange={(value) => setForm({ ...form, course_id: value })} options={refs.courses} allowEmpty />
      <Select label="Enseignant" value={form.teacher_id} onChange={(value) => setForm({ ...form, teacher_id: value })} options={refs.teachers.map((teacher) => ({ ...teacher, name: `${teacher.first_name} ${teacher.last_name}` }))} allowEmpty />
      <Input label="Date" type="date" value={form.session_date} onChange={(value) => setForm({ ...form, session_date: value })} required />
      <Input label="Début" type="time" value={form.start_time} onChange={(value) => setForm({ ...form, start_time: value })} />
      <Input label="Fin" type="time" value={form.end_time} onChange={(value) => setForm({ ...form, end_time: value })} />
      <Input label="Type" value={form.session_type} onChange={(value) => setForm({ ...form, session_type: value })} />
      <Input label="Titre / leçon" value={form.lesson_title} onChange={(value) => setForm({ ...form, lesson_title: value })} required />
      <div className="md:col-span-3 xl:col-span-5"><Input label="Résumé du cours" value={form.lesson_summary} onChange={(value) => setForm({ ...form, lesson_summary: value })} /></div>
      <div className="md:col-span-3 xl:col-span-5 flex justify-end"><SubmitButton saving={saving} /></div>
    </form></InlineForm>}
    <div className="overflow-x-auto rounded-xl border dark:border-gray-700"><table className="w-full"><thead className="bg-gray-50 dark:bg-gray-900"><tr><Th>Date</Th><Th>Séance</Th><Th>Classe / groupe</Th><Th>Enseignant</Th><Th>Appel</Th><Th>État</Th>{canTableActions && <Th>Action</Th>}</tr></thead><tbody>
      {sessions.map((session) => <tr key={session.id} className="border-t dark:border-gray-700"><Td>{dateLabel(session.session_date)}<small className="block text-gray-400">{String(session.start_time || '').slice(0, 5)}{session.end_time ? ` – ${String(session.end_time).slice(0, 5)}` : ''}</small></Td><Td strong>{session.lesson_title}<small className="block text-gray-400">{session.course_name || session.session_type}</small></Td><Td>{session.level_name} — {session.group_name}</Td><Td>{session.teacher_name || 'Non affecté'}</Td><Td>{session.marked_count || 0} marqué(s)<small className="block text-gray-400">{session.present_count || 0} présent(s), {session.absent_count || 0} absent(s)</small>{!canTableActions && canManage && <button type="button" onClick={() => openSheet(session)} className="mt-2 text-blue-600 font-semibold underline">Ouvrir l’appel</button>}</Td><Td><StatusPill active={session.status === 'completed'} activeLabel="Signé" inactiveLabel={session.status === 'cancelled' ? 'Annulé' : 'À faire'} /></Td>{canTableActions && <Td><button type="button" onClick={() => openSheet(session)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold"><ClipboardCheck size={17} /> Appel</button><RowAction icon={Edit3} label="Modifier" onClick={() => { setForm({ ...session }); setShowForm(true); }} /><RowAction icon={Trash2} label="Supprimer" danger onClick={() => remove(session.id)} /></Td>}</tr>)}
    </tbody></table>{!sessions.length && <Empty text="Aucune séance enregistrée." />}</div>
    {sheet && <AttendanceModal session={sheet} records={records} setRecords={setRecords} onClose={() => setSheet(null)} onSave={saveSheet} saving={saving} />}
  </div>;
};

const FinancePanel = ({ accounts, refs, reload, saving, setSaving, success, notifyError }) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [dossier, setDossier] = useState(null);
  const [guardian, setGuardian] = useState({ relationship: 'Responsable financier', first_name: '', last_name: '', phone: '', email: '', profession: '', address: '' });
  const [fee, setFee] = useState({ registration_fee_amount: 0, tuition_amount: 0, discount_amount: 0, payment_mode: '', notes: '' });
  const emptyPayment = { id: '', amount: '', payment_date: today(), payment_method: 'Espèces', reference: '', notes: '' };
  const [payment, setPayment] = useState(emptyPayment);
  const students = useMemo(() => (refs.students || []).filter((student) => `${student.first_name} ${student.last_name} ${student.student_number}`.toLowerCase().includes(search.toLowerCase())), [refs.students, search]);

  const loadDossier = useCallback(async (studentId) => {
    if (!studentId) return;
    try {
      const res = await apiService.getStudentDossier(studentId);
      const data = res?.data;
      setDossier(data);
      setSelectedId(String(studentId));
      setGuardian({ relationship: 'Responsable financier', first_name: '', last_name: '', phone: '', email: '', profession: '', address: '', ...(data?.guardian || {}) });
      setFee({ registration_fee_amount: data?.fee?.registration_fee_amount || 0, tuition_amount: data?.fee?.tuition_amount || 0, discount_amount: data?.fee?.discount_amount || 0, payment_mode: data?.fee?.payment_mode || '', notes: data?.fee?.notes || '' });
    } catch (err) { notifyError(err.message); }
  }, [notifyError]);

  useEffect(() => {
    const open = (event) => loadDossier(event.detail);
    window.addEventListener('school:open-dossier', open);
    return () => window.removeEventListener('school:open-dossier', open);
  }, [loadDossier]);

  const saveGuardian = async (event) => { event.preventDefault(); try { setSaving(true); await apiService.createSchoolResource('guardian', { student_id: dossier.student.id, ...guardian }); success('Responsable financier enregistré.'); await loadDossier(dossier.student.id); } catch (err) { notifyError(err.message); } finally { setSaving(false); } };
  const saveFee = async (event) => { event.preventDefault(); if (!dossier.student.enrollment_id) return notifyError('Inscrivez d’abord cet élève dans une classe.'); try { setSaving(true); await apiService.createSchoolResource('fee_accounts', { enrollment_id: dossier.student.enrollment_id, ...fee }); success('Scolarité configurée.'); await loadDossier(dossier.student.id); await reload(); } catch (err) { notifyError(err.message); } finally { setSaving(false); } };
  const addPayment = async (event) => { event.preventDefault(); if (!dossier.fee?.id) return notifyError('Configurez d’abord le montant de scolarité.'); try { setSaving(true); if (payment.id) await apiService.updateSchoolResource('payments', payment.id, payment); else await apiService.createSchoolResource('payments', { fee_account_id: dossier.fee.id, ...payment }); success(payment.id ? 'Paiement modifié.' : 'Paiement enregistré.'); setPayment(emptyPayment); await loadDossier(dossier.student.id); await reload(); } catch (err) { notifyError(err.message); } finally { setSaving(false); } };
  const deletePayment = async (id) => { if (!window.confirm('Supprimer ce paiement ? Le solde de la scolarité sera recalculé.')) return; try { await apiService.deleteSchoolResource('payments', id); success('Paiement supprimé.'); await loadDossier(dossier.student.id); await reload(); } catch (err) { notifyError(err.message); } };

  return <div className="grid xl:grid-cols-[32rem_minmax(0,1fr)] gap-5">
    <aside className="space-y-3"><div><h2 className="text-xl font-bold">Dossiers des élèves</h2><p className="text-sm text-gray-500">Sélectionnez un élève pour ouvrir son dossier complet.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Nom ou matricule…" compact />
      <div className="max-h-[58rem] overflow-y-auto space-y-2 pr-1">{students.map((student) => <button type="button" key={student.id} onClick={() => loadDossier(student.id)} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border ${String(student.id) === selectedId ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}><Avatar name={`${student.first_name} ${student.last_name}`} /><span><strong className="block">{student.first_name} {student.last_name}</strong><small className="text-gray-500">{student.student_number}</small></span></button>)}</div>
    </aside>
    <main>{!dossier ? <div className="min-h-[40rem] grid place-items-center rounded-2xl border-2 border-dashed dark:border-gray-700 text-center p-10"><div><User size={48} className="mx-auto text-gray-300 mb-3" /><h3 className="text-xl font-bold">Aucun dossier sélectionné</h3><p className="text-gray-500">Choisissez un élève dans la liste à gauche.</p></div></div> : <StudentDossier dossier={dossier} guardian={guardian} setGuardian={setGuardian} fee={fee} setFee={setFee} payment={payment} setPayment={setPayment} saveGuardian={saveGuardian} saveFee={saveFee} addPayment={addPayment} deletePayment={deletePayment} saving={saving} />}</main>
    {accounts.length > 0 && <div className="xl:col-span-2 border-t dark:border-gray-700 pt-5"><h3 className="text-lg font-bold mb-3">Suivi global des règlements</h3><div className="overflow-x-auto rounded-xl border dark:border-gray-700"><table className="w-full"><thead className="bg-gray-50 dark:bg-gray-900"><tr><Th>Élève</Th><Th>Classe</Th><Th>Montant</Th><Th>Payé</Th><Th>Reste</Th><Th>État</Th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-t dark:border-gray-700"><Td strong>{account.first_name} {account.last_name}<small className="block text-gray-400">{account.student_number}</small></Td><Td>{account.level_name} {account.group_name ? `— ${account.group_name}` : ''}</Td><Td>{money(Number(account.registration_fee_amount || 0) + Number(account.tuition_amount) - Number(account.discount_amount))}</Td><Td>{money(account.amount_paid)}</Td><Td>{money(account.balance)}</Td><Td><PaymentStatus status={account.status} /></Td></tr>)}</tbody></table></div></div>}
  </div>;
};

const StudentDossier = ({ dossier, guardian, setGuardian, fee, setFee, payment, setPayment, saveGuardian, saveFee, addPayment, deletePayment, saving }) => {
  const { student, payments = [], grades = [], absences = [] } = dossier;
  const printCard = () => window.print();
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-purple-600 font-semibold">DOSSIER ÉLÈVE</p><h2 className="text-2xl font-bold">{student.first_name} {student.last_name}</h2><p className="text-gray-500">{student.student_number} · {student.level_name || 'Non inscrit'} {student.group_name ? `— ${student.group_name}` : ''}</p></div><button type="button" onClick={printCard} className="inline-flex items-center gap-2 h-fit px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold"><Printer size={18} /> Imprimer la carte</button></div>
    <div className="school-print-area"><StudentCard student={student} /></div>
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3"><Detail label="Date de naissance" value={dateLabel(student.birth_date)} /><Detail label="Lieu de naissance" value={student.birth_place || '—'} /><Detail label="Nationalité" value={student.nationality || '—'} /><Detail label="Téléphone" value={student.phone || '—'} /><Detail label="E-mail" value={student.email} /><Detail label="Adresse" value={[student.address, student.city].filter(Boolean).join(', ') || '—'} /><Detail label="Année scolaire" value={student.structured_academic_year || student.academic_year || '—'} /><Detail label="Inscription" value={dateLabel(student.enrollment_date)} /></div>
    <div className="grid lg:grid-cols-2 gap-4">
      <form onSubmit={saveGuardian} className="rounded-xl border dark:border-gray-700 p-4 space-y-3"><h3 className="font-bold flex items-center gap-2"><User size={18} /> Responsable financier</h3><div className="grid grid-cols-2 gap-3"><Input label="Prénom" value={guardian.first_name || ''} onChange={(value) => setGuardian({ ...guardian, first_name: value })} required /><Input label="Nom" value={guardian.last_name || ''} onChange={(value) => setGuardian({ ...guardian, last_name: value })} required /><Input label="Téléphone" value={guardian.phone || ''} onChange={(value) => setGuardian({ ...guardian, phone: value })} /><Input label="E-mail" type="email" value={guardian.email || ''} onChange={(value) => setGuardian({ ...guardian, email: value })} /><Input label="Profession" value={guardian.profession || ''} onChange={(value) => setGuardian({ ...guardian, profession: value })} /><Input label="Lien" value={guardian.relationship || ''} onChange={(value) => setGuardian({ ...guardian, relationship: value })} /></div><SubmitButton saving={saving} label="Enregistrer le responsable" /></form>
      <form onSubmit={saveFee} className="rounded-xl border dark:border-gray-700 p-4 space-y-3"><h3 className="font-bold flex items-center gap-2"><CreditCard size={18} /> Droits et scolarité</h3><div className="grid grid-cols-2 gap-3"><Input label="Droits d’inscription" type="number" value={fee.registration_fee_amount} onChange={(value) => setFee({ ...fee, registration_fee_amount: value })} /><Input label="Écolage / scolarité" type="number" value={fee.tuition_amount} onChange={(value) => setFee({ ...fee, tuition_amount: value })} /><Input label="Remise" type="number" value={fee.discount_amount} onChange={(value) => setFee({ ...fee, discount_amount: value })} /><Input label="Mode prévu" value={fee.payment_mode || ''} onChange={(value) => setFee({ ...fee, payment_mode: value })} /><Detail label="Reste à payer" value={money(dossier.fee?.balance ?? (Number(fee.registration_fee_amount) + Number(fee.tuition_amount) - Number(fee.discount_amount)))} /></div><SubmitButton saving={saving} label="Configurer droits et scolarité" /></form>
    </div>
    {dossier.fee && <div className="rounded-xl border dark:border-gray-700 p-4"><h3 className="font-bold mb-3">{payment.id ? 'Modifier le règlement' : 'Ajouter un règlement'}</h3><form onSubmit={addPayment} className="grid md:grid-cols-5 gap-3"><Input label="Montant" type="number" value={payment.amount} onChange={(value) => setPayment({ ...payment, amount: value })} required /><Input label="Date" type="date" value={payment.payment_date} onChange={(value) => setPayment({ ...payment, payment_date: value })} required /><Select label="Mode" value={payment.payment_method} onChange={(value) => setPayment({ ...payment, payment_method: value })} options={['Espèces', 'Carte bancaire', 'Virement', 'Chèque', 'Mobile money'].map((name) => ({ id: name, name }))} /><Input label="Référence" value={payment.reference} onChange={(value) => setPayment({ ...payment, reference: value })} /><div className="flex items-end"><SubmitButton saving={saving} label={payment.id ? 'Enregistrer' : 'Encaisser'} /></div></form><div className="mt-4 space-y-2">{payments.map((item) => <div key={item.id} className="flex justify-between items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-900 p-3"><span>{dateLabel(item.payment_date)} · {item.payment_method}<small className="block text-gray-400">{item.reference || 'Sans référence'}</small></span><div className="flex items-center gap-2"><strong className="text-green-600">{money(item.amount)}</strong><RowAction icon={Edit3} label="Modifier" onClick={() => setPayment({ ...item })} /><RowAction icon={Trash2} label="Supprimer" danger onClick={() => deletePayment(item.id)} /></div></div>)}{!payments.length && <p className="text-sm text-gray-500">Aucun paiement enregistré.</p>}</div></div>}
    <div className="grid lg:grid-cols-2 gap-4"><MiniTable title="Dernières notes" icon={BookOpenCheck} columns={['Matière', 'Note', 'Date']} rows={grades.map((grade) => [grade.course_name || grade.evaluation_title, `${grade.score ?? '—'}/${grade.max_score || 20}`, dateLabel(grade.grade_date)])} /><MiniTable title="Absences" icon={ClipboardCheck} columns={['Date', 'Cours', 'État']} rows={absences.map((absence) => [dateLabel(absence.date), absence.course_name || '—', absence.status])} /></div>
  </div>;
};

const AttendanceModal = ({ session, records, setRecords, onClose, onSave, saving }) => {
  const counts = records.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
  return <Modal title={`Appel — ${session.lesson_title}`} subtitle={`${dateLabel(session.session_date)} · ${session.level_name} — ${session.group_name}`} onClose={onClose} wide>
    <div className="grid grid-cols-4 gap-2 mb-4">{[['present', 'Présents'], ['absent', 'Absents'], ['late', 'Retards'], ['excused', 'Excusés']].map(([key, label]) => <div key={key} className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 text-center"><strong className="text-xl block">{counts[key] || 0}</strong><span className="text-xs text-gray-500">{label}</span></div>)}</div>
    <div className="overflow-x-auto max-h-[55vh]"><table className="w-full"><thead className="sticky top-0 bg-white dark:bg-gray-800"><tr><Th>Élève</Th><Th>Statut</Th><Th>Note</Th></tr></thead><tbody>{records.map((row, index) => <tr key={row.id} className="border-t dark:border-gray-700"><Td strong>{row.first_name} {row.last_name}<small className="block text-gray-400">{row.student_number}</small></Td><Td><div className="flex flex-wrap gap-1">{[['present', 'Présent'], ['absent', 'Absent'], ['late', 'Retard'], ['excused', 'Excusé']].map(([value, label]) => <button type="button" key={value} onClick={() => setRecords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: value } : item))} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${row.status === value ? (value === 'absent' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'bg-gray-100 dark:bg-gray-700'}`}>{label}</button>)}</div></Td><Td><input value={row.notes} onChange={(event) => setRecords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} className="w-full min-w-[16rem] rounded-lg border dark:border-gray-700 bg-transparent px-3 py-2" placeholder="Observation…" /></Td></tr>)}</tbody></table>{!records.length && <Empty text="Aucun élève n’est affecté à ce groupe." />}</div>
    <div className="flex flex-wrap justify-end gap-3 pt-4 border-t dark:border-gray-700 mt-4"><button type="button" onClick={() => onSave(false)} disabled={saving} className="px-4 py-2 rounded-xl border dark:border-gray-700 font-semibold">Enregistrer le brouillon</button><button type="button" onClick={() => onSave(true)} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white font-semibold"><CheckCircle2 size={18} /> Terminer et signer</button></div>
  </Modal>;
};

const RosterModal = ({ roster, onClose }) => <Modal title={`${roster.group.level_name} — ${roster.group.name}`} subtitle={`${roster.group.academic_year_name} · ${roster.students.length} élève(s)`} onClose={onClose} wide><div className="school-print-area"><table className="w-full"><thead><tr><Th>Matricule</Th><Th>Nom et prénom</Th><Th>E-mail</Th><Th>Téléphone</Th></tr></thead><tbody>{roster.students.map((student) => <tr key={student.id} className="border-t dark:border-gray-700"><Td>{student.student_number}</Td><Td strong>{student.last_name} {student.first_name}</Td><Td>{student.email}</Td><Td>{student.phone || '—'}</Td></tr>)}</tbody></table></div><div className="flex justify-end mt-4"><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white"><Printer size={18} /> Imprimer la liste</button></div></Modal>;

const StudentCard = ({ student }) => <article className="student-id-card max-w-[48rem] rounded-2xl overflow-hidden border-2 border-purple-200 bg-white text-gray-900 shadow-sm">
  <header className="bg-gradient-to-r from-purple-700 to-blue-600 text-white px-5 py-4"><p className="text-xs uppercase tracking-widest opacity-80">Carte d’élève</p><h3 className="text-xl font-bold">Établissement universitaire</h3><span className="text-sm">Année scolaire {student.structured_academic_year || student.academic_year || '—'}</span></header>
  <div className="p-5 grid grid-cols-[7rem_1fr] gap-4"><Avatar name={`${student.first_name} ${student.last_name}`} large /><div><h4 className="text-xl font-bold">{student.first_name} {student.last_name}</h4><p className="text-purple-700 font-bold">{student.student_number}</p><p className="mt-2 text-sm">{student.level_name || 'Non inscrit'} {student.group_name ? `— ${student.group_name}` : ''}</p><p className="text-sm">Né(e) le {dateLabel(student.birth_date)} {student.birth_place ? `à ${student.birth_place}` : ''}</p><div className="mt-3 h-8 flex items-end gap-[2px]" aria-label={`Code carte ${student.student_number}`}>{String(student.student_number || '').split('').flatMap((char, index) => [<i key={`${char}-${index}-a`} className="block bg-gray-900 w-1" style={{ height: `${14 + ((char.charCodeAt(0) + index) % 18)}px` }} />, <i key={`${char}-${index}-b`} className="block bg-gray-900 w-0.5" style={{ height: `${20 + (index % 10)}px` }} />])}</div></div></div>
</article>;

const MiniTable = ({ title, icon: Icon, columns, rows }) => <div className="rounded-xl border dark:border-gray-700 p-4"><h3 className="font-bold flex items-center gap-2 mb-3"><Icon size={18} /> {title}</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{columns.map((column) => <Th key={column}>{column}</Th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t dark:border-gray-700">{row.map((value, valueIndex) => <Td key={valueIndex}>{value}</Td>)}</tr>)}</tbody></table>{!rows.length && <p className="text-sm text-gray-500 py-4">Aucun élément.</p>}</div></div>;
const PanelHeading = ({ title, description, children }) => <div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-bold">{title}</h2><p className="text-gray-500 mt-1">{description}</p></div>{children && <div className="flex items-start">{children}</div>}</div>;
const InlineForm = ({ title, onClose, children }) => <div className="rounded-2xl border-2 border-purple-100 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 p-4"><div className="flex justify-between mb-4"><h3 className="text-lg font-bold">{title}</h3><button type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button></div>{children}</div>;
const Modal = ({ title, subtitle, onClose, children, wide }) => <div className="app-modal-layer bg-black/55"><div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 shadow-2xl`}><div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-5 py-4 flex justify-between"><div><h2 className="text-2xl font-bold">{title}</h2>{subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label="Fermer" className="p-2"><X size={22} /></button></div><div className="p-5">{children}</div></div></div>;
const ActionButton = ({ onClick, icon: Icon, label, secondary }) => <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold ${secondary ? 'border dark:border-gray-700 bg-white dark:bg-gray-800' : 'bg-purple-600 text-white'}`}><Icon size={18} /> {label}</button>;
const RowAction = ({ onClick, icon: Icon, label, danger }) => <button type="button" onClick={onClick} title={label} aria-label={label} className={`inline-flex items-center gap-1 p-2 rounded-lg ${danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30'}`}><Icon size={18} /><span className="sr-only">{label}</span></button>;
const SubmitButton = ({ saving, label = 'Enregistrer' }) => <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-60">{saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{label}</button>;
const Input = ({ label, value, onChange, type = 'text', placeholder, required }) => <label className="block"><span className="block text-sm font-semibold mb-1">{label}{required && ' *'}</span><input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="w-full rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 outline-none focus:ring-2 focus:ring-purple-500" /></label>;
const Select = ({ label, value, onChange, options = [], required, allowEmpty }) => <label className="block"><span className="block text-sm font-semibold mb-1">{label}{required && ' *'}</span><div className="relative"><select value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} className="w-full appearance-none rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 pr-9 outline-none focus:ring-2 focus:ring-purple-500">{(allowEmpty || !value) && <option value="">Sélectionner…</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><ChevronDown size={17} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" /></div></label>;
const CheckInput = ({ label, checked, onChange }) => <label className="flex items-center gap-2 py-2.5 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="w-4 h-4 accent-purple-600" />{label}</label>;
const SearchBox = ({ value, onChange, placeholder, compact }) => <label className={`flex items-center gap-2 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 ${compact ? 'py-2' : 'py-3 max-w-xl'}`}><Search size={19} className="text-gray-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent outline-none" /></label>;
const statColors = { blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', green: 'bg-green-100 text-green-600', amber: 'bg-amber-100 text-amber-600', red: 'bg-red-100 text-red-600' };
const Stat = ({ icon: Icon, label, value, color }) => <div className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 p-4 flex items-center gap-3 shadow-sm"><span className={`p-2.5 rounded-xl ${statColors[color] || statColors.blue}`}><Icon size={21} /></span><span><small className="block text-gray-500">{label}</small><strong className="text-lg">{value}</strong></span></div>;
const Avatar = ({ name, large }) => <span className={`${large ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm'} rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold`}>{String(name || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>;
const Detail = ({ label, value }) => <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3"><small className="block text-gray-500">{label}</small><strong>{value}</strong></div>;
const StatusPill = ({ active, activeLabel, inactiveLabel }) => <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'}`}>{active ? activeLabel : inactiveLabel}</span>;
const PaymentStatus = ({ status }) => <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${status === 'Paid' ? 'bg-green-100 text-green-700' : status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{status === 'Paid' ? 'Payé' : status === 'Partial' ? 'Partiel' : status === 'Exempt' ? 'Exonéré' : 'En attente'}</span>;
const Th = ({ children }) => <th className="text-left p-3 text-sm font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{children}</th>;
const Td = ({ children, strong }) => <td className={`p-3 text-sm ${strong ? 'font-semibold' : 'text-gray-600 dark:text-gray-300'}`}>{children}</td>;
const Empty = ({ text }) => <div className="col-span-full py-10 text-center text-gray-500"><FileText size={34} className="mx-auto mb-2 text-gray-300" /><p>{text}</p></div>;
const LoadingState = () => <div className="min-h-[50vh] grid place-items-center"><div className="text-center"><Loader2 size={42} className="animate-spin mx-auto text-purple-600" /><p className="mt-3 text-gray-500">Chargement de la scolarité…</p></div></div>;

export default SchoolOperations;
