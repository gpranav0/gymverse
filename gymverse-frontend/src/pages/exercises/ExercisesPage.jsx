import { useCallback, useEffect, useState } from 'react';
import { Edit, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getExercises, createExercise, updateExercise, deleteExercise } from '../../services/workoutService';
import { getErrorMessage } from '../../services/api';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, SearchField, ErrorNote, SuccessNote, EmptyState, LoadingTable } from '../../components/ui/States';
import ExerciseForm from '../../components/forms/ExerciseForm';

const PAGE_SIZE = 20;
const LEVEL_PILL = { beginner: 'active', intermediate: 'pending', advanced: 'failed' };

export default function ExercisesPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'trainer'].includes(user.role);
  const canDelete = user.role === 'admin';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // null = closed, {} = create, { exercise } = edit
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getExercises({ page, limit: PAGE_SIZE, ...(search ? { search } : {}) });
      setRows(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load exercises.'));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSave = async (data) => {
    setSaving(true);
    setFormError(null);
    try {
      if (modal.exercise) await updateExercise(modal.exercise.exercise_id, data);
      else await createExercise(data);
      setModal(null);
      setNotice(`${data.exercise_name} ${modal.exercise ? 'updated' : 'added to the library'}.`);
      await fetchRows();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the exercise.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.exercise_name}"? Exercises used in a workout plan cannot be deleted.`)) return;
    setError(null);
    try {
      await deleteExercise(row.exercise_id);
      setNotice(`${row.exercise_name} deleted.`);
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else await fetchRows();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the exercise.'));
    }
  };

  const columns = [
    { key: 'name', label: 'Exercise', width: 'minmax(0,2fr)', render: (r, i) => <IdentityCell title={r.exercise_name} subtitle={[r.muscle_group, r.secondary_muscle_group].filter(Boolean).join(' · ')} index={i} /> },
    { key: 'equipment', label: 'Equipment', render: (r) => r.equipment_required || 'Bodyweight' },
    { key: 'level', label: 'Level', width: 'minmax(0,.9fr)', render: (r) => <Pill status={LEVEL_PILL[r.difficulty_level] || 'neutral'}>{(r.difficulty_level || 'any').toUpperCase()}</Pill> },
    ...(canEdit ? [{
      key: 'actions', label: '', width: 'auto', align: 'end',
      render: (r) => (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" title="Edit exercise" style={{ color: '#ffdf9e' }} onClick={() => { setFormError(null); setModal({ exercise: r }); }}><Edit size={16} /></button>
          {canDelete && <button type="button" className="btn-ghost" title="Delete exercise" style={{ color: '#ffc2cc' }} onClick={() => handleDelete(r)}><Trash2 size={16} /></button>}
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Exercise library" subtitle={meta ? `${meta.total} exercises` : 'Movements used to build workout plans'}>
        <SearchField value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search exercises…" icon={Search} />
        {canEdit && (
          <button type="button" onClick={() => { setFormError(null); setModal({}); }} className="btn-primary text-[13.5px]">
            + New exercise
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      {loading ? (
        <LoadingTable />
      ) : rows.length === 0 ? (
        <EmptyState>{search ? `No exercises match “${search}”.` : 'No exercises yet.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable columns={columns} rows={rows} rowKey={(r) => r.exercise_id} footer={<Pagination meta={meta} onPageChange={setPage} disabled={loading} />} />
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => !saving && setModal(null)} title={modal?.exercise ? 'Edit exercise' : 'New exercise'}>
        {formError && <ErrorNote>{formError}</ErrorNote>}
        {modal && <ExerciseForm initialData={modal.exercise} onSubmit={handleSave} onCancel={() => setModal(null)} loading={saving} />}
      </Modal>
    </div>
  );
}
