import { useState, useEffect, useCallback } from 'react';
import { getAttendanceHistory, checkIn, checkOut } from '../../services/attendanceService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtDate } from '../../utils/dates';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import CheckInOutForm from '../../components/forms/CheckInOutForm';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, EmptyState, LoadingTable } from '../../components/ui/States';

const PAGE_SIZE = 20;

export default function AttendancePage() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAttendanceHistory({ page, limit: PAGE_SIZE });
      setHistory(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch attendance history.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleAttendanceAction = async (action, memberId) => {
    try {
      setModalLoading(true);
      setFormError(null);
      if (action === 'in') {
        await checkIn({ member_id: memberId, check_in_method: 'manual' });
      } else {
        await checkOut({ member_id: memberId });
      }
      setIsModalOpen(false);
      if (page !== 1) setPage(1);
      else fetchHistory();
    } catch (err) {
      setFormError(getErrorMessage(err, `Failed to check ${action}.`));
    } finally {
      setModalLoading(false);
    }
  };

  const columns = [
    {
      key: 'member',
      label: 'Member',
      width: 'minmax(0,2.2fr)',
      render: (r, i) => (
        <IdentityCell
          title={r.member_name || `Member ${r.member_id}`}
          subtitle={r.member_code ? `${r.member_code} · #${r.attendance_id}` : `#${r.attendance_id}`}
          index={i}
        />
      ),
    },
    { key: 'date', label: 'Date', mono: true, render: (r) => fmtDate(r.attendance_date) },
    { key: 'in', label: 'Check in', mono: true, render: (r) => <span style={{ color: '#8ff0cd' }}>{r.check_in_time}</span> },
    {
      key: 'out',
      label: 'Check out',
      mono: true,
      render: (r) => (r.check_out_time ? r.check_out_time : <span style={{ color: '#ffdf9e' }}>—</span>),
    },
    { key: 'method', label: 'Method', render: (r) => <span className="capitalize">{r.check_in_method}</span> },
    {
      key: 'status',
      label: 'Status',
      width: 'minmax(0,.9fr)',
      render: (r) => <Pill status={r.check_out_time ? 'neutral' : 'on floor'}>{r.check_out_time ? 'Checked out' : 'On floor'}</Pill>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Attendance log" subtitle={meta ? `${meta.total} records` : 'Check-ins and check-outs'}>
        {['admin', 'receptionist'].includes(user.role) && (
          <button
            onClick={() => { setFormError(null); setIsModalOpen(true); }}
            className="btn-primary text-[13.5px]"
          >
            Log attendance
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingTable />
      ) : history.length === 0 ? (
        <EmptyState>No attendance records found.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable
            columns={columns}
            rows={history}
            rowKey={(r) => r.attendance_id}
            footer={<Pagination meta={meta} onPageChange={setPage} disabled={loading} />}
          />
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => !modalLoading && setIsModalOpen(false)}
        title="Log member attendance"
      >
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <CheckInOutForm
          onAction={handleAttendanceAction}
          onCancel={() => setIsModalOpen(false)}
          loading={modalLoading}
        />
      </Modal>
    </div>
  );
}
