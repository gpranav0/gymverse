import { useCallback, useEffect, useState } from 'react';
import { getAssignments, createAssignment, updateAssignment } from '../../services/assignmentService';
import { getTrainers } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';
import { fmtDate } from '../../utils/dates';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote, EmptyState, LoadingTable } from '../../components/ui/States';
import TrainerAssignmentForm from '../../components/forms/TrainerAssignmentForm';

const PAGE_SIZE = 25;
const STATUS_PILL = { active: 'active', completed: 'neutral', cancelled: 'expired' };

export default function TrainerAssignments() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('active');
  const [trainerId, setTrainerId] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAssignments({ page, limit: PAGE_SIZE, status, ...(trainerId ? { trainer_id: trainerId } : {}) });
      setRows(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load trainer rosters.'));
    } finally {
      setLoading(false);
    }
  }, [page, status, trainerId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    let active = true;
    getTrainers({ limit: 200 }).then((res) => { if (active) setTrainers(res.data || []); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const changeStatus = async (row, next) => {
    setBusyId(row.assignment_id);
    setError(null);
    setNotice(null);
    try {
      await updateAssignment(row.assignment_id, { status: next });
      setNotice(next === 'active'
        ? `${row.member_name} is back on ${row.trainer_name}'s roster.`
        : `${row.member_name} has been removed from ${row.trainer_name}'s roster.`);
      await fetchRows();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the assignment.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (data) => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await createAssignment(data);
      setIsModalOpen(false);
      setNotice(`${res.data?.member_name || 'The member'} is now on ${res.data?.trainer_name || 'the trainer'}'s roster.`);
      if (status !== 'active' || page !== 1) {
        setStatus('active');
        setPage(1);
      } else {
        await fetchRows();
      }
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not create the assignment.'));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'member', label: 'Member', width: 'minmax(0,1.8fr)', render: (r, i) => <IdentityCell title={r.member_name} subtitle={r.member_code} index={i} /> },
    {
      key: 'trainer', label: 'Trainer', width: 'minmax(0,1.5fr)',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{r.trainer_name}</div>
          <div className="truncate text-xs text-ink-muted">{r.specialization || 'General fitness'}</div>
        </div>
      ),
    },
    { key: 'start', label: 'Start', mono: true, render: (r) => fmtDate(r.start_date) },
    { key: 'end', label: 'End', mono: true, render: (r) => fmtDate(r.end_date) },
    { key: 'status', label: 'Status', width: 'minmax(0,.9fr)', render: (r) => <Pill status={STATUS_PILL[r.status]}>{String(r.status).toUpperCase()}</Pill> },
    {
      key: 'actions', label: '', width: 'auto', align: 'end',
      render: (r) => (r.status === 'active' ? (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-[12.5px] disabled:opacity-50" disabled={busyId === r.assignment_id} onClick={() => changeStatus(r, 'completed')}>
            End
          </button>
          <button type="button" className="btn-ghost text-[12.5px] disabled:opacity-50" style={{ color: '#ffc2cc' }} disabled={busyId === r.assignment_id} onClick={() => changeStatus(r, 'cancelled')}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost text-[12.5px] disabled:opacity-50" disabled={busyId === r.assignment_id} onClick={() => changeStatus(r, 'active')}>
          Reactivate
        </button>
      )),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trainer rosters" subtitle={meta ? `${meta.total} ${status === 'all' ? '' : status} assignment${meta.total === 1 ? '' : 's'}` : 'Which trainer looks after which member'}>
        <select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="field py-2.5 text-sm">
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <select aria-label="Filter by trainer" value={trainerId} onChange={(e) => { setTrainerId(e.target.value); setPage(1); }} className="field py-2.5 text-sm">
          <option value="">All trainers</option>
          {trainers.map((t) => <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_name}</option>)}
        </select>
        <button type="button" onClick={() => { setFormError(null); setIsModalOpen(true); }} className="btn-primary text-[13.5px]">
          + Assign trainer
        </button>
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      {loading ? (
        <LoadingTable />
      ) : rows.length === 0 ? (
        <EmptyState>No {status === 'all' ? '' : `${status} `}assignments{trainerId ? ' for this trainer' : ''}.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.assignment_id}
            footer={<Pagination meta={meta} onPageChange={setPage} disabled={loading} />}
          />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => !saving && setIsModalOpen(false)} title="Assign a trainer">
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <TrainerAssignmentForm onSubmit={handleCreate} onCancel={() => setIsModalOpen(false)} loading={saving} />
      </Modal>
    </div>
  );
}
