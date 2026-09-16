import { useCallback, useEffect, useState } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import {
  getClasses, createClass, updateClass, deleteClass,
  getClassSchedules, createSchedule, updateSchedule,
} from '../../services/classService';
import { getTrainers } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';
import { fmtDate, fmtTime } from '../../utils/dates';
import Modal from '../../components/ui/Modal';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote, EmptyState, LoadingTable } from '../../components/ui/States';
import ClassForm from '../../components/forms/ClassForm';
import ScheduleForm, { ScheduleEditForm } from '../../components/forms/ScheduleForm';

const SESSION_PILL = { scheduled: 'active', completed: 'neutral', cancelled: 'expired' };

function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-.3px]">{title}</h2>
        {subtitle && <p className="m-0 mt-1 text-[13px] text-ink-soft">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ClassManagement() {
  const [classes, setClasses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  // { type: 'class' | 'schedule' | 'editSchedule', data?: row }
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [classRes, scheduleRes, trainerRes] = await Promise.all([
        getClasses(),
        getClassSchedules({ includeCancelled: true }),
        getTrainers({ limit: 200 }),
      ]);
      setClasses(classRes.data || []);
      setSchedules(scheduleRes.data || []);
      setTrainers(trainerRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load classes and sessions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = (type, data) => { setFormError(null); setModal({ type, data }); };
  const closeModal = () => { if (!saving) setModal(null); };

  const save = async (action, successMessage) => {
    setSaving(true);
    setFormError(null);
    try {
      await action();
      setModal(null);
      setNotice(successMessage);
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save your changes.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = async (row) => {
    if (!window.confirm(`Delete "${row.class_name}"? A class with scheduled sessions cannot be deleted; set it inactive instead.`)) return;
    setBusyKey(`class-${row.class_id}`);
    setError(null);
    try {
      await deleteClass(row.class_id);
      setNotice(`${row.class_name} deleted.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the class.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancelSession = async (row) => {
    if (!window.confirm(`Cancel ${row.class_name} on ${fmtDate(row.class_date)}? Everyone booked on it will be released.`)) return;
    setBusyKey(`session-${row.schedule_id}`);
    setError(null);
    try {
      const res = await updateSchedule(row.schedule_id, { status: 'cancelled' });
      const released = res.released_bookings || 0;
      setNotice(`${row.class_name} on ${fmtDate(row.class_date)} cancelled${released ? `; ${released} booking${released === 1 ? '' : 's'} released` : ''}.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not cancel the session.'));
    } finally {
      setBusyKey(null);
    }
  };

  const activeClasses = classes.filter((c) => c.status === 'active');
  const activeTrainers = trainers.filter((t) => t.status === 'active');

  const classColumns = [
    { key: 'name', label: 'Class', width: 'minmax(0,2fr)', render: (c, i) => <IdentityCell title={c.class_name} subtitle={c.description} index={i} /> },
    { key: 'level', label: 'Difficulty', render: (c) => <span className="capitalize">{c.difficulty_level || 'Any'}</span> },
    { key: 'duration', label: 'Length', mono: true, render: (c) => (c.duration_minutes ? `${c.duration_minutes} min` : '—') },
    { key: 'status', label: 'Status', width: 'minmax(0,.8fr)', render: (c) => <Pill status={c.status === 'active' ? 'active' : 'expired'}>{String(c.status).toUpperCase()}</Pill> },
    {
      key: 'actions', label: '', width: 'auto', align: 'end',
      render: (c) => (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" title="Edit class" style={{ color: '#ffdf9e' }} onClick={() => openModal('class', c)}><Edit size={16} /></button>
          <button type="button" className="btn-ghost disabled:opacity-50" title="Delete class" style={{ color: '#ffc2cc' }} disabled={busyKey === `class-${c.class_id}`} onClick={() => handleDeleteClass(c)}><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  const sessionColumns = [
    { key: 'class', label: 'Session', width: 'minmax(0,1.8fr)', render: (s, i) => <IdentityCell title={s.class_name} subtitle={s.trainer_name} index={i} /> },
    { key: 'date', label: 'Date', mono: true, render: (s) => fmtDate(s.class_date) },
    { key: 'time', label: 'Time', mono: true, render: (s) => `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}` },
    { key: 'room', label: 'Room', render: (s) => s.room || '—' },
    { key: 'seats', label: 'Booked', mono: true, render: (s) => `${parseInt(s.enrolled_count, 10) || 0} / ${s.capacity}` },
    { key: 'status', label: 'Status', width: 'minmax(0,.9fr)', render: (s) => <Pill status={SESSION_PILL[s.status] || 'neutral'}>{String(s.status).toUpperCase()}</Pill> },
    {
      key: 'actions', label: '', width: 'auto', align: 'end',
      render: (s) => (s.status === 'scheduled' ? (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-[12.5px]" title="Edit session" onClick={() => openModal('editSchedule', s)}>Edit</button>
          <button type="button" className="btn-ghost text-[12.5px] disabled:opacity-50" title="Cancel session" style={{ color: '#ffc2cc' }} disabled={busyKey === `session-${s.schedule_id}`} onClick={() => handleCancelSession(s)}>Cancel</button>
        </div>
      ) : null),
    },
  ];

  const modalTitle = modal?.type === 'class' ? (modal.data ? 'Edit class' : 'Create class')
    : modal?.type === 'schedule' ? 'Schedule a session' : 'Edit session';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Manage classes" subtitle="The class catalogue and the sessions on the timetable" />

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      <SectionHeader title="Classes" subtitle={`${classes.length} in the catalogue, ${activeClasses.length} active`}>
        <button type="button" className="btn-primary text-[13.5px]" onClick={() => openModal('class')}>+ New class</button>
      </SectionHeader>
      {loading ? <LoadingTable rows={3} /> : classes.length === 0 ? (
        <EmptyState>No classes yet. Create one to start scheduling sessions.</EmptyState>
      ) : (
        <div className="overflow-x-auto"><GlassTable columns={classColumns} rows={classes} rowKey={(c) => c.class_id} /></div>
      )}

      <SectionHeader title="Upcoming sessions" subtitle="Including cancelled ones, so you can see what changed">
        <button type="button" className="btn-primary text-[13.5px] disabled:opacity-50" disabled={activeClasses.length === 0} onClick={() => openModal('schedule')}>
          + Schedule session
        </button>
      </SectionHeader>
      {loading ? <LoadingTable rows={3} /> : schedules.length === 0 ? (
        <EmptyState>Nothing on the timetable from today onwards.</EmptyState>
      ) : (
        <div className="overflow-x-auto"><GlassTable columns={sessionColumns} rows={schedules} rowKey={(s) => s.schedule_id} /></div>
      )}

      <Modal isOpen={!!modal} onClose={closeModal} title={modalTitle}>
        {formError && <ErrorNote>{formError}</ErrorNote>}
        {modal?.type === 'class' && (
          <ClassForm
            initialData={modal.data}
            loading={saving}
            onCancel={closeModal}
            onSubmit={(data) => save(
              () => (modal.data ? updateClass(modal.data.class_id, data) : createClass(data)),
              modal.data ? `${data.class_name} updated.` : `${data.class_name} created.`
            )}
          />
        )}
        {modal?.type === 'schedule' && (
          <ScheduleForm
            classes={activeClasses}
            trainers={activeTrainers}
            loading={saving}
            onCancel={closeModal}
            onSubmit={(data) => save(() => createSchedule(data), 'Session scheduled.')}
          />
        )}
        {modal?.type === 'editSchedule' && (
          <ScheduleEditForm
            schedule={modal.data}
            loading={saving}
            onCancel={closeModal}
            onSubmit={(data) => save(() => updateSchedule(modal.data.schedule_id, data), 'Session updated.')}
          />
        )}
      </Modal>
    </div>
  );
}
